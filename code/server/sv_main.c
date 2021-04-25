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

serverStatic_t	svs;				// persistant server info
server_t		sv;					// local server
int       gvm = 0;
vm_t			*gvms[MAX_NUM_VMS];		// game virtual machine
//#ifdef USE_MULTIVM
int       gameWorlds[MAX_NUM_VMS];
//#endif

#ifdef USE_RECENT_EVENTS
char recentEvents[1024][MAX_INFO_STRING+400];
int recentI = 0;
cvar_t	*sv_recentPassword;		// password for recent event updates
static int lastReset = 0; // debounce events
static int numConnected = 0;
static byte numScored[128];
#endif

cvar_t	*sv_fps;				// time rate for running non-clients
cvar_t	*sv_timeout;			// seconds without any message
cvar_t	*sv_zombietime;			// seconds to sink messages after disconnect
cvar_t	*sv_rconPassword;		// password for remote server commands
cvar_t	*sv_privatePassword;	// password for the privateClient slots
cvar_t	*sv_allowDownload;
cvar_t	*sv_maxclients;
cvar_t	*sv_maxclientsPerIP;
cvar_t	*sv_clientTLD;

#ifdef USE_MV
fileHandle_t	sv_demoFile = FS_INVALID_HANDLE;
char	sv_demoFileName[ MAX_OSPATH ];
char	sv_demoFileNameLast[ MAX_OSPATH ];
int		sv_demoClientID; // current client
int		sv_lastAck;
int		sv_lastClientSeq;

cvar_t	*sv_mvClients;
cvar_t	*sv_mvPassword;
cvar_t	*sv_demoFlags;
cvar_t	*sv_mvAutoRecord;
cvar_t  *sv_autoRecordThreshold;

cvar_t	*sv_mvFileCount;
cvar_t	*sv_mvFolderSize;
#endif
#ifdef USE_MULTIVM
cvar_t  *sv_mvSyncPS; // synchronize player state between worlds
cvar_t  *sv_mvSyncXYZ;
cvar_t  *sv_mvWorld; // send world commands to manage view

#endif

cvar_t	*sv_privateClients;		// number of clients reserved for password
cvar_t	*sv_hostname;
cvar_t	*sv_master[MAX_MASTER_SERVERS];		// master server ip address
#ifdef USE_SERVER_ROLES
cvar_t  *sv_roles;
cvar_t	*sv_clientRoles[MAX_CLIENT_ROLES];		// master server ip address
cvar_t	*sv_role[MAX_CLIENT_ROLES];		// master server ip address
cvar_t	*sv_rolePassword[MAX_CLIENT_ROLES];
#endif
#ifdef USE_REFEREE_CMDS
cvar_t  *sv_lock[2];
cvar_t  *sv_frozen;
#endif
cvar_t  *sv_activeAction;
cvar_t	*sv_reconnectlimit;		// minimum seconds between connect messages
cvar_t	*sv_padPackets;			// add nop bytes to messages
cvar_t	*sv_killserver;			// menu system can set to 1 to shut server down
cvar_t	*sv_mapname;
cvar_t	*sv_mapChecksum;
cvar_t	*sv_referencedPakNames;
cvar_t	*sv_serverid;
cvar_t	*sv_minRate;
cvar_t	*sv_maxRate;
cvar_t	*sv_dlRate;
cvar_t	*sv_gametype;
cvar_t	*sv_pure;
cvar_t	*sv_floodProtect;
cvar_t	*sv_lanForceRate; // dedicated 1 (LAN) server forces local client rates to 99999 (bug #491)

cvar_t *sv_levelTimeReset;
cvar_t *sv_filter;

#ifdef USE_BANS
cvar_t	*sv_banFile;
serverBan_t serverBans[SERVER_MAXBANS];
int serverBansCount = 0;
#endif

cvar_t	*sv_democlients;		// number of slots reserved for playing a demo
cvar_t	*sv_demoState;
cvar_t	*sv_autoDemo;
cvar_t  *sv_autoRecord;
cvar_t	*cl_freezeDemo; // to freeze server-side demos
cvar_t	*sv_demoTolerant;

#ifdef USE_LNBITS
cvar_t  *sv_lnMatchPrice;
cvar_t  *sv_lnMatchCut;
cvar_t  *sv_lnMatchReward;
cvar_t  *sv_lnWallet;
cvar_t  *sv_lnKey;
cvar_t  *sv_lnAPI;
cvar_t  *sv_lnWithdraw;
#endif

/*
=============================================================================

EVENT MESSAGES

=============================================================================
*/

/*
===============
SV_ExpandNewlines

Converts newlines to "\n" so a line prints nicer
===============
*/
static const char *SV_ExpandNewlines( const char *in ) {
	static char string[MAX_STRING_CHARS*2];
	int		l;

	l = 0;
	while ( *in && l < sizeof(string) - 3 ) {
		if ( *in == '\n' ) {
			string[l++] = '\\';
			string[l++] = 'n';
		} else {
			string[l++] = *in;
		}
		in++;
	}
	string[l] = '\0';

	return string;
}


/*
======================
SV_ReplacePendingServerCommands

FIXME: This is ugly
======================
*/
#if 0 // unused
static int SV_ReplacePendingServerCommands( client_t *client, const char *cmd ) {
	int i, index, csnum1, csnum2;

	for ( i = client->reliableSent+1; i <= client->reliableSequence; i++ ) {
		index = i & ( MAX_RELIABLE_COMMANDS - 1 );
		//
		if ( !Q_strncmp(cmd, client->reliableCommands[ index ], strlen("cs")) ) {
			sscanf(cmd, "cs %i", &csnum1);
			sscanf(client->reliableCommands[ index ], "cs %i", &csnum2);
			if ( csnum1 == csnum2 ) {
				Q_strncpyz( client->reliableCommands[ index ], cmd, sizeof( client->reliableCommands[ index ] ) );
				/*
				if ( client->netchan.remoteAddress.type != NA_BOT ) {
					Com_Printf( "WARNING: client %i removed double pending config string %i: %s\n", client-svs.clients, csnum1, cmd );
				}
				*/
				return qtrue;
			}
		}
	}
	return qfalse;
}
#endif


/*
======================
SV_AddServerCommand

The given command will be transmitted to the client, and is guaranteed to
not have future snapshot_t executed before it is executed
======================
*/
void SV_AddServerCommand( client_t *client, const char *cmd ) {
	int		index, i;

	// this is very ugly but it's also a waste to for instance send multiple config string updates
	// for the same config string index in one snapshot
//	if ( SV_ReplacePendingServerCommands( client, cmd ) ) {
//		return;
//	}

	// do not send commands until the gamestate has been sent
	if ( client->state < CS_PRIMED )
		return;

	client->reliableSequence++;
	// if we would be losing an old command that hasn't been acknowledged,
	// we must drop the connection
	// we check == instead of >= so a broadcast print added by SV_DropClient()
	// doesn't cause a recursive drop client
	if ( client->reliableSequence - client->reliableAcknowledge == MAX_RELIABLE_COMMANDS + 1 ) {
		Com_Printf( "===== pending server commands =====\n" );
		for ( i = client->reliableAcknowledge + 1 ; i <= client->reliableSequence ; i++ ) {
			Com_Printf( "cmd %5d: %s\n", i, client->reliableCommands[ i & (MAX_RELIABLE_COMMANDS-1) ] );
		}
		Com_Printf( "cmd %5d: %s\n", i, cmd );
		SV_DropClient( client, "Server command overflow" );
		return;
	}
	index = client->reliableSequence & ( MAX_RELIABLE_COMMANDS - 1 );

	Q_strncpyz( client->reliableCommands[ index ], cmd, sizeof( client->reliableCommands[ index ] ) );
}


