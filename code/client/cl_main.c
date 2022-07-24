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
// cl_main.c  -- client main loop

#include "client.h"
#include <limits.h>
#ifdef _DEBUG
#ifndef _WIN32
#ifndef __WASM__
#include <execinfo.h>
#endif
#include <unistd.h>
#endif
#include <sys/time.h>
#endif

cvar_t	*cl_noprint;
cvar_t	*cl_debugMove;
cvar_t	*cl_motd;

#ifdef USE_RENDERER_DLOPEN
cvar_t	*cl_renderer;
#endif

cvar_t	*rcon_client_password;
cvar_t	*rconAddress;

cvar_t	*cl_timeout;
cvar_t	*cl_autoNudge;
cvar_t	*cl_timeNudge;
cvar_t	*cl_showTimeDelta;

cvar_t	*cl_shownet;
cvar_t	*cl_autoRecordDemo;

cvar_t	*cl_aviFrameRate;
cvar_t	*cl_aviMotionJpeg;
cvar_t	*cl_forceavidemo;
cvar_t	*cl_aviPipeFormat;

cvar_t	*cl_activeAction;

cvar_t	*cl_motdString;

cvar_t	*cl_allowDownload;
#ifdef USE_CURL
cvar_t	*cl_mapAutoDownload;
#endif
cvar_t	*cl_conXOffset;
cvar_t	*cl_conColor;
cvar_t	*cl_inGameVideo;

cvar_t	*cl_serverStatusResendTime;

cvar_t	*cl_lanForcePackets;

cvar_t	*cl_guidServerUniq;

cvar_t	*cl_dlURL;
cvar_t	*cl_dlDirectory;

cvar_t	*cl_reconnectArgs;

// common cvars for GLimp modules
cvar_t	*vid_xpos;			// X coordinate of window position
cvar_t	*vid_ypos;			// Y coordinate of window position
cvar_t	*r_noborder;

cvar_t *r_allowSoftwareGL;	// don't abort out if the pixelformat claims software
cvar_t *r_swapInterval;
cvar_t *r_glDriver;
cvar_t *r_displayRefresh;
cvar_t *r_fullscreen;
cvar_t *r_mode;
cvar_t *r_modeFullscreen;
cvar_t *r_customwidth;
cvar_t *r_customheight;
cvar_t *r_customPixelAspect;

cvar_t *r_colorbits;
// these also shared with renderers:
cvar_t *cl_stencilbits;
cvar_t *cl_depthbits;
cvar_t *cl_drawBuffer;

cvar_t  *cl_nopredict;
cvar_t  *cl_lagometer;
cvar_t  *cl_drawFPS;
cvar_t  *cl_snaps;

cvar_t  *cl_demoOverrideCS[100];
cvar_t  *cl_demoOverrideGame;

#ifdef USE_DRAGDROP
cvar_t  *cl_dropAction;
#endif

#ifdef USE_ABS_MOUSE
cvar_t  *in_mouseAbsolute;
#endif

#ifdef USE_MULTIVM_CLIENT
cvar_t  *cl_mvHighlight;
#endif

#ifdef USE_MASTER_LAN
cvar_t	*cl_master[MAX_MASTER_SERVERS];		// master server ip address
#endif

#ifdef USE_LNBITS
cvar_t  *cl_lnInvoice;
#endif

#ifdef __WASM__
cvar_t  *cl_returnURL;

extern void CL_MenuModified(char *oldValue, char *newValue, cvar_t *cv);
#endif

#ifdef USE_LAZY_LOAD
void Sys_FileNeeded(const char *filename, int state);
cvar_t  *cl_lazyLoad;
#endif

#ifdef USE_ASYNCHRONOUS
#ifdef USE_CURL
download_t cl_downloads[10];
#endif
#endif

clientActive_t		cl;
clientConnection_t	clc;
clientStatic_t		cls;

#ifdef USE_MULTIVM_CLIENT
static qboolean serverWorld = qfalse;
int   cgvmi = 0;
vm_t *cgvmWorlds[MAX_NUM_VMS];
#else
vm_t *cgvm = NULL;
#endif

netadr_t			rcon_address;

char				cl_oldGame[ MAX_QPATH ];
qboolean			cl_oldGameSet;
static	qboolean	noGameRestart = qfalse;

#ifdef USE_CURL
download_t			download;
#endif

// Structure containing functions exported from refresh DLL
refexport_t	re;
#ifdef USE_RENDERER_DLOPEN
static void	*rendererLib;
#endif

static ping_t cl_pinglist[MAX_PINGREQUESTS];

typedef struct serverStatus_s
{
	char string[BIG_INFO_STRING];
	netadr_t address;
	int time, startTime;
	qboolean pending;
	qboolean print;
	qboolean retrieved;
} serverStatus_t;

static serverStatus_t cl_serverStatusList[MAX_SERVERSTATUSREQUESTS];

extern void  Cvar_SetClientDescriptions( void );
extern void  Cvar_SetRendererDescriptions( void );

static void CL_CheckForResend( void );
static void CL_ShowIP_f( void );
static void CL_ServerStatus_f( void );
static void CL_ServerStatusResponse( const netadr_t *from, msg_t *msg );
static void CL_ServerInfoPacket( const netadr_t *from, msg_t *msg );

// TODO: make this same command work for web
#ifdef USE_CURL
static void CL_Download_f( void );
#endif
static void CL_LocalServers_f( void );
static void CL_GlobalServers_f( void );
static void CL_Ping_f( void );

static void CL_InitRef( void );
static void CL_ShutdownRef( refShutdownCode_t code );
static void CL_InitGLimp_Cvars( void );

static void CL_NextDemo( void );

#ifdef USE_MV
void CL_Multiview_f( void );
void CL_MultiviewFollow_f( void );
#endif

/*
===============
CL_CDDialog

Called by Com_Error when a cd is needed
===============
*/
void CL_CDDialog( void ) {
	cls.cddialog = qtrue;	// start it next frame
}


/*
=======================================================================

CLIENT RELIABLE COMMAND COMMUNICATION

=======================================================================
*/

/*
======================
CL_AddReliableCommand

The given command will be transmitted to the server, and is guaranteed to
not have future usercmd_t executed before it is executed
======================
*/
void CL_AddReliableCommand( const char *cmd, qboolean isDisconnectCmd ) {
	int		index;
	int		unacknowledged = clc.reliableSequence - clc.reliableAcknowledge;

	if ( clc.serverAddress.type == NA_BAD )
		return;

	// if we would be losing an old command that hasn't been acknowledged,
	// we must drop the connection
	// also leave one slot open for the disconnect command in this case.
	
	if ((isDisconnectCmd && unacknowledged > MAX_RELIABLE_COMMANDS) ||
	    (!isDisconnectCmd && unacknowledged >= MAX_RELIABLE_COMMANDS))
	{
		if( com_errorEntered )
			return;
		else
			Com_Error(ERR_DROP, "Client command overflow");
	}

	clc.reliableSequence++;
	index = clc.reliableSequence & ( MAX_RELIABLE_COMMANDS - 1 );
	Q_strncpyz( clc.reliableCommands[ index ], cmd, sizeof( clc.reliableCommands[ index ] ) );
}


/*
=======================================================================

CLIENT SIDE DEMO RECORDING

=======================================================================
*/

/*
====================
CL_WriteDemoMessage

Dumps the current net message, prefixed by the length
====================
*/
static void CL_WriteDemoMessage( msg_t *msg, int headerBytes ) {
	int		len, swlen;

	// write the packet sequence
	len = clc.serverMessageSequence;
	swlen = LittleLong( len );
	FS_Write( &swlen, 4, clc.recordfile );

	// skip the packet sequencing information
	len = msg->cursize - headerBytes;
	swlen = LittleLong(len);
	FS_Write( &swlen, 4, clc.recordfile );
	FS_Write( msg->data + headerBytes, len, clc.recordfile );
}


/*
====================
CL_StopRecording_f

stop recording a demo
====================
*/
void CL_StopRecord_f( void ) {

	if ( clc.recordfile != FS_INVALID_HANDLE ) {
		char tempName[MAX_OSPATH];
		char finalName[MAX_OSPATH];
		int protocol;
		int	len, sequence;

		// finish up
		len = -1;
		FS_Write( &len, 4, clc.recordfile );
		FS_Write( &len, 4, clc.recordfile );
		FS_FCloseFile( clc.recordfile );
		clc.recordfile = FS_INVALID_HANDLE;

		// select proper extension
		if ( clc.dm68compat || clc.demoplaying ) {
			protocol = OLD_PROTOCOL_VERSION;
		} else {
			protocol = NEW_PROTOCOL_VERSION;
		}

		if ( com_protocol->integer != DEFAULT_PROTOCOL_VERSION ) {
			protocol = com_protocol->integer;
		}

		Com_sprintf( tempName, sizeof( tempName ), "%s.tmp", clc.recordName );

		Com_sprintf( finalName, sizeof( finalName ), "%s.%s%d", clc.recordName, DEMOEXT, protocol );

		if ( clc.explicitRecordName ) {
			FS_Remove( finalName );
		} else {
			// add sequence suffix to avoid overwrite
			sequence = 0;
			while ( FS_FileExists( finalName ) && ++sequence < 1000 ) {
				Com_sprintf( finalName, sizeof( finalName ), "%s-%02d.%s%d",
					clc.recordName, sequence, DEMOEXT, protocol );
			}
		}

		FS_Rename( tempName, finalName );
	}

	if ( !clc.demorecording ) {
		Com_Printf( "Not recording a demo.\n" );
	} else {
		Com_Printf( "Stopped demo recording.\n" );
	}

	clc.demorecording = qfalse;
	clc.spDemoRecording = qfalse;
}


/*
====================
CL_WriteServerCommands
====================
*/
static void CL_WriteServerCommands( msg_t *msg ) {
	int i;

	if ( clc.demoCommandSequence < clc.serverCommandSequence ) {

		// do not write more than MAX_RELIABLE_COMMANDS
		if ( clc.serverCommandSequence - clc.demoCommandSequence > MAX_RELIABLE_COMMANDS )
			clc.demoCommandSequence = clc.serverCommandSequence - MAX_RELIABLE_COMMANDS;

		for ( i = clc.demoCommandSequence + 1 ; i <= clc.serverCommandSequence; i++ ) {
			MSG_WriteByte( msg, svc_serverCommand );
			MSG_WriteLong( msg, i );
			MSG_WriteString( msg, clc.serverCommands[ i & (MAX_RELIABLE_COMMANDS-1) ] );
		}
	}

	clc.demoCommandSequence = clc.serverCommandSequence;
}


/*
====================
CL_WriteGamestate
====================
*/
static void CL_WriteGamestate( qboolean initial ) 
{
	byte		bufData[ MAX_MSGLEN_BUF ];
	char		*s;
	msg_t		msg;
	int			i;
	int			len;
	entityState_t	*ent;
	entityState_t	nullstate;
#ifdef USE_MULTIVM_CLIENT
	int igs = clc.currentView;
#endif

	// write out the gamestate message
	MSG_Init( &msg, bufData, MAX_MSGLEN );
	MSG_Bitstream( &msg );

	// NOTE, MRE: all server->client messages now acknowledge
	MSG_WriteLong( &msg, clc.reliableSequence );

	if ( initial ) {
		clc.demoMessageSequence = 1;
		clc.demoCommandSequence = clc.serverCommandSequence;
	} else {
		CL_WriteServerCommands( &msg );
	}
	
	clc.demoDeltaNum = 0; // reset delta for next snapshot
	
	MSG_WriteByte( &msg, svc_gamestate );
	MSG_WriteLong( &msg, clc.serverCommandSequence );

	// configstrings
	for ( i = 0 ; i < MAX_CONFIGSTRINGS ; i++ ) {
		if ( !cl.gameState.stringOffsets[i] ) {
			continue;
		}
		s = cl.gameState.stringData + cl.gameState.stringOffsets[i];
		MSG_WriteByte( &msg, svc_configstring );
		MSG_WriteShort( &msg, i );
		MSG_WriteBigString( &msg, s );
	}

	// baselines
	Com_Memset( &nullstate, 0, sizeof( nullstate ) );
	for ( i = 0; i < MAX_GENTITIES ; i++ ) {
		if ( !cl.baselineUsed[ i ] )
			continue;
		ent = &cl.entityBaselines[ i ];
		MSG_WriteByte( &msg, svc_baseline );
		MSG_WriteDeltaEntity( &msg, &nullstate, ent, qtrue );
	}

	// finalize message
	MSG_WriteByte( &msg, svc_EOF );
	
	// finished writing the gamestate stuff

	// write the client num
	MSG_WriteLong( &msg, clc.clientNum );

	// write the checksum feed
	MSG_WriteLong( &msg, clc.checksumFeed );

	// finished writing the client packet
	MSG_WriteByte( &msg, svc_EOF );

	// write it to the demo file
	if ( clc.demoplaying )
		len = LittleLong( clc.demoMessageSequence - 1 );
	else
		len = LittleLong( clc.serverMessageSequence - 1 );

	FS_Write( &len, 4, clc.recordfile );

	len = LittleLong( msg.cursize );
	FS_Write( &len, 4, clc.recordfile );
	FS_Write( msg.data, msg.cursize, clc.recordfile );
}


