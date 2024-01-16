/*
===========================================================================
Copyright (C) 1999-2005 Id Software, Inc.

This file is part of Quake III Arena source code.

Quake III Arena source code is free software; you can redistribute it
and/or modify it under the terms of the GNU General Public License as
published by the Free Software Foundation; either version 2 of the License,
or (at your option) any later version.

Quake III Arena source code is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Quake III Arena source code; if not, write to the Free Software
Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
===========================================================================
*/

#include "server.h"


/*
=============================================================================

Delta encode a client frame onto the network channel

A normal server packet will look like:

4	sequence number (high bit set if an oversize fragment)
<optional reliable commands>
1	svc_snapshot
4	last client reliable command
4	serverTime
1	lastframe for delta compression
1	snapFlags
1	areaBytes
<areabytes>
<playerstate>
<packetentities>

=============================================================================
*/

#ifdef USE_RECENT_EVENTS
// probably will never have more than 1024 client connected?
byte numDied[128];
static byte numWeapon[1024];
#endif

#ifdef USE_MULTIVM_SERVER
static void SV_BuildCommonSnapshot( void );

typedef struct {
	int number;
	int world;
	int worldFrom;
	qboolean isCamera;
	qboolean isTeleporter;
	vec3_t origin;
} multiworld_t;

// TODO: alloc as needed?
static multiworld_t multiworldEntities[MAX_NUM_VMS * MAX_GENTITIES];
static int numMultiworldEntities = 0;
// per client check if 
static qboolean multiworldInView[MAX_NUM_VMS * MAX_GENTITIES];
static qboolean hasMultiworldInView[MAX_NUM_VMS];
#endif

/*
=============
SV_EmitPacketEntities

Writes a delta update of an entityState_t list to the message.
=============
*/
static void SV_EmitPacketEntities( const clientSnapshot_t *from, const clientSnapshot_t *to, msg_t *msg ) {
	entityState_t	*oldent, *newent;
	int		oldindex, newindex;
	int		oldnum, newnum;
	int		from_num_entities;

	// generate the delta update
	if ( !from ) {
		from_num_entities = 0;
	} else {
		from_num_entities = from->num_entities;
	}

	newent = NULL;
	oldent = NULL;
	newindex = 0;
	oldindex = 0;
	while ( newindex < to->num_entities || oldindex < from_num_entities ) {
		if ( newindex >= to->num_entities ) {
			newnum = MAX_GENTITIES+1;
		} else {
			newent = to->ents[ newindex ];
			newnum = newent->number;
		}

		if ( oldindex >= from_num_entities ) {
			oldnum = MAX_GENTITIES+1;
		} else {
			oldent = from->ents[ oldindex ];
			oldnum = oldent->number;
		}

		if ( newnum == oldnum ) {
			// delta update from old position
			// because the force parm is qfalse, this will not result
			// in any bytes being emitted if the entity has not changed at all
			MSG_WriteDeltaEntity (msg, oldent, newent, qfalse );
			oldindex++;
			newindex++;
			continue;
		}

		if ( newnum < oldnum ) {
			// this is a new entity, send it from the baseline
			MSG_WriteDeltaEntity (msg, &sv.svEntities[newnum].baseline, newent, qtrue );
			newindex++;
			continue;
		}

		if ( newnum > oldnum ) {
			// the old entity isn't present in the new message
			MSG_WriteDeltaEntity (msg, oldent, NULL, qtrue );
			oldindex++;
			continue;
		}
	}

	MSG_WriteBits( msg, (MAX_GENTITIES-1), GENTITYNUM_BITS );	// end of packetentities
}


/*
==================
SV_WriteSnapshotToClient
==================
*/
static void SV_WriteSnapshotToClient( const client_t *client, msg_t *msg ) {
	const clientSnapshot_t	*oldframe;
	const clientSnapshot_t	*frame;
	int					lastframe;
	int					i;
	int					snapFlags;

	// this is the snapshot we are creating
#ifdef USE_MULTIVM_SERVER
  frame = &client->frames[gvmi][ client->netchan.outgoingSequence & PACKET_MASK ];
#else
  frame = &client->frames[ client->netchan.outgoingSequence & PACKET_MASK ];
#endif

	// try to use a previous frame as the source for delta compressing the snapshot
	if ( /* client->deltaMessage <= 0 || */ client->state != CS_ACTIVE ) {
		// client is asking for a retransmit
		oldframe = NULL;
		lastframe = 0;
	} else if ( client->netchan.outgoingSequence - client->deltaMessage >= (PACKET_BACKUP - 3) ) {
		// client hasn't gotten a good message through in a long time
		if ( com_developer->integer ) {
			if ( client->deltaMessage != client->netchan.outgoingSequence - ( PACKET_BACKUP + 1 ) ) {
				Com_Printf( "%s: Delta request from out of date packet.\n", client->name );
			}
		}
		oldframe = NULL;
		lastframe = 0;
	} else {
		// we have a valid snapshot to delta from
#ifdef USE_MULTIVM_SERVER
		oldframe = &client->frames[gvmi][ client->deltaMessage & PACKET_MASK ];
#else
    oldframe = &client->frames[ client->deltaMessage & PACKET_MASK ];
#endif
		lastframe = client->netchan.outgoingSequence - client->deltaMessage;
		// we may refer on outdated frame
#ifndef USE_MULTIVM_SERVER
		if ( oldframe->frameNum - svs.lastValidFrame < 0 ) {
			Com_DPrintf( "%s: Delta request from out of date frame.\n", client->name );
			oldframe = NULL;
			lastframe = 0;
		}
#endif
#ifdef USE_MV
		if ( frame->multiview && oldframe->first_psf <= svs.nextSnapshotPSF - svs.numSnapshotPSF ) {
			Com_Printf( "%s: Delta request from out of date playerstate.\n", client->name );
			oldframe = NULL;
			lastframe = 0;
		} else if ( frame->multiview && oldframe->version != MV_PROTOCOL_VERSION ) {
			oldframe = NULL;
			lastframe = 0;
		}
#endif
	}

#ifdef USE_MV
	if ( frame->multiview )
		MSG_WriteByte( msg, svc_multiview );
	else
#endif
	MSG_WriteByte (msg, svc_snapshot);

	// NOTE, MRE: now sent at the start of every message from server to client
	// let the client know which reliable clientCommands we have received
	//MSG_WriteLong( msg, client->lastClientCommand );

	// send over the current server time so the client can drift
	// its view of time to try to match
	if( client->oldServerTime ) {
		// The server has not yet got an acknowledgement of the
		// new gamestate from this client, so continue to send it
		// a time as if the server has not restarted. Note from
		// the client's perspective this time is strictly speaking
		// incorrect, but since it'll be busy loading a map at
		// the time it doesn't really matter.
		MSG_WriteLong (msg, sv.time + client->oldServerTime);
	} else {
		MSG_WriteLong (msg, sv.time);
	}

	// what we are delta'ing from
	MSG_WriteByte (msg, lastframe);

	snapFlags = svs.snapFlagServerBit;
	if ( client->rateDelayed ) {
		snapFlags |= SNAPFLAG_RATE_DELAYED;
	}
	if ( client->state != CS_ACTIVE ) {
		snapFlags |= SNAPFLAG_NOT_ACTIVE;
	}

	MSG_WriteByte (msg, snapFlags);

#ifdef USE_MV
	if ( frame->multiview ) {
		int oldmask;
		int	oldversion;

		if ( !oldframe || !oldframe->multiview ) {
			oldversion = 0;
			oldmask = 0;
		} else {
			oldversion = oldframe->version;
			oldmask = oldframe->mergeMask;
		}

		// emit protocol version in first message
		if ( oldversion != frame->version ) {
			MSG_WriteBits( msg, 1, 1 );
			MSG_WriteByte( msg, frame->version );
		} else {
			MSG_WriteBits( msg, 0, 1 );
		}

		// emit skip-merge mask
		if ( oldmask != frame->mergeMask ) {
			MSG_WriteBits( msg, 1, 1 );
			MSG_WriteBits( msg, frame->mergeMask, SM_BITS );
		} else {
			MSG_WriteBits( msg, 0, 1 );
		}

		SV_EmitPlayerStates( client - svs.clients, oldframe, frame, msg, frame->mergeMask );
		MSG_entMergeMask = frame->mergeMask; // emit packet entities with skipmask
		if((int)(client - svs.clients) > 0) {
			//Com_Printf("ents [%i]: %i -> %i, %i, %i\n", (int)(client - svs.clients), gvmi, frame->num_entities, client->gameWorld, client->newWorld);
		}
		SV_EmitPacketEntities( oldframe, frame, msg );
		MSG_entMergeMask = 0; // don't forget to reset that! 
	} else
#endif
	{
		// send over the areabits
		MSG_WriteByte (msg, frame->areabytes);
		MSG_WriteData (msg, frame->areabits, frame->areabytes);

		// don't send any changes to zombies
		if ( client->state <= CS_ZOMBIE ) {
			// playerstate
			MSG_WriteByte( msg, 0 ); // # of changes
			MSG_WriteBits( msg, 0, 1 ); // no array changes
			// packet entities
			MSG_WriteBits( msg, (MAX_GENTITIES-1), GENTITYNUM_BITS );
			return;
		}

		// delta encode the playerstate
		if ( oldframe ) {
			MSG_WriteDeltaPlayerstate( msg, &oldframe->ps, &frame->ps );
		} else {
			MSG_WriteDeltaPlayerstate( msg, NULL, &frame->ps );
		}

		// delta encode the entities
		SV_EmitPacketEntities( oldframe, frame, msg );
	} // !client->MVProtocol

	// padding for rate debugging
	if ( sv_padPackets->integer ) {
		for ( i = 0 ; i < sv_padPackets->integer ; i++ ) {
			MSG_WriteByte (msg, svc_nop);
		}
	}
}