/*
=================
SV_SendServerCommand

Sends a reliable command string to be interpreted by 
the client game module: "cp", "print", "chat", etc
A NULL client will broadcast to all clients
=================
*/
void QDECL SV_SendServerCommand( client_t *cl, const char *fmt, ... ) {
	va_list		argptr;
	char		message[MAX_STRING_CHARS+128]; // slightly larger than allowed, to detect overflows
	client_t	*client;
	int			j, len;
	
	va_start( argptr, fmt );
	len = Q_vsnprintf( message, sizeof( message ), fmt, argptr );
	va_end( argptr );

	if ( cl != NULL ) {
#ifdef USE_MULTIVM
		if(cl->gameWorld != gvm) return;
#endif
		// outdated clients can't properly decode 1023-chars-long strings
		// http://aluigi.altervista.org/adv/q3msgboom-adv.txt
		if ( len <= 1022 || cl->longstr ) {
			SV_AddServerCommand( cl, message );
		}
		return;
	}

	// hack to echo broadcast prints to console
	if ( com_dedicated->integer && !strncmp( message, "print", 5 ) ) {
		Com_Printf( "broadcast: %s\n", SV_ExpandNewlines( message ) );
	}

	// save broadcasts to demo
	// note: in the case a command is only issued to a specific client, it is NOT recorded (see above when cl != NULL). If you want to record them, just place this code above, but be warned that it may be dangerous (such as "disconnect" command) because server commands will be replayed to every connected clients!
	if ( sv.demoState == DS_RECORDING ) {
		SV_DemoWriteServerCommand( (char *)message );
	}

	// send the data to all relevant clients
	for ( j = 0, client = svs.clients; j < sv_maxclients->integer ; j++, client++ ) {
		if ( len <= 1022 || client->longstr ) {
#ifdef USE_MULTIVM
			if(client->gameWorld != gvm) continue;
#endif
			SV_AddServerCommand( client, message );
		}
	}
}


/*
==============================================================================

MASTER SERVER FUNCTIONS

==============================================================================
*/

/*
================
SV_MasterHeartbeat

Send a message to the masters every few minutes to
let it know we are alive, and log information.
We will also have a heartbeat sent when a server
changes from empty to non-empty, and full to non-full,
but not on every player enter or exit.
================
*/
#define	HEARTBEAT_MSEC	(300*1000)
#define	MASTERDNS_MSEC	(24*60*60*1000)
static void SV_MasterHeartbeat( const char *message )
{
	static netadr_t	adr[MAX_MASTER_SERVERS][2]; // [2] for v4 and v6 address for the same address string.
	int			i;
	int			res;
	int			netenabled;

	netenabled = Cvar_VariableIntegerValue("net_enabled");

	// "dedicated 1" is for lan play, "dedicated 2" is for inet public play
	if (!com_dedicated || com_dedicated->integer != 2 || !(netenabled & (NET_ENABLEV4 | NET_ENABLEV6)))
		return;		// only dedicated servers send heartbeats

	// if not time yet, don't send anything
	if ( svs.nextHeartbeatTime - svs.time > 0 )
		return;

	svs.nextHeartbeatTime = svs.time + HEARTBEAT_MSEC;

	// send to group masters
	for (i = 0; i < MAX_MASTER_SERVERS; i++)
	{
		if(!sv_master[i] || !sv_master[i]->string[0])
			continue;

		// see if we haven't already resolved the name or if it's been over 24 hours
		// resolving usually causes hitches on win95, so only do it when needed
		if ( sv_master[i]->modified || svs.time - svs.masterResolveTime[i] > 0 )
		{
			sv_master[i]->modified = qfalse;
			svs.masterResolveTime[i] = svs.time + MASTERDNS_MSEC;
			
			if(netenabled & NET_ENABLEV4)
			{
				Com_Printf("Resolving %s (IPv4)\n", sv_master[i]->string);
				res = NET_StringToAdr(sv_master[i]->string, &adr[i][0], NA_IP);

				if(res == 2)
				{
					// if no port was specified, use the default master port
					adr[i][0].port = BigShort(PORT_MASTER);
				}
				
				if(res)
					Com_Printf( "%s resolved to %s\n", sv_master[i]->string, NET_AdrToStringwPort( &adr[i][0] ) );
				else
					Com_Printf( "%s has no IPv4 address.\n", sv_master[i]->string );
			}
#ifndef EMSCRIPTEN
#ifdef USE_IPV6
			if(netenabled & NET_ENABLEV6)
			{
				Com_Printf("Resolving %s (IPv6)\n", sv_master[i]->string);
				res = NET_StringToAdr(sv_master[i]->string, &adr[i][1], NA_IP6);

				if(res == 2)
				{
					// if no port was specified, use the default master port
					adr[i][1].port = BigShort(PORT_MASTER);
				}
				
				if(res)
					Com_Printf( "%s resolved to %s\n", sv_master[i]->string, NET_AdrToStringwPort( &adr[i][1] ) );
				else
					Com_Printf( "%s has no IPv6 address.\n", sv_master[i]->string );
			}
#endif
#endif
		}

		if( adr[i][0].type == NA_BAD && adr[i][1].type == NA_BAD )
		{
			continue;
		}


		Com_Printf ("Sending heartbeat to %s\n", sv_master[i]->string );

		// this command should be changed if the server info / status format
		// ever incompatably changes

		if(adr[i][0].type != NA_BAD)
			NET_OutOfBandPrint( NS_SERVER, &adr[i][0], "heartbeat %s\n", message);
		if(adr[i][1].type != NA_BAD)
			NET_OutOfBandPrint( NS_SERVER, &adr[i][1], "heartbeat %s\n", message);
	}
}


/*
=================
SV_MasterShutdown

Informs all masters that this server is going down
=================
*/
void SV_MasterShutdown( void )
{
	// send a heartbeat right now
	svs.nextHeartbeatTime = svs.time;
	SV_MasterHeartbeat(HEARTBEAT_FOR_MASTER);

	// send it again to minimize chance of drops
	svs.nextHeartbeatTime = svs.time;
	SV_MasterHeartbeat(HEARTBEAT_FOR_MASTER);

	// when the master tries to poll the server, it won't respond, so
	// it will be removed from the list
}


/*
==============================================================================

CONNECTIONLESS COMMANDS

==============================================================================
*/

// This is deliberately quite large to make it more of an effort to DoS
#define MAX_BUCKETS        16384
#define MAX_HASHES          1024

static leakyBucket_t buckets[ MAX_BUCKETS ];
static leakyBucket_t *bucketHashes[ MAX_HASHES ];
static rateLimit_t outboundRateLimit;

/*
================
SVC_HashForAddress
================
*/
static int SVC_HashForAddress( const netadr_t *address ) {
	const byte	*ip = NULL;
	int			size = 0;
	int			hash = 0;
	int			i;

	switch ( address->type ) {
		case NA_IP:  ip = address->ipv._4; size = 4;  break;
#ifdef USE_IPV6
		case NA_IP6: ip = address->ipv._6; size = 16; break;
#endif
		default: break;
	}

	for ( i = 0; i < size; i++ ) {
		hash += (int)( ip[ i ] ) * ( i + 119 );
	}

	hash = ( hash ^ ( hash >> 10 ) ^ ( hash >> 20 ) );
	hash &= ( MAX_HASHES - 1 );

	return hash;
}


/*
================
SVC_RelinkToHead
================
*/
static void SVC_RelinkToHead( leakyBucket_t *bucket, int hash ) {

	if ( bucket->prev != NULL ) {
		bucket->prev->next = bucket->next;
	} else {
		return;
	}

	if ( bucket->next != NULL ) {
		bucket->next->prev = bucket->prev;
	}

	bucket->next = bucketHashes[ hash ];
	if ( bucketHashes[ hash ] != NULL ) {
		bucketHashes[ hash ]->prev = bucket;
	}

	bucket->prev = NULL;
	bucketHashes[ hash ] = bucket;
}