/*
=============
CL_EmitPacketEntities
=============
*/
static void CL_EmitPacketEntities( clSnapshot_t *from, clSnapshot_t *to, msg_t *msg, entityState_t *oldents ) {
	entityState_t	*oldent, *newent;
	int		oldindex, newindex;
	int		oldnum, newnum;
	int		from_num_entities;
#ifdef USE_MULTIVM_CLIENT
	int igs = clc.currentView;
#endif

	// generate the delta update
	if ( !from ) {
		from_num_entities = 0;
	} else {
		from_num_entities = from->numEntities;
	}

	newent = NULL;
	oldent = NULL;
	newindex = 0;
	oldindex = 0;
	while ( newindex < to->numEntities || oldindex < from_num_entities ) {
		if ( newindex >= to->numEntities ) {
			newnum = MAX_GENTITIES+1;
		} else {
			newent = &cl.parseEntities[(to->parseEntitiesNum + newindex) % MAX_PARSE_ENTITIES];
			newnum = newent->number;
		}

		if ( oldindex >= from_num_entities ) {
			oldnum = MAX_GENTITIES+1;
		} else {
			//oldent = &cl.parseEntities[(from->parseEntitiesNum + oldindex) % MAX_PARSE_ENTITIES];
			oldent = &oldents[ oldindex ];
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
			MSG_WriteDeltaEntity (msg, &cl.entityBaselines[newnum], newent, qtrue );
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
====================
CL_WriteSnapshot
====================
*/
static void CL_WriteSnapshot( void ) {

	static	clSnapshot_t saved_snap;
	static entityState_t saved_ents[ MAX_SNAPSHOT_ENTITIES ]; 

	clSnapshot_t *clSnap, *oldSnap; 
	byte	bufData[ MAX_MSGLEN_BUF ];
	msg_t	msg;
	int		i, len;
#ifdef USE_MULTIVM_CLIENT
	int igs = clc.currentView;
#endif

	clSnap = &cl.snapshots[ cl.snap.messageNum & PACKET_MASK ]; // current snapshot
	//if ( !snap->valid ) // should never happen?
	//	return;

	if ( clc.demoDeltaNum == 0 ) {
		oldSnap = NULL;
	} else {
		oldSnap = &saved_snap;
	}

	MSG_Init( &msg, bufData, MAX_MSGLEN );
	MSG_Bitstream( &msg );

	// NOTE, MRE: all server->client messages now acknowledge
	MSG_WriteLong( &msg, clc.reliableSequence );

	// Write all pending server commands
	CL_WriteServerCommands( &msg );
	
	MSG_WriteByte( &msg, svc_snapshot );
	MSG_WriteLong( &msg, clSnap->serverTime ); // sv.time
	MSG_WriteByte( &msg, clc.demoDeltaNum ); // 0 or 1
	MSG_WriteByte( &msg, clSnap->snapFlags );  // snapFlags
	MSG_WriteByte( &msg, clSnap->areabytes );  // areabytes
	MSG_WriteData( &msg, clSnap->areamask, clSnap->areabytes );
	if ( oldSnap )
		MSG_WriteDeltaPlayerstate( &msg, &oldSnap->ps, &clSnap->ps );
	else
		MSG_WriteDeltaPlayerstate( &msg, NULL, &clSnap->ps );

	CL_EmitPacketEntities( oldSnap, clSnap, &msg, saved_ents );

	// finished writing the client packet
	MSG_WriteByte( &msg, svc_EOF );

	// write it to the demo file
	if ( clc.demoplaying )
		len = LittleLong( clc.demoMessageSequence );
	else
		len = LittleLong( clc.serverMessageSequence );
	FS_Write( &len, 4, clc.recordfile );

	len = LittleLong( msg.cursize );
	FS_Write( &len, 4, clc.recordfile );
	FS_Write( msg.data, msg.cursize, clc.recordfile );

	// save last sent state so if there any need - we can skip any further incoming messages
	for ( i = 0; i < clSnap->numEntities; i++ )
		saved_ents[ i ] = cl.parseEntities[ (clSnap->parseEntitiesNum + i) % MAX_PARSE_ENTITIES ];

	saved_snap = *clSnap;
	saved_snap.parseEntitiesNum = 0;

	clc.demoMessageSequence++;
	clc.demoDeltaNum = 1;
}


/*
====================
CL_Record_f

record <demoname>

Begins recording a demo from the current position
====================
*/
static void CL_Record_f( void ) {
	char		demoName[MAX_OSPATH];
	char		name[MAX_OSPATH];
	char		demoExt[16];
	const char	*ext;
	qtime_t		t;

	if ( Cmd_Argc() > 2 ) {
		Com_Printf( "record <demoname>\n" );
		return;
	}

	if ( clc.demorecording ) {
		if ( !clc.spDemoRecording ) {
			Com_Printf( "Already recording.\n" );
		}
		return;
	}

	if ( cls.state != CA_ACTIVE ) {
		Com_Printf( "You must be in a level to record.\n" );
		return;
	}

	// sync 0 doesn't prevent recording, so not forcing it off .. everyone does g_sync 1 ; record ; g_sync 0 ..
	if ( NET_IsLocalAddress( &clc.serverAddress ) && !Cvar_VariableIntegerValue( "g_synchronousClients" ) ) {
		Com_Printf (S_COLOR_YELLOW "WARNING: You should set 'g_synchronousClients 1' for smoother demo recording\n");
	}

	if ( Cmd_Argc() == 2 ) {
		// explicit demo name specified
		Q_strncpyz( demoName, Cmd_Argv( 1 ), sizeof( demoName ) );
		ext = COM_GetExtension( demoName );
		if ( *ext ) {
			// strip demo extension
			sprintf( demoExt, "%s%d", DEMOEXT, OLD_PROTOCOL_VERSION );
			if ( Q_stricmp( ext, demoExt ) == 0 ) {
				*(strrchr( demoName, '.' )) = '\0';
			} else {
				// check both protocols
				sprintf( demoExt, "%s%d", DEMOEXT, NEW_PROTOCOL_VERSION );
				if ( Q_stricmp( ext, demoExt ) == 0 ) {
					*(strrchr( demoName, '.' )) = '\0';
				}
			}
		}
		Com_sprintf( name, sizeof( name ), "demos/%s", demoName );

		clc.explicitRecordName = qtrue;
	} else {

		Com_RealTime( &t );
		Com_sprintf( name, sizeof( name ), "demos/demo-%04d%02d%02d-%02d%02d%02d",
			1900 + t.tm_year, 1 + t.tm_mon,	t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec );

		clc.explicitRecordName = qfalse;
	}

	// save desired filename without extension
	Q_strncpyz( clc.recordName, name, sizeof( clc.recordName ) );

	Com_Printf( "recording to %s.\n", name );

	// start new record with temporary extension
	Q_strcat( name, sizeof( name ), ".tmp" );

	// open the demo file
	clc.recordfile = FS_FOpenFileWrite( name );
	if ( clc.recordfile == FS_INVALID_HANDLE ) {
		Com_Printf( "ERROR: couldn't open.\n" );
		clc.recordName[0] = '\0';
		return;
	}

	clc.demorecording = qtrue;

	Com_TruncateLongString( clc.recordNameShort, clc.recordName );

	if ( Cvar_VariableIntegerValue( "ui_recordSPDemo" ) ) {
	  clc.spDemoRecording = qtrue;
	} else {
	  clc.spDemoRecording = qfalse;
	}

	// don't start saving messages until a non-delta compressed message is received
	clc.demowaiting = qtrue;

	// we will rename record to dm_68 or dm_71 depending from this flag
	clc.dm68compat = qtrue;

	// write out the gamestate message
	CL_WriteGamestate( qtrue );

	// the rest of the demo file will be copied from net messages
}


/*
====================
CL_CompleteRecordName
====================
*/
static void CL_CompleteRecordName( char *args, int argNum )
{
	if( argNum == 2 )
	{
		char demoExt[ 16 ];

		Com_sprintf( demoExt, sizeof( demoExt ), ".%s%d", DEMOEXT, com_protocol->integer );
		Field_CompleteFilename( "demos", demoExt, qtrue, FS_MATCH_EXTERN | FS_MATCH_STICK );
	}
}


/*
=======================================================================

CLIENT SIDE DEMO PLAYBACK

=======================================================================
*/

static int messageShift = 0;
int        serverShift = 0;

/*
=================
CL_DemoCompleted
=================
*/
static void CL_DemoCompleted( void ) {
#ifdef USE_MULTIVM_CLIENT
  int igs = clientGames[cgvmi];
#endif
	Com_Printf("DEMO: ended.\n");
	if(clc.demoIndex) {
		messageShift = 0;
		serverShift = 0;
		Z_Free(clc.demoIndex);
	}
	
	if ( com_timedemo->integer ) {
		int	time;
		
		time = Sys_Milliseconds() - clc.timeDemoStart;
		if ( time > 0 ) {
			Com_Printf( "%i frames, %3.*f seconds: %3.1f fps\n", clc.timeDemoFrames,
			time > 10000 ? 1 : 2, time/1000.0, clc.timeDemoFrames*1000.0 / time );
		}
	}

	CL_Disconnect( qtrue, qtrue );
	CL_NextDemo();
}

void CL_ReadDemoIndex( void ) {
	int			s;
	int			r;
	msg_t		buf;
	int				cmd;
	int count = 0, newnum, i;
	byte		bufData[ MAX_MSGLEN_BUF ];
	int    startTime;
	int    demoStart = 0, demoEnd = 0;
	entityState_t	*es;
	entityState_t	nullstate;
	const int SIMPLE_READ_SIZE = 24;
#ifdef USE_MULTIVM_CLIENT
  int igs = clientGames[cgvmi];
#endif

	startTime = Sys_Milliseconds();
	
	Com_Memset( &nullstate, 0, sizeof( nullstate ) );
	
	while(qtrue) {
		// get the sequence number
		r = FS_Read( &s, 4, clc.demofile );
		if ( r != 4 ) {
			break;
		}
	
		// init the message
		MSG_Init( &buf, bufData, MAX_MSGLEN );

		// get the length
		r = FS_Read( &buf.cursize, 4, clc.demofile );

		// only read enough to get acknowledge and cmd
		r = FS_Read( buf.data, SIMPLE_READ_SIZE, clc.demofile );

		// check it if is a gamestate/snapshot
		MSG_Bitstream( &buf );
		MSG_ReadLong( &buf );
		s = MSG_ReadByte( &buf );
		if(s == svc_gamestate) {

		} else if (s == svc_snapshot) {
			// serverTime is first
			if(demoStart == 0)
				demoStart = MSG_ReadLong( &buf );
			else
				demoEnd = MSG_ReadLong( &buf );
			count++;
		} else if(s == svc_baseline) {
			count++;
		} else {
			// skip this message
		}
		r = FS_Seek( clc.demofile, buf.cursize - SIMPLE_READ_SIZE, FS_SEEK_CUR );
	}

	clc.numDemoIndex = (demoEnd - demoStart) / 1000 + 10;

	// allocate the necessary number of indexes 1 for each second, 
	//   +1 in case it's ever rounded down after / 1000
	Com_Printf( "DEMO: Initial scan took %ims\n", Sys_Milliseconds() - startTime );
	Com_Printf("DEMO: Allocating %i KB for %i frames\n", 
		(int)(clc.numDemoIndex * sizeof(demoIndex_t) / 1000), clc.numDemoIndex);

	clc.demoIndex = Z_Malloc(clc.numDemoIndex * sizeof(demoIndex_t));
	
	// TODO: parse every snapshot and make a copy of the entity state once every second so it can be rewound
	FS_Seek(clc.demofile, 0, FS_SEEK_SET);
	
	count = -1;
	while(qtrue) {
		// get the sequence number
		r = FS_Read( &s, 4, clc.demofile );
		if ( r != 4 ) {
			break;
		}
	
		// init the message
		MSG_Init( &buf, bufData, MAX_MSGLEN );

		// get the length
		r = FS_Read( &buf.cursize, 4, clc.demofile );

		// only read enough to get acknowledge and cmd
		r = FS_Read( buf.data, buf.cursize, clc.demofile );

		// check it if is a gamestate/snapshot
		MSG_Bitstream( &buf );
		MSG_ReadLong( &buf );
		s = MSG_ReadByte( &buf );
		if(s == svc_gamestate) {
			CL_ClearState();

			// a gamestate always marks a server command sequence
			clc.serverCommandSequence = MSG_ReadLong( &buf );

			// parse all the configstrings and baselines
#ifdef USE_MULTIVM_CLIENT
			cl.gameStates[clc.currentView].dataCount = 1;	// leave a 0 at the beginning for uninitialized configstrings
#else
			cl.gameState.dataCount = 1;	// leave a 0 at the beginning for uninitialized configstrings
#endif
			while ( 1 ) {
				cmd = MSG_ReadByte( &buf );

				if ( cmd == svc_EOF ) {
					break;
				}
				
				if ( cmd == svc_configstring ) {
					i = MSG_ReadShort( &buf );
					if ( i < 0 || i >= MAX_CONFIGSTRINGS ) {
						Com_Error( ERR_DROP, "configstring > MAX_CONFIGSTRINGS" );
					}

					MSG_ReadBigString( &buf );
				} else if ( cmd == svc_baseline ) {
					newnum = MSG_ReadBits( &buf, GENTITYNUM_BITS );
					if ( newnum < 0 || newnum >= MAX_GENTITIES ) {
						Com_Error( ERR_DROP, "Baseline number out of range: %i", newnum );
					}
					es = &cl.entityBaselines[ newnum ];
					MSG_ReadDeltaEntity( &buf, &nullstate, es, newnum );
					cl.baselineUsed[ newnum ] = 1;
				} else {
					Com_Error( ERR_DROP, "CL_ParseGamestate: bad command byte %i", cmd );
				}
			}

			clc.eventMask |= EM_GAMESTATE;

#ifdef USE_MV
			clientWorlds[0] = clc.clientNum;
			clc.zexpectDeltaSeq = 0; // that will reset compression context
#endif

			clc.clientNum = MSG_ReadLong( &buf );
			// read the checksum feed
			clc.checksumFeed = MSG_ReadLong( &buf );

		} else if (s == svc_snapshot 
#ifdef USE_MV
			|| s == svc_multiview
#endif
		) {
#ifdef USE_MULTIVM_CLIENT
			CL_ParseSnapshot( &buf, 0 );
#else
#ifdef USE_MV
			CL_ParseSnapshot( &buf, s == svc_multiview );
#else
			CL_ParseSnapshot( &buf );
#endif
#endif
			int newcount = floor((cl.snap.serverTime - demoStart) / 1000);
			if(newcount > count) {
				count = newcount;
				clc.demoIndex[count].serverTime = cl.snap.serverTime;
				clc.demoIndex[count].offset = FS_FTell(clc.demofile) - buf.cursize - 8;
        clSnapshot_t *clSnap = &cl.snapshots[cl.snap.messageNum & PACKET_MASK];
        for ( i = 0 ; i < clSnap->numEntities ; i++ ) {
          entityState_t *ent = &cl.parseEntities[ ( clSnap->parseEntitiesNum + i ) & (MAX_PARSE_ENTITIES-1) ];
          memcpy(clc.demoIndex[ent->number].entities, ent, sizeof(entityState_t));
        }
			} else {
			}
		}
		//offset = 8 + buf.cursize;
	}

	Com_Printf( "DEMO: Read %i key frames\n", count );
	if(demoEnd - demoStart > 120000)
		Com_Printf( "DEMO: Length %im %is\n", (demoEnd - demoStart) / 1000 / 60, (demoEnd - demoStart) / 1000 % 60 );
	else if(demoEnd - demoStart > 2000)
		Com_Printf( "DEMO: Length %is\n", (demoEnd - demoStart) / 1000 );
	else
		Com_Printf( "DEMO: Length %ims\n", demoEnd - demoStart );
	Com_Printf( "DEMO: Indexing took %ims\n", Sys_Milliseconds() - startTime );
	
	
	FS_Seek(clc.demofile, 0, FS_SEEK_SET);
}


/*
=================
CL_ReadDemoMessage
=================
*/
void CL_ReadDemoMessage( void ) {
	int			r;
	msg_t		buf;
	byte		bufData[ MAX_MSGLEN_BUF ];
	int			s;
#ifdef USE_MULTIVM_CLIENT
  int igs = clientGames[cgvmi];
//Com_Printf("%s: %i\n", __func__, igs);
#endif

	if ( clc.demofile == FS_INVALID_HANDLE ) {
    Com_Printf("ERROR: no demo to read\n");
		CL_DemoCompleted();
		return;
	}

	// get the sequence number
	r = FS_Read( &s, 4, clc.demofile );
	if ( r != 4 ) {
		CL_DemoCompleted();
		return;
	}
	clc.serverMessageSequence = LittleLong( s ) - messageShift;

	// init the message
	MSG_Init( &buf, bufData, MAX_MSGLEN );

	// get the length
	r = FS_Read( &buf.cursize, 4, clc.demofile );
	if ( r != 4 ) {
		CL_DemoCompleted();
		return;
	}
	buf.cursize = LittleLong( buf.cursize );
	if ( buf.cursize == -1 ) {
		CL_DemoCompleted();
		return;
	}
	if ( buf.cursize > buf.maxsize ) {
		Com_Error (ERR_DROP, "%s: demoMsglen > MAX_MSGLEN", __func__);
	}
	r = FS_Read( buf.data, buf.cursize, clc.demofile );
	if ( r != buf.cursize ) {
		Com_Printf( "Demo file was truncated.\n");
		CL_DemoCompleted();
		return;
	}

	clc.lastPacketTime = cls.realtime;
	buf.readcount = 0;

	clc.demoCommandSequence = clc.serverCommandSequence;

	CL_ParseServerMessage( &buf );

	if ( clc.demorecording ) {
		// track changes and write new message	
		if ( clc.eventMask & EM_GAMESTATE ) {
			CL_WriteGamestate( qfalse );
			// nothing should came after gamestate in current message
		} else if ( clc.eventMask & (EM_SNAPSHOT|EM_COMMAND) ) {
			CL_WriteSnapshot();
		}
	}
}


/*
====================
CL_WalkDemoExt
====================
*/
static int CL_WalkDemoExt( const char *arg, char *name, int name_len, fileHandle_t *handle )
{
	int i;
	
	*handle = FS_INVALID_HANDLE;
	i = 0;

	while ( demo_protocols[ i ] )
	{
		Com_sprintf( name, name_len, "demos/%s.%s%d", arg, DEMOEXT, demo_protocols[ i ] );
		FS_BypassPure();
		FS_FOpenFileRead( name, handle, qtrue );
		FS_RestorePure();
		if ( *handle != FS_INVALID_HANDLE )
		{
			Com_Printf( "Demo file: %s\n", name );
			return demo_protocols[ i ];
		}
		else
			Com_Printf( "Not found: %s\n", name );
		i++;
	}
	return -1;
}


/*
====================
CL_DemoExtCallback
====================
*/
static qboolean CL_DemoNameCallback_f( const char *filename, int length ) 
{
	const int ext_len = strlen( "." DEMOEXT );
	const int num_len = 2;
	int version;

	if ( length <= ext_len + num_len || Q_stricmpn( filename + length - (ext_len + num_len), "." DEMOEXT, ext_len ) != 0 )
		return qfalse;

	version = atoi( filename + length - num_len );
	if ( version == com_protocol->integer )
		return qtrue;

	if ( version < 66 || version > NEW_PROTOCOL_VERSION )
		return qfalse;

	return qtrue;
}


/*
====================
CL_CompleteDemoName
====================
*/
static void CL_CompleteDemoName( char *args, int argNum )
{
	if( argNum == 2 )
	{
		FS_SetFilenameCallback( CL_DemoNameCallback_f );
		Field_CompleteFilename( "demos", "." DEMOEXT "??", qfalse, FS_MATCH_ANY | FS_MATCH_STICK );
		FS_SetFilenameCallback( NULL );
	}
}


static void CL_Pause_f( void ) {
	if(!clc.demoplaying) {
		Com_Printf("Demo not playing.\n");
		return;
	}

  Cvar_Set("timescale", "0");
	Cvar_Set("cl_paused", "1");
}

static void CL_Play_f( void ) {
	if(!clc.demoplaying) {
		Com_Printf("Demo not playing.\n");
		return;
	}

	Cvar_Set("cl_paused", "0");
}

static void CL_Rewind_f( void ) {
	int seconds = 10;
#ifdef USE_MULTIVM_CLIENT
  int igs = clc.currentView;
#endif

	if(!clc.demoplaying) {
		Com_Printf("Demo not playing.\n");
		return;
	}

	if(Cmd_Argc() > 2) {
		Com_Printf( "Usage: %s (10|<seconds>)\n", Cmd_Argv(0) );
		return;
	}
	
	if(Cmd_Argc() == 2) {
		seconds = atoi(Cmd_Argv(1));
	}

	//  find the nearest snapshot
	int prevMessageNum = cl.snap.messageNum;
	int prevServerTime = cl.snap.serverTime;
	int nearest = (cl.snap.serverTime - clc.demoIndex[0].serverTime) / 1000;
	if(Q_stricmpn(Cmd_Argv(0), "rew", 3)==0) {
		Com_Printf("DEMO: rewind %i seconds\n", seconds);
		nearest -= seconds;
		if(nearest < 0) {
			nearest = 0;
		}
	} else if (Q_stricmpn(Cmd_Argv(0), "for", 3)==0) {
		Com_Printf("DEMO: fast forward %i seconds\n", seconds);
		nearest += seconds;
		if(nearest > clc.numDemoIndex) {
			nearest = clc.numDemoIndex - 1;
		}
	} else if (Q_stricmpn(Cmd_Argv(0), "skip", 4)==0) {
		nearest = seconds;
		if(nearest < 0) {
			Com_Printf("DEMO: Starting from the beginning.");
			nearest = 0;
		}
		if(nearest > clc.numDemoIndex) {
			Com_Printf("DEMO: Skipping to the end.");
			nearest = clc.numDemoIndex - 1;
		}
	}
	
	nearest = 1;

	// reset snapshot state to time we are skipping to
	FS_Seek(clc.demofile, clc.demoIndex[nearest].offset, FS_SEEK_SET);
	for(int j = 0; j < 3; j++) {
		CL_ReadDemoMessage();
	}
	messageShift = cl.snap.messageNum - (prevMessageNum - messageShift) ;
	serverShift = cl.snap.serverTime - (prevServerTime - serverShift);
	Com_Printf("Message shift: %i (%i)\n", messageShift, serverShift);
	// reset again to load the correct message shift
	FS_Seek(clc.demofile, clc.demoIndex[nearest].offset, FS_SEEK_SET);
	memcpy(cl.entityBaselines, clc.demoIndex[nearest].entities, MAX_GENTITIES * sizeof(entityState_t));
#ifdef USE_MULTIVM_CLIENT
  cl.serverTimes[0] = cl.snap.serverTime - serverShift;
#else
	cl.serverTime = cl.snap.serverTime - serverShift;
#endif
	for(int j = 0; j < 3; j++) {
		CL_ReadDemoMessage();
	}

	// TODO: on time change (rewind, forward) reset the previous snapshot to 0?
}

/*
====================
CL_PlayDemo_f

demo <demoname>

====================
*/
static void CL_PlayDemo_f( void ) {
	char		name[MAX_OSPATH];
	char		*arg, *ext_test;
	int			protocol, i;
	char		retry[MAX_OSPATH];
	const char	*shortname, *slash;
	fileHandle_t hFile;

#ifdef USE_MULTIVM_CLIENT
  int igs = clientGames[cgvmi];

	if ( Cmd_Argc() != 2 && Cmd_Argc() != 3 && !Q_stricmp(Cmd_Argv(0), "load") ) {
		Com_Printf( "demo <demoname>\n" );
		return;
	}
  if(!Q_stricmp(Cmd_Argv(0), "load")) {
    arg = Cmd_Argv( 2 );
  } else {
    arg = Cmd_Argv( 1 );
  }
#else
	if ( Cmd_Argc() != 2 ) {
		Com_Printf( "demo <demoname>\n" );
		return;
	}

	// open the demo file
	arg = Cmd_Argv( 1 );
#endif

	// check for an extension .DEMOEXT_?? (?? is protocol)
	ext_test = strrchr(arg, '.');
	if ( ext_test && !Q_stricmpn(ext_test + 1, DEMOEXT, ARRAY_LEN(DEMOEXT) - 1) )
	{
		protocol = atoi(ext_test + ARRAY_LEN(DEMOEXT));

		for( i = 0; demo_protocols[ i ]; i++ )
		{
			if ( demo_protocols[ i ] == protocol )
				break;
		}

		if ( demo_protocols[ i ] || protocol == com_protocol->integer  )
		{
			Com_sprintf(name, sizeof(name), "demos/%s", arg);
			FS_BypassPure();
			FS_FOpenFileRead( name, &hFile, qtrue );
			FS_RestorePure();
		}
		else
		{
			size_t len;

			Com_Printf("Protocol %d not supported for demos\n", protocol );
			len = ext_test - arg;

			if ( len > ARRAY_LEN( retry ) - 1 ) {
				len = ARRAY_LEN(retry) - 1;
			}

			Q_strncpyz( retry, arg, len + 1);
			retry[len] = '\0';
			protocol = CL_WalkDemoExt( retry, name, sizeof( name ), &hFile );
		}
	}
	else
		protocol = CL_WalkDemoExt( arg, name, sizeof( name ), &hFile );
	
	if ( hFile == FS_INVALID_HANDLE ) {
		Com_Printf( S_COLOR_YELLOW "couldn't open %s\n", name );
		return;
	}

	FS_FCloseFile( hFile ); 
	hFile = FS_INVALID_HANDLE;

#ifndef USE_MULTIVM_CLIENT
	// make sure a local server is killed
	// 2 means don't force disconnect of local client
	Cvar_Set( "sv_killserver", "2" );

	CL_Disconnect( qtrue, qfalse );
#endif

	// clc.demofile will be closed during CL_Disconnect so reopen it
	if ( FS_FOpenFileRead( name, &clc.demofile, qtrue ) == -1 ) 
	{
		// drop this time
		Com_Error( ERR_DROP, "couldn't open %s\n", name );
		return;
	}

	if ( (slash = strrchr( name, '/' )) != NULL )
		shortname = slash + 1;
	else
		shortname = name;

	Q_strncpyz( clc.demoName, shortname, sizeof( clc.demoName ) );

#ifndef USE_NO_CONSOLE
	Con_Close();
#endif

	cls.state = CA_CONNECTED;
	clc.demoplaying = qtrue;
	Q_strncpyz( cls.servername, shortname, sizeof( cls.servername ) );

	if ( protocol <= OLD_PROTOCOL_VERSION )
		clc.compat = qtrue;
	else
		clc.compat = qfalse;
  
	// read demo messages until connected
#ifdef USE_CURL
	while ( cls.state >= CA_CONNECTED && cls.state < CA_PRIMED && !Com_DL_InProgress( &download ) ) {
#else
	while ( cls.state >= CA_CONNECTED && cls.state < CA_PRIMED ) {
#endif
		CL_ReadDemoMessage();
	}

	// don't get the first snapshot this frame, to prevent the long
	// time from the gamestate load from messing causing a time skip
	clc.firstDemoFrameSkipped = qfalse;
}


/*
==================
CL_NextDemo

Called when a demo or cinematic finishes
If the "nextdemo" cvar is set, that command will be issued
==================
*/
static void CL_NextDemo( void ) {
	char v[ MAX_CVAR_VALUE_STRING ];

	Cvar_VariableStringBuffer( "nextdemo", v, sizeof( v ) ); 
	Com_DPrintf( "CL_NextDemo: %s\n", v );
	if ( !v[0] ) {
		return;
	}

	Cvar_Set( "nextdemo", "" );
	Cbuf_AddText( v );
	Cbuf_AddText( "\n" );
	Cbuf_Execute();
}


//======================================================================

/*
=====================
CL_ShutdownVMs
=====================
*/
static void CL_ShutdownVMs( void )
{
	CL_ShutdownCGame();
	CL_ShutdownUI();
}

#include "snd_local.h"
extern soundInterface_t si;

/*
=====================
Called by Com_GameRestart, CL_FlushMemory and SV_SpawnServer

CL_ShutdownAll
=====================
*/
void CL_ShutdownAll( void ) {

#ifdef USE_CURL
	Com_DL_Cleanup(&download);
#ifdef USE_ASYNCHRONOUS
	for(int i = 0; i < 10; i++) {
		Com_DL_Cleanup(&cl_downloads[i]);
	}
#endif
#endif

	// clear and mute all sounds until next registration
	S_DisableSounds();

	// shutdown VMs
	CL_ShutdownVMs();

	// shutdown the renderer
	if ( re.Shutdown ) {
		if ( CL_GameSwitch() ) {
			CL_ShutdownRef( REF_DESTROY_WINDOW ); // shutdown renderer & GLimp
		} else {
			re.Shutdown( REF_KEEP_CONTEXT ); // don't destroy window or context
		}
	}

	cls.rendererStarted = qfalse;
	cls.soundRegistered = qfalse;

	SCR_Done();
}


/*
=================
CL_ClearMemory
=================
*/
void CL_ClearMemory( void ) {
	// if not running a server clear the whole hunk
	if ( !com_sv_running->integer ) {
		// clear the whole hunk
		Hunk_Clear();
		// clear collision map data
		CM_ClearMap();
	} else {
		// clear all the client data on the hunk
#ifdef USE_MULTIVM_SERVER
		// clear to mark doesn't work in multivm mode because there are many marks
		Hunk_Clear();
    CM_ClearMap();
#else
		Hunk_ClearToMark();
#endif
	}
}


/*
=================
CL_FlushMemory

Called by CL_Disconnect_f, CL_DownloadsComplete
Also called by Com_Error
=================
*/
void CL_FlushMemory( void ) {

	// shutdown all the client stuff
	CL_ShutdownAll();

	CL_ClearMemory();

#ifdef USE_ASYNCHRONOUS
	if(!com_cl_running || !com_cl_running->integer || !FS_Initialized()) return;
#endif

	CL_StartHunkUsers();
}


/*
=====================
CL_MapLoading

A local server is starting to load a map, so update the
screen to let the user know about it, then dump all client
memory on the hunk from cgame, ui, and renderer
=====================
*/
void CL_MapLoading( void ) {
#ifdef USE_MULTIVM_CLIENT
  int igs = clientGames[cgvmi];
	clientWorlds[cgvmi] = clc.clientNum;
#endif

	if ( com_dedicated->integer ) {
		cls.state = CA_DISCONNECTED;
 		Key_SetCatcher( KEYCATCH_CONSOLE );
		return;
	}

	if ( !com_cl_running->integer ) {
		return;
	}

#ifndef USE_NO_CONSOLE
	Con_Close();
#endif
	Key_SetCatcher( 0 );


	// if we are already connected to the local host, stay connected
	if ( cls.state >= CA_CONNECTED && !Q_stricmp( cls.servername, "localhost" ) ) {
		cls.state = CA_CONNECTED;		// so the connect screen is drawn
		Com_Memset( cls.updateInfoString, 0, sizeof( cls.updateInfoString ) );
		Com_Memset( clc.serverMessage, 0, sizeof( clc.serverMessage ) );
		Com_Memset( &cl.gameState, 0, sizeof( cl.gameState ) );
		clc.lastPacketSentTime = -9999;
		cls.framecount++;
		SCR_UpdateScreen(qfalse);
	} else {
		// clear nextmap so the cinematic shutdown doesn't execute it
		Cvar_Set( "nextmap", "" );
#ifndef USE_LOCAL_DED
		CL_Disconnect( qtrue, qfalse );
#endif
		Q_strncpyz( cls.servername, "localhost", sizeof(cls.servername) );
		cls.state = CA_CHALLENGING;		// so the connect screen is drawn
		Key_SetCatcher( 0 );
		cls.framecount++;
		SCR_UpdateScreen(qfalse);
		clc.connectTime = -RETRANSMIT_TIMEOUT;
		NET_StringToAdr( cls.servername, &clc.serverAddress, NA_UNSPEC );
		// we don't need a challenge on the localhost
		CL_CheckForResend();
	}
}


/*
=====================
CL_ClearState

Called before parsing a gamestate
=====================
*/
void CL_ClearState( void ) {

//	S_StopAllSounds();

	Com_Memset( &cl, 0, sizeof( cl ) );
}


/*
====================
CL_UpdateGUID

update cl_guid using QKEY_FILE and optional prefix
====================
*/
static void CL_UpdateGUID( const char *prefix, int prefix_len )
{
#ifdef USE_Q3KEY
	fileHandle_t f;
	int len;

	len = FS_SV_FOpenFileRead( QKEY_FILE, &f );
	FS_FCloseFile( f );

	if( len != QKEY_SIZE ) 
		Cvar_Set( "cl_guid", "" );
	else
		Cvar_Set( "cl_guid", Com_MD5File( QKEY_FILE, QKEY_SIZE,
			prefix, prefix_len ) );
#else
	Cvar_Set( "cl_guid", Com_MD5Buf( &cl_cdkey[0], sizeof(cl_cdkey), prefix, prefix_len));
#endif
}


/*
=====================
CL_ResetOldGame
=====================
*/
void CL_ResetOldGame( void ) 
{
	cl_oldGameSet = qfalse;
	cl_oldGame[0] = '\0';
}


/*
=====================
CL_RestoreOldGame

change back to previous fs_game
=====================
*/
static qboolean CL_RestoreOldGame( void )
{
	if ( cl_oldGameSet )
	{
		cl_oldGameSet = qfalse;
		Cvar_Set( "fs_game", cl_oldGame );
		FS_ConditionalRestart( clc.checksumFeed, qtrue, 0 );
		return qtrue;
	}
	return qfalse;
}


/*
=====================
CL_Disconnect

Called when a connection, demo, or cinematic is being terminated.
Goes from a connected state to either a menu state or a console state
Sends a disconnect message to the server
This is also called on Com_Error and Com_Quit, so it shouldn't cause any errors
=====================
*/
qboolean CL_Disconnect( qboolean showMainMenu, qboolean dropped ) {
	static qboolean cl_disconnecting = qfalse;
	qboolean cl_restarted = qfalse;

#ifdef _DEBUG
#ifndef __WASM__
  void *syms[20];
  const size_t size = backtrace( syms, ARRAY_LEN( syms ) );
  backtrace_symbols_fd( syms, size, STDERR_FILENO );
#else
	DebugTrace();
#endif
#endif

	if ( !com_cl_running || !com_cl_running->integer ) {
		return cl_restarted;
	}

	if ( cl_disconnecting ) {
		return cl_restarted;
	}

	cl_disconnecting = qtrue;

	// Stop demo recording
	if ( clc.demorecording ) {
		CL_StopRecord_f();
	}

	// Stop demo playback
#ifndef USE_MULTIVM_CLIENT
	if ( clc.demofile != FS_INVALID_HANDLE ) {
		FS_FCloseFile( clc.demofile );
		clc.demofile = FS_INVALID_HANDLE;
	}
#else
  if ( clc.demofiles[clc.currentView] != FS_INVALID_HANDLE ) {
    FS_FCloseFile( clc.demofiles[clc.currentView] );
    clc.demofiles[clc.currentView] = FS_INVALID_HANDLE;
  }
#endif

	// Finish downloads
	if ( clc.download != FS_INVALID_HANDLE ) {
		FS_FCloseFile( clc.download );
		clc.download = FS_INVALID_HANDLE;
	}
	*clc.downloadTempName = *clc.downloadName = '\0';
	Cvar_Set( "cl_downloadName", "" );

	// Stop recording any video
	if ( CL_VideoRecording() ) {
		// Finish rendering current frame
		cls.framecount++;
		SCR_UpdateScreen(qfalse);
		CL_CloseAVI();
	}
	
#ifdef USE_LNBITS
	Cvar_Set("cl_lnInvoice", "");
	cls.qrCodeShader = 0;
#endif

#ifdef USE_LOCAL_DED
	if(dropped || cls.postgame)
#endif
	if ( cgvm ) {
		// do that right after we rendered last video frame
		CL_ShutdownCGame();
	}

	SCR_StopCinematic();
	S_StopAllSounds();

	Key_ClearStates();

	if ( uivm && showMainMenu ) {
		VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_NONE );
	}

	// Remove pure paks
	if(!noGameRestart && !showMainMenu) {
		FS_PureServerSetLoadedPaks( "", "" );
		FS_PureServerSetReferencedPaks( "", "" );

		FS_ClearPakReferences( FS_GENERAL_REF | FS_UI_REF | FS_CGAME_REF );
	}

	if ( CL_GameSwitch() ) {
		// keep current gamestate and connection
		cl_disconnecting = qfalse;
		return qfalse;
	}

#ifdef USE_LOCAL_DED
	{
		netadr_t	addr;
		NET_StringToAdr("localhost", &addr, NA_LOOPBACK);
		if(cls.state >= CA_CONNECTED && clc.serverAddress.type == NA_LOOPBACK) {
			//cls.state = CA_CONNECTED;
			Key_SetCatcher((Key_GetCatcher() ^ KEYCATCH_CGAME) | KEYCATCH_UI);
			if(!dropped && !cls.postgame) {
				// skip disconnecting and just show the main menu
				noGameRestart = qtrue;
				cl_disconnecting = qfalse;
				return qfalse;
			} else if (cls.postgame) {
				cls.postgame = qfalse;
				Cbuf_AddText("map_restart\n");
				Cbuf_Execute();
			}
		}
    clc.serverAddress = addr;
	}
#ifdef __WASM__
	if(showMainMenu && cl_returnURL->string[0]) {
		Cbuf_AddText("quit\n");
	}
#endif
#endif

	// send a disconnect message to the server
	// send it a few times in case one is dropped
	if ( cls.state >= CA_CONNECTED && cls.state != CA_CINEMATIC && !clc.demoplaying ) {
		CL_AddReliableCommand( "disconnect", qtrue );
		CL_WritePacket();
		CL_WritePacket();
		CL_WritePacket();
	}

	CL_ClearState();

	// wipe the client connection
	Com_Memset( &clc, 0, sizeof( clc ) );
	
	cls.state = CA_DISCONNECTED;

	// allow cheats locally
	Cvar_Set( "sv_cheats", "1" );

	// not connected to a pure server anymore
	cl_connectedToPureServer = 0;

#ifdef USE_LOCAL_DED
	if(FS_Initialized())
		CL_UpdateGUID( NULL, 0 );
#endif

	// Cmd_RemoveCommand( "callvote" );
	Cmd_RemoveCgameCommands();

	if ( noGameRestart )
		noGameRestart = qfalse;
	else
		cl_restarted = CL_RestoreOldGame();

	cl_disconnecting = qfalse;

	return cl_restarted;
}


/*
===================
CL_ForwardCommandToServer

adds the current command line as a clientCommand
things like godmode, noclip, etc, are commands directed to the server,
so when they are typed in at the console, they will need to be forwarded.
===================
*/
void CL_ForwardCommandToServer( const char *string ) {
	const char *cmd;

	cmd = Cmd_Argv( 0 );

	// ignore key up commands
	if ( cmd[0] == '-' ) {
		return;
	}

	// no userinfo updates from command line
	if ( !strcmp( cmd, "userinfo" ) ) {
		return;
	}

	if ( clc.demoplaying || cls.state < CA_CONNECTED || cmd[0] == '+' ) {
		Com_Printf( "Unknown command \"%s" S_COLOR_WHITE "\"\n", cmd );
		return;
	}

	if ( Cmd_Argc() > 1 ) {
		CL_AddReliableCommand( string, qfalse );
	} else {
		CL_AddReliableCommand( cmd, qfalse );
	}

#ifdef USE_LOCAL_DED
	// detect a map command and start connection to localhost
	//   this helps the UI not sit around and wait while the server is starting
	if( (!strcmp(cmd, "map")
 		|| !strcmp(cmd, "devmap")
		|| !strcmp(cmd, "spmap")
		|| !strcmp(cmd, "spdevmap"))
		&& clc.serverAddress.type == NA_LOOPBACK ) {
		// TODO: only kick allbots if command comes from menu?
		Cmd_Clear();
		Cbuf_AddText("wait 10\nconnect localhost\n");
	}
#endif
}


/*
===================
CL_RequestMotd

===================
*/
#if 0
void CL_RequestMotd( void ) {
	char		info[MAX_INFO_STRING];

	if ( !cl_motd->integer ) {
		return;
	}
	Com_Printf( "Resolving %s\n", UPDATE_SERVER_NAME );
	if ( !NET_StringToAdr( UPDATE_SERVER_NAME, &cls.updateServer, NA_IP ) ) {
		Com_Printf( "Couldn't resolve address\n" );
		return;
	}
	cls.updateServer.port = BigShort( PORT_UPDATE );
	Com_Printf( "%s resolved to %i.%i.%i.%i:%i\n", UPDATE_SERVER_NAME,
		cls.updateServer.ip[0], cls.updateServer.ip[1],
		cls.updateServer.ip[2], cls.updateServer.ip[3],
		BigShort( cls.updateServer.port ) );
	
	info[0] = 0;
  // NOTE TTimo xoring against Com_Milliseconds, otherwise we may not have a true randomization
  // only srand I could catch before here is tr_noise.c l:26 srand(1001)
  // https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=382
  // NOTE: the Com_Milliseconds xoring only affects the lower 16-bit word,
  //   but I decided it was enough randomization
	Com_sprintf( cls.updateChallenge, sizeof( cls.updateChallenge ), "%i", ((rand() << 16) ^ rand()) ^ Com_Milliseconds());

	Info_SetValueForKey( info, "challenge", cls.updateChallenge );
	Info_SetValueForKey( info, "renderer", cls.glconfig.renderer_string );
	Info_SetValueForKey( info, "version", com_version->string );

	NET_OutOfBandPrint( NS_CLIENT, &cls.updateServer, "getmotd \"%s\"\n", info );
}
#endif

/*
===================
CL_RequestAuthorization

Authorization server protocol
-----------------------------

All commands are text in Q3 out of band packets (leading 0xff 0xff 0xff 0xff).

Whenever the client tries to get a challenge from the server it wants to
connect to, it also blindly fires off a packet to the authorize server:

getKeyAuthorize <challenge> <cdkey>

cdkey may be "demo"


#OLD The authorize server returns a:
#OLD 
#OLD keyAthorize <challenge> <accept | deny>
#OLD 
#OLD A client will be accepted if the cdkey is valid and it has not been used by any other IP
#OLD address in the last 15 minutes.


The server sends a:

getIpAuthorize <challenge> <ip>

The authorize server returns a:

ipAuthorize <challenge> <accept | deny | demo | unknown >

A client will be accepted if a valid cdkey was sent by that ip (only) in the last 15 minutes.
If no response is received from the authorize server after two tries, the client will be let
in anyway.
===================
*/
#ifndef STANDALONE
static void CL_RequestAuthorization( void ) {
	char	nums[64];
	int		i, j, l;
	cvar_t	*fs;

	if ( !cls.authorizeServer.port ) {
		Com_Printf( "Resolving %s\n", AUTHORIZE_SERVER_NAME );
		if ( !NET_StringToAdr( AUTHORIZE_SERVER_NAME, &cls.authorizeServer, NA_IP ) ) {
			Com_Printf( "Couldn't resolve address\n" );
			return;
		}

		cls.authorizeServer.port = BigShort( PORT_AUTHORIZE );
		Com_Printf( "%s resolved to %i.%i.%i.%i:%i\n", AUTHORIZE_SERVER_NAME,
			cls.authorizeServer.ipv._4[0], cls.authorizeServer.ipv._4[1],
			cls.authorizeServer.ipv._4[2], cls.authorizeServer.ipv._4[3],
			BigShort( cls.authorizeServer.port ) );
	}
	if ( cls.authorizeServer.type == NA_BAD ) {
		return;
	}

	// only grab the alphanumeric values from the cdkey, to avoid any dashes or spaces
	j = 0;
	l = strlen( cl_cdkey );
	if ( l > 32 ) {
		l = 32;
	}
	for ( i = 0 ; i < l ; i++ ) {
		if ( ( cl_cdkey[i] >= '0' && cl_cdkey[i] <= '9' )
				|| ( cl_cdkey[i] >= 'a' && cl_cdkey[i] <= 'z' )
				|| ( cl_cdkey[i] >= 'A' && cl_cdkey[i] <= 'Z' )
			 ) {
			nums[j] = cl_cdkey[i];
			j++;
		}
	}
	nums[j] = 0;

	fs = Cvar_Get ("cl_anonymous", "0", CVAR_INIT|CVAR_SYSTEMINFO );

	NET_OutOfBandPrint(NS_CLIENT, &cls.authorizeServer, "getKeyAuthorize %i %s", fs->integer, nums );
}
#endif


/*
======================================================================

CONSOLE COMMANDS

======================================================================
*/

/*
==================
CL_ForwardToServer_f
==================
*/
static void CL_ForwardToServer_f( void ) {
	if ( cls.state != CA_ACTIVE || clc.demoplaying ) {
		Com_Printf ("Not connected to a server.\n");
		return;
	}

	if ( Cmd_Argc() <= 1 || strcmp( Cmd_Argv( 1 ), "userinfo" ) == 0 )
		return;

	// don't forward the first argument
	CL_AddReliableCommand( Cmd_ArgsFrom( 1 ), qfalse );
}


/*
==================
CL_Disconnect_f
==================
*/
void CL_Disconnect_f( void ) {
	SCR_StopCinematic();
	Cvar_Set( "ui_singlePlayerActive", "0" );
	if ( cls.state != CA_DISCONNECTED && cls.state != CA_CINEMATIC ) {
		if ( (uivm && uivm->callLevel) || (cgvm && cgvm->callLevel) ) {
			Com_Error( ERR_DISCONNECT, "Disconnected from server" );
		} else {
			// clear any previous "server full" type messages
			clc.serverMessage[0] = '\0';
#ifndef BUILD_SLIM_CLIENT
#ifndef USE_LOCAL_DED
			if ( com_sv_running && com_sv_running->integer ) {
				// if running a local server, kill it
				SV_Shutdown( "Disconnected from server" );
			} else 
#endif
#endif
			{
				Com_Printf( "Disconnected from %s\n", cls.servername );
			}
			Cvar_Set( "com_errorMessage", "" );
			if ( !CL_Disconnect( qfalse, qfalse ) ) { // restart client if not done already
#ifndef USE_LAZY_MEMORY
				CL_FlushMemory();
#endif
			}
			if ( uivm ) {
				VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_MAIN );
			}
		}
	}
}


/*
================
CL_Reconnect_f
================
*/
static void CL_Reconnect_f( void ) {
	if ( cl_reconnectArgs->string[0] == '\0' || Q_stricmp( cl_reconnectArgs->string, "localhost" ) == 0 )
		return;
	Cvar_Set( "ui_singlePlayerActive", "0" );
	Cbuf_AddText( va( "connect %s\n", cl_reconnectArgs->string ) );
}


/*
================
CL_Connect_f
================
*/
static void CL_Connect_f( void ) {
	netadrtype_t family;
	netadr_t	addr;
	char	buffer[ sizeof(cls.servername) ];  // same length as cls.servername
	char	args[ sizeof( cls.servername ) + MAX_CVAR_VALUE_STRING ];
	char	*server;	
	const char	*serverString;
	int		len;
	int		argc;

	argc = Cmd_Argc();
	family = NA_UNSPEC;

	if ( argc != 2 && argc != 3 ) {
		Com_Printf( "Usage: connect [-4|-6] server\n");
		return;	
	}
	
	if( argc == 2 ) {
		server = Cmd_Argv(1);
	} else {
		if( !strcmp( Cmd_Argv(1), "-4" ) )
			family = NA_IP;
#ifdef USE_IPV6
		else if( !strcmp( Cmd_Argv(1), "-6" ) )
			family = NA_IP6;
		else
			Com_Printf( S_COLOR_YELLOW "warning: only -4 or -6 as address type understood.\n" );
#else
			Com_Printf( S_COLOR_YELLOW "warning: only -4 as address type understood.\n" );
#endif
		server = Cmd_Argv(2);
	}

	Q_strncpyz( buffer, server, sizeof( buffer ) );
	server = buffer;

	// skip leading "q3a:/" in connection string
	if ( !Q_stricmpn( server, "q3a:/", 5 ) ) {
		server += 5;
	}

	// skip all slash prefixes
	while ( *server == '/' ) {
		server++;
	}

	len = strlen( server );
	if ( len <= 0 ) {
		return;
	}

	// some programs may add ending slash
	if ( server[len-1] == '/' ) {
		server[len-1] = '\0';
	}

	if ( !*server ) {
		return;
	}

	// try resolve remote server first
	if ( !NET_StringToAdr( server, &addr, family ) ) {
		Com_Printf( S_COLOR_YELLOW "Bad server address - %s\n", server );
		return;
	}

	// save arguments for reconnect
	Q_strncpyz( args, Cmd_ArgsFrom( 1 ), sizeof( args ) );

	Cvar_Set( "ui_singlePlayerActive", "0" );

	// clear any previous "server full" type messages
	clc.serverMessage[0] = '\0';

#ifndef USE_LOCAL_DED
#ifndef BUILD_SLIM_CLIENT

	// if running a local server, kill it
	if ( com_sv_running && com_sv_running->integer && !strcmp( server, "localhost" ) ) {
		SV_Shutdown( "Server quit" );
	}

	// make sure a local server is killed
	Cvar_Set( "sv_killserver", "1" );
	SV_Frame( 0 );

#endif
#else

	if(addr.type != NA_LOOPBACK && (!strcmp (server, "127.0.0.1")
		|| !strcmp (server, va("127.0.0.1:%i", BigShort(PORT_SERVER))))) {
		NET_StringToAdr("localhost", &addr, NA_LOOPBACK);
	}
	// if we were already connected to the local server, don't reconnect
	if(cls.state >= CA_CONNECTED && clc.serverAddress.type == NA_LOOPBACK
		&& addr.type == NA_LOOPBACK && cgvm) {
		cls.state = CA_PRIMED;
		VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_NONE );
		return;
	}
#endif
	noGameRestart = qtrue;
	CL_Disconnect( qfalse, qtrue );

#ifndef USE_NO_CONSOLE
	Con_Close();
#endif

	Q_strncpyz( cls.servername, server, sizeof( cls.servername ) );

	// copy resolved address 
	clc.serverAddress = addr;

	if (clc.serverAddress.port == 0) {
		clc.serverAddress.port = BigShort( PORT_SERVER );
	}

	serverString = NET_AdrToStringwPort( &clc.serverAddress );

	Com_Printf( "%s resolved to %s\n", cls.servername, serverString );

	if ( cl_guidServerUniq->integer )
		CL_UpdateGUID( serverString, strlen( serverString ) );
	else
		CL_UpdateGUID( NULL, 0 );

	// if we aren't playing on a lan, we need to authenticate
	// with the cd key
#ifndef USE_LOCAL_DED
	if ( NET_IsLocalAddress( &clc.serverAddress ) ) {
		cls.state = CA_CHALLENGING;
	} else 
#endif
	{
		cls.state = CA_CONNECTING;

		// Set a client challenge number that ideally is mirrored back by the server.
		//clc.challenge = ((rand() << 16) ^ rand()) ^ Com_Milliseconds();
		Com_RandomBytes( (byte*)&clc.challenge, sizeof( clc.challenge ) );
	}

	Key_SetCatcher( 0 );
	clc.connectTime = -99999;	// CL_CheckForResend() will fire immediately
	clc.connectPacketCount = 0;

	Cvar_Set( "cl_reconnectArgs", args );

	// server connection string
	Cvar_Set( "cl_currentServerAddress", server );
}

#define MAX_RCON_MESSAGE (MAX_STRING_CHARS+4)

/*
==================
CL_CompleteRcon
==================
*/
qboolean hasRcon = qfalse;
static void CL_CompleteRcon( char *args, int argNum )
{
	int beforeLength;
	if ( argNum >= 2 )
	{
		// Skip "rcon "
		char *p = Com_SkipTokens( args, 1, " " );

		beforeLength = strlen(g_consoleField.buffer);
		if ( p > args )
			Field_CompleteCommand( p, qtrue, qtrue );

		// TODO: execute a \rcon cmdlist
		if(beforeLength == strlen(g_consoleField.buffer)) {
			Cbuf_AddText( va("rcon complete %s\n", p) );
			Cbuf_Execute();
		}
	}
}


/*
=====================
CL_Rcon_f

  Send the rest of the command line over as
  an unconnected command.
=====================
*/
static void CL_Rcon_f( void ) {
	char message[MAX_RCON_MESSAGE];
	const char *sp;
	int len;

#if 0
// allow blank passwords for rcon clients
	if ( !rcon_client_password->string[0] ) {
		Com_Printf( "You must set 'rconpassword' before\n"
			"issuing an rcon command.\n" );
		return;
	}
#endif

	if ( cls.state >= CA_CONNECTED ) {
		rcon_address = clc.netchan.remoteAddress;
	} else {
		if ( !rconAddress->string[0] ) {
			Com_Printf( "You must either be connected,\n"
				"or set the 'rconAddress' cvar\n"
				"to issue rcon commands\n" );
			return;
		}
		if ( !NET_StringToAdr( rconAddress->string, &rcon_address, NA_UNSPEC ) ) {
			return;
		}
		if ( rcon_address.port == 0 ) {
			rcon_address.port = BigShort( PORT_SERVER );
		}
	}

	message[0] = -1;
	message[1] = -1;
	message[2] = -1;
	message[3] = -1;
	message[4] = '\0';

	// we may need to quote password if it contains spaces
	sp = strchr( rcon_client_password->string, ' ' );

	len = Com_sprintf( message+4, sizeof( message )-4,
		sp ? "rcon \"%s\" %s" : "rcon %s %s",
		rcon_client_password->string,
		Cmd_Cmd() + 5 ) + 4 + 1; // including OOB marker and '\0'

	NET_SendPacket( NS_CLIENT, len, message, &rcon_address );
}


/*
=================
CL_SendPureChecksums
=================
*/
static void CL_SendPureChecksums( void ) {
	char cMsg[ MAX_STRING_CHARS-1 ];
	int len;

	if ( !cl_connectedToPureServer || clc.demoplaying )
		return;

#ifdef USE_SPOOF_CHECKSUM
	// because restarting VMs is not done, especially when file system doesnt change
	//   but resetting which Paks are used is cleared in ParseGamestate
	//   also the server does this
	FS_TouchFileInPak( "vm/ui.qvm" );
	FS_TouchFileInPak( "vm/cgame.qvm" );
#endif

	// if we are pure we need to send back a command with our referenced pk3 checksums
	len = sprintf( cMsg, "cp %d ", cl.serverId );
	strcpy( cMsg + len, FS_ReferencedPakPureChecksums( sizeof( cMsg ) - len - 1 ) );
Com_Printf("Check pure: %s\n", cMsg);

	CL_AddReliableCommand( cMsg, qfalse );
}


/*
=================
CL_ResetPureClientAtServer
=================
*/
static void CL_ResetPureClientAtServer( void ) {
	CL_AddReliableCommand( "vdr", qfalse );
}


#ifdef USE_VID_FAST
/*
=================
CL_Vid_Restart_Fast
*/
static void CL_Vid_Restart_Fast() {
	glconfig_t *glConfig = re.GetConfig();
	extern void GL_GetDrawableSize( int *w, int *h );
	GL_GetDrawableSize( &glConfig->vidWidth, &glConfig->vidHeight );
	cls.glconfig = *glConfig;

}
#endif


/*
=================
CL_Vid_Restart

Restart the video subsystem

we also have to reload the UI and CGame because the renderer
doesn't know what graphics to reload
=================
*/
static void CL_Vid_Restart( qboolean keepWindow ) {

#ifdef USE_VID_FAST
  char *arg = Cmd_Argv(1);
  if (!strcmp(arg, "fast")) {
    CL_Vid_Restart_Fast();
    return;
  }
#endif

	// Settings may have changed so stop recording now
	if ( CL_VideoRecording() )
		CL_CloseAVI();

	if ( clc.demorecording )
		CL_StopRecord_f();

	// clear and mute all sounds until next registration
	S_DisableSounds();

	// shutdown VMs
	CL_ShutdownVMs();

	// shutdown the renderer and clear the renderer interface
	CL_ShutdownRef( keepWindow ? REF_KEEP_WINDOW : REF_DESTROY_WINDOW );

	// client is no longer pure until new checksums are sent
	CL_ResetPureClientAtServer();

	// clear pak references
	FS_ClearPakReferences( FS_UI_REF | FS_CGAME_REF );

	// reinitialize the filesystem if the game directory or checksum has changed
	if ( !clc.demoplaying ) // -EC-
		FS_ConditionalRestart( clc.checksumFeed, qfalse, 0 );

	cls.soundRegistered = qfalse;

	// unpause so the cgame definitely gets a snapshot and renders a frame
	Cvar_Set( "cl_paused", "0" );

	CL_ClearMemory();

	// startup all the client stuff
	CL_StartHunkUsers();

	// start the cgame if connected
	if ( ( cls.state > CA_CONNECTED && cls.state != CA_CINEMATIC ) || cls.startCgame ) {
		cls.cgameStarted = qtrue;
		CL_InitCGame(-1);
		// send pure checksums
		CL_SendPureChecksums();
	}

	cls.startCgame = qfalse;
}


/*
=================
CL_Vid_Restart_f

Wrapper for CL_Vid_Restart
=================
*/
static void CL_Vid_Restart_f( void ) {
	// hack for OSP mod: do not allow vid restart right after cgame init
	if ( cls.lastVidRestart )
		if ( abs( cls.lastVidRestart - Sys_Milliseconds() ) < 500 )
			return;

#ifdef USE_LAZY_LOAD
	if ( Q_stricmp( Cmd_Argv(1), "lazy" ) == 0) {
		CL_StartHunkUsers();
	} else 
#endif
	if ( Q_stricmp( Cmd_Argv(1), "keep_window" ) == 0
 		|| Q_stricmp( Cmd_Argv(1), "fast" ) == 0)
		CL_Vid_Restart( qtrue );
	else
		CL_Vid_Restart( qfalse );
}


/*
=================
CL_Snd_Restart

Restart the sound subsystem
=================
*/

/*
=================
CL_Snd_Restart_f

Restart the sound subsystem
The cgame and game must also be forced to restart because
handles will be invalid
=================
*/
static void CL_Snd_Restart_f( void )
{
	S_Shutdown();

	// sound will be reinitialized by vid_restart
	S_Init();
	cls.soundStarted = qtrue;
	cls.soundRegistered = qtrue;
	S_BeginRegistration();
	//CL_Vid_Restart();
}


/*
==================
CL_Configstrings_f
==================
*/
static void CL_Configstrings_f( void ) {
	int		i;
	int		ofs;

	if ( cls.state != CA_ACTIVE ) {
		Com_Printf( "Not connected to a server.\n");
		return;
	}

	for ( i = 0 ; i < MAX_CONFIGSTRINGS ; i++ ) {
#ifdef USE_MULTIVM_CLIENT
		ofs = cl.gameStates[clc.currentView].stringOffsets[ i ];
#else
		ofs = cl.gameState.stringOffsets[ i ];
#endif
		if ( !ofs ) {
			continue;
		}
#ifdef USE_MULTIVM_CLIENT
		Com_Printf( "%4i: %s\n", i, cl.gameStates[clc.currentView].stringData + ofs );
#else
		Com_Printf( "%4i: %s\n", i, cl.gameState.stringData + ofs );
#endif
	}
}


/*
==============
CL_Clientinfo_f
==============
*/
static void CL_Clientinfo_f( void ) {
	Com_Printf( "--------- Client Information ---------\n" );
	Com_Printf( "state: %i\n", cls.state );
	Com_Printf( "Server: %s\n", cls.servername );
	Com_Printf ("User info settings:\n");
#ifdef USE_MULTIVM_CLIENT
  Info_Print( Cvar_InfoString( CVAR_USERINFO, NULL, clc.currentView ) );
#else
	Info_Print( Cvar_InfoString( CVAR_USERINFO, NULL ) );
#endif
	Com_Printf( "--------------------------------------\n" );
}


/*
==============
CL_Serverinfo_f
==============
*/
static void CL_Serverinfo_f( void ) {
	int		ofs;

#ifdef USE_MULTIVM_CLIENT
		ofs = cl.gameStates[clc.currentView].stringOffsets[ CS_SERVERINFO ];
#else
		ofs = cl.gameState.stringOffsets[ CS_SERVERINFO ];
#endif
	if ( !ofs )
		return;

	Com_Printf( "Server info settings:\n" );
#ifdef USE_MULTIVM_CLIENT
	Info_Print( cl.gameStates[clc.currentView].stringData + ofs );
#else
	Info_Print( cl.gameState.stringData + ofs );
#endif
}


/*
===========
CL_Systeminfo_f
===========
*/
static void CL_Systeminfo_f( void ) {
	int ofs;

#ifdef USE_MULTIVM_CLIENT
	ofs = cl.gameStates[clc.currentView].stringOffsets[ CS_SYSTEMINFO ];
#else
	ofs = cl.gameState.stringOffsets[ CS_SYSTEMINFO ];
#endif
	if ( !ofs )
		return;

	Com_Printf( "System info settings:\n" );
#ifdef USE_MULTIVM_CLIENT
	Info_Print( cl.gameStates[clc.currentView].stringData + ofs );
#else
	Info_Print( cl.gameState.stringData + ofs );
#endif
}


static void CL_CompleteCallvote( char *args, int argNum )
{
	if( argNum >= 2 )
	{
		// Skip "callvote "
		char *p = Com_SkipTokens( args, 1, " " );

		if ( p > args )
			Field_CompleteCommand( p, qtrue, qtrue );
	}
}


//====================================================================


/*
=================
CL_DownloadsComplete

Called when all downloading has been completed
=================
*/
static void CL_DownloadsComplete( void ) {
#ifdef USE_MULTIVM_CLIENT
	int igs = clientGames[cgvmi];
#endif

	Com_Printf("Downloads complete\n");
	if(uivm)
		VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_NONE );

#ifdef __WASM__
	if(clc.dlDisconnect) {
		if(clc.downloadRestart) {
			FS_Restart(clc.checksumFeed);
			clc.downloadRestart = qfalse;
		}
		return;
	}
#endif

#ifdef USE_LAZY_LOAD
	// make sure we have a map by now
	const char *map = va("maps/%s.bsp", Info_ValueForKey( cl.gameState.stringData + cl.gameState.stringOffsets[ CS_SERVERINFO ], "mapname" ));
	if(FS_ReadFile(map, NULL) <= 0) {
		Sys_FileNeeded(map, VFS_NOW);
		return;
	}
#endif

#ifdef USE_CURL
	// if we downloaded with cURL
	if(clc.cURLUsed) { 
		clc.cURLUsed = qfalse;
		Com_DL_Cleanup(&download);
		if( clc.cURLDisconnected ) {
			if(clc.downloadRestart) {
				FS_Restart(clc.checksumFeed);
				clc.downloadRestart = qfalse;
			}
			clc.cURLDisconnected = qfalse;
			CL_Reconnect_f();
			return;
		}
	}
#endif

	// if we downloaded files we need to restart the file system
	if (clc.downloadRestart) {
		clc.downloadRestart = qfalse;

		FS_Restart(clc.checksumFeed); // We possibly downloaded a pak, restart the file system to load it

		// inform the server so we get new gamestate info
		CL_AddReliableCommand( "donedl", qfalse );

		// by sending the donedl command we request a new gamestate
		// so we don't want to load stuff yet
		return;
	}

	// let the client game init and load data
	cls.state = CA_LOADING;

	// Pump the loop, this may change gamestate!
	Com_EventLoop();

	// if the gamestate was changed by calling Com_EventLoop
	// then we loaded everything already and we don't want to do it again.
	if ( cls.state != CA_LOADING ) {
		return;
	}

	// flush client memory and start loading stuff
	// this will also (re)load the UI
	// if this is a local client then only the client part of the hunk
	// will be cleared, note that this is done after the hunk mark has been set
	//if ( !com_sv_running->integer )

#ifdef USE_LAZY_MEMORY
	S_DisableSounds();
	re.ReloadShaders(qtrue);
	// adopt the styles from the current mod
	//cls.charSetShader = re.RegisterShader( "gfx/2d/bigchars" );
	//cls.whiteShader = re.RegisterShader( "white" );
  //cls.lagometerShader = re.RegisterShader( "lagometer" );
#ifndef USE_NO_CONSOLE
	//cls.consoleShader = re.RegisterShader( "console" );
#endif
#ifndef __WASM__
	cls.soundRegistered = qtrue;
	S_BeginRegistration();
#endif
#else
	CL_FlushMemory();
#endif

	// initialize the CGame
	cls.cgameStarted = qtrue;

#ifdef USE_MULTIVM_CLIENT
	// force the client to load a new VM using sv_mvWorld
	// this only loads a VM the first time, decoupling game state from loading
	// TODO: exec world 0:0 asynchronously
	cgvmi = clc.currentView;
#ifdef USE_LAZY_LOAD
	//if(clc.sv_mvWorld) {
	//	Cvar_Set( "cl_lazyLoad", "2" ); // TODO: 4
	//} else {
		Cvar_Set( "cl_lazyLoad", "1" ); // TODO: 4
	//}
#endif
	// added restart fancy-ness to this function automatically
	CL_InitCGame(cgvmi);
#ifdef USE_LAZY_LOAD
	Cvar_Set( "cl_lazyLoad", "1" ); // TODO: 4
#endif
#else
	clientGames[0] = 0;
	clientWorlds[0] = clc.clientNum;
	CL_InitCGame(-1);
#endif

	// set pure checksums
	CL_SendPureChecksums();

	CL_WritePacket();
	CL_WritePacket();
	CL_WritePacket();
}