/*
==================
SV_UpdateServerCommandsToClient

(re)send all server commands the client hasn't acknowledged yet
==================
*/
void SV_UpdateServerCommandsToClient( client_t *client, msg_t *msg ) {
	int i, n;

#ifdef USE_MV
	if ( client->multiview.protocol /*&& client->state >= CS_CONNECTED*/ ) {

		if ( client->multiview.recorder ) {
			// forward target client commands to recorder slot
			SV_ForwardServerCommands( client ); // TODO: forward all clients?
		}

		if ( client->reliableAcknowledge >= client->reliableSequence ) {
#ifdef USE_MV_ZCMD
			// nothing to send, reset compression sequences
			for ( i = 0; i < MAX_RELIABLE_COMMANDS; i++ )
				client->multiview.z.stream[ i ].zcommandNum = -1;
#endif
			return;
		}

		for ( i = client->reliableAcknowledge + 1 ; i <= client->reliableSequence ; i++ ) {
#ifdef USE_MV_ZCMD
			// !!! do not start compression sequence from already sent uncompressed commands
			// (re)send them uncompressed and only after that initiate compression sequence
			/*if ( i <= client->reliableSent ) {
				MSG_WriteByte( msg, svc_serverCommand );
				MSG_WriteLong( msg, i );
				MSG_WriteString( msg, client->reliableCommands[ i & (MAX_RELIABLE_COMMANDS-1) ] );
			} else {*/
				// build new compressed stream or re-send existing
				SV_BuildCompressedBuffer( client, i );
				MSG_WriteLZStream( msg, &client->multiview.z.stream[ i & (MAX_RELIABLE_COMMANDS-1) ] );
				// TODO: indicate compressedSent?
			//}
#else
			MSG_WriteByte( msg, svc_serverCommand );
			MSG_WriteLong( msg, i );
			MSG_WriteString( msg, client->reliableCommands[ i & (MAX_RELIABLE_COMMANDS-1) ] );
#endif
		}

		// recorder operations always success:
		if ( client->multiview.recorder )
			client->reliableAcknowledge = client->reliableSequence;
		client->multiview.lastRecvTime = svs.time;
		// TODO: indicate compressedSent?
		//client->reliableSent = client->reliableSequence;
		return;
	}
#ifdef USE_MV_ZCMD
	// reset on inactive/non-multiview
	client->multiview.z.deltaSeq = 0;
#endif
#endif // USE_MV

	// write any unacknowledged serverCommands
	n = client->reliableSequence - client->reliableAcknowledge;

	for ( i = 0 ; i < n ; i++ ) {
		const int index = client->reliableAcknowledge + 1 + i;
		MSG_WriteByte( msg, svc_serverCommand );
		MSG_WriteLong( msg, index );
		MSG_WriteString( msg, client->reliableCommands[ index & (MAX_RELIABLE_COMMANDS-1) ] );
	}

#ifdef USE_MV
	if ( client->reliableSequence > client->reliableAcknowledge ) {
		client->multiview.lastRecvTime = svs.time;
	}
#endif
}

/*
=============================================================================

Build a client snapshot structure

=============================================================================
*/


typedef int entityNum_t;
typedef struct {
	int		numSnapshotEntities;
	entityNum_t	snapshotEntities[ MAX_SNAPSHOT_ENTITIES ];
	qboolean unordered;
} snapshotEntityNumbers_t;



typedef struct clientPVS_s {
	int		snapshotFrame; // svs.snapshotFrame

	int		clientNum;
	int		areabytes;
	byte	areabits[MAX_MAP_AREA_BYTES];		// portalarea visibility bits
	snapshotEntityNumbers_t	numbers;

	byte	entMask[MAX_GENTITIES/8];
	qboolean entMaskBuilt;

} clientPVS_t;

#ifdef USE_MULTIVM_SERVER
static clientPVS_t client_pvsWorlds[MAX_NUM_VMS][ MAX_CLIENTS ];
#define client_pvs client_pvsWorlds[gvmi]
#else
static clientPVS_t client_pvs[ MAX_CLIENTS ];
#endif