/*
================
SVC_BucketForAddress

Find or allocate a bucket for an address
================
*/
static leakyBucket_t *SVC_BucketForAddress( const netadr_t *address, int burst, int period ) {
	static leakyBucket_t dummy = { 0 };
	static int		start = 0;
	const int		hash = SVC_HashForAddress( address );
	const int		now = Sys_Milliseconds();
	leakyBucket_t	*bucket;
	int				i, n;

	for ( bucket = bucketHashes[ hash ], n = 0; bucket; bucket = bucket->next, n++ ) {
		switch ( bucket->type ) {
			case NA_IP:
				if ( memcmp( bucket->ipv._4, address->ipv._4, 4 ) == 0 ) {
					if ( n > 8 ) {
						SVC_RelinkToHead( bucket, hash );
					}
					return bucket;
				}
				break;
#ifdef USE_IPV6
			case NA_IP6:
				if ( memcmp( bucket->ipv._6, address->ipv._6, 16 ) == 0 ) {
					if ( n > 8 ) {
						SVC_RelinkToHead( bucket, hash );
					}
					return bucket;
				}
				break;
#endif
			default:
				return &dummy;
		}
	}

	for ( i = 0; i < MAX_BUCKETS; i++ ) {
		int interval;

		if ( start >= MAX_BUCKETS )
			start = 0;
		bucket = &buckets[ start++ ];
		interval = now - bucket->rate.lastTime;

		// Reclaim expired buckets
		if ( bucket->type != NA_BAD && (unsigned)interval > ( bucket->rate.burst * period ) ) {
			if ( bucket->prev != NULL ) {
				bucket->prev->next = bucket->next;
			} else {
				bucketHashes[ bucket->hash ] = bucket->next;
			}
			
			if ( bucket->next != NULL ) {
				bucket->next->prev = bucket->prev;
			}

			bucket->type = NA_BAD;
		}

		if ( bucket->type == NA_BAD ) {
			bucket->type = address->type;
			switch ( address->type ) {
				case NA_IP:  Com_Memcpy( bucket->ipv._4, address->ipv._4, 4 );  break;
#ifdef USE_IPV6
				case NA_IP6: Com_Memcpy( bucket->ipv._6, address->ipv._6, 16 ); break;
#endif
				default: break;
			}

			bucket->rate.lastTime = now;
			bucket->rate.burst = 0;
			bucket->hash = hash;
			bucket->toxic = 0;

			// Add to the head of the relevant hash chain
			bucket->next = bucketHashes[ hash ];
			if ( bucketHashes[ hash ] != NULL ) {
				bucketHashes[ hash ]->prev = bucket;
			}

			bucket->prev = NULL;
			bucketHashes[ hash ] = bucket;

			return bucket;
		}
	}

	// Couldn't allocate a bucket for this address
	return NULL;
}


/*
================
SVC_RateLimit
================
*/
qboolean SVC_RateLimit( rateLimit_t *bucket, int burst, int period ) {
	int now = Sys_Milliseconds();
	int interval = now - bucket->lastTime;
	int expired = interval / period;
	int expiredRemainder = interval % period;

	if ( expired > bucket->burst || interval < 0 ) {
		bucket->burst = 0;
		bucket->lastTime = now;
	} else {
		bucket->burst -= expired;
		bucket->lastTime = now - expiredRemainder;
	}

	if ( bucket->burst < burst ) {
		bucket->burst++;
		return qfalse;
	}

	return qtrue;
}


/*
================
SVC_RateDrop
================
*/
static void SVC_RateDrop( leakyBucket_t *bucket, int burst ) {
	if ( bucket != NULL ) {
		if ( bucket->toxic < 10000 )
			++bucket->toxic;
		bucket->rate.burst = burst * bucket->toxic;
		bucket->rate.lastTime = Sys_Milliseconds();
	}
}


/*
================
SVC_RateRestoreBurst
================
*/
static void SVC_RateRestoreBurst( leakyBucket_t *bucket ) {
	if ( bucket != NULL ) {
		if ( bucket->rate.burst > 0 ) {
			bucket->rate.burst--;
		}
	}
}


/*
================
SVC_RateRestoreToxic
================
*/
static void SVC_RateRestoreToxic( leakyBucket_t *bucket ) {
	if ( bucket != NULL ) {
		if ( bucket->toxic > 0 ) {
			bucket->toxic--;
		}
	}
}


/*
================
SVC_RateLimitAddress

Rate limit for a particular address
================
*/
qboolean SVC_RateLimitAddress( const netadr_t *from, int burst, int period ) {
	leakyBucket_t *bucket = SVC_BucketForAddress( from, burst, period );

	return bucket ? SVC_RateLimit( &bucket->rate, burst, period ) : qtrue;
}


/*
================
SVC_RateRestoreAddress

Decrease burst rate
================
*/
void SVC_RateRestoreBurstAddress( const netadr_t *from, int burst, int period ) {
	leakyBucket_t *bucket = SVC_BucketForAddress( from, burst, period );

	SVC_RateRestoreBurst( bucket );
}


/*
================
SVC_RateRestoreToxicAddress

Decrease toxicity
================
*/
void SVC_RateRestoreToxicAddress( const netadr_t *from, int burst, int period ) {
	leakyBucket_t *bucket = SVC_BucketForAddress( from, burst, period );

	SVC_RateRestoreToxic( bucket );
}


/*
================
SVC_RateDropAddress
================
*/
void SVC_RateDropAddress( const netadr_t *from, int burst, int period ) {
	leakyBucket_t *bucket = SVC_BucketForAddress( from, burst, period );

	SVC_RateDrop( bucket, burst );
}


#ifdef USE_RECENT_EVENTS
static char *escaped;
const char *SV_EscapeStr(const char *str, int len) {
	return str;
	int count = 0, i, j;
	for(i = 0; i < len; i++) {
		if(str[i] == 0) break;
		if(str[i] == '\\') {
			count++;
		}
	}
	
	if(escaped) {
		Z_Free(escaped);
	}
	escaped = Z_Malloc((len+count)*8);
	for(i = 0, j = 0; i < len; i++, j++) {
		if(str[i] == 0) break;
		if(str[i] == '\\') {
			escaped[j] = '\\';
			j++;
		}
		escaped[j] = str[i];
	}
	return escaped;
}

void SV_RecentStatus(recentEvent_t type) {
	client_t *c;
	playerState_t *ps;
	int playerLength;
	int statusLength;
	int i;
	char player[MAX_NAME_LENGTH + 100];
	char status[MAX_INFO_STRING];
	char *cl_guid;
	char *s;
	i = 0;
	memcpy(&recentEvents[recentI++], va(RECENT_TEMPLATE_STR, sv.time, SV_EVENT_SERVERINFO, SV_EscapeStr(Cvar_InfoString( CVAR_SERVERINFO, NULL ), MAX_INFO_STRING)), MAX_INFO_STRING);
	if(recentI == 1024) recentI = 0;
makestatus:
	s = &status[1];
	status[0] = '[';
	status[1] = '\0';
	statusLength = 1;
	for ( ; i < sv_maxclients->integer ; i++ ) {
		c = &svs.clients[i];
		if ( c->state >= CS_CONNECTED ) {
			cl_guid = Info_ValueForKey(c->userinfo, "cl_guid");
			ps = SV_GameClientNum( i );
			playerLength = Com_sprintf( player, sizeof( player ), "[\"%s\",%i,%i,\"%s\",%i,%i,%i,%i],",
				cl_guid, 
				ps->persistant[ PERS_SCORE ], c->ping, c->name,
				ps->persistant[ PERS_HITS ], ps->persistant[ PERS_EXCELLENT_COUNT ],
				ps->persistant[ PERS_IMPRESSIVE_COUNT ], ps->persistant[ PERS_KILLED ]);
			
			if ( statusLength + playerLength >= MAX_INFO_STRING - 100 ) {
				goto sendstatus;
			}
			
			s = Q_stradd( s, player );
			statusLength += playerLength;
		}
	}

sendstatus:
	// replace the final comma with a closing bracket
	status[statusLength-1] = ']';
	// the polling service should callback at this time for a getstatus message?
	// TODO: update match ended with player list
	memcpy(&recentEvents[recentI++], va(RECENT_TEMPLATE, sv.time, type, status), MAX_INFO_STRING);
	if(recentI == 1024) recentI = 0;
	if(i < sv_maxclients->integer) {
		goto makestatus;
	}
}
#endif