/*
=================
CL_BeginDownload

Requests a file to download from the server.  Stores it in the current
game directory.
=================
*/
static void CL_BeginDownload( const char *localName, const char *remoteName ) {

	Com_DPrintf("***** CL_BeginDownload *****\n"
				"Localname: %s\n"
				"Remotename: %s\n"
				"****************************\n", localName, remoteName);

	Q_strncpyz ( clc.downloadName, localName, sizeof(clc.downloadName) );
	Com_sprintf( clc.downloadTempName, sizeof(clc.downloadTempName), "%s.tmp", localName );

	// Set so UI gets access to it
	Cvar_Set( "cl_downloadName", remoteName );
	Cvar_Set( "cl_downloadSize", "0" );
	Cvar_Set( "cl_downloadCount", "0" );
	Cvar_SetIntegerValue( "cl_downloadTime", cls.realtime );

	clc.downloadBlock = 0; // Starting new file
	clc.downloadCount = 0;

	CL_AddReliableCommand( va("download %s", remoteName), qfalse );
}


/*
=================
CL_NextDownload

A download completed or failed
=================
*/
void CL_NextDownload( void )
{
	char *s;
	char *remoteName, *localName;
	qboolean useCURL = qfalse;

 	// A download has finished, check whether this matches a referenced checksum
 	if(*clc.downloadName)
 	{
 		const char *zippath = FS_BuildOSPath(Cvar_VariableString("fs_homepath"), clc.downloadName, NULL );

 		if(!FS_CompareZipChecksum(zippath))
 			Com_Error(ERR_DROP, "Incorrect checksum for file: %s", clc.downloadName);
 	}

 	*clc.downloadTempName = *clc.downloadName = 0;
 	Cvar_Set("cl_downloadName", "");

	// We are looking to start a download here
	if (*clc.downloadList) {
		s = clc.downloadList;

		// format is:
		//  @remotename@localname@remotename@localname, etc.

		if (*s == '@')
			s++;
		remoteName = s;
		
		if ( (s = strchr(s, '@')) == NULL ) {
			CL_DownloadsComplete();
			return;
		}

		*s++ = '\0';
		localName = s;
		if ( (s = strchr(s, '@')) != NULL )
			*s++ = '\0';
		else
			s = localName + strlen(localName); // point at the null byte

#ifdef USE_CURL
		if(!(cl_allowDownload->integer & DLF_NO_REDIRECT)) {
			if(clc.sv_allowDownload & DLF_NO_REDIRECT) {
				Com_Printf("WARNING: server does not "
					"allow download redirection "
					"(sv_allowDownload is %d)\n",
					clc.sv_allowDownload);
			}
			else if(!*clc.sv_dlURL) {
				Com_Printf("WARNING: server allows "
					"download redirection, but does not "
					"have sv_dlURL set\n");
        if (!Com_DL_Begin( &download,
          remoteName, // local naming automatically handled by cl_curl
          cl_dlURL->string, qfalse )) {
          Com_Printf("WARNING: could not load download with curl\n");
  				useCURL = qfalse;
  			} else {
          useCURL = qtrue;
        }
			}
			else if (!Com_DL_Begin( &download,
        remoteName, // local naming automatically handled by cl_curl
        clc.sv_dlURL, qfalse )) {
        Com_Printf("WARNING: could not load download with curl\n");
				useCURL = qfalse;
			} else {
        useCURL = qtrue;
      }
		}
		else if(!(clc.sv_allowDownload & DLF_NO_REDIRECT)) {
			Com_Printf("WARNING: server allows download "
				"redirection, but it disabled by client "
				"configuration (cl_allowDownload is %d)\n",
				cl_allowDownload->integer);
		}
#endif /* USE_CURL */

		if( !useCURL ) {
			if( (cl_allowDownload->integer & DLF_NO_UDP) ) {
				Com_Error(ERR_DROP, "UDP Downloads are "
					"disabled on your client. "
					"(cl_allowDownload is %d)",
					cl_allowDownload->integer);
				return;	
			}
			else {
				CL_BeginDownload( localName, remoteName );
			}
		}
		clc.downloadRestart = qtrue;

		// move over the rest
		memmove( clc.downloadList, s, strlen(s) + 1 );

		return;
	}

	CL_DownloadsComplete();
}