/*
=============
SV_SortEntityNumbers

Insertion sort is about 10 times faster than quicksort for our task
=============
*/
static void SV_SortEntityNumbers( entityNum_t *num, const int size ) {
	entityNum_t tmp;
	int i, d;
	for ( i = 1 ; i < size; i++ ) {
		d = i;
		while ( d > 0 && num[d] < num[d-1] ) {
			tmp = num[d];
			num[d] = num[d-1];
			num[d-1] = tmp;
			d--;
		}
	}
	// consistency check for delta encoding
	for ( i = 1 ; i < size; i++ ) {
		if ( num[i-1] >= num[i] ) {
			Com_Error( ERR_DROP, "%s: invalid entity number %i", __func__, num[ i ] );
		}
	}
}


/*
===============
SV_AddIndexToSnapshot
===============
*/
static void SV_AddIndexToSnapshot( svEntity_t *svEnt, int index, snapshotEntityNumbers_t *eNums ) {

	svEnt->snapshotCounter = sv.snapshotCounter;

	// if we are full, silently discard entities
	if ( eNums->numSnapshotEntities >= MAX_SNAPSHOT_ENTITIES ) {
		return;
	}

	eNums->snapshotEntities[ eNums->numSnapshotEntities ] = index;
	eNums->numSnapshotEntities++;
}


typedef enum {
	EPV_NOTPORTAL,
	EPV_PORTAL,
	EPV_PORTALONLY,
} entityPOV_t;
/*
===============
SV_AddEntitiesVisibleFromPoint
===============
*/
static void SV_AddEntitiesVisibleFromPoint( const vec3_t origin, clientPVS_t *pvs, entityPOV_t portal ) {
	int		e, i;
	sharedEntity_t *ent;
	svEntity_t	*svEnt;
	entityState_t  *es;
	int		l;
	int		clientarea, clientcluster;
	int		leafnum;
	byte	*clientpvs;
	byte	*bitvector;

	// during an error shutdown message we may need to transmit
	// the shutdown message after the server has shutdown, so
	// specfically check for it
	if ( sv.state == SS_DEAD ) {
		return;
	}

	leafnum = CM_PointLeafnum (origin);
	clientarea = CM_LeafArea (leafnum);
	clientcluster = CM_LeafCluster (leafnum);

	// calculate the visible areas
	pvs->areabytes = CM_WriteAreaBits( pvs->areabits, clientarea );

#ifdef USE_MULTIVM_SERVER
	clientpvs = CM_ClusterPVS (clientcluster, gameWorlds[gvmi]);
#else
#ifdef USE_MULTIVM_CLIENT
	clientpvs = CM_ClusterPVS (clientcluster, 0);
#else
	clientpvs = CM_ClusterPVS (clientcluster);
#endif
#endif

	for ( e = 0 ; e < svs.currFrame->count; e++ ) {
		es = svs.currFrame->ents[ e ];
		ent = SV_GentityNum( es->number );

		// entities can be flagged to be sent to only one client
		if ( ent->r.svFlags & SVF_SINGLECLIENT ) {
			if ( ent->r.singleClient != pvs->clientNum ) {
				continue;
			}
		}
		// entities can be flagged to be sent to everyone but one client
		if ( ent->r.svFlags & SVF_NOTSINGLECLIENT ) {
			if ( ent->r.singleClient == pvs->clientNum ) {
				continue;
			}
		}
		// entities can be flagged to be sent to a given mask of clients
		if ( ent->r.svFlags & SVF_CLIENTMASK ) {
			if ( pvs->clientNum >= 32 )
				Com_Error( ERR_DROP, "SVF_CLIENTMASK: clientNum >= 32" );
			if ( ~ent->r.singleClient & (1 << pvs->clientNum) )
				continue;
		}

		svEnt = &sv.svEntities[ es->number ];

		// don't double add an entity through portals
		if ( svEnt->snapshotCounter == sv.snapshotCounter ) {
			continue;
		}

		// broadcast entities are always sent
		if ( ent->r.svFlags & SVF_BROADCAST ) {
			SV_AddIndexToSnapshot( svEnt, e, &pvs->numbers );
			continue;
		}

		// ignore if not touching a PV leaf
		// check area
		if ( !CM_AreasConnected( clientarea, svEnt->areanum ) ) {
			// doors can legally straddle two areas, so
			// we may need to check another one
			if ( !CM_AreasConnected( clientarea, svEnt->areanum2 ) ) {
				continue;		// blocked by a door
			}
		}

		bitvector = clientpvs;

		// check individual leafs
		if ( !svEnt->numClusters ) {
			continue;
		}
		l = 0;
		for ( i=0 ; i < svEnt->numClusters ; i++ ) {
			l = svEnt->clusternums[i];
			if ( bitvector[l >> 3] & (1 << (l&7) ) ) {
				break;
			}
		}

		// if we haven't found it to be visible,
		// check overflow clusters that coudln't be stored
		if ( i == svEnt->numClusters ) {
			if ( svEnt->lastCluster ) {
				for ( ; l <= svEnt->lastCluster ; l++ ) {
					if ( bitvector[l >> 3] & (1 << (l&7) ) ) {
						break;
					}
				}
				if ( l == svEnt->lastCluster ) {
					continue;	// not visible
				}
			} else {
				continue;
			}
		}

#ifdef USE_MULTIVM_SERVER
		if(portal == EPV_PORTALONLY && ent->s.eType != ET_PORTAL) {
			continue;
		}
#endif

		// add it
		SV_AddIndexToSnapshot( svEnt, e, &pvs->numbers );

		// if it's a portal entity, add everything visible from its camera position
		if ( ent->r.svFlags & SVF_PORTAL && portal == EPV_NOTPORTAL ) {
			if ( ent->s.generic1 ) {
				vec3_t dir;
				VectorSubtract(ent->s.origin, origin, dir);
				if ( VectorLengthSquared(dir) > (float) ent->s.generic1 * ent->s.generic1 ) {
					continue;
				}
			}
			pvs->numbers.unordered = qtrue;
#ifdef USE_MULTIVM_SERVER
			if(ent->s.eType == ET_PORTAL) {
				// don't show entities if the portal is from a different world
				if((ent->s.powerups >> 8) != gvmi) {
					// doesn't add portals but still adds camera points
					SV_AddEntitiesVisibleFromPoint( ent->s.origin2, pvs, EPV_PORTALONLY );
					for(int j = 0; j < numMultiworldEntities; j++) {
						if(multiworldEntities[j].worldFrom != (ent->s.powerups >> 8)) continue; // skip portals not from this world
						if(multiworldEntities[j].isCamera) {
							VectorCopy(multiworldEntities[j].origin, ent->s.origin2);
							break;
						}
					}
				} else
					SV_AddEntitiesVisibleFromPoint( ent->s.origin2, pvs, portal );
			} else
#endif
			SV_AddEntitiesVisibleFromPoint( ent->s.origin2, pvs, portal );
		}
	}

	ent = SV_GentityNum( pvs->clientNum );
	// merge second PVS at ent->r.s.origin2
	if ( ent->r.svFlags & SVF_SELF_PORTAL2 && portal == EPV_NOTPORTAL ) {
		SV_AddEntitiesVisibleFromPoint( ent->r.s.origin2, pvs, EPV_PORTAL );
		pvs->numbers.unordered = qtrue;
	}
}