/*
================
SVC_Status

Responds with all the info that qplug or qspy can see about the server
and all connected players.  Used for getting detailed information after
the simple info query.
================
*/
static void SVC_Status( const netadr_t *from ) {
	char	player[MAX_NAME_LENGTH + 32]; // score + ping + name
	char	status[MAX_PACKETLEN];
	char	*s;
	int		i;
	client_t	*cl;
	playerState_t	*ps;
	int		statusLength;
	int		playerLength;
	char	infostring[MAX_INFO_STRING+160]; // add some space for challenge string

	// ignore if we are in single player
#ifndef DEDICATED
#ifdef USE_LOCAL_DED
	// allow people to connect to your single player server
	if(qfalse && !com_dedicated->integer)
#endif
	if ( Cvar_VariableIntegerValue( "g_gametype" ) == GT_SINGLE_PLAYER || Cvar_VariableIntegerValue("ui_singlePlayerActive")) {
		return;
	}
#endif

	// Prevent using getstatus as an amplifier
	if ( SVC_RateLimitAddress( from, 10, 1000 ) ) {
		if ( com_developer->integer ) {
			Com_Printf( "SVC_Status: rate limit from %s exceeded, dropping request\n",
				NET_AdrToString( from ) );
		}
		return;
	}

	// Allow getstatus to be DoSed relatively easily, but prevent
	// excess outbound bandwidth usage when being flooded inbound
	if ( SVC_RateLimit( &outboundRateLimit, 10, 100 ) ) {
		Com_DPrintf( "SVC_Status: rate limit exceeded, dropping request\n" );
		return;
	}

	// A maximum challenge length of 128 should be more than plenty.
	if ( strlen( Cmd_Argv( 1 ) ) > 128 )
		return;

	Q_strncpyz( infostring, Cvar_InfoString( CVAR_SERVERINFO, NULL ), sizeof( infostring ) );

	// echo back the parameter to status. so master servers can use it as a challenge
	// to prevent timed spoofed reply packets that add ghost servers
	Info_SetValueForKey( infostring, "challenge", Cmd_Argv( 1 ) );

	s = status;
	status[0] = '\0';
	statusLength = strlen( infostring ) + 16; // strlen( "statusResponse\n\n" )

	for ( i = 0 ; i < sv_maxclients->integer ; i++ ) {
		cl = &svs.clients[i];
		if ( cl->state >= CS_CONNECTED ) {

			ps = SV_GameClientNum( i );
			playerLength = Com_sprintf( player, sizeof( player ), "%i %i \"%s\"\n", 
				ps->persistant[ PERS_SCORE ], cl->ping, cl->name );
			
			if ( statusLength + playerLength >= MAX_PACKETLEN-4 )
				break; // can't hold any more
			
			s = Q_stradd( s, player );
			statusLength += playerLength;
		}
	}

	NET_OutOfBandPrint( NS_SERVER, from, "statusResponse\n%s\n%s", infostring, status );
}


/*
================
SVC_Info

Responds with a short info message that should be enough to determine
if a user is interested in a server to do a full status
================
*/
static void SVC_Info( const netadr_t *from ) {
	int		i, count, humans;
	const char	*gamedir;
	char	infostring[MAX_INFO_STRING];

	// ignore if we are in single player
#ifndef DEDICATED
#ifdef USE_LOCAL_DED
	// allow people to connect to your single player server
	if(qfalse && !com_dedicated->integer)
#endif
	if ( Cvar_VariableIntegerValue( "g_gametype" ) == GT_SINGLE_PLAYER || Cvar_VariableIntegerValue("ui_singlePlayerActive")) {
		return;
	}
#endif

	// Prevent using getinfo as an amplifier
	if ( SVC_RateLimitAddress( from, 10, 1000 ) ) {
		if ( com_developer->integer ) {
			Com_Printf( "SVC_Info: rate limit from %s exceeded, dropping request\n",
				NET_AdrToString( from ) );
		}
		return;
	}

	// Allow getinfo to be DoSed relatively easily, but prevent
	// excess outbound bandwidth usage when being flooded inbound
	if ( SVC_RateLimit( &outboundRateLimit, 10, 100 ) ) {
		Com_DPrintf( "SVC_Info: rate limit exceeded, dropping request\n" );
		return;
	}

	/*
	 * Check whether Cmd_Argv(1) has a sane length. This was not done in the original Quake3 version which led
	 * to the Infostring bug discovered by Luigi Auriemma. See http://aluigi.altervista.org/ for the advisory.
	 */

	// A maximum challenge length of 128 should be more than plenty.
	if ( strlen( Cmd_Argv( 1 ) ) > 128 )
		return;

	// don't count privateclients
	count = humans = 0;
	for ( i = sv_privateClients->integer ; i < sv_maxclients->integer ; i++ ) {
		if ( svs.clients[i].state >= CS_CONNECTED ) {
			count++;
			if (svs.clients[i].netchan.remoteAddress.type != NA_BOT) {
				humans++;
			}
		}
	}

	infostring[0] = '\0';

	// echo back the parameter to status. so servers can use it as a challenge
	// to prevent timed spoofed reply packets that add ghost servers
	Info_SetValueForKey( infostring, "challenge", Cmd_Argv(1) );

	Info_SetValueForKey( infostring, "gamename", com_gamename->string );
	Info_SetValueForKey( infostring, "protocol", va("%i", PROTOCOL_VERSION) );
	Info_SetValueForKey( infostring, "hostname", sv_hostname->string );
	Info_SetValueForKey( infostring, "mapname", sv_mapname->string );
	Info_SetValueForKey( infostring, "clients", va("%i", count) );
	Info_SetValueForKey(infostring, "g_humanplayers", va("%i", humans));
	Info_SetValueForKey( infostring, "sv_maxclients", 
		va("%i", sv_maxclients->integer - sv_privateClients->integer - sv_democlients->integer ) );
	Info_SetValueForKey( infostring, "gametype", va("%i", sv_gametype->integer ) );
	Info_SetValueForKey( infostring, "pure", va("%i", sv_pure->integer ) );
	Info_SetValueForKey(infostring, "g_needpass", va("%d", Cvar_VariableIntegerValue("g_needpass")));
	gamedir = Cvar_VariableString( "fs_game" );
	if( *gamedir ) {
		Info_SetValueForKey( infostring, "game", gamedir );
	} else {
		Info_SetValueForKey( infostring, "game", BASEGAME );
	}

	NET_OutOfBandPrint( NS_SERVER, from, "infoResponse\n%s", infostring );
}


/*
================
SV_FlushRedirect
================
*/
netadr_t redirectAddress; // for rcon return messages

void SV_FlushRedirect( const char *outputbuf )
{
	if ( *outputbuf )
	{
		NET_OutOfBandPrint( NS_SERVER, &redirectAddress, "print\n%s", outputbuf );
	}
}


#ifdef USE_SERVER_ROLES
static qboolean SV_UserHasAccess(const char *pw, int *role) {
	SV_InitUserRoles();

	// check passwords	
	for(int i = 0; i < MAX_CLIENT_ROLES; i++) {
		if(sv_role[i] && sv_rolePassword[i] && sv_rolePassword[i]->string[0] 
			&& strcmp( pw, sv_rolePassword[i]->string ) == 0) {
			// update command list with current role information
			Cmd_FilterLimited(sv_role[i]->string);
			*role = i;
			return qtrue;
		}
	}
	return qfalse;
}
#endif