/*
=================
CL_InitDownloads

After receiving a valid game state, we valid the cgame and local zip files here
and determine if we need to download them
=================
*/
void CL_InitDownloads( void ) {
	char missingfiles[ MAXPRINTMSG ];

	if ( FS_ComparePaks( missingfiles, sizeof( missingfiles ) , qtrue ) ) {

		// autodownload is disabled on the client
		// but it's possible that some referenced files on the server are missing
		if( !(cl_allowDownload->integer & DLF_ENABLE) ) {
			// NOTE TTimo I would rather have that printed as a modal message box
			// but at this point while joining the game we don't know wether we will successfully join or not
			Com_Printf( "\nWARNING: You are missing some files referenced by the server:\n"
				"You might not be able to join the game\n"
				"Go to the setting menu to turn on autodownload, or get the file elsewhere\n\n");
		}

		Com_Printf( "Need paks: %s\n", missingfiles );
		
		if ( missingfiles[0] ) {
			//strcpy(clc.downloadList, missingfiles);
      Q_strcat( clc.downloadList, sizeof( clc.downloadList ), missingfiles );

			// if autodownloading is not enabled on the server
			cls.state = CA_CONNECTED;

			*clc.downloadTempName = *clc.downloadName = '\0';
			Cvar_Set( "cl_downloadName", "" );
    }
  }

  if(clc.downloadList[0]) {
		CL_NextDownload();
		return;
	}

#ifdef USE_CURL
	if ( cl_mapAutoDownload->integer && ( !(clc.sv_allowDownload & DLF_ENABLE) || clc.demoplaying ) )
	{
		const char *info, *mapname, *bsp;
#ifdef USE_MULTIVM_CLIENT
		int igs = clc.currentView;
#endif

		// get map name and BSP file name
		info = cl.gameState.stringData + cl.gameState.stringOffsets[ CS_SERVERINFO ];
		mapname = Info_ValueForKey( info, "mapname" );
		bsp = va( "maps/%s.bsp", mapname );

		if ( FS_FOpenFileRead( bsp, NULL, qfalse ) == -1 )
		{
			if ( CL_Download( "dlmap", mapname, qtrue ) )
			{
				cls.state = CA_CONNECTED; // prevent continue loading and shows the ui download progress screen
				return;
			}
		}
	}
#endif // USE_CURL
		
	CL_DownloadsComplete();
}


/*
=================
CL_CheckForResend

Resend a connect message if the last one has timed out
=================
*/
static void CL_CheckForResend( void ) {
	int		port, len;
	char	info[MAX_INFO_STRING*2]; // larger buffer to detect overflows
	char	data[MAX_INFO_STRING];
	qboolean	notOverflowed;
	qboolean	infoTruncated;

	// don't send anything if playing back a demo
	if ( clc.demoplaying ) {
		return;
	}

	// resend if we haven't gotten a reply yet
	if ( cls.state != CA_CONNECTING && cls.state != CA_CHALLENGING ) {
		return;
	}

	if ( cls.realtime - clc.connectTime < RETRANSMIT_TIMEOUT ) {
		return;
	}

	clc.connectTime = cls.realtime;	// for retransmit requests
	clc.connectPacketCount++;

	switch ( cls.state ) {
	case CA_CONNECTING:
		// requesting a challenge .. IPv6 users always get in as authorize server supports no ipv6.
#ifndef STANDALONE
		if (!Cvar_VariableIntegerValue("com_standalone") && clc.serverAddress.type == NA_IP && !Sys_IsLANAddress( &clc.serverAddress ) )
			CL_RequestAuthorization();
#endif    
		// The challenge request shall be followed by a client challenge so no malicious server can hijack this connection.
		NET_OutOfBandPrint( NS_CLIENT, &clc.serverAddress, "getchallenge %d %s", clc.challenge, GAMENAME_FOR_MASTER );
		break;
		
	case CA_CHALLENGING:
		// sending back the challenge
		port = Cvar_VariableIntegerValue( "net_qport" );

		infoTruncated = qfalse;
#ifdef USE_MULTIVM_CLIENT
    Q_strncpyz( info, Cvar_InfoString( CVAR_USERINFO, &infoTruncated, cgvmi ), sizeof( info ) );
#else
		Q_strncpyz( info, Cvar_InfoString( CVAR_USERINFO, &infoTruncated ), sizeof( info ) );
#endif

		// remove some non-important keys that may cause overflow during connection
		if ( strlen( info ) > MAX_USERINFO_LENGTH - 64 ) {
			infoTruncated |= Info_RemoveKey( info, "xp_name" ) ? qtrue : qfalse;
			infoTruncated |= Info_RemoveKey( info, "xp_country" ) ? qtrue : qfalse;
		}
	
		len = strlen( info );
		if ( len > MAX_USERINFO_LENGTH ) {
			notOverflowed = qfalse;
		} else {
			notOverflowed = qtrue;
		}

		if ( com_protocol->integer != DEFAULT_PROTOCOL_VERSION ) {
			notOverflowed &= Info_SetValueForKey_s( info, MAX_USERINFO_LENGTH, "protocol",
				com_protocol->string );
		} else {
		notOverflowed &= Info_SetValueForKey_s( info, MAX_USERINFO_LENGTH, "protocol",
				clc.compat ? XSTRING( OLD_PROTOCOL_VERSION ) : XSTRING( NEW_PROTOCOL_VERSION ) );
		}
		
		notOverflowed &= Info_SetValueForKey_s( info, MAX_USERINFO_LENGTH, "qport",
			va( "%i", port ) );

		notOverflowed &= Info_SetValueForKey_s( info, MAX_USERINFO_LENGTH, "challenge",
			va( "%i", clc.challenge ) );

		// for now - this will be used to inform server about q3msgboom fix
		// this is optional key so will not trigger oversize warning
		Info_SetValueForKey_s( info, MAX_USERINFO_LENGTH, "client", Q3_VERSION );

		if ( !notOverflowed ) {
			Com_Printf( S_COLOR_YELLOW "WARNING: oversize userinfo, you might be not able to join remote server!\n" );
		}

		len = Com_sprintf( data, sizeof( data ), "connect \"%s\"", info );
		// NOTE TTimo don't forget to set the right data length!
		NET_OutOfBandCompress( NS_CLIENT, &clc.serverAddress, (byte *) &data[0], len );
		// the most current userinfo has been sent, so watch for any
		// newer changes to userinfo variables
		cvar_modifiedFlags &= ~CVAR_USERINFO;

		// ... but force re-send if userinfo was truncated in any way
		if ( infoTruncated || !notOverflowed ) {
			cvar_modifiedFlags |= CVAR_USERINFO;
		}
		break;

	default:
		Com_Error( ERR_FATAL, "CL_CheckForResend: bad cls.state" );
	}
}


/*
===================
CL_MotdPacket
===================
*/
static void CL_MotdPacket( const netadr_t *from ) {
	const char *challenge;
	const char *info;

	// if not from our server, ignore it
	if ( !NET_CompareAdr( from, &cls.updateServer ) ) {
		return;
	}

	info = Cmd_Argv(1);

	// check challenge
	challenge = Info_ValueForKey( info, "challenge" );
	if ( strcmp( challenge, cls.updateChallenge ) ) {
		return;
	}

	challenge = Info_ValueForKey( info, "motd" );

	Q_strncpyz( cls.updateInfoString, info, sizeof( cls.updateInfoString ) );
	Cvar_Set( "cl_motdString", challenge );
}


/*
===================
CL_InitServerInfo
===================
*/
static void CL_InitServerInfo( serverInfo_t *server, const netadr_t *address ) {
	server->adr = *address;
	server->clients = 0;
	server->hostName[0] = '\0';
	server->mapName[0] = '\0';
	server->maxClients = 0;
	server->maxPing = 0;
	server->minPing = 0;
	server->ping = -1;
	server->game[0] = '\0';
	server->gameType = 0;
	server->netType = 0;
	server->punkbuster = 0;
	server->g_humanplayers = 0;
	server->g_needpass = 0;
}

#define MAX_SERVERSPERPACKET	256

typedef struct hash_chain_s {
	netadr_t             addr;
	struct hash_chain_s *next;
} hash_chain_t;

static hash_chain_t *hash_table[1024];
static hash_chain_t hash_list[MAX_GLOBAL_SERVERS];
static unsigned int hash_count = 0;

static unsigned int hash_func( const netadr_t *addr ) {

	const byte		*ip = NULL;
	unsigned int	size;
	unsigned int	i;
	unsigned int	hash = 0;

	switch ( addr->type ) {
		case NA_IP:  ip = addr->ipv._4; size = 4;  break;
#ifdef USE_IPV6
		case NA_IP6: ip = addr->ipv._6; size = 16; break;
#endif
		default: size = 0; break;
	}

	for ( i = 0; i < size; i++ )
		hash = hash * 101 + (int)( *ip++ );

	hash = hash ^ ( hash >> 16 );

	return (hash & 1023);
}

static void hash_insert( const netadr_t *addr ) 
{
	hash_chain_t **tab, *cur;
	unsigned int hash;
	if ( hash_count >= MAX_GLOBAL_SERVERS )
		return;
	hash = hash_func( addr );
	tab = &hash_table[ hash ];
	cur = &hash_list[ hash_count++ ];
	cur->addr = *addr;
	if ( cur != *tab )
		cur->next = *tab;
	else
		cur->next = NULL;
	*tab = cur;
}

static void hash_reset( void ) 
{
	hash_count = 0;
	memset( hash_list, 0, sizeof( hash_list ) );
	memset( hash_table, 0, sizeof( hash_table ) );
}

static hash_chain_t *hash_find( const netadr_t *addr )
{
	hash_chain_t *cur;
	cur = hash_table[ hash_func( addr ) ];
	while ( cur != NULL ) {
		if ( NET_CompareAdr( addr, &cur->addr ) )
			return cur;
		cur = cur->next;
	}
	return NULL;
}


/*
===================
CL_ServersResponsePacket
===================
*/
static void CL_ServersResponsePacket( const netadr_t* from, msg_t *msg, qboolean extended ) {
	int				i, count, total;
	netadr_t addresses[MAX_SERVERSPERPACKET];
	int				numservers;
	byte*			buffptr;
	byte*			buffend;
	serverInfo_t *server;
	serverInfo_t *servers = &cls.globalServers[0];
	int	*max = &cls.numglobalservers;
	qboolean websocket = qfalse;


#ifdef USE_MASTER_LAN
	// check if server response is from a specific list
	netadr_t addr;
	if(cls.pingUpdateSource == AS_LOCAL) {
		for (i = 0; i < MAX_MASTER_SERVERS; i++) {
			memset(&addr, 0, sizeof(addr));
			if(!cl_master[i]->string[0]) {
				continue;
			}

			if(!NET_StringToAdr(cl_master[i]->string, &addr, NA_UNSPEC)) {
				continue;
			}

			if (NET_CompareAdr(from, &addr)) {
				servers = &cls.localServers[0];
				max = &cls.numlocalservers;
				if(!Q_stricmpn(addr.protocol, "ws", 2)
				 	|| !Q_stricmpn(addr.protocol, "wss", 3)) {
					websocket = qtrue;
				}
				break;
			}
		}
	}
#endif

	if (*max == -1) {
		// state to detect lack of servers or lack of response
		*max = 0;
		cls.numGlobalServerAddresses = 0;
		hash_reset();
	}

	// parse through server response string
	numservers = 0;
	buffptr    = msg->data;
	buffend    = buffptr + msg->cursize;

	// advance to initial token
	do
	{
		if(*buffptr == '\\' || (extended && *buffptr == '/'))
			break;
		
		buffptr++;
	} while (buffptr < buffend);

	while (buffptr + 1 < buffend)
	{
		// IPv4 address
		if (*buffptr == '\\')
		{
			buffptr++;

			if (buffend - buffptr < sizeof(addresses[numservers].ipv._4) + sizeof(addresses[numservers].port) + 1)
				break;

			for(i = 0; i < sizeof(addresses[numservers].ipv._4); i++)
				addresses[numservers].ipv._4[i] = *buffptr++;

			addresses[numservers].type = NA_IP;
		}
#ifdef USE_IPV6
		// IPv6 address, if it's an extended response
		else if (extended && *buffptr == '/')
		{
			buffptr++;

			if (buffend - buffptr < sizeof(addresses[numservers].ipv._6) + sizeof(addresses[numservers].port) + 1)
				break;
			
			for(i = 0; i < sizeof(addresses[numservers].ipv._6); i++)
				addresses[numservers].ipv._6[i] = *buffptr++;
			
			addresses[numservers].type = NA_IP6;
			addresses[numservers].scope_id = from->scope_id;
		}
#endif
		else
			// syntax error!
			break;
			
		// parse out port
		addresses[numservers].port = (*buffptr++) << 8;
		addresses[numservers].port += *buffptr++;
		addresses[numservers].port = BigShort( addresses[numservers].port );
		

		if(websocket) {
			Q_strncpyz(addresses[numservers].protocol, "ws", 3);
		} 

		// syntax check
		if (*buffptr != '\\' && *buffptr != '/')
			break;
	
		numservers++;
		if (numservers >= MAX_SERVERSPERPACKET)
			break;
	}

	count = *max;

	for (i = 0; i < numservers && count < MAX_GLOBAL_SERVERS; i++) {

		// Tequila: It's possible to have sent many master server requests. Then
		// we may receive many times the same addresses from the master server.
		// We just avoid to add a server if it is still in the global servers list.
		if ( hash_find( &addresses[i] ) )
			continue;

		hash_insert( &addresses[i] );

		// build net address
		server = &servers[count];

		CL_InitServerInfo( server, &addresses[i] );
		// advance to next slot

		count++;
	}


	// if getting the global list
	if ( count >= MAX_GLOBAL_SERVERS && cls.numGlobalServerAddresses < MAX_GLOBAL_SERVERS )
	{
		// if we couldn't store the servers in the main list anymore
		for (; i < numservers && cls.numGlobalServerAddresses < MAX_GLOBAL_SERVERS; i++)
		{
			// just store the addresses in an additional list
			cls.globalServerAddresses[cls.numGlobalServerAddresses++] = addresses[i];
		}
	}

	*max = count;
	total = count + cls.numGlobalServerAddresses;

	Com_Printf( "getserversResponse%s:%3d servers parsed (total %d)\n", websocket ? " (ws)" : "", numservers, total);
}


/*
=================
CL_ConnectionlessPacket

Responses to broadcasts, etc

return true only for commands indicating that our server is alive
or connection sequence is going into the right way
=================
*/
static qboolean CL_ConnectionlessPacket( const netadr_t *from, msg_t *msg ) {
	qboolean fromserver;
	const char *s;
	const char *c;
	int challenge = 0;

	MSG_BeginReadingOOB( msg );
	MSG_ReadLong( msg );	// skip the -1

	s = MSG_ReadStringLine( msg );

	Cmd_TokenizeString( s );

	c = Cmd_Argv(0);

	if ( com_developer->integer ) {
		Com_Printf( "CL packet %s: %s\n", NET_AdrToStringwPort( from ), s );
	}

	// challenge from the server we are connecting to
	if ( !Q_stricmp(c, "challengeResponse" ) ) {

		if ( cls.state != CA_CONNECTING ) {
			Com_DPrintf( "Unwanted challenge response received. Ignored.\n" );
			return qfalse;
		}

		c = Cmd_Argv( 2 );
		if ( *c != '\0' )
			challenge = atoi( c );

		clc.compat = qtrue;
		s = Cmd_Argv( 3 ); // analyze server protocol version
		if ( *s != '\0' ) {
			int sv_proto = atoi( s );
			if ( sv_proto > OLD_PROTOCOL_VERSION ) {
				if ( sv_proto == NEW_PROTOCOL_VERSION || sv_proto == com_protocol->integer ) {
					clc.compat = qfalse;
				} else {
					int cl_proto = com_protocol->integer;
					if ( cl_proto == DEFAULT_PROTOCOL_VERSION ) {
						// we support new protocol features by default
						cl_proto = NEW_PROTOCOL_VERSION;
					}
					Com_Printf( S_COLOR_YELLOW "Warning: Server reports protocol version %d, "
						"we have %d. Trying legacy protocol %d.\n",
						sv_proto, cl_proto, OLD_PROTOCOL_VERSION );
				}
			}
		}

		if ( clc.compat )
		{
			if ( !NET_CompareAdr( from, &clc.serverAddress ) )
			{
				// This challenge response is not coming from the expected address.
				// Check whether we have a matching client challenge to prevent
				// connection hi-jacking.
				if ( *c == '\0' || challenge != clc.challenge )
				{
					Com_DPrintf( "Challenge response received from unexpected source. Ignored.\n" );
					return qfalse;
				}
			}
		}
		else
		{
			if ( *c == '\0' || challenge != clc.challenge )
			{
				Com_Printf( "Bad challenge for challengeResponse. Ignored.\n" );
				return qfalse;
			}
		}

		// start sending connect instead of challenge request packets
		clc.challenge = atoi(Cmd_Argv(1));
		cls.state = CA_CHALLENGING;
		clc.connectPacketCount = 0;
		clc.connectTime = -99999;

		// take this address as the new server address.  This allows
		// a server proxy to hand off connections to multiple servers
		Q_strncpyz((char *)from->protocol, clc.serverAddress.protocol, sizeof(from->protocol));
		clc.serverAddress = *from;
		Com_DPrintf( "challengeResponse: %d\n", clc.challenge );
		return qtrue;
	}

	// server connection
	if ( !Q_stricmp(c, "connectResponse") ) {
		if ( cls.state >= CA_CONNECTED ) {
			Com_Printf( "Dup connect received. Ignored.\n" );
			return qfalse;
		}
		if ( cls.state != CA_CHALLENGING ) {
			Com_Printf( "connectResponse packet while not connecting. Ignored.\n" );
			return qfalse;
		}
		if ( !NET_CompareAdr( from, &clc.serverAddress ) ) {
			Com_Printf( "connectResponse from wrong address. Ignored.\n" );
			return qfalse;
		}

		if ( !clc.compat ) {
			// first argument: challenge response
			c = Cmd_Argv( 1 );
			if ( *c != '\0' ) {
				challenge = atoi( c );
			} else {
				Com_Printf( "Bad connectResponse received. Ignored.\n" );
				return qfalse;
			}

			if ( challenge != clc.challenge ) {
				Com_Printf( "ConnectResponse with bad challenge received. Ignored.\n" );
				return qfalse;
			}

			if ( com_protocolCompat ) {
				// enforce dm68-compatible stream for legacy/unknown servers
				clc.compat = qtrue;
			}

			// second (optional) argument: actual protocol version used on server-side
			c = Cmd_Argv( 2 );
			if ( *c != '\0' ) {
				int protocol = atoi( c );
				if ( protocol > 0 ) {
					if ( protocol <= OLD_PROTOCOL_VERSION ) {
						clc.compat = qtrue;
					} else {
						clc.compat = qfalse;
					}
				}
			}
		}

		Netchan_Setup( NS_CLIENT, &clc.netchan, from, Cvar_VariableIntegerValue( "net_qport" ), clc.challenge, clc.compat );

		cls.state = CA_CONNECTED;
		clc.lastPacketSentTime = -9999;		// send first packet immediately
		return qtrue;
	}

	// server responding to an info broadcast
	if ( !Q_stricmp(c, "infoResponse") ) {
		CL_ServerInfoPacket( from, msg );
		return qfalse;
	}

	// server responding to a get playerlist
	if ( !Q_stricmp(c, "statusResponse") ) {
		CL_ServerStatusResponse( from, msg );
		return qfalse;
	}

	// echo request from server
	if ( !Q_stricmp(c, "echo") ) {
		// NOTE: we may have to add exceptions for auth and update servers
		if ( (fromserver = NET_CompareAdr( from, &clc.serverAddress )) != qfalse || NET_CompareAdr( from, &rcon_address ) ) {
			NET_OutOfBandPrint( NS_CLIENT, from, "%s", Cmd_Argv(1) );
		}
		return fromserver;
	}

	// cd check
	if ( !Q_stricmp(c, "keyAuthorize") ) {
		// we don't use these now, so dump them on the floor
		return qfalse;
	}

	// global MOTD from id
	if ( !Q_stricmp(c, "motd") ) {
		CL_MotdPacket( from );
		return qfalse;
	}

	// print string from server
	if ( !Q_stricmp(c, "print") ) {
		// NOTE: we may have to add exceptions for auth and update servers
		if ( (fromserver = NET_CompareAdr( from, &clc.serverAddress )) != qfalse || NET_CompareAdr( from, &rcon_address ) ) {
			s = MSG_ReadString( msg );
			Q_strncpyz( clc.serverMessage, s, sizeof( clc.serverMessage ) );
			Com_Printf( "%s", s );
		}
		return fromserver;
	}

	// list of servers sent back by a master server (classic)
	if ( !Q_strncmp(c, "getserversResponse", 18) ) {
		CL_ServersResponsePacket( from, msg, qfalse );
		return qfalse;
	}

	// list of servers sent back by a master server (extended)
	if ( !Q_strncmp(c, "getserversExtResponse", 21) ) {
		CL_ServersResponsePacket( from, msg, qtrue );
		return qfalse;
	}

	Com_DPrintf( "Unknown connectionless packet command.\n" );
	return qfalse;
}


/*
=================
CL_PacketEvent

A packet has arrived from the main event loop
=================
*/
#ifdef __WASM__
Q_EXPORT
#endif
void CL_PacketEvent( const netadr_t *from, msg_t *msg ) {
	int		headerBytes;
#ifdef USE_MULTIVM_CLIENT
	cgvmi = clc.currentView;
	CM_SwitchMap(clientMaps[cgvmi]);
#endif

	if ( msg->cursize < 5 ) {
		Com_DPrintf( "%s: Runt packet\n", NET_AdrToStringwPort( from ) );
		return;
	}

	if ( *(int *)msg->data == -1 ) {
		if ( CL_ConnectionlessPacket( from, msg ) )
			clc.lastPacketTime = cls.realtime;
		return;
	}

	if ( cls.state < CA_CONNECTED ) {
		return;		// can't be a valid sequenced packet
	}

	//
	// packet from server
	//
	if ( !NET_CompareAdr( from, &clc.netchan.remoteAddress ) ) {
		if ( com_developer->integer ) {
			Com_Printf( "%s:sequenced packet without connection\n",
				NET_AdrToStringwPort( from ) );
		}
		// FIXME: send a client disconnect?
		return;
	}

	if ( !CL_Netchan_Process( &clc.netchan, msg ) ) {
		return;		// out of order, duplicated, etc
	}

	// the header is different lengths for reliable and unreliable messages
	headerBytes = msg->readcount;

	// track the last message received so it can be returned in 
	// client messages, allowing the server to detect a dropped
	// gamestate
	clc.serverMessageSequence = LittleLong( *(int32_t *)msg->data );

	clc.lastPacketTime = cls.realtime;
	CL_ParseServerMessage( msg );

	//
	// we don't know if it is ok to save a demo message until
	// after we have parsed the frame
	//
	if ( clc.demorecording && !clc.demowaiting && !clc.demoplaying ) {
		CL_WriteDemoMessage( msg, headerBytes );
	}
}