#ifdef USE_MULTIVM_SERVER
/*
===============
SV_MarkClientPortalPVS
===============
*/
static void SV_MarkClientPortalPVS( const vec3_t origin, int clientNum, int portal ) {
	int		i, num;
	sharedEntity_t *ent;
	svEntity_t	*svEnt;
	int		l;
	int		clientarea, clientcluster;
	int		leafnum;
	byte	*clientpvs;
	byte	*bitvector;

	leafnum = CM_PointLeafnum (origin);
	clientarea = CM_LeafArea (leafnum);
	clientcluster = CM_LeafCluster (leafnum);
	clientpvs = CM_ClusterPVS (clientcluster, gameWorlds[gvmi]);

	if ( svs.currFrame == NULL ) {
		// this will always success and setup current frame
		//SV_BuildCommonSnapshot();
	}

	for ( num = 0 ; num < sv.num_entitiesWorlds[gvmi] ; num++ ) {
		ent = SV_GentityNum( num );
		svEnt = &sv.svEntities[ num ];
		if ( !ent->r.linked ) {
			continue;
		}
		if ( !(ent->r.svFlags & SVF_PORTAL) ) {
			continue;
		}
		if( ent->r.svFlags & SVF_NOCLIENT ) {
			continue;
		}
		if ( (ent->r.svFlags & SVF_SINGLECLIENT) && ent->r.singleClient != clientNum ) {
			continue;
		}
		if ( (ent->r.svFlags & SVF_NOTSINGLECLIENT) && ent->r.singleClient == clientNum ) {
			continue;
		}
		if ( ent->r.svFlags & SVF_CLIENTMASK ) {
			if ( ~ent->r.singleClient & (1 << clientNum) )
			continue;
		}
		if ( !CM_AreasConnected( clientarea, svEnt->areanum ) ) {
			if ( !CM_AreasConnected( clientarea, svEnt->areanum2 ) ) {
				continue;		// blocked by a door
			}
		}

		bitvector = clientpvs;

		// check individual leafs
		if ( !svEnt->numClusters ) {
			continue;
		}
		l = 0;
		for ( i=0 ; i < svEnt->numClusters ; i++ ) {
			l = svEnt->clusternums[i];
			if ( bitvector[l >> 3] & (1 << (l&7) ) ) {
				break;
			}
		}
		if ( i == svEnt->numClusters ) {
			if ( svEnt->lastCluster ) {
				for ( ; l <= svEnt->lastCluster ; l++ ) {
					if ( bitvector[l >> 3] & (1 << (l&7) ) ) {
						break;
					}
				}
				if ( l == svEnt->lastCluster ) {
					continue;	// not visible
				}
			} else {
				continue;
			}
		}

		if ( ent->s.generic1 ) {
			vec3_t dir;
			VectorSubtract(ent->s.origin, origin, dir);
			if ( VectorLengthSquared(dir) > (float) ent->s.generic1 * ent->s.generic1 ) {
				continue;
			}
		}

		// mark the portal as being in view so the other world snapshot can always send entities from this point
		//   when the portals have the same name in both maps, and the same location, entities will be sent
		for(int j = 0; j < numMultiworldEntities; j++) {
			vec3_t dist;
			if(multiworldEntities[j].worldFrom != gvmi) continue; // skip portals not from this world
			if(multiworldEntities[j].world == gvmi) continue; // skip portals that lead to this world
			// only portals from this world leading to other worlds
			VectorSubtract(ent->s.origin2, multiworldEntities[j].origin, dist);
			if(VectorLength(dist) < 8.0f) {
				int prevGvm = gvmi;
				gvmi = multiworldEntities[j].world;
				multiworldInView[j] = qtrue;
				hasMultiworldInView[gvmi] = qtrue;
				// powerups hack, add world parameter to powerups for non-multigame QVMs like baseq3a, 
				//   so a prebuilt QVM can still use portals as long as cgame transfers powerups flags to the renderer
				// TODO: make this optional
				// TODO: something special for personal portals as opposed to map portals, need to add and remove them?
				if ( ent->s.eType == ET_PORTAL ) {
					ent->s.powerups |= (multiworldEntities[j].world << 8);
				}
				CM_SwitchMap(gameWorlds[gvmi]);
				if(portal < 10)
					SV_MarkClientPortalPVS( ent->s.origin2, clientNum, portal + 1 );
				gvmi = prevGvm;
				CM_SwitchMap(gameWorlds[gvmi]);
				break;
			}
		}
	}
}

int parseEntities(const char **ents);
int parseKeys(const char *buffer, const char **keys, const char **vals);

void SV_AddWorldlyEntities( void ) {
#define MAX_KEYVALUES 16
	vec3_t origin;
	static const char *entities[MAX_GENTITIES];
	char message[MAX_TOKEN_CHARS];
	int world;
	int numEntities;
	memset(entities, 0, sizeof(entities));
	numEntities = parseEntities(entities);

	for(int i = 0; i < numEntities; i++) {
		const char *keys[MAX_KEYVALUES];
		const char *vals[MAX_KEYVALUES];
		memset(keys, 0, sizeof(keys));
		memset(vals, 0, sizeof(vals));
		const char *ent = entities[i];
		qboolean isWorldspawn = qfalse;
		qboolean isTeleporter = qfalse;
		qboolean isCamera = qfalse;
		int numKeyValues = parseKeys(ent, keys, vals);
		world = gvmi;
		message[0] = '\0';
		VectorClear(origin);
		for(int j = 0; j < numKeyValues; j++) {
			if(!Q_stricmpn(keys[j], "classname", 9)) {
				if(!Q_stricmpn(vals[j]+1, "misc_teleporter_dest", 10)
					|| !Q_stricmpn(vals[j]+1, "info_player_deathmatch", 10)
				) {
					isTeleporter = qtrue;
				}
				else if (!Q_stricmpn(vals[j]+1, "info_player_intermission", 10)
					|| !Q_stricmpn(vals[j]+1, "misc_portal_camera", 10)) {
					isCamera = qtrue;
				}
				else if (!Q_stricmpn(vals[j]+1, "worldspawn", 10)) {
					isWorldspawn = qtrue;
				}
				else {
				}
			}
			else if(!Q_stricmpn(keys[j], "world", 5)) {
				sscanf(vals[j], "\"%i\"", &world);
			}
			else if(!Q_stricmpn(keys[j], "message", 7)) {
				sscanf(vals[j], "\"%s\"", message);
			}
			else if(!Q_stricmpn(keys[j], "origin", 6)) {
				sscanf(vals[j], "\"%f %f %f\"", 
					&origin[0], 
					&origin[1], 
					&origin[2]);
			}
		}
		if(isWorldspawn) {
			continue;
		}
		if( (isCamera || isTeleporter) /* && world != gvmi &*/ ) {
			multiworldEntities[numMultiworldEntities].isCamera = isCamera;
			multiworldEntities[numMultiworldEntities].isTeleporter = isTeleporter;
			multiworldEntities[numMultiworldEntities].world = world;
			multiworldEntities[numMultiworldEntities].worldFrom = gvmi;
			multiworldEntities[numMultiworldEntities].number = i;
			VectorCopy(origin, multiworldEntities[numMultiworldEntities].origin);
			numMultiworldEntities++;
		}
	}
}