/*
===============
SVC_RemoteCommand

An rcon packet arrived from the network.
Shift down the remaining args
Redirect all printfs
===============
*/
static void SVC_RemoteCommand( const netadr_t *from ) {
	static rateLimit_t bucket;
	qboolean	valid;
	qboolean  limited;
	int role;
	// TTimo - scaled down to accumulate, but not overflow anything network wise, print wise etc.
	// (OOB messages are the bottleneck here)
	char		sv_outputbuf[1024 - 16];
	const char	*cmd_aux, *pw, *cmd;

	// Prevent using rcon as an amplifier and make dictionary attacks impractical
	if ( SVC_RateLimitAddress( from, 10, 1000 ) ) {
		if ( com_developer->integer ) {
			Com_Printf( "SVC_RemoteCommand: rate limit from %s exceeded, dropping request\n",
				NET_AdrToString( from ) );
		}
		return;
	}

	pw = Cmd_Argv( 1 );
	if ( ( sv_rconPassword->string[0] && strcmp( pw, sv_rconPassword->string ) == 0 ) ||
		( rconPassword2[0] && strcmp( pw, rconPassword2 ) == 0 ) ) {
		limited = qfalse;
		valid = qtrue;
		Com_Printf( "Rcon from %s: %s\n", NET_AdrToString( from ), Cmd_ArgsFrom( 2 ) );
#ifdef USE_SERVER_ROLES
	} else if (SV_UserHasAccess(pw, &role)) {
		limited = qtrue;
		valid = qtrue;
		Com_Printf( "Rcon (limited) from %s: %s\n", NET_AdrToString( from ), Cmd_ArgsFrom( 2 ) );
#endif
#ifdef USE_RECENT_EVENTS
	} else if (( sv_recentPassword->string[0] && strcmp( pw, sv_recentPassword->string ) == 0 )) {
		// send connected client guids to requester
		SV_RecentStatus(SV_EVENT_GETSTATUS);
		
		// send all events to requester
		for(int i = 0; i < ARRAY_LEN(recentEvents); i++) {
			if(recentEvents[i][0] == 0)
				continue;
			NET_OutOfBandPrint( NS_SERVER, from, "%s", recentEvents[i] );
		}
		return;
#endif
	} else {
		// Make DoS via rcon impractical
		if ( SVC_RateLimit( &bucket, 10, 1000 ) ) {
			Com_DPrintf( "SVC_RemoteCommand: rate limit exceeded, dropping request\n" );
			return;
		}

		valid = qfalse;
		Com_Printf( "Bad rcon from %s: %s\n", NET_AdrToString( from ), Cmd_ArgsFrom( 2 ) );
	}

	// start redirecting all print outputs to the packet
	redirectAddress = *from;
	Com_BeginRedirect( sv_outputbuf, sizeof( sv_outputbuf ), SV_FlushRedirect );

#ifndef USE_LOCAL_DED
	if ( !sv_rconPassword->string[0] && !rconPassword2[0] ) {
		Com_Printf( "No rconpassword set on the server.\n" );
	} else if ( !valid ) {
		Com_Printf( "Bad rconpassword.\n" );
#else
;
	// allow empty rcon password
	if(!(!sv_rconPassword->string[0] && !rconPassword2[0]) && !valid) {
		Com_Printf( "Bad rconpassword.\n" );
#endif
	} else {
		// https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=543
		// get the command directly, "rcon <pass> <command>" to avoid quoting issues
		// extract the command by walking
		// since the cmd formatting can fuckup (amount of spaces), using a dumb step by step parsing
		cmd_aux = Cmd_Cmd();
		while ( *cmd_aux && *cmd_aux <= ' ' ) // skip whitespace
			cmd_aux++;
		cmd_aux += 4; // "rcon"
		while ( *cmd_aux == ' ' )
			cmd_aux++;
		if ( *cmd_aux == '"' ) {
			cmd_aux++;
			while ( *cmd_aux && *cmd_aux != '"' ) // quoted password
				cmd_aux++;
			if ( *cmd_aux == '"' )
				cmd_aux++;
		} else {
			while ( *cmd_aux && *cmd_aux != ' ' ) // password
				cmd_aux++;
		}
		while ( *cmd_aux == ' ' )
			cmd_aux++;

		cmd = Cmd_Argv( 2 );
		if(!strcmp(cmd, "complete")) {
			char	infostring[MAX_INFO_STRING];
			field_t rconField;
			cmd_aux += 9;
			memcpy(rconField.buffer, cmd_aux, sizeof(rconField.buffer));
			Field_AutoComplete( &rconField );
			infostring[0] = '\0';
			Info_SetValueForKey( infostring, "autocomplete", &rconField.buffer[1] );
			NET_OutOfBandPrint( NS_SERVER, from, "infoResponse\n%s", infostring );
		} else {
#ifdef USE_SERVER_ROLES
			if(limited) {
				Cmd_ExecuteLimitedString( cmd_aux, qfalse, role );
			} else
#endif
			Cmd_ExecuteString( cmd_aux, qfalse, gvm );
		}
	}

	Com_EndRedirect();
}


/*
=================
SV_ConnectionlessPacket

A connectionless packet has four leading 0xff
characters to distinguish it from a game channel.
Clients that are in the game can still send
connectionless packets.
=================
*/
static void SV_ConnectionlessPacket( const netadr_t *from, msg_t *msg ) {
	const char *s;
	const char *c;

	MSG_BeginReadingOOB( msg );
	MSG_ReadLong( msg );		// skip the -1 marker

	if ( !memcmp( "connect ", msg->data + 4, 8 ) ) {
		if ( msg->cursize > MAX_INFO_STRING*2 ) { // if we assume 200% compression ratio on userinfo
			if ( com_developer->integer ) {
				Com_Printf( "%s : connect packet is too long - %i\n", NET_AdrToString( from ), msg->cursize );
			}
			return;
		}
		Huff_Decompress( msg, 12 );
	}

	s = MSG_ReadStringLine( msg );
	Cmd_TokenizeString( s );

	c = Cmd_Argv(0);

	if ( com_developer->integer ) {
		Com_Printf( "SV packet %s : %s\n", NET_AdrToString( from ), c );
	}

	if ( !Q_stricmp(c, "rcon") ) {
		SVC_RemoteCommand( from );
		return;
	}

	if ( !com_sv_running->integer ) {
		return;
	}

	if (!Q_stricmp(c, "getstatus")) {
		SVC_Status( from );
	} else if (!Q_stricmp(c, "getinfo")) {
		SVC_Info( from );
	} else if (!Q_stricmp(c, "getchallenge")) {
		SV_GetChallenge( from );
	} else if (!Q_stricmp(c, "connect")) {
		SV_DirectConnect( from );
#ifndef STANDALONE
	} else if (!Q_stricmp(c, "ipAuthorize")) {
		// removed from codebase since stateless challenges
#endif
	} else if (!Q_stricmp(c, "disconnect")) {
		// if a client starts up a local server, we may see some spurious
		// server disconnect messages when their new server sees our final
		// sequenced messages to the old client
	} else {
		if ( com_developer->integer ) {
			Com_Printf( "bad connectionless packet from %s:\n%s\n",
				NET_AdrToString( from ), s );
		}
	}
}

//============================================================================

/*
=================
SV_PacketEvent
=================
*/
void SV_PacketEvent( const netadr_t *from, msg_t *msg ) {
	int			i;
	client_t	*cl;
	int			qport;

	if ( msg->cursize < 6 ) // too short for anything
		return;

	// check for connectionless packet (0xffffffff) first
	if ( *(int *)msg->data == -1 ) {
		SV_ConnectionlessPacket( from, msg );
		return;
	}

	if ( sv.state == SS_DEAD ) {
		return;
	}

	// read the qport out of the message so we can fix up
	// stupid address translating routers
	MSG_BeginReadingOOB( msg );
	MSG_ReadLong( msg ); // sequence number
	qport = MSG_ReadShort( msg ) & 0xffff;

	// find which client the message is from
	for (i=0, cl=svs.clients ; i < sv_maxclients->integer ; i++,cl++) {
		if (cl->state == CS_FREE) {
			continue;
		}
		if ( !NET_CompareBaseAdr( from, &cl->netchan.remoteAddress ) ) {
			continue;
		}
		// it is possible to have multiple clients from a single IP
		// address, so they are differentiated by the qport variable
		if (cl->netchan.qport != qport) {
			continue;
		}

		// make sure it is a valid, in sequence packet
		if (SV_Netchan_Process(cl, msg)) {
			// the IP port can't be used to differentiate clients, because
			// some address translating routers periodically change UDP
			// port assignments
			if (cl->netchan.remoteAddress.port != from->port) {
				Com_Printf( "SV_PacketEvent: fixing up a translated port\n" );
				cl->netchan.remoteAddress.port = from->port;
			}
			// zombie clients still need to do the Netchan_Process
			// to make sure they don't need to retransmit the final
			// reliable message, but they don't do any other processing
			if (cl->state != CS_ZOMBIE) {
				cl->lastPacketTime = svs.time;	// don't timeout
				SV_ExecuteClientMessage( cl, msg );
			}
			return;
		}
	}
}


/*
===================
SV_CalcPings

Updates the cl->ping variables
===================
*/
static void SV_CalcPings( void ) {
	int			i, j;
	client_t	*cl;
	int			total, count;
	int			delta;
	playerState_t	*ps;

	for (i=0 ; i < sv_maxclients->integer ; i++) {
		cl = &svs.clients[i];
		if ( cl->state != CS_ACTIVE ) {
			cl->ping = 999;
			continue;
		}
		if ( !cl->gentity ) {
			cl->ping = 999;
			continue;
		}
		if ( cl->netchan.remoteAddress.type == NA_BOT ) {
			cl->ping = 0;
			continue;
		}

		total = 0;
		count = 0;
		for ( j = 0 ; j < PACKET_BACKUP ; j++ ) {
#ifdef USE_MV
			if ( cl->frames[cl->gameWorld][j].messageAcked == 0 ) {
				continue;
			}
			delta = cl->frames[cl->gameWorld][j].messageAcked - cl->frames[cl->gameWorld][j].messageSent;
#else
			if ( cl->frames[0][j].messageAcked == 0 ) {
				continue;
			}
			delta = cl->frames[0][j].messageAcked - cl->frames[0][j].messageSent;
#endif
			count++;
			total += delta;
		}
		if (!count) {
			cl->ping = 999;
		} else {
			cl->ping = total/count;
			if ( cl->ping > 999 ) {
				cl->ping = 999;
			}
		}

		// let the game dll know about the ping
		ps = SV_GameClientNum( i );
		ps->ping = cl->ping;
	}
}

/*
==================
SV_CheckTimeouts

If a packet has not been received from a client for timeout->integer 
seconds, drop the conneciton.  Server time is used instead of
realtime to avoid dropping the local client while debugging.

When a client is normally dropped, the client_t goes into a zombie state
for a few seconds to make sure any final reliable message gets resent
if necessary
==================
*/
static void SV_CheckTimeouts( void ) {
	int		i;
	client_t	*cl;
	int			droppoint;
	int			zombiepoint;

	droppoint = svs.time - 1000 * sv_timeout->integer;
	zombiepoint = svs.time - 1000 * sv_zombietime->integer;

	for ( i = 0, cl = svs.clients ; i < sv_maxclients->integer ; i++, cl++ ) {
		if ( cl->state == CS_FREE ) {
			continue;
		}
		// message times may be wrong across a changelevel
		if ( cl->lastPacketTime - svs.time > 0 ) {
			cl->lastPacketTime = svs.time;
		}

		if ( cl->state == CS_ZOMBIE && cl->lastPacketTime - zombiepoint < 0 ) {
			// using the client id cause the cl->name is empty at this point
			Com_DPrintf( "Going from CS_ZOMBIE to CS_FREE for client %d\n", i );
#ifdef USE_MULTIVM
			sharedEntity_t *ent;
			int prevGvm = gvm;
			for(int igvm = 0; igvm < MAX_NUM_VMS; igvm++) {
				if(!gvms[igvm]) continue;
				gvm = igvm;
				CM_SwitchMap(gameWorlds[gvm]);
				SV_SetAASgvm(gvm);
				ent = SV_GentityNum( i );
				ent->s.eType = 0;
			}
			gvm = prevGvm;
			CM_SwitchMap(gameWorlds[gvm]);
			SV_SetAASgvm(gvm);
#endif
			cl->state = CS_FREE;	// can now be reused
			continue;
		}
		if ( cl->justConnected && svs.time - cl->lastPacketTime > 4000 ) {
			// for real client 4 seconds is more than enough to respond
			SVC_RateDropAddress( &cl->netchan.remoteAddress, 10, 1000 ); // enforce burst with progressive multiplier
			SV_DropClient( cl, NULL ); // drop silently
			cl->state = CS_FREE;
			continue;
		}
		if ( cl->state >= CS_CONNECTED && cl->lastPacketTime - droppoint < 0 ) {
			// wait several frames so a debugger session doesn't
			// cause a timeout
			if ( ++cl->timeoutCount > 5 ) {
				SV_DropClient( cl, "timed out" );
				cl->state = CS_FREE;	// don't bother with zombie state
			}
		} else {
			cl->timeoutCount = 0;
		}
	}
}


/*
==================
SV_CheckPaused
==================
*/
static qboolean SV_CheckPaused( void ) {

#ifdef DEDICATED
	// can't pause on dedicated servers
	return qfalse;
#else
	const client_t *cl;
	int	count;
	int	i;

	// only pause if there is just a single client connected
	count = 0;
	for (i=0,cl=svs.clients ; i < sv_maxclients->integer ; i++,cl++) {
		if ( cl->state >= CS_CONNECTED && cl->netchan.remoteAddress.type != NA_BOT ) {
			count++;
			if(atoi(Info_ValueForKey(cl->userinfo, "cl_paused"))) {
				Cvar_Set("cl_paused", "1");
			}
		}
	}

	if ( !cl_paused->integer ) {
		return qfalse;
	}

	if ( count > 1 ) {
		// don't pause
		if (sv_paused->integer)
			Cvar_Set("sv_paused", "0");
		return qfalse;
	}

	if (!sv_paused->integer)
		Cvar_Set("sv_paused", "1");

	return qtrue;
#endif // !DEDICATED
}


/*
==================
SV_FrameMsec
Return time in millseconds until processing of the next server frame.
==================
*/
int SV_FrameMsec( void )
{
	if ( sv_fps )
	{
		int frameMsec;
		
		frameMsec = 1000.0f / sv_fps->value;
		
		if ( frameMsec < sv.timeResidual )
			return 0;
		else
			return frameMsec - sv.timeResidual;
	}
	else
		return 1;
}


/*
==================
SV_TrackCvarChanges
==================
*/
void SV_TrackCvarChanges( void )
{
	client_t *cl;
	int i;

	if ( sv_maxRate->integer && sv_maxRate->integer < 1000 ) {
		Cvar_Set( "sv_maxRate", "1000" );
		Com_DPrintf( "sv_maxRate adjusted to 1000\n" );
	}

	if ( sv_minRate->integer && sv_minRate->integer < 1000 ) {
		Cvar_Set( "sv_minRate", "1000" );
		Com_DPrintf( "sv_minRate adjusted to 1000\n" );
	}

	Cvar_ResetGroup( CVG_SERVER, qfalse );

	if ( sv.state == SS_DEAD || !svs.clients )
		return;

	for ( i = 0, cl = svs.clients; i < sv_maxclients->integer; i++, cl++ ) {
		if ( cl->state >= CS_CONNECTED ) {
			SV_UserinfoChanged( cl, qfalse, qfalse ); // do not update userinfo, do not run filter
		}
	}
}


/*
==================
SV_Restart
==================
*/
static void SV_Restart( const char *reason ) {
	qboolean sv_shutdown = qfalse;
	char mapName[ MAX_CVAR_VALUE_STRING ];
	int i;

	if ( svs.clients ) {
		// check if we can reset map time without full server shutdown
		for ( i = 0; i < sv_maxclients->integer; i++ ) {
			if ( svs.clients[i].state >= CS_CONNECTED ) {
				sv_shutdown = qtrue;
				break;
			}
		}
	}

	sv.time = 0; // force level time reset
	sv.restartTime = 0;
	
	Cvar_VariableStringBuffer( "mapname", mapName, sizeof( mapName ) );
	
	if ( sv_shutdown ) {
		SV_Shutdown( reason );
	}

	Cbuf_AddText( va( "map %s\n", mapName ) );
}


/*
==================
SV_Frame

Player movement occurs as a result of packet events, which
happen before SV_Frame is called
==================
*/
void SV_Frame( int msec ) {
	int		frameMsec;
	int		startTime;
	int		i, n;

	if ( Cvar_CheckGroup( CVG_SERVER ) )
		SV_TrackCvarChanges(); // update rate settings, etc.

	// the menu kills the server with this cvar
	if ( sv_killserver->integer ) {
		SV_Shutdown( "Server was killed" );
		Cvar_Set( "sv_killserver", "0" );
		return;
	}

	if ( !com_sv_running->integer )
	{
		if ( com_dedicated->integer )
		{
			// Block indefinitely until something interesting happens
			// on STDIN.
#ifndef EMSCRIPTEN
			Sys_Sleep( -1 );
#endif
		}
		return;
	}

#ifdef USE_CURL	
	if ( svDownload.cURL ) 
	{
		Com_DL_Perform( &svDownload );
	}
#endif

#ifdef USE_LNBITS
	SV_CheckInvoicesAndPayments();
#endif

#ifdef USE_MULTIVM
	gvm = 0;
	CM_SwitchMap(gameWorlds[gvm]);
	SV_SetAASgvm(gvm);
#endif

	// allow pause if only the local client is connected
	if ( SV_CheckPaused() ) {
		return;
	}

	// if it isn't time for the next frame, do nothing

	frameMsec = 1000 / sv_fps->integer * com_timescale->value;
	// don't let it scale below 1ms
	if(frameMsec < 1)
	{
		Cvar_Set( "timescale", va( "%f", sv_fps->value / 1000.0f ) );
		Com_DPrintf( "timescale adjusted to %f\n", com_timescale->value );
		frameMsec = 1;
	}

	sv.timeResidual += msec;

#ifdef USE_MULTIVM
	for(i = 0; i < MAX_NUM_VMS; i++) {
		if(!gvms[i]) continue;
		gvm = i;
		CM_SwitchMap(gameWorlds[gvm]);
		SV_SetAASgvm(gvm);
		if ( !com_dedicated->integer )
			SV_BotFrame( sv.time + sv.timeResidual );
	}
	gvm = 0;
	CM_SwitchMap(gameWorlds[gvm]);
	SV_SetAASgvm(gvm);
#else
	if ( !com_dedicated->integer )
		SV_BotFrame( sv.time + sv.timeResidual );
#endif

	// if time is about to hit the 32nd bit, kick all clients
	// and clear sv.time, rather
	// than checking for negative time wraparound everywhere.
	// 2giga-milliseconds = 23 days, so it won't be too often
	if ( sv.time > 0x78000000 ) {
		SV_Restart( "Restarting server due to time wrapping" );
		return;
	}

	// try to do silent restart earlier if possible
	if ( sv.time > (12*3600*1000) && ( sv_levelTimeReset->integer == 0 || sv.time > 0x40000000 ) ) {
		n = 0;
		if ( svs.clients ) {
			for ( i = 0; i < sv_maxclients->integer; i++ ) {
				// FIXME: deal with bots (reconnect?)
				if ( svs.clients[i].state != CS_FREE && svs.clients[i].netchan.remoteAddress.type != NA_BOT ) {
					n = 1;
					break;
				}
			}
		}
		if ( !n ) {
			SV_Restart( "Restarting server" );
			return;
		}
	}

#ifdef USE_MV
	if ( svs.nextSnapshotPSF > svs.modSnapshotPSF + svs.numSnapshotPSF ) {
		svs.nextSnapshotPSF -= svs.modSnapshotPSF;
		if ( svs.clients ) {
			for ( i = 0; i < sv_maxclients->integer; i++ ) {
				if ( svs.clients[ i ].state < CS_CONNECTED )
					continue;
#ifdef USE_MULTIVM
				for(int j = 0; j < MAX_NUM_VMS; j++) {
					for ( n = 0; n < PACKET_BACKUP; n++ ) {
						if ( svs.clients[ i ].frames[j][ n ].first_psf > svs.modSnapshotPSF )
							svs.clients[ i ].frames[j][ n ].first_psf -= svs.modSnapshotPSF;
					}
				}
#else
				for ( n = 0; n < PACKET_BACKUP; n++ ) {
					if ( svs.clients[ i ].frames[0][ n ].first_psf > svs.modSnapshotPSF )
						svs.clients[ i ].frames[0][ n ].first_psf -= svs.modSnapshotPSF;
				}
#endif
			}
		}
	}
#endif

	if ( sv.restartTime && sv.time >= sv.restartTime ) {
		sv.restartTime = 0;
		Cbuf_AddText( "map_restart 0\n" );
		return;
	}

	// update infostrings if anything has been changed
	if ( cvar_modifiedFlags & CVAR_SERVERINFO ) {
		SV_SetConfigstring( CS_SERVERINFO, Cvar_InfoString( CVAR_SERVERINFO, NULL ) );
		cvar_modifiedFlags &= ~CVAR_SERVERINFO;
	}
	if ( cvar_modifiedFlags & CVAR_SYSTEMINFO ) {
		SV_SetConfigstring( CS_SYSTEMINFO, Cvar_InfoString_Big( CVAR_SYSTEMINFO, NULL ) );
		cvar_modifiedFlags &= ~CVAR_SYSTEMINFO;
	}

	if ( com_speeds->integer ) {
		startTime = Sys_Milliseconds();
	} else {
		startTime = 0;	// quite a compiler warning
	}

	// update ping based on the all received frames
	SV_CalcPings();

#ifdef USE_MULTIVM
	for(i = 0; i < MAX_NUM_VMS; i++) {
		if(!gvms[i]) continue;
		gvm = i;
		CM_SwitchMap(gameWorlds[gvm]);
		SV_SetAASgvm(gvm);
		if (com_dedicated->integer) SV_BotFrame (sv.time);
	}
	gvm = 0;
	CM_SwitchMap(gameWorlds[gvm]);
	SV_SetAASgvm(gvm);
#else
	if (com_dedicated->integer) SV_BotFrame (sv.time);
#endif

#ifdef USE_MV
	svs.emptyFrame = qtrue;
#endif

	// run the game simulation in chunks
	while ( sv.timeResidual >= frameMsec ) {
		sv.timeResidual -= frameMsec;
		svs.time += frameMsec;
		sv.time += frameMsec;

		// let everything in the world think and move
		for(i = 0; i < MAX_NUM_VMS; i++) {
			if(!gvms[i]) continue;
			gvm = i;
			CM_SwitchMap(gameWorlds[gvm]);
			SV_SetAASgvm(gvm);
			VM_Call( gvms[gvm], 1, GAME_RUN_FRAME, sv.time );
		}
		gvm = 0;
		CM_SwitchMap(gameWorlds[gvm]);
		SV_SetAASgvm(gvm);
		
#ifdef USE_MV
		svs.emptyFrame = qfalse; // ok, run recorder
#endif

		// play/record demo frame (if enabled)
		if (sv.demoState == DS_RECORDING) // Record the frame
			SV_DemoWriteFrame();
		else if (sv.demoState == DS_WAITINGPLAYBACK || Cvar_VariableIntegerValue("sv_demoState") == DS_WAITINGPLAYBACK) // Launch again the playback of the demo (because we needed a restart in order to set some cvars such as sv_maxclients or fs_game)
			SV_DemoRestartPlayback();
		else if (sv.demoState == DS_PLAYBACK) // Play the next demo frame
			SV_DemoReadFrame();
	}

	if ( com_speeds->integer ) {
		time_game = Sys_Milliseconds () - startTime;
	}

	// check timeouts
	SV_CheckTimeouts();

	// reset current and build new snapshot on first query
	SV_IssueNewSnapshot();

#ifdef USE_RECENT_EVENTS
	numConnected = 0;
	for( i = 0; i < sv_maxclients->integer; i++ ) 
	{
		client_t *c = &svs.clients[ i ];
		playerState_t *ps = SV_GameClientNum( i );
		clientSnapshot_t	*frame = &c->frames[0][ c->netchan.outgoingSequence - 1 & PACKET_MASK ];

		if(c->netchan.remoteAddress.type != NA_BOT) {
			numConnected++;
		}
		//ps = &frame->ps;
		for ( int j = ps->eventSequence - MAX_PS_EVENTS ; j < ps->eventSequence ; j++ ) {
			if ( j >= c->frames[0][ c->netchan.outgoingSequence - 2 & PACKET_MASK ].ps.eventSequence ) {
				int event = frame->ps.events[ j & (MAX_PS_EVENTS-1) ] & ~EV_EVENT_BITS;
				//if(j >= ps.eventSequence) {
//					if(event > 1) // footsteps and none
//						Com_Printf("event: %i %i\n", event, i);
				if(event == EV_FOOTSTEP) {
					numDied[i / 8] &= ~(1 << (i % 8));
				}
/*
				if(event >= EV_DEATH1 && event <= EV_DEATH3) {
					char clientId[10];
					memcpy(clientId, va("%i", i), sizeof(clientId));
					Com_Printf("Died: %s\n", clientId);
					memcpy(&recentEvents[recentI++], va(RECENT_TEMPLATE_STR, sv.time, SV_EVENT_CLIENTDIED, clientId), MAX_INFO_STRING);
					if(recentI == 1024) recentI = 0;
					numDied[i / 8] |= 1 << (i % 8);
				}
*/
			}
		}
	
		if(ps->pm_flags & (PMF_RESPAWNED)
			&& (numDied[i / 8] & (1 << (i % 8)))) {
			char clientId[10];
			memcpy(clientId, va("%i", i), sizeof(clientId));
			// TODO: add respawn location
			memcpy(&recentEvents[recentI++], va(RECENT_TEMPLATE, sv.time, SV_EVENT_CLIENTRESPAWN, clientId), MAX_INFO_STRING);
			if(recentI == 1024) recentI = 0;
			numDied[i / 8] &= ~(1 << (i % 8));
		}
		if ( ps->pm_flags & (PMF_RESPAWNED | PMF_TIME_KNOCKBACK) ) {
			numScored[i / 8] |= 1 << (i % 8);
		} else {
			numScored[i / 8] &= ~(1 << (i % 8));
		}
		//}
	}

	// must send a snapshot to a client at least once every second
	if(sv.time - lastReset > 1000) {
		lastReset = sv.time;
		numConnected = 0;
		memset(&numScored, 0, sizeof(numScored));
	} else if (lastReset < sv.time) {		
		// check if scoreboard is being shown to all players, indicating game end
		//   create a matchend event with all the player scores
		int numScoredBits = 0;
		for(int i = 0; i < ARRAY_LEN(numScored); i++) {
			for(int j = 0; j < 8; j++) {
				if(numScored[i] & (1 << j))
					numScoredBits++;
			}
		}
		if(numConnected > 0 && numConnected == numScoredBits) {
			SV_RecentStatus(SV_EVENT_MATCHEND);
			lastReset = sv.time + 10000; // don't make match event for another 10 seconds
		}
	}
#endif

	// send messages back to the clients
	SV_SendClientMessages();

#ifdef USE_MV
	svs.emptyFrame = qfalse;
	if ( sv_mvAutoRecord->integer > 0 || sv_mvAutoRecord->integer == -1 ) {
		if ( sv_demoFile == FS_INVALID_HANDLE ) {
			if ( SV_FindActiveClient( qtrue, -1, sv_mvAutoRecord->integer == -1 ? 0 : sv_mvAutoRecord->integer ) >= 0 ) {
				Cbuf_AddText( "mvrecord\n" );
			}
		}
	}
#endif

	// send a heartbeat to the master if needed
	SV_MasterHeartbeat(HEARTBEAT_FOR_MASTER);
	
#ifdef USE_MULTIVM
	gvm = 0;
	CM_SwitchMap(gameWorlds[gvm]);
	SV_SetAASgvm(gvm);
#endif
}


/*
====================
SV_RateMsec

Return the number of msec until another message can be sent to
a client based on its rate settings
====================
*/

#define UDPIP_HEADER_SIZE 28
#define UDPIP6_HEADER_SIZE 48

int SV_RateMsec( const client_t *client )
{
	int rate, rateMsec;
	int messageSize;
	
	if ( !client->rate )
		return 0;

	messageSize = client->netchan.lastSentSize;

#ifdef USE_IPV6
	if ( client->netchan.remoteAddress.type == NA_IP6 )
		messageSize += UDPIP6_HEADER_SIZE;
	else
#endif
		messageSize += UDPIP_HEADER_SIZE;
		
	rateMsec = messageSize * 1000 / ((int) (client->rate * com_timescale->value));
	rate = Sys_Milliseconds() - client->netchan.lastSentTime;
	
	if ( rate > rateMsec )
		return 0;
	else
		return rateMsec - rate;
}


/*
====================
SV_SendQueuedPackets

Send download messages and queued packets in the time that we're idle, i.e.
not computing a server frame or sending client snapshots.
Return the time in msec until we expect to be called next
====================
*/
int SV_SendQueuedPackets( void )
{
	int numBlocks;
	int dlStart, deltaT, delayT;
	static int dlNextRound = 0;
	int timeVal = INT_MAX;

	// Send out fragmented packets now that we're idle
	delayT = SV_SendQueuedMessages();
	if(delayT >= 0)
		timeVal = delayT;

	if(sv_dlRate->integer)
	{
		// Rate limiting. This is very imprecise for high
		// download rates due to millisecond timedelta resolution
		dlStart = Sys_Milliseconds();
		deltaT = dlNextRound - dlStart;

		if(deltaT > 0)
		{
			if(deltaT < timeVal)
				timeVal = deltaT + 1;
		}
		else
		{
			numBlocks = SV_SendDownloadMessages();

			if(numBlocks)
			{
				// There are active downloads
				deltaT = Sys_Milliseconds() - dlStart;

				delayT = 1000 * numBlocks * MAX_DOWNLOAD_BLKSIZE;
				delayT /= sv_dlRate->integer * 1024;

				if(delayT <= deltaT + 1)
				{
					// Sending the last round of download messages
					// took too long for given rate, don't wait for
					// next round, but always enforce a 1ms delay
					// between DL message rounds so we don't hog
					// all of the bandwidth. This will result in an
					// effective maximum rate of 1MB/s per user, but the
					// low download window size limits this anyways.
					if(timeVal > 2)
						timeVal = 2;

					dlNextRound = dlStart + deltaT + 1;
				}
				else
				{
					dlNextRound = dlStart + delayT;
					delayT -= deltaT;

					if(delayT < timeVal)
						timeVal = delayT;
				}
			}
		}
	}
	else
	{
		if(SV_SendDownloadMessages())
			timeVal = 0;
	}

	return timeVal;
}