/*
==================
CL_CheckTimeout
==================
*/
static void CL_CheckTimeout( void ) {
	//
	// check timeout
	//
	if ( ( !CL_CheckPaused() || !sv_paused->integer )
		&& cls.state >= CA_CONNECTED && cls.state != CA_CINEMATIC
		&& cls.realtime - clc.lastPacketTime > cl_timeout->integer * 1000 ) {
		if ( ++cl.timeoutcount > 5 ) { // timeoutcount saves debugger
			Com_Printf( "\nServer connection timed out.\n" );
			Cvar_Set( "com_errorMessage", "Server connection timed out." );
			if ( !CL_Disconnect( qfalse, qtrue ) ) { // restart client if not done already
				CL_FlushMemory();
			}
#ifdef USE_ASYNCHRONOUS
			if(!FS_Initialized()) {
				return;
			}
#endif
			if ( uivm ) {
				VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_MAIN );
			}
			return;
		}
	} else {
		cl.timeoutcount = 0;
	}
}


/*
==================
CL_CheckPaused
Check whether client has been paused.
==================
*/
qboolean CL_CheckPaused( void )
{
	// if cl_paused->modified is set, the cvar has only been changed in
	// this frame. Keep paused in this frame to ensure the server doesn't
	// lag behind.
	if(cl_paused->integer || cl_paused->modified)
		return qtrue;
	
	return qfalse;
}


/*
==================
CL_NoDelay
==================
*/
qboolean CL_NoDelay( void )
{
#ifdef USE_MULTIVM_CLIENT
  int igs = clientGames[cgvmi];
#endif
	extern cvar_t *com_timedemo;
	if ( CL_VideoRecording() || ( com_timedemo->integer && clc.demofile != FS_INVALID_HANDLE ) )
		return qtrue;
	
	return qfalse;
}


/*
==================
CL_CheckUserinfo
==================
*/
static void CL_CheckUserinfo( void ) {

	// don't add reliable commands when not yet connected
	if ( cls.state < CA_CONNECTED )
		return;

	// don't overflow the reliable command buffer when paused
	if ( CL_CheckPaused() )
		return;

	// send a reliable userinfo update if needed
	if ( cvar_modifiedFlags & CVAR_USERINFO )
	{
		qboolean infoTruncated = qfalse;
		const char *info;

		cvar_modifiedFlags &= ~CVAR_USERINFO;

#ifdef USE_MULTIVM_CLIENT
		info = Cvar_InfoString( CVAR_USERINFO, &infoTruncated, clientGames[cgvmi] );
#else
    info = Cvar_InfoString( CVAR_USERINFO, &infoTruncated );
#endif
		if ( strlen( info ) > MAX_USERINFO_LENGTH || infoTruncated ) {
			Com_Printf( S_COLOR_YELLOW "WARNING: oversize userinfo, you might be not able to play on remote server!\n" );
		}

		CL_AddReliableCommand( va( "userinfo \"%s\"", info ), qfalse );
	}
}

#ifdef USE_LIVE_RELOAD
void CL_ChangeNotifcations( void );
#endif

#if defined(USE_LAZY_LOAD) || defined(USE_ASYNCHRONOUS)
void CL_CheckLazyUpdates( void );
extern char asyncModelName[MAX_OSPATH * 2];
extern char asyncShaderName[MAX_OSPATH * 2];
#endif

/*
==================
CL_Frame
==================
*/
extern qboolean goddamnit;

void CL_Frame( int msec, int realMsec ) {
	float fps;
	float frameDuration;

#ifdef USE_MULTIVM_CLIENT
	cgvmi = clc.currentView;
	CM_SwitchMap(clientMaps[cgvmi]);
#endif


#ifdef USE_CURL	
	if ( download.cURL ) {
		Com_DL_Perform( &download );
	}
#ifdef USE_ASYNCHRONOUS
	for(int i = 0; i < 10; i++) {
		if(cl_downloads[i].cURLM || cl_downloads[i].cURL) {
			Com_DL_Perform(&cl_downloads[i]);
		}
	}
#endif
#endif


#if defined(USE_LAZY_LOAD) || defined(USE_ASYNCHRONOUS)
	//CL_CheckLazyUpdates();
#endif
#ifdef USE_LIVE_RELOAD
	//CL_ChangeNotifcations();
#endif


	if ( !com_cl_running->integer ) {
		return;
	}

	// save the msec before checking pause
	cls.realFrametime = realMsec;
#ifdef USE_ASYNCHRONOUS
	// quake3's loading process is entirely synchronous. throughout this
	// process it will call trap_UpdateScreen to force an immediate buffer
	// swap. however, in WebGL we can't force an immediate buffer swap,
	// it only occurs once we've yielded to the event loop. due to the
	// synchronous design however, the event loop is blocked and the
	// loading screen is therefor never rendered
	//
	// to get around this, the JS VM code has a special case for trap_UpdateScreen
	// that suspends the execution of the VM after it has been invoked,
	// enabling the event loop to breath. we're checking here if it has
	// been suspended, and resuming it if so now that we've successfully
	// swapped buffers
#ifndef USE_MULTIVM_CLIENT
  if(cgvm && VM_IsSuspended(cgvm)) {
    unsigned int result = VM_Resume(cgvm);
    if (result != 0xDEADBEEF) {
    }
  }
#else
	for(int i = 0; i < MAX_NUM_VMS; i++) {
		if(!cgvmWorlds[i]) continue;
		if(VM_IsSuspended(cgvmWorlds[i])) {
			cgvmi = i;
			CM_SwitchMap(clientMaps[cgvmi]);
			unsigned int result = VM_Resume(cgvmWorlds[i]);
			if (result == 0xDEADBEEF) {
				continue;
			}
			if (cls.state == CA_LOADING) {

			}
		}
	}
	cgvmi = clc.currentView;
	CM_SwitchMap(clientMaps[cgvmi]);
#endif
#endif


#ifdef USE_CURL
	if ( clc.downloadCURLM ) {
		Com_DL_Perform(&download);
		// we can't process frames normally when in disconnected
		// download mode since the ui vm expects cls.state to be
		// CA_CONNECTED
		if ( clc.cURLDisconnected ) {
			cls.frametime = msec;
			cls.realtime += msec;
			cls.framecount++;
			SCR_UpdateScreen(qfalse);
			S_Update( realMsec );
#ifndef USE_NO_CONSOLE
			Con_RunConsole();
#endif
			return;
		}
	}
#endif

	if ( cls.cddialog ) {
		// bring up the cd error dialog if needed
		cls.cddialog = qfalse;
		VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_NEED_CD );
	} else	if ( cls.state == CA_DISCONNECTED && !( Key_GetCatcher( ) & KEYCATCH_UI )
		&& !com_sv_running->integer && uivm ) {
		// if disconnected, bring up the menu
		S_StopAllSounds();
		VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_MAIN );
	}

	// if recording an avi, lock to a fixed fps
	if ( CL_VideoRecording() && msec ) {
		// save the current screen
		if ( cls.state == CA_ACTIVE || cl_forceavidemo->integer ) {

			if ( com_timescale->value > 0.0001f )
				fps = MIN( cl_aviFrameRate->value / com_timescale->value, 1000.0f );
			else
				fps = 1000.0f;

			frameDuration = MAX( 1000.0f / fps, 1.0f ) + clc.aviVideoFrameRemainder;

			CL_TakeVideoFrame();

			msec = (int)frameDuration;
			clc.aviVideoFrameRemainder = frameDuration - msec;
		}
	}
	
	if ( cl_autoRecordDemo->integer && !clc.demoplaying ) {
		if ( cls.state == CA_ACTIVE && !clc.demorecording ) {
			// If not recording a demo, and we should be, start one
			qtime_t	now;
			const char	*nowString;
			char		*p;
			char		mapName[ MAX_QPATH ];
			char		serverName[ MAX_OSPATH ];

			Com_RealTime( &now );
			nowString = va( "%04d%02d%02d%02d%02d%02d",
					1900 + now.tm_year,
					1 + now.tm_mon,
					now.tm_mday,
					now.tm_hour,
					now.tm_min,
					now.tm_sec );

			Q_strncpyz( serverName, cls.servername, MAX_OSPATH );
			// Replace the ":" in the address as it is not a valid
			// file name character
			p = strchr( serverName, ':' );
			if( p ) {
				*p = '.';
			}

			Q_strncpyz( mapName, COM_SkipPath( cl.mapname ), sizeof( cl.mapname ) );
			COM_StripExtension(mapName, mapName, sizeof(mapName));

			Cbuf_ExecuteText( EXEC_NOW,
					va( "record %s-%s-%s", nowString, serverName, mapName ) );
		}
		else if( cls.state != CA_ACTIVE && clc.demorecording ) {
			// Recording, but not CA_ACTIVE, so stop recording
			CL_StopRecord_f( );
		}
	}

	// decide the simulation time
	cls.frametime = msec;
	cls.realtime += msec;

	if ( cl_timegraph->integer ) {
		SCR_DebugGraph( msec * 0.25f );
	}

	// see if we need to update any userinfo
	CL_CheckUserinfo();

	// if we haven't gotten a packet in a long time, drop the connection
	if ( !clc.demoplaying ) {
		CL_CheckTimeout();
	}

	// send intentions now
	CL_SendCmd();

	// resend a connection request if necessary
	CL_CheckForResend();

	// decide on the serverTime to render
#ifdef USE_MULTIVM_CLIENT
  for(int i = 0; i < MAX_NUM_VMS; i++) {
    if(!cgvmWorlds[i] || !cl.snapWorlds[i].valid) continue;
    cgvmi = i;
    CL_SetCGameTime();
  }
#else
  CL_SetCGameTime();
#endif

	// update the screen
	cls.framecount++;
	SCR_UpdateScreen(qfalse);

	// update audio
	S_Update( realMsec );

	// advance local effects for next frame
	SCR_RunCinematic();

#ifndef USE_NO_CONSOLE
	Con_RunConsole();
#endif
	
#ifdef USE_MULTIVM_CLIENT
	cgvmi = clc.currentView;
	CM_SwitchMap(clientMaps[cgvmi]);
#endif
}


//============================================================================

/*
================
CL_RefPrintf
================
*/

#ifdef USE_PRINT_CONSOLE
#undef Com_Printf
#undef Com_DPrintf
#define Com_Printf R_Printf
#define Com_DPrintf R_DPrintf
#endif

static __attribute__ ((format (printf, 2, 3))) void QDECL CL_RefPrintf( printParm_t level, const char *fmt, ... ) {
	va_list		argptr;
	char		msg[MAXPRINTMSG];
	
	va_start( argptr, fmt );
	Q_vsnprintf( msg, sizeof( msg ), fmt, argptr );
	va_end( argptr );

	switch ( level ) {
#ifndef USE_LAZY_LOAD
		default: Com_Printf( "%s", msg ); break;
#else
		default: 
			if(!com_developer->integer)
				Com_DPrintf( "%s", msg ); 
			break;
#endif
#ifndef __WASM__
		case PRINT_DEVELOPER: Com_DPrintf( "%s", msg ); break;
#endif
		case PRINT_WARNING: Com_Printf( S_COLOR_YELLOW "%s", msg ); break;
		case PRINT_ERROR: Com_Printf( S_COLOR_RED "%s", msg ); break;
	}
}

#ifdef USE_PRINT_CONSOLE
#undef Com_Printf
#undef Com_DPrintf
#define Com_Printf CL_Printf
#define Com_DPrintf CL_DPrintf
#endif


/*
============
CL_ShutdownRef
============
*/
static void CL_ShutdownRef( refShutdownCode_t code ) {

#ifdef USE_RENDERER_DLOPEN
	if ( cl_renderer->modified ) {
		code = REF_UNLOAD_DLL;
	}
#endif

	if ( code >= REF_DESTROY_WINDOW ) { // +REF_UNLOAD_DLL
		// shutdown sound system before renderer
		// because it may depend from window handle
		S_Shutdown();
	}

	SCR_Done();

	if ( re.Shutdown ) {
		re.Shutdown( code );
	}

#ifdef USE_RENDERER_DLOPEN
	if ( rendererLib ) {
		Sys_UnloadLibrary( rendererLib );
		rendererLib = NULL;
	}
#endif

	Com_Memset( &re, 0, sizeof( re ) );

	cls.rendererStarted = qfalse;
}


/*
============
CL_InitRenderer
============
*/
static void CL_InitRenderer( void ) {
#ifdef USE_PRINT_CONSOLE
  Com_PrintFlags(PC_INIT);
#endif
#ifdef USE_MULTIVM_CLIENT
	clc.currentView = clientGames[0] = worldMaps[0] = 0;
  clientScreens[0][0] = 
	clientScreens[0][1] = 0;
	clientScreens[0][2] = 
	clientScreens[0][3] = 1;
#ifdef USE_LAZY_MEMORY
	re.SwitchWorld(-1);
#endif
#endif

	// this sets up the renderer and calls R_Init
	re.BeginRegistration( &cls.glconfig );
#ifdef USE_PRINT_CONSOLE
  Com_PrintClear();
#endif

	// load character sets
	cls.charSetShader = re.RegisterShader( "gfx/2d/bigchars" );
	cls.whiteShader = re.RegisterShader( "white" );
  cls.lagometerShader = re.RegisterShader( "lagometer" );
#ifndef USE_NO_CONSOLE
	cls.consoleShader = re.RegisterShader( "console" );

	Con_CheckResize();

	g_console_field_width = ((cls.glconfig.vidWidth / smallchar_width)) - 2;
	g_consoleField.widthInChars = g_console_field_width;
#endif

	// for 640x480 virtualized screen
	cls.biasY = 0;
	cls.biasX = 0;
	if ( cls.glconfig.vidWidth * 480 > cls.glconfig.vidHeight * 640 ) {
		// wide screen, scale by height
		cls.scale = cls.glconfig.vidHeight * (1.0/480.0);
		cls.biasX = 0.5 * ( cls.glconfig.vidWidth - ( cls.glconfig.vidHeight * (640.0/480.0) ) );
	} else {
		// no wide screen, scale by width
		cls.scale = cls.glconfig.vidWidth * (1.0/640.0);
		cls.biasY = 0.5 * ( cls.glconfig.vidHeight - ( cls.glconfig.vidWidth * (480.0/640) ) );
	}

	SCR_Init();
}


/*
============================
CL_StartHunkUsers

After the server has cleared the hunk, these will need to be restarted
This is the only place that any of these functions are called from
============================
*/
void CL_StartHunkUsers( void ) {
#ifdef USE_ASYNCHRONOUS
	qboolean firstStart = qfalse;
#endif


	if (!com_cl_running) {
Com_Printf("skipping\n");
		return;
	}

	if ( !com_cl_running || !com_cl_running->integer ) {
Com_Printf( "skipping\n");
		return;
	}

#ifndef USE_ASYNCHRONOUS
#ifdef _DEBUG
#ifndef __WASM__
  void *syms[20];
  const size_t size = backtrace( syms, ARRAY_LEN( syms ) );
  backtrace_symbols_fd( syms, size, STDERR_FILENO );
#else
	DebugTrace();
#endif
#endif
#endif

	// fixup renderer -EC-
	if ( !re.BeginRegistration ) {
		CL_InitRef();
	}

	if ( !cls.rendererStarted ) {
		cls.rendererStarted = qtrue;
		CL_InitRenderer();
    Cvar_SetRendererDescriptions();
	}

	if ( !cls.soundStarted ) {
		cls.soundStarted = qtrue;
		S_Init();
	}

	if ( !cls.soundRegistered ) {
		cls.soundRegistered = qtrue;
		S_BeginRegistration();
	}

	if ( !cls.uiStarted
#ifndef BUILD_GAME_STATIC
    && !Cvar_VariableIntegerValue("com_skipLoadUI")
#endif
#ifdef USE_ASYNCHRONOUS
		&& FS_Initialized()
#endif
  ) {
		Sys_SetStatus("Loading UI...");
		cls.uiStarted = qtrue;
		CL_InitUI(qfalse);
#ifdef USE_ASYNCHRONOUS
		if(uivm && cls.uiStarted) {
			firstStart = qtrue;
		}
#endif
	}

#ifdef USE_ASYNCHRONOUS
	if ( ( cls.state > CA_CONNECTED && cls.state != CA_CINEMATIC ) && !cls.cgameStarted ) {
		cls.cgameStarted = qtrue;
		CL_InitCGame(-1);
		CL_SendPureChecksums();
		if(cgvm && cls.cgameStarted) {
			firstStart = qtrue;
		}
	}

	// init with console down like Quake 1!
	if(!uivm && !cls.uiStarted && !Cvar_VariableIntegerValue("com_skipLoadUI") && cls.state == CA_DISCONNECTED) {
		Key_SetCatcher( Key_GetCatcher( ) | KEYCATCH_CONSOLE );
		// not connecting?
		Com_Printf( S_COLOR_RED "WARNING: Using asynchronous build without an early \\connect <address> command.\n");
	} else if (firstStart && (Key_GetCatcher( ) & KEYCATCH_CONSOLE)) {
		// close console if UI just started
		Con_Close();
		if(cgvm) {
			Key_SetCatcher( Key_GetCatcher( ) | KEYCATCH_CGAME );
		} else {
			Key_SetCatcher( Key_GetCatcher( ) | KEYCATCH_UI );
		}
	}
#endif

}


/*
============
CL_RefMalloc
============
*/
static void *CL_RefMalloc( int size ) {
	return Z_TagMalloc( size, TAG_RENDERER );
}


/*
============
CL_RefFreeAll
============
*/
static void CL_RefFreeAll( void ) {
	Z_FreeTags( TAG_RENDERER );
}


/*
============
CL_ScaledMilliseconds
============
*/
int CL_ScaledMilliseconds( void ) {
	return Sys_Milliseconds()*com_timescale->value;
}


/*
============
CL_IsMinimized
============
*/
static qboolean CL_IsMininized( void ) {
	return gw_minimized;
}


/*
============
CL_SetScaling

Sets console chars height
============
*/
static void CL_SetScaling( float factor, int captureWidth, int captureHeight ) {

	if ( cls.con_factor != factor ) {
		// rescale console
		con_scale->modified = qtrue;
	}

	cls.con_factor = factor;

	// set custom capture resolution
	cls.captureWidth = captureWidth;
	cls.captureHeight = captureHeight;
}


#if defined(USE_MULTIVM_CLIENT) || defined(USE_MULTIVM_SERVER)
byte	*CL_CM_ClusterPVS (int cluster, int cmi)
{
	return CM_ClusterPVS(cluster, clientMaps[cgvmi]);
}
void	CL_CM_Trace( trace_t *results, const vec3_t start, const vec3_t mins, const vec3_t maxs, const vec3_t end, int passEntityNum, int contentmask, int cmi ) {
	int prev = CM_SwitchMap(cmi);
	CM_BoxTrace(results, start, end, mins, maxs, 0, contentmask, qfalse);
	CM_SwitchMap(prev);
}
#else
byte	*CL_CM_ClusterPVS (int cluster) {
	return CM_ClusterPVS(cluster);
}
void	CL_CM_Trace( trace_t *results, const vec3_t start, const vec3_t mins, const vec3_t maxs, const vec3_t end, int passEntityNum, int contentmask ) {
	CM_BoxTrace(results, start, end, mins, maxs, 0, contentmask, qfalse);
}
#endif


/*
============
CL_InitRef
============
*/
static void CL_InitRef( void ) {
	refimport_t	rimp;
	refexport_t	*ret;
#ifdef USE_RENDERER_DLOPEN
	GetRefAPI_t		GetRefAPI;
	char			dllName[ MAX_OSPATH ];
#endif
#ifdef USE_PRINT_CONSOLE
  Com_PrintFlags(PC_INIT);
#endif

	CL_InitGLimp_Cvars();

#ifdef USE_RENDERER_DLOPEN
  Com_DPrintf( "----- Initializing Renderer (%s) ----\n", cl_renderer->string );
#else
	Com_DPrintf( "----- Initializing Renderer ----\n" );
#endif

#ifdef USE_RENDERER_DLOPEN
#ifdef __WASM__
#error not ready for this
#endif

#if defined (__linux__) && defined(__i386__)
#define REND_ARCH_STRING "x86"
#else
#define REND_ARCH_STRING ARCH_STRING
#endif

// TODO: make this a fancy list of renderers we recognize
	Com_sprintf( dllName, sizeof( dllName ), XSTRING(RENDERER_PREFIX) "_%s_" REND_ARCH_STRING DLL_EXT, cl_renderer->string );
	rendererLib = FS_LoadLibrary( dllName );
	if ( !rendererLib )
	{
		Cvar_ForceReset( "cl_renderer" );
		Com_sprintf( dllName, sizeof( dllName ), XSTRING(RENDERER_PREFIX) "_%s_" REND_ARCH_STRING DLL_EXT, cl_renderer->string );
		rendererLib = FS_LoadLibrary( dllName );
		if ( !rendererLib )
		{
			// WASM not USE_ASYNCHRONOUS because we don't have permittion to execute a DLL outside of
			//   the initial working directory and fs_basepath (fs_homepath is restricted in that way)
#ifndef __WASM__
			Com_Error( ERR_FATAL, "Failed to load renderer %s", dllName );
#else
			// just keep running frame and do nothing if it hasn't arrived yet
			return;
#endif
		}
	}

	GetRefAPI = Sys_LoadFunction( rendererLib, "GetRefAPI" );
	if( !GetRefAPI )
	{
		Com_Error( ERR_FATAL, "Can't load symbol GetRefAPI" );
		return;
	}

	cl_renderer->modified = qfalse;
#endif

	Com_Memset( &rimp, 0, sizeof( rimp ) );

	rimp.Cmd_AddCommand = Cmd_AddCommand;
	rimp.Cmd_RemoveCommand = Cmd_RemoveCommand;
	rimp.Cmd_SetDescription = Cmd_SetDescription;
	rimp.Cmd_Argc = Cmd_Argc;
	rimp.Cmd_Argv = Cmd_Argv;
	rimp.Cmd_ExecuteText = Cbuf_ExecuteText;
	rimp.Printf = CL_RefPrintf;
	rimp.Error = Com_Error;
	rimp.Milliseconds = CL_ScaledMilliseconds;
#ifndef __WASM__
	rimp.Microseconds = Sys_Microseconds;
#endif
	rimp.Malloc = CL_RefMalloc;
	rimp.FreeAll = CL_RefFreeAll;
	rimp.Free = Z_Free;
#ifdef HUNK_DEBUG
	rimp.Hunk_AllocDebug = Hunk_AllocDebug;
#else
	rimp.Hunk_Alloc = Hunk_Alloc;
#endif
	rimp.Hunk_AllocateTempMemory = Hunk_AllocateTempMemory;
	rimp.Hunk_FreeTempMemory = Hunk_FreeTempMemory;
	
	rimp.CM_ClusterPVS = CL_CM_ClusterPVS;
	rimp.CM_DrawDebugSurface = CM_DrawDebugSurface;

	rimp.FS_ReadFile = FS_ReadFile;
	rimp.FS_FreeFile = FS_FreeFile;
	rimp.FS_WriteFile = FS_WriteFile;
	rimp.FS_FreeFileList = FS_FreeFileList;
	rimp.FS_ListFiles = FS_ListFiles;
	//rimp.FS_FileIsInPAK = FS_FileIsInPAK;
	rimp.FS_FileExists = FS_FileExists;

	rimp.Cvar_Get = Cvar_Get;
	rimp.Cvar_Set = Cvar_Set;
	rimp.Cvar_SetValue = Cvar_SetValue;
	rimp.Cvar_CheckRange = Cvar_CheckRange;
	rimp.Cvar_SetDescription = Cvar_SetDescription;
	rimp.Cvar_VariableStringBuffer = Cvar_VariableStringBuffer;
	rimp.Cvar_VariableString = Cvar_VariableString;
	rimp.Cvar_VariableIntegerValue = Cvar_VariableIntegerValue;

	rimp.Cvar_SetGroup = Cvar_SetGroup;
	rimp.Cvar_CheckGroup = Cvar_CheckGroup;
	rimp.Cvar_ResetGroup = Cvar_ResetGroup;

	// cinematic stuff

	rimp.CIN_UploadCinematic = CIN_UploadCinematic;
	rimp.CIN_PlayCinematic = CIN_PlayCinematic;
	rimp.CIN_RunCinematic = CIN_RunCinematic_Fake;

	rimp.CL_WriteAVIVideoFrame = CL_WriteAVIVideoFrame;
#ifndef __WASM__
	rimp.CL_SaveJPGToBuffer = CL_SaveJPGToBuffer;
	rimp.CL_SaveJPG = CL_SaveJPG;
	rimp.CL_LoadJPG = CL_LoadJPG;
#endif

	rimp.CL_IsMinimized = CL_IsMininized;
	rimp.CL_SetScaling = CL_SetScaling;

	rimp.Sys_SetClipboardBitmap = Sys_SetClipboardBitmap;
	rimp.Sys_LowPhysicalMemory = Sys_LowPhysicalMemory;
	rimp.Com_RealTime = Com_RealTime;

	// OpenGL API
	rimp.GLimp_Init = GLimp_Init;
	rimp.GLimp_Shutdown = GLimp_Shutdown;
	rimp.GL_GetProcAddress = GL_GetProcAddress;

	rimp.GLimp_EndFrame = GLimp_EndFrame;
	rimp.GLimp_InitGamma = GLimp_InitGamma;
	rimp.GLimp_SetGamma = GLimp_SetGamma;

	// Vulkan API
#ifdef USE_VULKAN_API
#ifdef __WASM__
#error goddamnit
#endif
	rimp.VKimp_Init = VKimp_Init;
	rimp.VKimp_Shutdown = VKimp_Shutdown;
	rimp.VK_GetInstanceProcAddr = VK_GetInstanceProcAddr;
	rimp.VK_CreateSurface = VK_CreateSurface;
#endif

	rimp.Trace = CL_CM_Trace;

#ifdef USE_MULTIVM_CLIENT
	rimp.worldMaps = &worldMaps[0];
#endif
#ifdef USE_LAZY_LOAD
	rimp.FS_FOpenFileRead = FS_FOpenFileRead;
	rimp.asyncModelName = &asyncModelName[0];
	rimp.asyncShaderName = &asyncShaderName[0];
#endif
#ifdef USE_CURSOR_SPY
	rimp.Spy_CursorPosition = Spy_CursorPosition;
	rimp.Spy_InputText = Spy_InputText;
	rimp.Spy_Banner = Spy_Banner;
#endif

	ret = GetRefAPI( REF_API_VERSION, &rimp );

	Com_Printf( "-------------------------------\n");

	if ( !ret ) {
		Com_Error (ERR_FATAL, "Couldn't initialize refresh" );
	}

	re = *ret;
#ifdef USE_PRINT_CONSOLE
  Com_PrintClear();
#endif

	// unpause so the cgame definitely gets a snapshot and renders a frame
	Cvar_Set( "cl_paused", "0" );
}