void SV_RemoveWorldlyEntities( void ) {
	for(int i = 0; i < numMultiworldEntities; i++) {
		if(multiworldEntities[i].worldFrom == gvmi) {
			memcpy(&multiworldEntities[i], &multiworldEntities[i + 1], sizeof(multiworldEntities) - (i + 1) * sizeof(multiworldEntities[i]));
			numMultiworldEntities--;
			memset(&multiworldEntities[numMultiworldEntities], 0, sizeof(multiworldEntities[0]));
			i--;
		}
	}
}
#endif


/*
===============
SV_InitSnapshotStorage
===============
*/
void SV_InitSnapshotStorage( void ) 
{
	// initialize snapshot storage
	Com_Memset( svs.snapFrames, 0, sizeof( svs.snapFrames ) );
#ifdef USE_MULTIVM_SERVER
	memset( multiworldEntities, 0, sizeof( multiworldEntities ) );
	numMultiworldEntities = 0;
#endif
	svs.freeStorageEntities = svs.numSnapshotEntities;
	svs.currentStoragePosition = 0;

	svs.snapshotFrame = 0;
	svs.currentSnapshotFrame = 0;
	svs.lastValidFrame = 0;

#ifdef USE_MULTIVM_SERVER
  Com_Memset(svs.currFrameWorlds, 0, sizeof(svs.currFrameWorlds));

	Com_Memset( client_pvsWorlds, 0, sizeof( client_pvsWorlds ) );
#else
  svs.currFrame = NULL;

	Com_Memset( client_pvs, 0, sizeof( client_pvs ) );
#endif
}


/*
===============
SV_IssueNewSnapshot

This should be called before any new client snaphot built
===============
*/
void SV_IssueNewSnapshot( void ) 
{
#ifdef USE_MULTIVM_SERVER
  // do the entire frame because this is called only once, then checked is its zero when updating
  Com_Memset(svs.currFrameWorlds, 0, sizeof(svs.currFrameWorlds));
#else
  svs.currFrame = NULL;
#endif
	
	// value that clients can use even for their empty frames
	// as it will not increment on new snapshot built
	svs.currentSnapshotFrame = svs.snapshotFrame;
}