//===========================================================================================


static void CL_SetModel_f( void ) {
	const char *arg;
	char name[ MAX_CVAR_VALUE_STRING ];

	arg = Cmd_Argv( 1 );
	if ( arg[0] ) {
		Cvar_Set( "model", arg );
		Cvar_Set( "headmodel", arg );
	} else {
		Cvar_VariableStringBuffer( "model", name, sizeof( name ) );
		Com_Printf( "model is set to %s\n", name );
	}
}


//===========================================================================================


/*
===============
CL_Video_f

video
video [filename]
===============
*/
static void CL_Video_f( void )
{
	char filename[ MAX_OSPATH ];
	const char *ext;
	qboolean pipe;
	int i;

	if( !clc.demoplaying )
	{
		Com_Printf( "The %s command can only be used when playing back demos\n", Cmd_Argv( 0 ) );
		return;
	}

	pipe = ( Q_stricmp( Cmd_Argv( 0 ), "video-pipe" ) == 0 );

	if ( pipe )
		ext = "mp4";
	else
		ext = "avi";

	if( Cmd_Argc() == 2 )
	{
		// explicit filename
		Com_sprintf( filename, sizeof( filename ), "videos/%s", Cmd_Argv( 1 ) );

		// override video file extension
		if ( pipe )
		{
			char *sep = strrchr( filename, '/' ); // last path separator
			char *e = strrchr( filename, '.' );

			if ( e && e > sep && *(e+1) != '\0' ) {
				ext = e + 1;
				*e = '\0';
			}
		}
	}
	else
	{
		 // scan for a free filename
		for( i = 0; i <= 9999; i++ )
		{
			Com_sprintf( filename, sizeof( filename ), "videos/video%04d.%s", i, ext );
			if ( !FS_FileExists( filename ) )
				break; // file doesn't exist
		}

		if( i > 9999 )
		{
			Com_Printf( S_COLOR_RED "ERROR: no free file names to create video\n" );
			return;
		}

		// without extension
		Com_sprintf( filename, sizeof( filename ), "videos/video%04d", i );
	}


	clc.aviSoundFrameRemainder = 0.0f;
	clc.aviVideoFrameRemainder = 0.0f;

	Q_strncpyz( clc.videoName, filename, sizeof( clc.videoName ) );
	clc.videoIndex = 0;

	CL_OpenAVIForWriting( va( "%s.%s", clc.videoName, ext ), pipe );
}


/*
===============
CL_StopVideo_f
===============
*/
static void CL_StopVideo_f( void )
{
  CL_CloseAVI();
}


/*
====================
CL_CompleteRecordName
====================
*/
static void CL_CompleteVideoName( char *args, int argNum )
{
	if( argNum == 2 )
	{
		Field_CompleteFilename( "videos", ".avi", qtrue, FS_MATCH_EXTERN | FS_MATCH_STICK );
	}
}


/*
===============
CL_GenerateQKey

test to see if a valid QKEY_FILE exists.  If one does not, try to generate
it by filling it with 2048 bytes of random data.
===============
*/
#ifdef USE_Q3KEY
static void CL_GenerateQKey(void)
{
	int len = 0;
	unsigned char buff[ QKEY_SIZE ];
	fileHandle_t f;

	len = FS_SV_FOpenFileRead( QKEY_FILE, &f );
	FS_FCloseFile( f );
	if( len == QKEY_SIZE ) {
		Com_Printf( "QKEY found.\n" );
		return;
	}
	else {
		if( len > 0 ) {
			Com_Printf( "QKEY file size != %d, regenerating\n",
				QKEY_SIZE );
		}

		Com_Printf( "QKEY building random string\n" );
		Com_RandomBytes( buff, sizeof(buff) );

		f = FS_SV_FOpenFileWrite( QKEY_FILE );
		if( !f ) {
			Com_Printf( "QKEY could not open %s for write\n",
				QKEY_FILE );
			return;
		}
		FS_Write( buff, sizeof(buff), f );
		FS_FCloseFile( f );
		Com_Printf( "QKEY generated\n" );
	}
} 
#endif


/*
** CL_GetModeInfo
*/
typedef struct vidmode_s
{
	const char	*description;
	int			width, height;
	float		pixelAspect;		// pixel width / height
} vidmode_t;

static const vidmode_t cl_vidModes[] =
{
	{ "Mode  0: 320x240",			320,	240,	1 },
	{ "Mode  1: 400x300",			400,	300,	1 },
	{ "Mode  2: 512x384",			512,	384,	1 },
	{ "Mode  3: 640x480",			640,	480,	1 },
	{ "Mode  4: 800x600",			800,	600,	1 },
	{ "Mode  5: 960x720",			960,	720,	1 },
	{ "Mode  6: 1024x768",			1024,	768,	1 },
	{ "Mode  7: 1152x864",			1152,	864,	1 },
	{ "Mode  8: 1280x1024 (5:4)",	1280,	1024,	1 },
	{ "Mode  9: 1600x1200",			1600,	1200,	1 },
	{ "Mode 10: 2048x1536",			2048,	1536,	1 },
	{ "Mode 11: 856x480 (wide)",	856,	480,	1 },
	// extra modes:
	{ "Mode 12: 1280x960",			1280,	960,	1 },
	{ "Mode 13: 1280x720",			1280,	720,	1 },
	{ "Mode 14: 1280x800 (16:10)",	1280,	800,	1 },
	{ "Mode 15: 1366x768",			1366,	768,	1 },
	{ "Mode 16: 1440x900 (16:10)",	1440,	900,	1 },
	{ "Mode 17: 1600x900",			1600,	900,	1 },
	{ "Mode 18: 1680x1050 (16:10)",	1680,	1050,	1 },
	{ "Mode 19: 1920x1080",			1920,	1080,	1 },
	{ "Mode 20: 1920x1200 (16:10)",	1920,	1200,	1 },
	{ "Mode 21: 2560x1080 (21:9)",	2560,	1080,	1 },
	{ "Mode 22: 3440x1440 (21:9)",	3440,	1440,	1 },
	{ "Mode 23: 3840x2160",			3840,	2160,	1 },
	{ "Mode 24: 4096x2160 (4K)",	4096,	2160,	1 }
};
static const int s_numVidModes = ARRAY_LEN( cl_vidModes );

#ifdef __WASM__
Q_EXPORT
#endif
qboolean CL_GetModeInfo( int *width, int *height, float *windowAspect, int mode, const char *modeFS, int dw, int dh, qboolean fullscreen )
{
	const	vidmode_t *vm;
	float	pixelAspect;

	// set dedicated fullscreen mode
	if ( fullscreen && *modeFS )
		mode = atoi( modeFS );

	if ( mode < -2 )
		return qfalse;

	if ( mode >= s_numVidModes )
		return qfalse;

	// fix unknown desktop resolution
	if ( mode == -2 && (dw == 0 || dh == 0) )
		mode = 3;

	if ( mode == -2 ) { // desktop resolution
		*width = dw;
		*height = dh;
		pixelAspect = r_customPixelAspect->value;
	} else if ( mode == -1 ) { // custom resolution
		*width = r_customwidth->integer;
		*height = r_customheight->integer;
		pixelAspect = r_customPixelAspect->value;
	} else { // predefined resolution
		vm = &cl_vidModes[ mode ];
		*width  = vm->width;
		*height = vm->height;
		pixelAspect = vm->pixelAspect;
	}

	*windowAspect = (float)*width / ( *height * pixelAspect );

	return qtrue;
}


/*
** CL_ModeList_f
*/
static void CL_ModeList_f( void )
{
	int i;

	Com_Printf( "\n" );
	for ( i = 0; i < s_numVidModes; i++ )
	{
		Com_Printf( "%s\n", cl_vidModes[ i ].description );
	}
	Com_Printf( "\n" );
}


#ifdef USE_RENDERER_DLOPEN
static qboolean isValidRenderer( const char *s ) {
	while ( *s ) {
		if ( !((*s >= 'a' && *s <= 'z') || (*s >= 'A' && *s <= 'Z') || (*s >= '1' && *s <= '9')) )
			return qfalse;
		++s;
	}
	return qtrue;
}
#endif


static void CL_InitGLimp_Cvars( void )
{
	// shared with GLimp
	r_allowSoftwareGL = Cvar_Get( "r_allowSoftwareGL", "0", CVAR_LATCH );
	r_swapInterval = Cvar_Get( "r_swapInterval", "0", CVAR_ARCHIVE_ND );
	r_glDriver = Cvar_Get( "r_glDriver", OPENGL_DRIVER_NAME, CVAR_ARCHIVE_ND | CVAR_LATCH );
	
	r_displayRefresh = Cvar_Get( "r_displayRefresh", "0", CVAR_LATCH );
	Cvar_CheckRange( r_displayRefresh, "0", "500", CV_INTEGER );
	Cvar_SetDescription( r_displayRefresh, "Override monitor refresh rate in fullscreen mode:\n  0 - use current monitor refresh rate\n >0 - use custom refresh rate" );

	vid_xpos = Cvar_Get( "vid_xpos", "3", CVAR_ARCHIVE );
	vid_ypos = Cvar_Get( "vid_ypos", "22", CVAR_ARCHIVE );
	Cvar_CheckRange( vid_xpos, NULL, NULL, CV_INTEGER );
	Cvar_CheckRange( vid_ypos, NULL, NULL, CV_INTEGER );

	r_noborder = Cvar_Get( "r_noborder", "0", CVAR_ARCHIVE_ND | CVAR_LATCH );
	Cvar_CheckRange( r_noborder, "0", "1", CV_INTEGER );

	r_mode = Cvar_Get( "r_mode", "-2", CVAR_ARCHIVE | CVAR_LATCH );
	r_modeFullscreen = Cvar_Get( "r_modeFullscreen", "-2", CVAR_ARCHIVE | CVAR_LATCH );
	Cvar_CheckRange( r_mode, "-2", va( "%i", s_numVidModes-1 ), CV_INTEGER );
	Cvar_SetDescription( r_mode, "Set video mode:\n -2 - use current desktop resolution\n -1 - use \\r_customWidth and \\r_customHeight\n  0..N - enter \\modelist for details" );
	Cvar_SetDescription( r_modeFullscreen, "Dedicated fullscreen mode, set to \"\" to use \\r_mode in all cases" );

	r_fullscreen = Cvar_Get( "r_fullscreen", "1", CVAR_ARCHIVE | CVAR_LATCH );
	r_customPixelAspect = Cvar_Get( "r_customPixelAspect", "1", CVAR_ARCHIVE_ND | CVAR_LATCH );
	r_customwidth = Cvar_Get( "r_customWidth", "1600", CVAR_ARCHIVE | CVAR_LATCH );
	r_customheight = Cvar_Get( "r_customHeight", "1024", CVAR_ARCHIVE | CVAR_LATCH );
	Cvar_CheckRange( r_customwidth, "4", NULL, CV_INTEGER );
	Cvar_CheckRange( r_customheight, "4", NULL, CV_INTEGER );
	Cvar_SetDescription( r_customwidth, "Custom width to use with \\r_mode -1" );
	Cvar_SetDescription( r_customheight, "Custom height to use with \\r_mode -1" );

	r_colorbits = Cvar_Get( "r_colorbits", "0", CVAR_ARCHIVE_ND | CVAR_LATCH );
	Cvar_CheckRange( r_colorbits, "0", "32", CV_INTEGER );

	// shared with renderer:
	cl_stencilbits = Cvar_Get( "r_stencilbits", "8", CVAR_ARCHIVE_ND | CVAR_LATCH );
	Cvar_CheckRange( cl_stencilbits, "0", "8", CV_INTEGER );
	cl_depthbits = Cvar_Get( "r_depthbits", "0", CVAR_ARCHIVE_ND | CVAR_LATCH );
	Cvar_CheckRange( cl_depthbits, "0", "32", CV_INTEGER );

	cl_drawBuffer = Cvar_Get( "r_drawBuffer", "GL_BACK", CVAR_CHEAT );

#ifdef USE_RENDERER_DLOPEN
	cl_renderer = Cvar_Get( "cl_renderer", "opengl2", CVAR_ARCHIVE | CVAR_LATCH );
	if ( !isValidRenderer( cl_renderer->string ) ) {
		Cvar_ForceReset( "cl_renderer" );
	}
#endif
}


#ifdef USE_MULTIVM_CLIENT
void CL_LoadVM_f( void ) {
	char *name;
	
	if ( Cmd_Argc() < 2 ) {
		Com_Printf( "Usage: %s <game|cgame|ui|demo> [mapname]\n", Cmd_Argv( 0 ) );
		return;
	}

	name = Cmd_Argv( 1 );

	if ( !Q_stricmp( name, "game" ) ) {
		CL_AddReliableCommand( va("load %s", Cmd_ArgsFrom(1)), qfalse );
		//CL_ForwardCommandToServer("load game");
		return;


	} else if ( !Q_stricmp( name, "cgame" )
    || !Q_stricmp( name, "demo" )) {
		if(Cmd_Argc() > 3) {
			Com_Printf( "Usage: %s <game|cgame|ui|demo> [numclient]\n", Cmd_Argv( 0 ) );
			return;
		}

		int i, count = 0;
		for(i = 0; i < MAX_NUM_VMS; i++) {
			if(cgvmWorlds[i]) count++;
			else {
				cgvmi = i;
				break;
			}
		}
		count++;
    if(!Q_stricmp( name, "demo" )) {
      CL_PlayDemo_f();
    } else {
			clientGames[cgvmi] = clientGames[clc.currentView];
			clientWorlds[cgvmi] = clientWorlds[clc.currentView];
		  CL_InitCGame(cgvmi); // createNew if cgvmWorlds[cgvmi] is already taken
		}
		return;
	} else if ( !Q_stricmp( name, "ui" ) ) {
		int i, count = 0;
		for(i = 0; i < MAX_NUM_VMS; i++) {
			if(uivmWorlds[i]) count++;
			else {
				uivmi = i; // this looks like it isn't used until compiler templates run
                   //   and everything past this point uses it like uivms[uivmi]
				break;
			}
		}
		count++;
		CL_InitUI(qtrue);
		uivmi = 0;
		return;
  } else if (FS_SV_FOpenFileRead(va("maps/%s.bsp", name), NULL)) {
    int i, count = 0;
    for(i = 0; i < MAX_NUM_VMS; i++) {
			if(clientWorlds[i] > -1) count++;
      else {
        clientWorlds[i] = count;
        clientMaps[i] = count;
        worldMaps[i] = re.LoadWorld( va("maps/%s.bsp", name) );
        Com_Printf("World loaded on %i\n", i);
        break;
      }
    }
    return;
  } else {
		Com_Printf( " unknown VM name '%s'\n", name );
		return;
	}
	//Cbuf_AddText("vid_restart fast\n");
}

void CL_Tele_f ( void ) {
	if ( Cmd_Argc() > 4 || Cmd_Argc() == 2 ) {
		Com_Printf ("Usage: tele [xcoord zcoord ycoord]\n");
		return;
	}

	CL_AddReliableCommand( va("tele %s", Cmd_ArgsFrom(1)), qfalse );
}

void CL_Game_f ( void ) {
	if ( Cmd_Argc() > 3 ) {
		Com_Printf ("Usage: game [0/1/2 moveorigin] [num] (<client>)\n");
		return;
	}
	char *i = Cmd_Argv(2);
	if(i[0] != '\0') {
		clc.currentView = atoi(i);
	} else {
		clc.currentView = clientGames[clc.currentView] + 1;
	}
	if(clc.currentView < 0 || clc.currentView >= MAX_NUM_VMS) {
		clc.currentView = 0;
	}
	if(Cmd_Argc() < 2) {
		CL_AddReliableCommand( va("game 0 %i %i", clc.currentView, clc.clientNum), qfalse );
	} else {
		CL_AddReliableCommand( va("game %i %i %i", atoi(Cmd_Argv(1)), clc.currentView, clc.clientNum), qfalse );
	}
}

void CL_World_f( void ) {
	int i;
	char world[10];
	const char *w;
	int clworld, clgame;
	qboolean found = qfalse;
	int empty = -1;
	if ( Cmd_Argc() > 3 ) {
		Com_Printf ("Usage: world [numworld]\n");
		return;
	}
	Q_strncpyz(world, Cmd_Argv(1), sizeof(world));
	Com_Printf( "Client switching world: %s\n", world );
	// TODO: this format will be used by the server to send camera commands
	//   so splines can be generated on the server basically by "following"
	if((w = Q_stristr(world, ":"))) {
		world[w - world] = '\0';
		clgame = atoi(world);
		clworld = atoi(w + 1);
	} else {
		clgame = atoi(world);
		clworld = clc.clientNum;
	}

	// check if a client game with this address already exists
	for(i = 0; i < MAX_NUM_VMS; i++) {
		if (!cgvmWorlds[i]) {
			// open slot
			if(empty == -1) // first only
				empty = i;
		} else {
			// slot is taken
			if(clientGames[i] == clgame) {
				Com_Printf("World found: %i -> %i:%i\n", i, clientGames[i], clientWorlds[i]);
				// if it a game exists and is unused it can switch clients
				if(clientWorlds[i] == clworld
          || clientWorlds[i] == -1) {
					found = qtrue;
					clc.currentView = i;
					break;
				}
			}
		}
	}
	if(!found) {
		Com_Printf("World not found, creating new game.\n");
		if(empty == -1) {
			Com_Error(ERR_DROP, "Too many worlds: \n");
			return;
		}
		// use the empty slot and start a VM
		i = clc.currentView = empty;
		clientGames[clc.currentView] = clgame;
		clientWorlds[clc.currentView] = clworld;
		CL_InitCGame(i);
	}
	serverWorld = qtrue;
	Cbuf_ExecuteText(EXEC_APPEND, va("tile -1 -1 -1\n"));
	Cbuf_ExecuteText(EXEC_APPEND, va("tile 0 0 %i\n", i));
	Cbuf_Execute();
	serverWorld = qfalse;
}

void CL_Tile_f( void ) {
	int clientNum, i, x, y, xMaxVMs, yMaxVMs, count = 0;
	if(Cmd_Argc() == 1 || Cmd_Argc() > 4 || (clc.sv_mvWorld && !serverWorld)) {
		if(Cmd_Argc() == 1) {
			for(int i = 0; i < MAX_NUM_VMS; i++) {
				if(clientScreens[i][0] > -1) {
					Com_Printf( "[VM:%i] Game: %i:%i, %fx%f (%fx%f)\n", 
						i, clientGames[i], clientWorlds[i], 
						clientScreens[i][0], clientScreens[i][1],
					 	clientScreens[i][2], clientScreens[i][3]);
				}
			}
		} else if (clc.sv_mvWorld && !serverWorld) {
			Com_Printf("In server world mode, no tiling.\n");
			return; // silently disable on this server, world messages are sent
		}
		Com_Printf ("Usage: tile [x y] [clientnum]\n");
		return;
	}
	for(i = 0; i < MAX_NUM_VMS; i++) {
		if(!cgvmWorlds[i]) continue;
		if(clientScreens[i][0] > -1) count++;
	}
	if(Cmd_Argc() == 3 || Cmd_Argc() == 4) {
		if(Cmd_Argc() == 4) {
			char world[16];
			strcpy(world, Cmd_Argv(3));
			if(world[1] == ':') {
				world[1] = '\0';
				clientNum = atoi(world);
				if(clientGames[clientNum] != -1) {
					// switch the screen on the world view for this specific client
					clientWorlds[clientNum] = atoi(&world[2]);
				}
			} else {
				clientNum = atoi(world);
			}
		} else
			clientNum = clc.currentView;
		x = atoi(Cmd_Argv(1));
		y = atoi(Cmd_Argv(2));
		// if it was disabled, now it won't be
		if (clientNum >= 0 && clientScreens[clientNum][0] == -1
			&& x > -1 && y > -1) count++;
			else if (x < 0 || y < 0) count--;
	} else {
		clientNum = atoi(Cmd_Argv(1));
		// if it was disabled, now it won't be
		if (clientNum >= 0 && clientScreens[clientNum][0] == -1) count++;
	}

	if(clientNum > MAX_NUM_VMS || clientNum < -1) {
		Com_Printf("Must be between 0 and %i, given: %i\n", MAX_NUM_VMS, clientNum);
		return;
	} else if(clientNum >= 0 && !cgvmWorlds[clientNum] 
    && clientWorlds[clientNum] == -1) {
		Com_Printf("CGame not active on %i\n", clientNum);
		return;
	} else if(clientNum == -1) {
		// display all in a grid
		if(Cmd_Argc() == 2) {
			count = 0;
			for(i = 0; i < MAX_NUM_VMS; i++) {
				if(!cgvmWorlds[i]) continue;
				count++;
			}
		} else {
			// hide all screens
			count = 0;
		}
	}

	xMaxVMs = ceil(sqrt(count));
	yMaxVMs = round(sqrt(count));
	if(Cmd_Argc() < 4) {
		x = xMaxVMs - 1;
		y = yMaxVMs - 1;
	}
	if(x > xMaxVMs) x = xMaxVMs - 1;
	if(y > yMaxVMs) y = yMaxVMs - 1;
	int s = clientNum == -1 ? 0 : clientNum;
	int e = clientNum == -1 ? MAX_NUM_VMS : clientNum + 1;
	for(; s < (e > MAX_NUM_VMS ? MAX_NUM_VMS : e); s++) {
		if(clientNum == -1 && Cmd_Argc() == 2) {
			x = s % xMaxVMs;
			y = s / xMaxVMs;
		}
		if(x < 0 || y < 0 || (clientNum == -1 && !cgvmWorlds[s])) {
	    Com_DPrintf("Tiling subtracting: %i x %i "
        "(client: %i, total: %i)\n", x, y, s, count);
			clientScreens[s][0] = 
			clientScreens[s][1] = 
			clientScreens[s][2] = 
			clientScreens[s][3] = -1;
		} else {
	    Com_DPrintf("Tiling adding: %i x %i "
        "(client: %i, total: %i)\n", x, y, s, count);
			clientScreens[s][0] = (1.0f * (x % xMaxVMs)) / xMaxVMs;
			clientScreens[s][1] = (1.0f * (y % yMaxVMs)) / yMaxVMs;
			clientScreens[s][2] = 1.0f / xMaxVMs;
			clientScreens[s][3] = 1.0f / yMaxVMs;
		}
	}
}

void CL_Dvr_f(void) {
	char *xIn, *yIn, *wIn, *hIn;
	int clientNum, argc = 0;
	if(Cmd_Argc() < 5 || Cmd_Argc() > 6
		|| (clc.sv_mvWorld && !serverWorld)) {
		if(Cmd_Argc() == 1) {
			for(int i = 0; i < MAX_NUM_VMS; i++) {
				if(clientScreens[i][0] > -1) {
					Com_Printf( "[%i] %i %i: %fx%f (%fx%f)\n", 
						i, clientGames[i], clientWorlds[i], 
						clientScreens[i][0], clientScreens[i][1],
					 	clientScreens[i][2], clientScreens[i][3]);
				}
			}
		} else if (clc.sv_mvWorld && !serverWorld) {
			Com_Printf("In server world mode, no tiling.\n");
			return; // silently disable on this server, world messages are sent
		}
		Com_Printf ("Usage: dvr [clientnum] [x y w h]\n");
		return;
	}
	if(Cmd_Argc() == 5) {
		clientNum = clc.currentView;
	} else {
		char world[16];
		strcpy(world, Cmd_Argv(++argc));
		if(world[1] == ':') {
			world[1] = '\0';
			clientNum = atoi(world);
			if(clientGames[clientNum] != -1) {
				// switch the screen on the world view for this specific client
				clientWorlds[clientNum] = atoi(&world[2]);
			}
		} else {
			clientNum = atoi(world);
		}
	}
	xIn = Cmd_Argv(++argc);
	yIn = Cmd_Argv(++argc);
	wIn = Cmd_Argv(++argc);
	hIn = Cmd_Argv(++argc);
	clientScreens[clientNum][0] = Q_atof(xIn);
	clientScreens[clientNum][1] = Q_atof(yIn);
	clientScreens[clientNum][2] = Q_atof(wIn);
	clientScreens[clientNum][3] = Q_atof(hIn);
}

#endif


/*
====================
CL_Init
====================
*/
void CL_Init( void ) {
	const char *s;
	cvar_t *cv;
#ifdef USE_PRINT_CONSOLE
  Com_PrintFlags(PC_INIT);
#endif

	Com_Printf( "----- Client Initialization -----\n" );

#ifndef USE_NO_CONSOLE
	Con_Init();
#endif

	CL_ClearState();
	cls.state = CA_DISCONNECTED;	// no longer CA_UNINITIALIZED

	CL_ResetOldGame();

	cls.realtime = 0;

	CL_InitInput();

	//
	// register client variables
	//
	cl_noprint = Cvar_Get( "cl_noprint", "0", 0 );
	cl_motd = Cvar_Get( "cl_motd", "1", 0 );

	cl_timeout = Cvar_Get( "cl_timeout", "200", 0 );
	Cvar_CheckRange( cl_timeout, "5", NULL, CV_INTEGER );

	cl_autoNudge = Cvar_Get( "cl_autoNudge", "0", CVAR_TEMP );
	Cvar_CheckRange( cl_autoNudge, "0", "1", CV_FLOAT );
#ifdef BUILD_GAME_STATIC
  cl_timeNudge = Cvar_Get( "cl_timeNudge", "-30", CVAR_TEMP );
#else
  cl_timeNudge = Cvar_Get( "cl_timeNudge", "0", CVAR_TEMP );
#endif
	Cvar_CheckRange( cl_timeNudge, "-30", "30", CV_INTEGER );

	cl_shownet = Cvar_Get ("cl_shownet", "0", CVAR_TEMP );
	cl_showTimeDelta = Cvar_Get ("cl_showTimeDelta", "0", CVAR_TEMP );
	rcon_client_password = Cvar_Get ("rconPassword", "", CVAR_TEMP );
	cl_activeAction = Cvar_Get( "activeAction", "", CVAR_TEMP );

	cl_autoRecordDemo = Cvar_Get ("cl_autoRecordDemo", "0", CVAR_ARCHIVE);

	cl_aviFrameRate = Cvar_Get ("cl_aviFrameRate", "25", CVAR_ARCHIVE);
	Cvar_CheckRange( cl_aviFrameRate, "1", "1000", CV_INTEGER );
	cl_aviMotionJpeg = Cvar_Get ("cl_aviMotionJpeg", "1", CVAR_ARCHIVE);
	cl_forceavidemo = Cvar_Get ("cl_forceavidemo", "0", 0);
  for(int cs = 0; cs < 100; cs++) {
    cl_demoOverrideCS[cs] = Cvar_Get(va("cl_demoOverrideCS%d", cs + 1), "", CVAR_TEMP);
  }
  cl_demoOverrideGame = Cvar_Get("cl_demoOverrideGame", "", CVAR_TEMP);

	cl_aviPipeFormat = Cvar_Get( "cl_aviPipeFormat",
		"-preset medium -crf 23 -vcodec libx264 -flags +cgop -pix_fmt yuv420p "
		"-bf 2 -codec:a aac -strict -2 -b:a 160k -r:a 22050 -movflags faststart", 
		CVAR_ARCHIVE );

	rconAddress = Cvar_Get ("rconAddress", "", 0);

#ifdef USE_MASTER_LAN
	for ( int index = 0; index < MAX_MASTER_SERVERS; index++ ) {
    cl_master[index] = Cvar_Get(va("cl_master%d", index + 1), "", CVAR_ARCHIVE);
  }
#endif

#ifdef USE_DRAGDROP
  cl_dropAction = Cvar_Get( "cl_dropAction", "1", CVAR_ARCHIVE );
  Cvar_CheckRange( cl_dropAction, "0", "2", CV_INTEGER );
#endif

#ifdef USE_ABS_MOUSE
	in_mouseAbsolute = Cvar_Get("in_mouseAbsolute", "1", CVAR_ARCHIVE);
#endif

	// get the menu path from multigame VM so we can start on a specific screen
#ifdef __WASM__
	Cvar_SetModifiedFunc(Cvar_Get("ui_breadCrumb", "", CVAR_TEMP), CL_MenuModified);
	cl_returnURL = Cvar_Get("cl_returnURL", "", CVAR_TEMP);
#endif

#ifdef USE_MV
	Cvar_Get( "mvproto", va( "%i", MV_PROTOCOL_VERSION ), CVAR_USERINFO | CVAR_ROM );
#endif
#ifdef USE_MULTIVM_CLIENT
  cl_mvHighlight = Cvar_Get("cl_mvHighlight", "1", CVAR_ARCHIVE);
  Cvar_CheckRange( cl_mvHighlight, "0", "1", CV_INTEGER );
#endif

	cl_allowDownload = Cvar_Get( "cl_allowDownload", XSTRING(DLF_ENABLE), CVAR_ARCHIVE_ND );
#ifdef USE_CURL
	cl_mapAutoDownload = Cvar_Get( "cl_mapAutoDownload", "0", CVAR_ARCHIVE_ND );
#ifdef USE_CURL_DLOPEN
	cl_cURLLib = Cvar_Get( "cl_cURLLib", DEFAULT_CURL_LIB, 0 );
#endif
#endif

	cl_conXOffset = Cvar_Get ("cl_conXOffset", "0", 0);
	cl_conColor = Cvar_Get( "cl_conColor", "", 0 );

	cl_inGameVideo = Cvar_Get( "r_inGameVideo", "1", CVAR_ARCHIVE_ND );
	Cvar_SetDescription( cl_inGameVideo, "Controls whether in game video should be draw" );

	cl_serverStatusResendTime = Cvar_Get ("cl_serverStatusResendTime", "750", 0);

	// init autoswitch so the ui will have it correctly even
	// if the cgame hasn't been started
	Cvar_Get ("cg_autoswitch", "1", CVAR_ARCHIVE);

	cl_motdString = Cvar_Get( "cl_motdString", "", CVAR_ROM );

	cv = Cvar_Get( "cl_maxPing", "800", CVAR_ARCHIVE_ND );
	Cvar_CheckRange( cv, "100", "999", CV_INTEGER );

	cl_lanForcePackets = Cvar_Get( "cl_lanForcePackets", "1", CVAR_ARCHIVE_ND );

	cl_guidServerUniq = Cvar_Get( "cl_guidServerUniq", "1", CVAR_ARCHIVE_ND );

#ifdef USE_CMD_CONNECTOR
	Cvar_Get( "cmd_connector", "1", CVAR_ROM | CVAR_USERINFO );
#endif

#ifdef USE_LAZY_LOAD
#if defined(USE_ASYNCHRONOUS) || defined(__WASM__)
	// we have no choice because even IDBFS is asynchronous
	cl_lazyLoad = Cvar_Get( "cl_lazyLoad", "1", CVAR_TEMP );
#else
  cl_lazyLoad = Cvar_Get( "cl_lazyLoad", "0", CVAR_TEMP );
#endif
	//if(cl_lazyLoad->integer > 1)
	//	Cvar_Set("cl_lazyLoad", "1");
#endif

#ifdef __WASM__
//#ifdef _DEBUG
	cl_dlURL = Cvar_Get( "cl_dlURL", "http://local.games:8080/multigame", CVAR_ARCHIVE_ND );
//#else
	//cl_dlURL = Cvar_Get( "cl_dlURL", "https://www.googleapis.com/download/storage/v1/b/nightly.quake.games/o/assets%2Fmultigame%2F%1", CVAR_ARCHIVE_ND );
	//cl_dlURL = Cvar_Get( "cl_dlURL", "https://nightly.quake.games/assets/multigame", CVAR_ARCHIVE_ND );
//#endif
#else
	cl_dlURL = Cvar_Get( "cl_dlURL", "http://ws.q3df.org/maps/download/%1", CVAR_ARCHIVE_ND );
#endif
	
	cl_dlDirectory = Cvar_Get( "cl_dlDirectory", "0", CVAR_ARCHIVE_ND );
	Cvar_CheckRange( cl_dlDirectory, "0", "1", CV_INTEGER );
	s = va( "Save downloads initiated by \\dlmap and \\download commands in:\n"
		" 0 - current game directory\n"
		" 1 - fs_basegame (%s) directory\n", FS_GetBaseGameDir() );
	Cvar_SetDescription( cl_dlDirectory, s );

	cl_reconnectArgs = Cvar_Get( "cl_reconnectArgs", "", CVAR_ARCHIVE_ND | CVAR_NOTABCOMPLETE );
  cl_drawFPS = Cvar_Get ("cl_drawFPS", "1", CVAR_ARCHIVE );
  cl_lagometer = Cvar_Get ("cl_lagometer", "1", CVAR_ARCHIVE );
  cl_nopredict = Cvar_Get ("cl_nopredict", "0", 0 );

	// userinfo
	Cvar_Get ("name", "UnnamedPlayer", CVAR_USERINFO | CVAR_ARCHIVE_ND );
	Cvar_Get ("rate", "25000", CVAR_USERINFO | CVAR_ARCHIVE );
#ifdef BUILD_GAME_STATIC
  cl_snaps = Cvar_Get ("snaps", "100", CVAR_USERINFO | CVAR_TEMP );
#else
#ifdef USE_MULTIVM_CLIENT
	cl_snaps = Cvar_Get ("snaps", "100", CVAR_USERINFO | CVAR_ARCHIVE );
#else
	cl_snaps = Cvar_Get ("snaps", "40", CVAR_USERINFO | CVAR_ARCHIVE );
#endif
#endif
	Cvar_Get ("model", "sarge", CVAR_USERINFO | CVAR_ARCHIVE_ND );
	Cvar_Get ("headmodel", "sarge", CVAR_USERINFO | CVAR_ARCHIVE_ND );
 	Cvar_Get ("team_model", "sarge", CVAR_USERINFO | CVAR_ARCHIVE_ND );
	Cvar_Get ("team_headmodel", "sarge", CVAR_USERINFO | CVAR_ARCHIVE_ND );
//	Cvar_Get ("g_redTeam", "Stroggs", CVAR_SERVERINFO | CVAR_ARCHIVE);
//	Cvar_Get ("g_blueTeam", "Pagans", CVAR_SERVERINFO | CVAR_ARCHIVE);
	Cvar_Get ("color1", "4", CVAR_USERINFO | CVAR_ARCHIVE );
	Cvar_Get ("color2", "5", CVAR_USERINFO | CVAR_ARCHIVE );
	Cvar_Get ("handicap", "100", CVAR_USERINFO | CVAR_ARCHIVE_ND );
//	Cvar_Get ("teamtask", "0", CVAR_USERINFO );
	Cvar_Get ("sex", "male", CVAR_USERINFO | CVAR_ARCHIVE_ND );
	Cvar_Get ("cl_anonymous", "0", CVAR_USERINFO | CVAR_ARCHIVE_ND );

	Cvar_Get ("password", "", CVAR_USERINFO);
	Cvar_Get ("cg_predictItems", "1", CVAR_USERINFO | CVAR_ARCHIVE );


	// cgame might not be initialized before menu is used
	Cvar_Get ("cg_viewsize", "100", CVAR_ARCHIVE_ND );
	// Make sure cg_stereoSeparation is zero as that variable is deprecated and should not be used anymore.
	Cvar_Get ("cg_stereoSeparation", "0", CVAR_ROM);

	//
	// register client commands
	//
	Cmd_AddCommand ("cmd", CL_ForwardToServer_f);
	Cmd_AddCommand ("configstrings", CL_Configstrings_f);
	Cmd_AddCommand ("clientinfo", CL_Clientinfo_f);
	Cmd_AddCommand ("snd_restart", CL_Snd_Restart_f);
	Cmd_AddCommand ("vid_restart", CL_Vid_Restart_f);
	Cmd_AddCommand ("disconnect", CL_Disconnect_f);

	Cmd_AddCommand ("record", CL_Record_f);
	Cmd_SetCommandCompletionFunc( "record", CL_CompleteRecordName );
	Cmd_AddCommand ("demo", CL_PlayDemo_f);
	Cmd_SetCommandCompletionFunc( "demo", CL_CompleteDemoName );
	Cmd_AddCommand("demo_pause", CL_Pause_f);
	Cmd_AddCommand("rewind", CL_Rewind_f);
	Cmd_AddCommand("forward", CL_Rewind_f);
	Cmd_AddCommand("demo_play", CL_Play_f);
	
	Cmd_AddCommand ("cinematic", CL_PlayCinematic_f);
	Cmd_AddCommand ("stoprecord", CL_StopRecord_f);
	Cmd_AddCommand ("connect", CL_Connect_f);
	Cmd_AddCommand ("reconnect", CL_Reconnect_f);
	Cmd_AddCommand ("localservers", CL_LocalServers_f);
	Cmd_AddCommand ("globalservers", CL_GlobalServers_f);
	Cmd_AddCommand ("rcon", CL_Rcon_f);
	Cmd_SetCommandCompletionFunc( "rcon", CL_CompleteRcon );
	Cmd_AddCommand ("ping", CL_Ping_f );
	Cmd_AddCommand ("serverstatus", CL_ServerStatus_f );
#ifndef __WASM__
	Cmd_AddCommand ("showip", CL_ShowIP_f );
#endif
	Cmd_AddCommand ("model", CL_SetModel_f );
	Cmd_AddCommand ("video", CL_Video_f );
	Cmd_AddCommand ("video-pipe", CL_Video_f );
	Cmd_SetCommandCompletionFunc( "video", CL_CompleteVideoName );
	Cmd_AddCommand ("stopvideo", CL_StopVideo_f );
	Cmd_AddCommand ("serverinfo", CL_Serverinfo_f );
	Cmd_AddCommand ("systeminfo", CL_Systeminfo_f );
	Cmd_AddCommand( "callvote", NULL );
	Cmd_SetCommandCompletionFunc( "callvote", CL_CompleteCallvote );

#ifdef USE_CURL
	Cmd_AddCommand( "download", CL_Download_f );
	Cmd_AddCommand( "dlmap", CL_Download_f );
#endif
	Cmd_AddCommand( "modelist", CL_ModeList_f );
	Cmd_SetDescription("modelist", "List of accessible screen resolutions\nUsage: modelist");

#ifdef USE_PRINT_CONSOLE
  Com_PrintFlags(PC_INIT);
#endif

#ifdef USE_MV
	Cmd_AddCommand( "mvjoin", CL_Multiview_f );
	Cmd_SetDescription("mvjoin", "Join multiview to allow viewing of other players\nUsage: mvjoin");
	Cmd_AddCommand( "mvleave", CL_Multiview_f );
	Cmd_SetDescription("mvleave", "Leave multiview and stop showing other players\nUsage: mvleave");
	Cmd_AddCommand( "mvfollow", CL_MultiviewFollow_f );
	Cmd_SetDescription("mvfollow", "Follow a specific player in multiview\nUsage: mvfollow <playernumber>");
#endif

#ifdef USE_MULTIVM_CLIENT
	Cmd_AddCommand( "load", CL_LoadVM_f );
	Cmd_SetDescription("load", "Load extra VMs for showing multiple players or maps\nUsage: load [ui|cgame|game]");
	Cmd_AddCommand ("tele", CL_Tele_f);
	Cmd_SetDescription( "tele", "Teleport into the game as if you just connected\nUsage: teleport <client> [xcoord zcoord ycoord]" );
	Cmd_AddCommand ("game", CL_Game_f);
	Cmd_SetDescription( "game", "Switch games in multiVM mode to another match\nUsage: game [0/1/2 moveorigin] [num]" );
	Cmd_AddCommand ("world", CL_World_f);
	Cmd_SetDescription( "world", "Switch the rendered world client side only\nUsage: world <numworld>" );
	Cmd_AddCommand ("tile", CL_Tile_f);
	Cmd_SetDescription( "tile", "Display multiview renderings in a grid\nUsage: tile [+/-] [x y] [clientnum]" );
	Cmd_AddCommand ("dvr", CL_Dvr_f);
	Cmd_SetDescription( "dvr", "Change where the screen output is drawn using percentages\nUsage: dvr [clientnum] x y w h" );
#endif

	Cvar_Set( "cl_running", "1" );

#ifdef USE_MD5
	CL_GenerateQKey();
#endif
	Cvar_Get( "cl_guid", "", CVAR_USERINFO | CVAR_ROM | CVAR_PROTECTED );
	CL_UpdateGUID( NULL, 0 );
#ifdef USE_LNBITS
	cl_lnInvoice = Cvar_Get( "cl_lnInvoice", "", CVAR_USERINFO | CVAR_ROM | CVAR_PROTECTED );
#endif

  Cvar_SetClientDescriptions();

  Com_Printf( "----- Client Initialization Complete -----\n" );

#ifdef USE_PRINT_CONSOLE
  Com_PrintClear();
#endif
}


/*
===============
CL_Shutdown

Called on fatal error, quit and dedicated mode switch
===============
*/
void CL_Shutdown( const char *finalmsg, qboolean quit ) {
	static qboolean recursive = qfalse;

	// check whether the client is running at all.
	if ( !com_cl_running || !com_cl_running->integer )
		return;

	Com_Printf( "----- Client Shutdown (%s) -----\n", finalmsg );

#ifdef USE_ASYNCHRONOUS
#ifdef USE_CURL
	//if(cl_downloads) {
	//	Z_Free(cl_downloads);
	//}
#endif
#endif

	if ( recursive ) {
		Com_Printf( "WARNING: Recursive CL_Shutdown()\n" );
		return;
	}
	recursive = qtrue;

	noGameRestart = quit;
	CL_Disconnect( qfalse, qfalse );

	S_DisableSounds();
	CL_ShutdownVMs();

	CL_ShutdownRef( quit ? REF_UNLOAD_DLL : REF_DESTROY_WINDOW );

#ifndef USE_NO_CONSOLE
	Con_Shutdown();
#endif

	Cmd_RemoveCommand ("cmd");
	Cmd_RemoveCommand ("configstrings");
	Cmd_RemoveCommand ("userinfo");
	Cmd_RemoveCommand ("clientinfo");
	Cmd_RemoveCommand ("snd_restart");
	Cmd_RemoveCommand ("vid_restart");
	Cmd_RemoveCommand ("disconnect");
	Cmd_RemoveCommand ("record");
	Cmd_RemoveCommand ("demo");
	Cmd_RemoveCommand ("cinematic");
	Cmd_RemoveCommand ("stoprecord");
	Cmd_RemoveCommand ("connect");
	Cmd_RemoveCommand ("reconnect");
	Cmd_RemoveCommand ("localservers");
	Cmd_RemoveCommand ("globalservers");
	Cmd_RemoveCommand ("rcon");
	Cmd_RemoveCommand ("ping");
	Cmd_RemoveCommand ("serverstatus");
	Cmd_RemoveCommand ("showip");
	Cmd_RemoveCommand ("model");
	Cmd_RemoveCommand ("video");
	Cmd_RemoveCommand ("stopvideo");
	Cmd_RemoveCommand ("serverinfo");
	Cmd_RemoveCommand ("systeminfo");
	Cmd_RemoveCommand ("modelist");

#ifdef USE_CURL
	Com_DL_Cleanup( &download );

	Cmd_RemoveCommand( "download" );
	Cmd_RemoveCommand( "dlmap" );
#endif

#ifdef USE_MV
	Cmd_RemoveCommand( "mvjoin" );
	Cmd_RemoveCommand( "mvleave" );
	Cmd_RemoveCommand( "mvfollow" );
#endif
#ifdef USE_MULTIVM_CLIENT
	Cmd_RemoveCommand( "load" );
#endif

	CL_ClearInput();

	Cvar_Set( "cl_running", "0" );

	recursive = qfalse;

	Com_Memset( &cls, 0, sizeof( cls ) );
	Key_SetCatcher( 0 );
	Com_Printf( "-----------------------\n" );
}


static void CL_SetServerInfo(serverInfo_t *server, const char *info, int ping) {
	if (server) {
		if (info) {
			server->clients = atoi(Info_ValueForKey(info, "clients"));
			Q_strncpyz(server->hostName,Info_ValueForKey(info, "hostname"), MAX_NAME_LENGTH);
			Q_strncpyz(server->mapName, Info_ValueForKey(info, "mapname"), MAX_NAME_LENGTH);
			server->maxClients = atoi(Info_ValueForKey(info, "sv_maxclients"));
			Q_strncpyz(server->game,Info_ValueForKey(info, "game"), MAX_NAME_LENGTH);
			server->gameType = atoi(Info_ValueForKey(info, "gametype"));
			server->netType = atoi(Info_ValueForKey(info, "nettype"));
			server->minPing = atoi(Info_ValueForKey(info, "minping"));
			server->maxPing = atoi(Info_ValueForKey(info, "maxping"));
			server->punkbuster = atoi(Info_ValueForKey(info, "punkbuster"));
			server->g_humanplayers = atoi(Info_ValueForKey(info, "g_humanplayers"));
			server->g_needpass = atoi(Info_ValueForKey(info, "g_needpass"));
		}
		server->ping = ping;
	}
}


static void CL_SetServerInfoByAddress(const netadr_t *from, const char *info, int ping) {
	int i;

	for (i = 0; i < MAX_OTHER_SERVERS; i++) {
		if (NET_CompareAdr(from, &cls.localServers[i].adr) ) {
			CL_SetServerInfo(&cls.localServers[i], info, ping);
		}
	}

	for (i = 0; i < MAX_GLOBAL_SERVERS; i++) {
		if (NET_CompareAdr(from, &cls.globalServers[i].adr)) {
			CL_SetServerInfo(&cls.globalServers[i], info, ping);
		}
	}

	for (i = 0; i < MAX_OTHER_SERVERS; i++) {
		if (NET_CompareAdr(from, &cls.favoriteServers[i].adr)) {
			CL_SetServerInfo(&cls.favoriteServers[i], info, ping);
		}
	}
}


/*
===================
CL_ServerInfoPacket
===================
*/
static void CL_ServerInfoPacket( const netadr_t *from, msg_t *msg ) {
	int		i, type, len;
	char	info[MAX_INFO_STRING];
	const char *infoString;
#ifdef USE_LOCAL_DED
	char *autocomplete;
#endif
#ifdef USE_LNBITS
	char *paymentInvoice, *challenge;
#endif
	int		prot;
	netadr_t addr;
	
	if(from->type == NA_LOOPBACK) {
		// emulate a local address instead of loopback to not hold up the list
		NET_StringToAdr( va("127.0.0.1:%i", BigShort(PORT_SERVER)), &addr, NA_UNSPEC );
		addr.type = NA_IP;
	}

	infoString = MSG_ReadString( msg );
	
#ifdef USE_LOCAL_DED
	// exit early if this is an autocomplete message
	autocomplete = Info_ValueForKey( infoString, "autocomplete" );
	NET_StringToAdr( rconAddress->string, &rcon_address, NA_UNSPEC );
	if ( rcon_address.port == 0 ) {
		rcon_address.port = BigShort( PORT_SERVER );
	}
	if(autocomplete[0]) {
		if((NET_CompareAdr(from, &clc.serverAddress)
			|| (rcon_address.type != NA_BAD && NET_CompareAdr(from, &rcon_address)))) {
			hasRcon = Q_stristr(g_consoleField.buffer, "\\rcon") != 0;
			Field_Clear(&g_consoleField);
			if(hasRcon) // add rcon back on to autocomplete command
				memcpy(&g_consoleField.buffer, va("\\rcon %s", autocomplete), sizeof(g_consoleField.buffer));
			else
				memcpy(&g_consoleField.buffer, autocomplete, sizeof(g_consoleField.buffer));
			Field_AutoComplete( &g_consoleField );
			g_consoleField.cursor = strlen(g_consoleField.buffer);
			hasRcon = qfalse;
		} else
			Com_Printf( "Rcon: autocomplete dropped\n" );
		return;
	}
#endif

#ifdef USE_LNBITS
	// exit early if this is a payment request
	paymentInvoice = Info_ValueForKey( infoString, "cl_lnInvoice" );
	if(paymentInvoice[0]) {
		char *reward = Info_ValueForKey( infoString, "reward" );
		challenge = Info_ValueForKey( infoString, "oldChallenge" );
		if(challenge[0] && clc.challenge == atoi(challenge)) {
			if(reward[0]) {
				Cvar_Set( "cl_lnInvoice", reward );
			} else {
				Cvar_Set( "cl_lnInvoice", paymentInvoice );
			}
			challenge = Info_ValueForKey( infoString, "challenge" );
			clc.challenge = atoi(challenge);
			cls.qrCodeShader = 0;
		}
		return;
	}
#endif

	// if this isn't the correct protocol version, ignore it
	prot = atoi( Info_ValueForKey( infoString, "protocol" ) );
	if ( prot != OLD_PROTOCOL_VERSION && prot != NEW_PROTOCOL_VERSION ) {
		Com_DPrintf( "Different protocol info packet: %s\n", infoString );
		return;
	}

	// iterate servers waiting for ping response
	for (i=0; i<MAX_PINGREQUESTS; i++)
	{
		if ( cl_pinglist[i].time || cl_pinglist[i].adr.port == 0)
			continue;

		if (NET_CompareAdr( from, &cl_pinglist[i].adr )
			|| (from->type == NA_LOOPBACK && NET_CompareAdr( &addr, &cl_pinglist[i].adr )))
		{

			// calc ping time
			cl_pinglist[i].time = Sys_Milliseconds() - cl_pinglist[i].start;
			if ( cl_pinglist[i].time < 1 )
			{
				cl_pinglist[i].time = 1;
			}
			if ( com_developer->integer )
			{
				Com_Printf( "ping time %dms from %s\n", cl_pinglist[i].time, NET_AdrToString( from ) );
			}

			// save of info
			Q_strncpyz( cl_pinglist[i].info, infoString, sizeof( cl_pinglist[i].info ) );

			// tack on the net type
			// NOTE: make sure these types are in sync with the netnames strings in the UI
			switch (from->type)
			{
				case NA_LOOPBACK:
				case NA_BROADCAST:
				case NA_IP:
					type = 1;
					break;
#ifdef USE_IPV6
				case NA_IP6:
					type = 2;
					break;
#endif
				default:
					type = 0;
					break;
			}

			Info_SetValueForKey( cl_pinglist[i].info, "nettype", va("%d", type) );
			if(from->type == NA_LOOPBACK) {
 				CL_SetServerInfoByAddress(&addr, infoString, cl_pinglist[i].time);
			} else {
				CL_SetServerInfoByAddress(from, infoString, cl_pinglist[i].time);
			}

			return;
		}
	}

	// if not just sent a local broadcast or pinging local servers
	if (cls.pingUpdateSource != AS_LOCAL) {
		return;
	}

	for ( i = 0 ; i < MAX_OTHER_SERVERS ; i++ ) {

		// empty slot
		if ( cls.localServers[i].adr.port == 0 ) {
			break;
		}

		// avoid duplicate
		if ( NET_CompareAdr( from, &cls.localServers[i].adr ) ) {
			return;
		}
	}

	if ( i == MAX_OTHER_SERVERS ) {
		Com_DPrintf( "MAX_OTHER_SERVERS hit, dropping infoResponse\n" );
		return;
	}

	// add this to the list
	cls.numlocalservers = i+1;
	CL_InitServerInfo( &cls.localServers[i], from );

	Q_strncpyz( info, MSG_ReadString( msg ), sizeof( info ) );
	len = (int) strlen( info );
	if ( len > 0 ) {
		if ( info[ len-1 ] == '\n' ) {
			info[ len-1 ] = '\0';
		}
		Com_Printf( "%s: %s\n", NET_AdrToStringwPort( from ), info );
	}
}