/*
===============
SV_BuildCommonSnapshot

This always allocates new common snapshot frame
===============
*/
static void SV_BuildCommonSnapshot( void ) 
{
	sharedEntity_t	*list[ MAX_GENTITIES ];
	sharedEntity_t	*ent;
	
	snapshotFrame_t	*tmp;
	snapshotFrame_t	*sf;

	int count;
	int index;
	int	num;
	int i;

	count = 0;

	// gather all linked entities
	if ( sv.state != SS_DEAD ) {
#ifdef USE_MULTIVM_SERVER
		for ( num = 0 ; num < sv.num_entitiesWorlds[gvmi] ; num++ ) {
#else
    for ( num = 0 ; num < sv.num_entities ; num++ ) {
#endif
			ent = SV_GentityNum( num );

			// never send entities that aren't linked in
			if ( !ent->r.linked ) {
				continue;
			}
	
			if ( ent->s.number != num
#ifdef USE_DEMO_SERVER
				&& !(sv.demoState == DS_PLAYBACK || sv.demoState == DS_WAITINGPLAYBACK) 
#endif
      ) {
				Com_DPrintf( "FIXING ENT->S.NUMBER %i => %i\n", ent->s.number, num );
				ent->s.number = num;
			}

			// entities can be flagged to explicitly not be sent to the client
			if ( ent->r.svFlags & SVF_NOCLIENT ) {
				continue;
			}

#ifdef USE_RECENT_EVENTS
			if(ent->s.clientNum < sv_maxclients->integer
				&& svs.clients[ent->s.clientNum].state == CS_ACTIVE
			//	&& svs.clients[ent->s.clientNum].netchan.remoteAddress.type != NA_BOT 
			) {

				if(ent->s.eType == ET_PLAYER && ent->s.event & EV_EVENT_BITS) {
					int event = (ent->s.event & ~EV_EVENT_BITS);

//					if(event > 1) // footsteps and none
//						Com_Printf("event: %i %i\n", event, ent->s.clientNum);
					if(event >= EV_DEATH1 && event <= EV_DEATH3
						&& !(numDied[ent->s.clientNum / 8] & (1 << (ent->s.clientNum % 8)))
					) {
						char player[1024];
						client_t *c1 = &svs.clients[ent->s.clientNum];
						playerState_t *ps1 = SV_GameClientNum( ent->s.clientNum );
						if(ent->s.eventParm == 1022) {
							Com_sprintf( player, sizeof( player ), "[[%i,%i,\"%s\"]]", 
								ps1->persistant[ PERS_SCORE ], c1->ping, c1->name);			
						} else {
							client_t *c2 = &svs.clients[ent->s.eventParm];
							playerState_t *ps2 = SV_GameClientNum( ent->s.eventParm );
							Com_sprintf( player, sizeof( player ), "[[%i,%i,\"%s\"],[%i,%i,\"%s\"]]", 
								ps1->persistant[ PERS_SCORE ], c1->ping, c1->name, 
								ps2->persistant[ PERS_SCORE ], c2->ping, c2->name );
						}
            SV_RecentEvent(va(RECENT_TEMPLATE, sv.time, SV_EVENT_CLIENTDIED, player));
						numDied[ent->s.clientNum / 8] |= 1 << (ent->s.clientNum % 8);
					}
				}

				if(ent->s.eType == ET_PLAYER
					&& (ent->s.event & ~EV_EVENT_BITS) == EV_CHANGE_WEAPON) {
					char weapon[1024];
					playerState_t *ps = SV_GameClientNum( ent->s.clientNum );
					// debounce weapon change event
					if(numWeapon[ent->s.clientNum] != ps->weapon) {
						numWeapon[ent->s.clientNum] = ps->weapon;
						client_t *c = &svs.clients[ent->s.clientNum];
						memcpy(weapon, va("[%i,\"%s\"]", ps->weapon, c->name), sizeof(weapon));
            SV_RecentEvent(va(RECENT_TEMPLATE, sv.time, SV_EVENT_CLIENTWEAPON, weapon));
					}
				}
				if(ent->s.eType == ET_PLAYER
					&& (ent->s.eType & (EF_AWARD_EXCELLENT | EF_AWARD_GAUNTLET
					| EF_AWARD_CAP | EF_AWARD_IMPRESSIVE | EF_AWARD_DEFEND
					| EF_AWARD_ASSIST | EF_AWARD_DENIED))) {
					char award[1024];
					client_t *c = &svs.clients[ent->s.clientNum];
					memcpy(award, va("[%i,\"%s\"]", ent->s.eType, c->name), sizeof(award));
          SV_RecentEvent(va(RECENT_TEMPLATE, sv.time, SV_EVENT_CLIENTAWARD, award));
				}
			}
#endif

			list[ count++ ] = ent;
			sv.svEntities[ num ].snapshotCounter = -1;
		}
	}

	sv.snapshotCounter = -1;

	sf = &svs.snapFrames[ svs.snapshotFrame % NUM_SNAPSHOT_FRAMES ];
	
	// track last valid frame
	if ( svs.snapshotFrame - svs.lastValidFrame > (NUM_SNAPSHOT_FRAMES-1) ) {
		svs.lastValidFrame = svs.snapshotFrame - (NUM_SNAPSHOT_FRAMES-1);
		// release storage
		svs.freeStorageEntities += sf->count;
		sf->count = 0;
	}

	// release more frames if needed
	while ( svs.freeStorageEntities < count && svs.lastValidFrame != svs.snapshotFrame ) {
		tmp = &svs.snapFrames[ svs.lastValidFrame % NUM_SNAPSHOT_FRAMES ];
		svs.lastValidFrame++;
		// release storage
		svs.freeStorageEntities += tmp->count;
		tmp->count = 0;
	}

	// should never happen but anyway
	if ( svs.freeStorageEntities < count ) {
		Com_Error( ERR_DROP, "Not enough snapshot storage: %i < %i", svs.freeStorageEntities, count );
	}

	// allocate storage
	sf->count = count;
	svs.freeStorageEntities -= count;

	sf->start = svs.currentStoragePosition; 
	svs.currentStoragePosition = ( svs.currentStoragePosition + count ) % svs.numSnapshotEntities;

	sf->frameNum = svs.snapshotFrame;
	svs.snapshotFrame++;

	svs.currFrame = sf; // clients can refer to this

	// setup start index
	index = sf->start;
	for ( i = 0 ; i < count ; i++, index = (index+1) % svs.numSnapshotEntities ) {
		//index %= svs.numSnapshotEntities;
		svs.snapshotEntities[ index ] = list[ i ]->s;
		sf->ents[ i ] = &svs.snapshotEntities[ index ];
	}
}



static clientPVS_t *SV_BuildClientPVS( int clientSlot, const playerState_t *ps, qboolean buildEntityMask ) 
{
	svEntity_t	*svEnt;
	clientPVS_t	*pvs;
	vec3_t	org;
	int i;
	
	pvs = &client_pvs[ clientSlot ];

	if ( pvs->snapshotFrame != svs.snapshotFrame /*|| pvs->clientNum != ps->clientNum*/ ) {
		pvs->snapshotFrame = svs.snapshotFrame;

		// find the client's viewpoint
		VectorCopy( ps->origin, org );
		org[2] += ps->viewheight;

		// bump the counter used to prevent double adding
		sv.snapshotCounter++;

		// never send client's own entity, because it can
		// be regenerated from the playerstate
		svEnt = &sv.svEntities[ ps->clientNum ];
		svEnt->snapshotCounter = sv.snapshotCounter;

		// add all the entities directly visible to the eye, which
		// may include portal entities that merge other viewpoints
		pvs->clientNum = ps->clientNum;
		pvs->areabytes = 0;
		memset( pvs->areabits, 0, sizeof ( pvs->areabits ) );

		// empty entities before visibility check
		pvs->entMaskBuilt = qfalse;
		pvs->numbers.numSnapshotEntities = 0;
		pvs->numbers.unordered = qfalse;
#ifndef USE_MULTIVM_SERVER
		SV_AddEntitiesVisibleFromPoint( org, pvs, EPV_NOTPORTAL );
#else
		// only add point of view if player is present
		if(!sv_mvWorld->integer || SV_PlayerPresent(ps->clientNum)) {
			SV_AddEntitiesVisibleFromPoint( org, pvs, EPV_NOTPORTAL );
		}
		for(int j = 0; j < numMultiworldEntities; j++) {
			if(multiworldInView[j] 
				&& multiworldEntities[j].world == gvmi) {
				// TODO: add another visibility point from this view point
				SV_AddEntitiesVisibleFromPoint( multiworldEntities[j].origin, pvs, EPV_PORTAL );
				pvs->numbers.unordered = qtrue;
			}
		}
#endif
		// if there were portals visible, there may be out of order entities
		// in the list which will need to be resorted for the delta compression
		// to work correctly.  This also catches the error condition
		// of an entity being included twice.
		if ( pvs->numbers.unordered ) {
			SV_SortEntityNumbers( &pvs->numbers.snapshotEntities[0], pvs->numbers.numSnapshotEntities );
		}

		// now that all viewpoint's areabits have been OR'd together, invert
		// all of them to make it a mask vector, which is what the renderer wants
		for ( i = 0 ; i < MAX_MAP_AREA_BYTES/sizeof(int) ; i++ ) {
			((int *)pvs->areabits)[i] = ((int *)pvs->areabits)[i] ^ -1;
		}
	}

	if ( buildEntityMask && !pvs->entMaskBuilt ) {
		pvs->entMaskBuilt = qtrue;
		memset( pvs->entMask, 0, sizeof ( pvs->entMask ) );
		for ( i = 0; i < pvs->numbers.numSnapshotEntities ; i++ ) {
			SET_ABIT( pvs->entMask, svs.currFrame->ents[ pvs->numbers.snapshotEntities[ i ] ]->number );
		}
	}

	return pvs;
}


/*
=============
SV_BuildClientSnapshot

Decides which entities are going to be visible to the client, and
copies off the playerstate and areabits.

This properly handles multiple recursive portals, but the render
currently doesn't.

For viewing through other player's eyes, clent can be something other than client->gentity
=============
*/
static void SV_BuildClientSnapshot( client_t *client ) {
	clientSnapshot_t			*frame;
	int							i, cl;
	int							clientNum;
	playerState_t				*ps;
	clientPVS_t					*pvs;

	// this is the frame we are creating
#ifdef USE_MULTIVM_SERVER
	frame = &client->frames[gvmi][ client->netchan.outgoingSequence & PACKET_MASK ];
#else
  frame = &client->frames[ client->netchan.outgoingSequence & PACKET_MASK ];
#endif
	cl = client - svs.clients;

	// clear everything in this snapshot
	Com_Memset( frame->areabits, 0, sizeof( frame->areabits ) );
	frame->areabytes = 0;

	// https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=62
	frame->num_entities = 0;
	frame->frameNum = svs.currentSnapshotFrame;

#ifdef USE_MV
	if ( client->multiview.protocol > 0 ) {
		frame->multiview = qtrue;
		frame->version = MV_PROTOCOL_VERSION;
		if(client->mvAck == 0)
			client->mvAck = client->messageAcknowledge;
		// select primary client slot
		if ( client->multiview.recorder ) {
			cl = sv_demoClientID;
		}
	} else {
		frame->multiview = qfalse;
		client->mvAck = 0;
	}
	Com_Memset( frame->psMask, 0, sizeof( frame->psMask ) );
	frame->first_psf = svs.nextSnapshotPSF;
	frame->num_psf = 0;
#ifdef USE_MULTIVM_SERVER
	frame->world = gvmi;
#endif
#endif
	
	if ( client->state == CS_ZOMBIE )
		return;

	// grab the current playerState_t
	ps = SV_GameClientNum( cl );
	frame->ps = *ps;

#ifdef USE_MULTIVM_SERVER
	// change player world be detecting a multiworld portal jump
	clientSnapshot_t *oldframe = &client->frames[gvmi][ client->netchan.outgoingSequence - 1 & PACKET_MASK ];
	if(/* sv_mvWorld->integer &&*/ gvmi == client->gameWorld
		&& ((ps->eFlags ^ oldframe->ps.eFlags) & EF_TELEPORT_BIT)) {
		for(int i = 0; i < numMultiworldEntities; i++) {
			vec3_t vec;
			VectorSubtract(multiworldEntities[i].origin, ps->origin, vec);
			if(multiworldEntities[i].world != client->newWorld && VectorLength(vec) < 64) {
				client->newWorld = multiworldEntities[i].world;
				// TODO: change this game mode to 5 to mean check with client if it's okay to send gamestate
				Cbuf_AddText(va("wait 1\ngame 0 %i %i\n", client->newWorld, cl));
			}
		}
	}
#endif

	clientNum = frame->ps.clientNum;
	if ( clientNum < 0 || clientNum >= MAX_GENTITIES ) {
		Com_Error( ERR_DROP, "SV_SvEntityForGentity: bad gEnt" );
	}

	// we set client->gentity only after sending gamestate
	// so don't send any packetentities changes until CS_PRIMED
	// because new gamestate will invalidate them anyway
#ifdef USE_MV
	if ( !client->gentity && !client->multiview.recorder ) {
#else
	if ( !client->gentity ) {
#endif
		return;
	}

	if ( svs.currFrame == NULL ) {
		// this will always success and setup current frame
		SV_BuildCommonSnapshot();
	}

	frame->frameNum = svs.currFrame->frameNum;

#ifdef USE_MV
	if ( frame->multiview ) {
		clientPVS_t *pvs;
		psFrame_t *psf;
		int slot;

		for ( slot = 0 ; slot < sv_maxclients->integer; slot++ ) {
			// record only form primary slot or active clients
			if ( slot == cl || svs.clients[ slot ].state == CS_ACTIVE ) {

				// get current playerstate
				ps = SV_GameClientNum( slot );

				// skip bots in spectator state
				if ( ps->persistant[ PERS_TEAM ] == TEAM_SPECTATOR 
					&& svs.clients[ slot ].netchan.remoteAddress.type == NA_BOT ) {
					continue;
				}

				// allocate playerstate frame
				psf = &svs.snapshotPSF[ svs.nextSnapshotPSF % svs.numSnapshotPSF ]; 
				svs.nextSnapshotPSF++;
				frame->num_psf++;

				SET_ABIT( frame->psMask, slot );

				psf->ps = *ps;
				psf->clientSlot = slot;

				pvs = SV_BuildClientPVS( slot, &psf->ps, qtrue );
				psf->areabytes = pvs->areabytes;
				memcpy( psf->areabits, pvs->areabits, sizeof( psf->areabits ) );

				if ( slot == cl ) {
					// save for primary client
					frame->areabytes = psf->areabytes;
					Com_Memcpy( frame->areabits, psf->areabits, sizeof( frame->areabits ) );
				}
				// copy generated entity mask
				memcpy( psf->entMask, pvs->entMask, sizeof( psf->entMask ) );
			}
		}

		// get ALL pointers from common snapshot
		frame->num_entities = svs.currFrame->count;
		for ( i = 0 ; i < frame->num_entities ; i++ ) {
			frame->ents[ i ] = svs.currFrame->ents[ i ];
		}
		frame->mergeMask = SM_ALL & ~SV_GetMergeMaskEntities( frame );

#ifdef USE_MV_ZCMD
		// some extras
		if ( client->deltaMessage <= 0 )
			client->multiview.z.deltaSeq = 0;
#endif
		
		// auto score request
		if ( sv_demoFlags->integer & ( SCORE_RECORDER | SCORE_CLIENT ) )
			SV_QueryClientScore( client );

	}
	else // non-multiview frame
#endif
	{
		pvs = SV_BuildClientPVS( cl, ps, qfalse );

		memcpy( frame->areabits, pvs->areabits, sizeof( frame->areabits ) );
		frame->areabytes = pvs->areabytes;

		frame->num_entities = pvs->numbers.numSnapshotEntities;
		// get pointers from common snapshot
		for ( i = 0 ; i < pvs->numbers.numSnapshotEntities ; i++ )	{
			frame->ents[ i ] = svs.currFrame->ents[ pvs->numbers.snapshotEntities[ i ] ];
		}
	}
}


/*
=======================
SV_SendMessageToClient

Called by SV_SendClientSnapshot and SV_SendClientGameState
=======================
*/
void SV_SendMessageToClient( msg_t *msg, client_t *client )
{
#ifdef USE_MV

	if ( client->multiview.protocol && client->multiview.recorder
		&& sv_demoFile != FS_INVALID_HANDLE ) {
		int v;

		 // finalize packet
		MSG_WriteByte( msg, svc_EOF );

		// write message sequence
		v = LittleLong( client->netchan.outgoingSequence );
		FS_Write( &v, 4, sv_demoFile );

		// write message size
		v = LittleLong( msg->cursize );
		FS_Write( &v, 4, sv_demoFile );

		// write data
		FS_Write( msg->data, msg->cursize, sv_demoFile );

		// update delta sequence
		client->deltaMessage = client->netchan.outgoingSequence;
		client->netchan.outgoingSequence++;
		return;
	}
#endif // USE_MV

	// record information about the message
#ifdef USE_MULTIVM_SERVER
	client->frames[gvmi][client->netchan.outgoingSequence & PACKET_MASK].messageSize = msg->cursize;
	client->frames[gvmi][client->netchan.outgoingSequence & PACKET_MASK].messageSent = svs.msgTime;
	client->frames[gvmi][client->netchan.outgoingSequence & PACKET_MASK].messageAcked = 0;
#else
  client->frames[client->netchan.outgoingSequence & PACKET_MASK].messageSize = msg->cursize;
  client->frames[client->netchan.outgoingSequence & PACKET_MASK].messageSent = svs.msgTime;
  client->frames[client->netchan.outgoingSequence & PACKET_MASK].messageAcked = 0;
#endif

	// send the datagram
	SV_Netchan_Transmit( client, msg );
}


#ifdef USE_MULTIVM_SERVER
void SV_SetClientViewAngle( int clientNum, vec3_t angle );
#endif

/*
=======================
SV_SendClientSnapshot

Also called by SV_FinalMessage

=======================
*/
void SV_SendClientSnapshot( client_t *client ) {
	byte		msg_buf[ MAX_MSGLEN_BUF ];
	msg_t		msg;
	int     headerBytes;

#ifdef USE_MULTIVM_SERVER
	qboolean first = qtrue;
	int igvm;

	//entityState_t nullstate;
	//const svEntity_t *svEnt;
	// mark portal PVS ahead of time, sucks to do extra math, but then all worlds can refer to each other easily
	memset(hasMultiworldInView, qfalse, sizeof(hasMultiworldInView));
	memset(multiworldInView, qfalse, sizeof(multiworldInView));
	for(igvm = 0; igvm < MAX_NUM_VMS; igvm++) {
		if(!gvmWorlds[igvm]) continue;
		gvmi = igvm;
		// they must at least be a spectator even to "peer" into this world from another
		if(sv_mvWorld->integer != 0 && !SV_PlayerPresent(client - svs.clients)
			&& gvmi != client->gameWorld && gvmi != client->newWorld) continue;
		//Com_Printf("Marking PVS: %i -> %i\n", gvmi, SV_PlayerPresent(client - svs.clients));
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_MarkClientPortalPVS( SV_GameClientNum(client - svs.clients)->origin, client - svs.clients, 0 );
	}

	for(igvm = 0; igvm < MAX_NUM_VMS; igvm++) {
		if(!gvmWorlds[igvm]) continue;
		gvmi = igvm;
		CM_SwitchMap(gameWorlds[igvm]);
		SV_SetAASgvm(igvm);

		// for omnipresent with matching worlds, copy origin and view angle to subordinate worlds
		if(sv_mvSyncXYZ->integer != 0
			&& sv_mvOmnipresent->integer != 0
			&& igvm != client->newWorld && igvm != client->gameWorld) {
			int clientNum = (int)(client - svs.clients);
			playerState_t *ps = (playerState_t *)((byte *)sv.gameClientWorlds[client->gameWorld] + sv.gameClientSizes[client->gameWorld]*clientNum);
			VectorCopy(ps->origin, SV_GameClientNum( clientNum )->origin);
			SV_SetClientViewAngle(clientNum, vec3_origin);
		}

		// skip worlds client hasn't entered yet
		if(sv_mvWorld->integer != 0 
			&& (!SV_PlayerPresent(client - svs.clients) /* || !hasMultiworldInView[igvm] */)
			&& igvm != client->gameWorld && igvm != client->newWorld) continue;

		// must acknowledge new gamestate in response to their game request
		//if(client->lastSnapshotTime - svs.time == -9999 && igvm != client->newWorld) continue;
		//Com_Printf("Sending snapshot %i -> %i, %i, %i\n", (int)(client - svs.clients), igvm, SV_PlayerPresent(client - svs.clients), SV_GentityNum(client - svs.clients)->s.eType);

#endif

	// build the snapshot
	SV_BuildClientSnapshot( client );

#ifndef USE_MV // send bots to client
	// bots need to have their snapshots build, but
	// the query them directly without needing to be sent
	if ( client->netchan.remoteAddress.type == NA_BOT ) {
#ifdef USE_MULTIVM_SERVER
		continue;
#else
		return;
#endif
	}
#endif

#ifdef USE_MULTIVM_SERVER
	if(first) {
		first = qfalse;
		MSG_Init( &msg, msg_buf, MAX_MSGLEN );
		msg.allowoverflow = qtrue;
		headerBytes = msg.cursize;
		MSG_WriteLong( &msg, client->lastClientCommand );
	}
	// switch game data slots (`igs`) on client before processing snapshot
	if(atoi(Info_ValueForKey( client->userinfo, "mvproto" )) > 1) {
		MSG_WriteByte( &msg, svc_mvWorld );
		MSG_WriteByte( &msg, igvm );
	}
#else
	MSG_Init( &msg, msg_buf, MAX_MSGLEN );
	msg.allowoverflow = qtrue;
	headerBytes = msg.cursize;

	// NOTE, MRE: all server->client messages now acknowledge
	// let the client know which reliable clientCommands we have received
	MSG_WriteLong( &msg, client->lastClientCommand );
#endif

	// (re)send any reliable server commands
	SV_UpdateServerCommandsToClient( client, &msg );

	// send over all the relevant entityState_t
	// and the playerState_t
	SV_WriteSnapshotToClient( client, &msg );

#ifdef USE_DEMO_CLIENTS
	if ( client->demorecording ) {
		msg_t copyMsg;
		Com_Memcpy(&copyMsg, &msg, sizeof(copyMsg));
 		SV_WriteDemoMessage( client, &copyMsg, headerBytes );
 		playerState_t	*ps = SV_GameClientNum( client - svs.clients);
 		if (ps->pm_type == PM_INTERMISSION) {
 			SV_StopRecord( client );
 		}
 	}
#endif

	// bots need to have their snapshots build, but
	// the query them directly without needing to be sent
	if ( client->netchan.remoteAddress.type == NA_BOT ) {
#ifdef USE_MULTIVM_SERVER
		continue;
#else
		return;
#endif
	}

#ifdef USE_MULTIVM_SERVER
		if(client->multiview.protocol == 0 || client->mvAck == 0) {
			break;
		}
	}
	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif

	// check for overflow
	if ( msg.overflowed ) {
		Com_Printf( "WARNING: msg overflowed for %s\n", client->name );
		MSG_Clear( &msg );
	}

	SV_SendMessageToClient( &msg, client );
}


/*
=======================
SV_SendClientMessages
=======================
*/
void SV_SendClientMessages( void )
{
	int		i;
	client_t	*c;

	svs.msgTime = Sys_Milliseconds();

#ifdef USE_MV
	c = svs.clients + sv_maxclients->integer; // recorder slot
	if ( sv_demoFile != FS_INVALID_HANDLE
	 	&& !svs.emptyFrame // we want to record only synced game frames
		&& c->state >= CS_PRIMED)
	{
		SV_SendClientSnapshot( c );
		c->lastSnapshotTime = svs.time;
		c->rateDelayed = qfalse;
	}
#endif // USE_MV

	// send a message to each connected client
	for( i = 0; i < sv_maxclients->integer; i++ )
	{
		c = &svs.clients[ i ];
		
		if ( c->state == CS_FREE ) 
			continue;		// not connected

#ifdef USE_DEMO_SERVER
    // do not send a packet to a democlient, this will cause the engine to crash
    if(c->demoClient) // demo clients only exist in networking, not in qagame
      continue;
#endif

		if ( *c->downloadName )
			continue;		// Client is downloading, don't send snapshots

		// 1. Local clients get snapshots every server frame
		// 2. Remote clients get snapshots depending from rate and requested number of updates

		if ( svs.time - c->lastSnapshotTime < c->snapshotMsec * com_timescale->value )
			continue;		// It's not time yet

		if ( c->netchan.unsentFragments || c->netchan_start_queue )
		{
			c->rateDelayed = qtrue;
			continue;		// Drop this snapshot if the packet queue is still full or delta compression will break
		}
	
		if ( SV_RateMsec( c ) > 0 )
		{
			// Not enough time since last packet passed through the line
			c->rateDelayed = qtrue;
			continue;
		}
    
#ifdef USE_RECENT_EVENTS
    if(c->isRecent) {
      for(int i = c->recentMessageNum; i < recentI; i++) {
        NET_OutOfBandPrint( NS_SERVER, &c->netchan.remoteAddress, "recentEvent %s", recentEvents[i % MAX_RECENT_EVENTS] );
      }
      c->recentMessageNum = recentI;
    }
#endif

		// generate and send a new message
		SV_SendClientSnapshot( c );
		c->lastSnapshotTime = svs.time;
		c->rateDelayed = qfalse;
	}
}