/*
===================
CL_GetServerStatus
===================
*/
static serverStatus_t *CL_GetServerStatus( const netadr_t *from ) {
	int i, oldest, oldestTime;

	for (i = 0; i < MAX_SERVERSTATUSREQUESTS; i++) {
		if ( NET_CompareAdr( from, &cl_serverStatusList[i].address ) ) {
			return &cl_serverStatusList[i];
		}
	}
	for (i = 0; i < MAX_SERVERSTATUSREQUESTS; i++) {
		if ( cl_serverStatusList[i].retrieved ) {
			return &cl_serverStatusList[i];
		}
	}
	oldest = -1;
	oldestTime = 0;
	for (i = 0; i < MAX_SERVERSTATUSREQUESTS; i++) {
		if (oldest == -1 || cl_serverStatusList[i].startTime < oldestTime) {
			oldest = i;
			oldestTime = cl_serverStatusList[i].startTime;
		}
	}
	return &cl_serverStatusList[oldest];
}


/*
===================
CL_ServerStatus
===================
*/
int CL_ServerStatus( const char *serverAddress, char *serverStatusString, int maxLen ) {
	int i;
	netadr_t	to;
	serverStatus_t *serverStatus;

	// if no server address then reset all server status requests
	if ( !serverAddress ) {
		for (i = 0; i < MAX_SERVERSTATUSREQUESTS; i++) {
			cl_serverStatusList[i].address.port = 0;
			cl_serverStatusList[i].retrieved = qtrue;
		}
		return qfalse;
	}
	// get the address
	if ( !NET_StringToAdr( serverAddress, &to, NA_UNSPEC ) ) {
		return qfalse;
	}
	serverStatus = CL_GetServerStatus( &to );
	// if no server status string then reset the server status request for this address
	if ( !serverStatusString ) {
		serverStatus->retrieved = qtrue;
		return qfalse;
	}

	// if this server status request has the same address
	if ( NET_CompareAdr( &to, &serverStatus->address) ) {
		// if we received a response for this server status request
		if (!serverStatus->pending) {
			Q_strncpyz(serverStatusString, serverStatus->string, maxLen);
			serverStatus->retrieved = qtrue;
			serverStatus->startTime = 0;
			return qtrue;
		}
		// resend the request regularly
		else if ( Sys_Milliseconds() - serverStatus->startTime > cl_serverStatusResendTime->integer ) {
			serverStatus->print = qfalse;
			serverStatus->pending = qtrue;
			serverStatus->retrieved = qfalse;
			serverStatus->time = 0;
			serverStatus->startTime = Sys_Milliseconds();
			NET_OutOfBandPrint( NS_CLIENT, &to, "getstatus" );
			return qfalse;
		}
	}
	// if retrieved
	else if ( serverStatus->retrieved ) {
		serverStatus->address = to;
		serverStatus->print = qfalse;
		serverStatus->pending = qtrue;
		serverStatus->retrieved = qfalse;
		serverStatus->startTime = Sys_Milliseconds();
		serverStatus->time = 0;
		NET_OutOfBandPrint( NS_CLIENT, &to, "getstatus" );
		return qfalse;
	}
	return qfalse;
}


/*
===================
CL_ServerStatusResponse
===================
*/
static void CL_ServerStatusResponse( const netadr_t *from, msg_t *msg ) {
	const char	*s;
	char	info[MAX_INFO_STRING];
	char	buf[64], *v[2];
	int		i, l, score, ping;
	int		len;
	serverStatus_t *serverStatus;

	serverStatus = NULL;
	for (i = 0; i < MAX_SERVERSTATUSREQUESTS; i++) {
		if ( NET_CompareAdr( from, &cl_serverStatusList[i].address ) ) {
			serverStatus = &cl_serverStatusList[i];
			break;
		}
	}
	// if we didn't request this server status
	if (!serverStatus) {
		return;
	}

	s = MSG_ReadStringLine( msg );

	len = 0;
	Com_sprintf(&serverStatus->string[len], sizeof(serverStatus->string)-len, "%s", s);

	if (serverStatus->print) {
		Com_Printf("Server settings:\n");
		// print cvars
		while (*s) {
			for (i = 0; i < 2 && *s; i++) {
				if (*s == '\\')
					s++;
				l = 0;
				while (*s) {
					info[l++] = *s;
					if (l >= MAX_INFO_STRING-1)
						break;
					s++;
					if (*s == '\\') {
						break;
					}
				}
				info[l] = '\0';
				if (i) {
					Com_Printf("%s\n", info);
				}
				else {
					Com_Printf("%-24s", info);
				}
			}
		}
	}

	len = strlen(serverStatus->string);
	Com_sprintf(&serverStatus->string[len], sizeof(serverStatus->string)-len, "\\");

	if (serverStatus->print) {
		Com_Printf("\nPlayers:\n");
		Com_Printf("num: score: ping: name:\n");
	}
	for (i = 0, s = MSG_ReadStringLine( msg ); *s; s = MSG_ReadStringLine( msg ), i++) {

		len = strlen(serverStatus->string);
		Com_sprintf(&serverStatus->string[len], sizeof(serverStatus->string)-len, "\\%s", s);

		if (serverStatus->print) {
			//score = ping = 0;
			//sscanf(s, "%d %d", &score, &ping);
			Q_strncpyz( buf, s, sizeof (buf) );
			Com_Split( buf, v, 2, ' ' );
			score = atoi( v[0] );
			ping = atoi( v[1] );
			s = strchr(s, ' ');
			if (s)
				s = strchr(s+1, ' ');
			if (s)
				s++;
			else
				s = "unknown";
			Com_Printf("%-2d   %-3d    %-3d   %s\n", i, score, ping, s );
		}
	}
	len = strlen(serverStatus->string);
	Com_sprintf(&serverStatus->string[len], sizeof(serverStatus->string)-len, "\\");

	serverStatus->time = Sys_Milliseconds();
	serverStatus->address = *from;
	serverStatus->pending = qfalse;
	if (serverStatus->print) {
		serverStatus->retrieved = qtrue;
	}
}


/*
==================
CL_LocalServers_f
==================
*/
static void CL_LocalServers_f( void ) {
#ifndef USE_MASTER_LAN
	char		*message;
	int			i, j, n;
#else
	int i, j;
#endif
	netadr_t	to;

	Com_Printf( "Scanning for servers on the local network...\n");

	// reset the list, waiting for response
	cls.numlocalservers = 0;
	cls.pingUpdateSource = AS_LOCAL;

	for (i = 0; i < MAX_OTHER_SERVERS; i++) {
		qboolean b = cls.localServers[i].visible;
		Com_Memset(&cls.localServers[i], 0, sizeof(cls.localServers[i]));
		cls.localServers[i].visible = b;
	}
	Com_Memset( &to, 0, sizeof( to ) );

#ifdef USE_MASTER_LAN
	// emulate localhost
	NET_StringToAdr( va("127.0.0.1:%i", BigShort(PORT_SERVER)), &to, NA_UNSPEC );
	to.type = NA_IP;
	cls.numlocalservers = -1;
	for ( i = 0; i < MAX_MASTER_SERVERS; i++ ) {
		if(cls.numGlobalServerAddresses < MAX_GLOBAL_SERVERS) {
			netadr_t *addr = &cls.globalServerAddresses[cls.numGlobalServerAddresses];
			if(!cl_master[i]->string[0]) {
				continue;
			}

			if(!NET_StringToAdr( cl_master[i]->string, addr, NA_UNSPEC )) {
				continue;
			}
			// only add localhost if its in the list of cl_master
			if (NET_CompareAdr(&to, addr)) {
				//for(j = 0; j < cls.numlocalservers; j++) {
				//	if ( NET_CompareAdr( addr, &cls.localServers[j].adr ) ) {
				//		break;
				//	}
				//}
			} else if (addr->port != BigShort((short)PORT_SERVER)) {
				Com_Printf( "Requesting servers from %s (%s)...\n", cl_master[i]->string, NET_AdrToStringwPort(addr) );
				NET_OutOfBandPrint( NS_CLIENT, addr, "getservers 68 " );
				NET_OutOfBandPrint( NS_CLIENT, addr, "getservers 72 " );
			}
			
		}
	}
#else
	// The 'xxx' in the message is a challenge that will be echoed back
	// by the server.  We don't care about that here, but master servers
	// can use that to prevent spoofed server responses from invalid ip
	message = "\377\377\377\377getinfo xxx";
	n = (int)strlen( message );

	// send each message twice in case one is dropped
	for ( i = 0 ; i < 2 ; i++ ) {
		// send a broadcast packet on each server port
		// we support multiple server ports so a single machine
		// can nicely run multiple servers
		for ( j = 0 ; j < NUM_SERVER_PORTS ; j++ ) {
			to.port = BigShort( (short)(PORT_SERVER + j) );

#ifdef USE_MULTIVM_SERVER
			to.netWorld = 0;
#endif
			to.type = NA_BROADCAST;
			NET_SendPacket( NS_CLIENT, n, message, &to );
#ifdef USE_IPV6
			to.type = NA_MULTICAST6;
			NET_SendPacket( NS_CLIENT, n, message, &to );
#endif
		}
	}
#endif
}


/*
==================
CL_GlobalServers_f

Originally master 0 was Internet and master 1 was MPlayer.
ioquake3 2008; added support for requesting five separate master servers using 0-4.
ioquake3 2017; made master 0 fetch all master servers and 1-5 request a single master server.
==================
*/
static void CL_GlobalServers_f( void ) {
	netadr_t	to;
	int			count, i, masterNum;
	char		command[1024];
	const char	*masteraddress;
	
	if ( (count = Cmd_Argc()) < 3 || (masterNum = atoi(Cmd_Argv(1))) < 0 || masterNum > MAX_MASTER_SERVERS )
	{
		Com_Printf( "Usage: globalservers <master# 0-%d> <protocol> [keywords]\n", MAX_MASTER_SERVERS );
		return;
	}

	// request from all master servers
	if ( masterNum == 0 ) {
		int numAddress = 0;

		for ( i = 1; i <= MAX_MASTER_SERVERS; i++ ) {
			sprintf( command, "sv_master%d", i );
			masteraddress = Cvar_VariableString( command );

			if ( !*masteraddress )
				continue;

			numAddress++;

			Com_sprintf( command, sizeof( command ), "globalservers %d %s %s\n", i, Cmd_Argv( 2 ), Cmd_ArgsFrom( 3 ) );
			Cbuf_AddText( command );
		}

		if ( !numAddress ) {
			Com_Printf( "CL_GlobalServers_f: Error: No master server addresses.\n");
		}
		return;
	}

	sprintf( command, "sv_master%d", masterNum );
	masteraddress = Cvar_VariableString( command );
	
	if ( !*masteraddress )
	{
		Com_Printf( "CL_GlobalServers_f: Error: No master server address given.\n");
		return;	
	}

	// reset the list, waiting for response
	// -1 is used to distinguish a "no response"

	i = NET_StringToAdr( masteraddress, &to, NA_UNSPEC );
	
	if ( i == 0 )
	{
		Com_Printf( "CL_GlobalServers_f: Error: could not resolve address of master %s\n", masteraddress );
		return;	
	}
	else if ( i == 2 )
		to.port = BigShort( PORT_MASTER );

	Com_Printf( "Requesting servers from %s (%s)...\n", masteraddress, NET_AdrToStringwPort( &to ) );

	cls.numglobalservers = -1;
	cls.pingUpdateSource = AS_GLOBAL;

	// Use the extended query for IPv6 masters
#ifdef USE_IPV6
	if ( to.type == NA_IP6 || to.type == NA_MULTICAST6 )
	{
		int v4enabled = Cvar_VariableIntegerValue( "net_enabled" ) & NET_ENABLEV4;
		
		if ( v4enabled )
		{
			Com_sprintf( command, sizeof( command ), "getserversExt %s %s",
				GAMENAME_FOR_MASTER, Cmd_Argv(2) );
		}
		else
		{
			Com_sprintf( command, sizeof( command ), "getserversExt %s %s ipv6",
				GAMENAME_FOR_MASTER, Cmd_Argv(2) );
		}
	}
	else
#endif
		Com_sprintf( command, sizeof( command ), "getservers %s", Cmd_Argv(2) );

	for ( i = 3; i < count; i++ )
	{
		Q_strcat( command, sizeof( command ), " " );
		Q_strcat( command, sizeof( command ), Cmd_Argv( i ) );
	}

	NET_OutOfBandPrint( NS_SERVER, &to, "%s", command );
}


/*
==================
CL_GetPing
==================
*/
void CL_GetPing( int n, char *buf, int buflen, int *pingtime )
{
	const char	*str;
	int		time;
	int		maxPing;

	if (n < 0 || n >= MAX_PINGREQUESTS || !cl_pinglist[n].adr.port)
	{
		// empty or invalid slot
		buf[0]    = '\0';
		*pingtime = 0;
		return;
	}

	str = NET_AdrToStringwPortandProtocol( &cl_pinglist[n].adr );
	Q_strncpyz( buf, str, buflen );

	time = cl_pinglist[n].time;
	if ( time == 0 )
	{
		// check for timeout
		time = Sys_Milliseconds() - cl_pinglist[n].start;
		maxPing = Cvar_VariableIntegerValue( "cl_maxPing" );
		if (time < maxPing)
		{
			// not timed out yet
			time = 0;
		}
	}

	CL_SetServerInfoByAddress(&cl_pinglist[n].adr, cl_pinglist[n].info, cl_pinglist[n].time);

	*pingtime = time;
}


/*
==================
CL_GetPingInfo
==================
*/
void CL_GetPingInfo( int n, char *buf, int buflen )
{
	if (n < 0 || n >= MAX_PINGREQUESTS || !cl_pinglist[n].adr.port)
	{
		// empty or invalid slot
		if (buflen)
			buf[0] = '\0';
		return;
	}

	Q_strncpyz( buf, cl_pinglist[n].info, buflen );
}


/*
==================
CL_ClearPing
==================
*/
void CL_ClearPing( int n )
{
	if (n < 0 || n >= MAX_PINGREQUESTS)
		return;

	cl_pinglist[n].adr.port = 0;
}


/*
==================
CL_GetPingQueueCount
==================
*/
int CL_GetPingQueueCount( void )
{
	int		i;
	int		count;
	ping_t*	pingptr;

	count   = 0;
	pingptr = cl_pinglist;

	for (i=0; i<MAX_PINGREQUESTS; i++, pingptr++ ) {
		if (pingptr->adr.port) {
			count++;
		}
	}

	return (count);
}


/*
==================
CL_GetFreePing
==================
*/
static ping_t* CL_GetFreePing( void )
{
	ping_t* pingptr;
	ping_t* best;
	int		oldest;
	int		i;
	int		time, msec;

	msec = Sys_Milliseconds();
	pingptr = cl_pinglist;
	for ( i = 0; i < ARRAY_LEN( cl_pinglist ); i++, pingptr++ )
	{
		// find free ping slot
		if ( pingptr->adr.port )
		{
			if ( pingptr->time == 0 )
			{
				if ( msec - pingptr->start < 500 )
				{
					// still waiting for response
					continue;
				}
			}
			else if ( pingptr->time < 500 )
			{
				// results have not been queried
				continue;
			}
		}

		// clear it
		pingptr->adr.port = 0;
		return pingptr;
	}

	// use oldest entry
	pingptr = cl_pinglist;
	best    = cl_pinglist;
	oldest  = INT_MIN;
	for ( i = 0; i < ARRAY_LEN( cl_pinglist ); i++, pingptr++ )
	{
		// scan for oldest
		time = msec - pingptr->start;
		if ( time > oldest )
		{
			oldest = time;
			best   = pingptr;
		}
	}

	return best;
}


/*
==================
CL_Ping_f
==================
*/
static void CL_Ping_f( void ) {
	netadr_t	to;
	ping_t*		pingptr;
	char*		server;
	int			argc;
	netadrtype_t	family = NA_UNSPEC;

	argc = Cmd_Argc();

	if ( argc != 2 && argc != 3 ) {
		Com_Printf( "Usage: ping [-4|-6] server\n");
		return;	
	}
	
	if(argc == 2)
		server = Cmd_Argv(1);
	else
	{
		if(!strcmp(Cmd_Argv(1), "-4"))
			family = NA_IP;
#ifdef USE_IPV6
		else if(!strcmp(Cmd_Argv(1), "-6"))
			family = NA_IP6;
		else
			Com_Printf( "warning: only -4 or -6 as address type understood.\n");
#else
		else
			Com_Printf( "warning: only -4 as address type understood.\n");
#endif
		
		server = Cmd_Argv(2);
	}

	Com_Memset( &to, 0, sizeof( to ) );

	if ( !NET_StringToAdr( server, &to, family ) ) {
		return;
	}

	pingptr = CL_GetFreePing();

	memcpy( &pingptr->adr, &to, sizeof (netadr_t) );
	pingptr->start = Sys_Milliseconds();
	pingptr->time  = 0;

	CL_SetServerInfoByAddress( &pingptr->adr, NULL, 0 );

	NET_OutOfBandPrint( NS_CLIENT, &to, "getinfo xxx" );
}


/*
==================
CL_UpdateVisiblePings_f
==================
*/
qboolean CL_UpdateVisiblePings_f(int source) {
	int			slots, i;
	char		buff[MAX_STRING_CHARS];
	int			pingTime;
	int			max;
	qboolean status = qfalse;

	if (source < 0 || source > AS_FAVORITES) {
		return qfalse;
	}

	cls.pingUpdateSource = source;

	slots = CL_GetPingQueueCount();
	if (slots < MAX_PINGREQUESTS) {
		serverInfo_t *server = NULL;

		switch (source) {
			case AS_LOCAL :
				server = &cls.localServers[0];
				max = cls.numlocalservers;
			break;
			case AS_GLOBAL :
				server = &cls.globalServers[0];
				max = cls.numglobalservers;
			break;
			case AS_FAVORITES :
				server = &cls.favoriteServers[0];
				max = cls.numfavoriteservers;
			break;
			default:
				return qfalse;
		}
		for (i = 0; i < max; i++) {
			if (server[i].visible) {
				if (server[i].ping == -1) {
					int j;


					if (slots >= MAX_PINGREQUESTS) {
						break;
					}
					for (j = 0; j < MAX_PINGREQUESTS; j++) {
						if (!cl_pinglist[j].adr.port) {
							continue;
						}

							if (NET_CompareAdr( &cl_pinglist[j].adr, &server[i].adr)) {
							// already on the list
							break;
						}
					}
					if (j >= MAX_PINGREQUESTS) {
						status = qtrue;
						for (j = 0; j < MAX_PINGREQUESTS; j++) {
							if (!cl_pinglist[j].adr.port) {
								memcpy(&cl_pinglist[j].adr, &server[i].adr, sizeof(netadr_t));
								cl_pinglist[j].start = Sys_Milliseconds();
								cl_pinglist[j].time = 0;
								NET_OutOfBandPrint(NS_CLIENT, &cl_pinglist[j].adr, "getinfo xxx");
								slots++;
								break;
							}
						}
					}
				}
				// if the server has a ping higher than cl_maxPing or
				// the ping packet got lost
				else if (server[i].ping == 0) {
					// if we are updating global servers
					if (source == AS_GLOBAL) {
						//
						if ( cls.numGlobalServerAddresses > 0 ) {
							// overwrite this server with one from the additional global servers
							cls.numGlobalServerAddresses--;
							CL_InitServerInfo(&server[i], &cls.globalServerAddresses[cls.numGlobalServerAddresses]);
							// NOTE: the server[i].visible flag stays untouched
						}
					}
				}
			}
		}
	} 

	if (slots) {
		status = qtrue;
	}
	for (i = 0; i < MAX_PINGREQUESTS; i++) {
		if (!cl_pinglist[i].adr.port) {
			continue;
		}
		CL_GetPing( i, buff, MAX_STRING_CHARS, &pingTime );
		if (pingTime != 0) {
			CL_ClearPing(i);
			status = qtrue;
		}
	}

	return status;
}


/*
==================
CL_ServerStatus_f
==================
*/
static void CL_ServerStatus_f( void ) {
	netadr_t	to, *toptr = NULL;
	char		*server;
	serverStatus_t *serverStatus;
	int			argc;
	netadrtype_t	family = NA_UNSPEC;

	argc = Cmd_Argc();

	if ( argc != 2 && argc != 3 )
	{
		if (cls.state != CA_ACTIVE || clc.demoplaying)
		{
			Com_Printf( "Not connected to a server.\n" );
#ifdef USE_IPV6
			Com_Printf( "Usage: serverstatus [-4|-6] <server>\n" );
#else
			Com_Printf("Usage: serverstatus <server>\n");
#endif
			return;
		}

		toptr = &clc.serverAddress;
	}
	
	if(!toptr)
	{
		Com_Memset( &to, 0, sizeof( to ) );
	
		if(argc == 2)
			server = Cmd_Argv(1);
		else
		{
			if ( !strcmp( Cmd_Argv(1), "-4" ) )
				family = NA_IP;
#ifdef USE_IPV6
			else if ( !strcmp( Cmd_Argv(1), "-6" ) )
				family = NA_IP6;
			else
				Com_Printf( "warning: only -4 or -6 as address type understood.\n" );
#else
			else
				Com_Printf( "warning: only -4 as address type understood.\n" );
#endif
		
			server = Cmd_Argv(2);
		}

		toptr = &to;
		if ( !NET_StringToAdr( server, toptr, family ) )
			return;
	}

	NET_OutOfBandPrint( NS_CLIENT, toptr, "getstatus" );

	serverStatus = CL_GetServerStatus( toptr );
	serverStatus->address = *toptr;
	serverStatus->print = qtrue;
	serverStatus->pending = qtrue;
}


#ifndef __WASM__
/*
==================
CL_ShowIP_f
==================
*/
static void CL_ShowIP_f( void ) {
	Sys_ShowIP();
}
#endif


// TODO: something else for server and dedicated, perhaps download from 
//   list of CDN sources, repacking?
#ifdef USE_CURL

qboolean CL_Download( const char *cmd, const char *pakname, qboolean autoDownload )
{
	char url[MAX_OSPATH];
	char name[MAX_CVAR_VALUE_STRING];
	const char *s;
#ifdef USE_ASYNCHRONOUS
	int dli;
#endif

	if ( cl_dlURL->string[0] == '\0' )
	{
		Com_Printf( S_COLOR_YELLOW "cl_dlURL cvar is not set\n" );
		return qfalse;
	}

	// skip leading slashes
	while ( *pakname == '/' || *pakname == '\\' )
		pakname++;

	// skip gamedir
#ifndef USE_ASYNCHRONOUS
	s = strrchr( pakname, '/' );
	if ( s )
		pakname = s+1;

#else
	
	s = strchr( pakname, '/' );
	if ( s )
		pakname = s+1;

	if(!autoDownload) {
		int i;
		int empty = -1;
		for(i = 0; i < 10; i++) {
			if(!Com_DL_InProgress(&cl_downloads[i])) {
				empty = i;
			} else if (!Q_stricmp(cl_downloads[i].Name, pakname)) {
				// already found in current downloads
				//Com_Printf("already in list: %i, %s != %s\n", i, cl_downloads[i].Name, pakname);
				return qfalse;
			} else {
			}
		}
		if(empty == -1) {
			// still downloading in all slots!
			//Com_Printf("already downloading: %s\n", pakname);
			return qfalse;
		} else {
			// why does Com_DL_InProgress() return false but we haven't finished downloading?
			assert(cl_downloads[i].Name[0] == '\0' || cl_downloads[empty].Completed); // god fucking damnit
			dli = empty;
		}
	}


	if( !Q_stricmp( cmd, "lazydl" ) ) {
		// must be looking for a directory index
	} else
#endif
	if ( !Com_DL_ValidFileName( pakname ) )
	{
		Com_Printf( S_COLOR_YELLOW "invalid file name: '%s'.\n", pakname );
		return qfalse;
	}

	if ( !Q_stricmp( cmd, "dlmap" ) )
	{
		Q_strncpyz( name, pakname, sizeof( name ) );
		FS_StripExt( name, ".pk3" );
		if ( !name[0] )
			return qfalse;
		s = va( "maps/%s.bsp", name );
		if ( FS_FileIsInPAK( s, NULL, url ) )
		{
			Com_Printf( S_COLOR_YELLOW " map %s already exists in %s.pk3\n", name, url );
			return qfalse;
		}
	}

#ifdef USE_ASYNCHRONOUS
	if(!autoDownload)
		return Com_DL_Begin( &cl_downloads[dli], pakname, cl_dlURL->string, autoDownload );
#endif	
	return Com_DL_Begin( &download, pakname, cl_dlURL->string, autoDownload );
}

#endif // USE_CURL


/*
==================
CL_Download_f
==================
*/
static void CL_Download_f( void )
{
	if ( Cmd_Argc() < 2 || *Cmd_Argv( 1 ) == '\0' )
	{
		Com_Printf( "Usage: %s <mapname>\n", Cmd_Argv( 0 ) );
		return;
	}

#if defined(USE_CURL) || defined(__WASM__)
	if ( !strcmp( Cmd_Argv(1), "-" ) )
	{
#ifdef USE_CURL
		Com_DL_Cleanup( &download );
#endif
		return;
	}

	CL_Download( Cmd_Argv( 0 ), Cmd_Argv( 1 ), qfalse );
#endif
}


#ifdef USE_MV

void CL_Multiview_f( void ) {
#ifdef USE_MULTIVM_CLIENT
	int igs = clc.currentView;
#endif

	if ( cls.state != CA_ACTIVE || !cls.servername[0] || clc.demoplaying ) {
		Com_Printf( "Not connected.\n" );
		return;
	}

	if ( atoi( Info_ValueForKey( cl.gameState.stringData + cl.gameState.stringOffsets[ CS_SERVERINFO ], "mvproto" ) ) != MV_PROTOCOL_VERSION ) {
		Com_Printf( S_COLOR_YELLOW "Remote server does not support this function.\n" );
		return;
	}

	CL_AddReliableCommand( Cmd_Argv( 0 ), qfalse );
}


void CL_MultiviewFollow_f( void ) {
	int clientNum;
#ifdef USE_MULTIVM_CLIENT
	int igs = clc.currentView;
#endif

	if ( !cl.snap.multiview ) {
		Com_Printf("Not a multiview snapshot.\n");
		return;
	}

	clientNum = atoi( Cmd_Argv( 1 ) );

	if ( (unsigned)clientNum >= MAX_CLIENTS ) {
		Com_Printf("Multiview client out of range.\n");
		return;
	}

	if ( GET_ABIT( cl.snap.clientMask, clientNum ) )
#ifdef USE_MULTIVM_CLIENT
		clientWorlds[clc.currentView] = clientNum;
#else
		clientWorlds[0] = clientNum;
#endif
	else 
		Com_Printf("Multiview client not available.\n");
}

#endif // USE_MV
