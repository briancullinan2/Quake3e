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
// client.h -- primary header for client

#include "../qcommon/q_shared.h"
#include "../qcommon/qcommon.h"
#include "../qcommon/vm_local.h"
#include "../renderercommon/tr_public.h"
#include "../ui/ui_public.h"
#include "keys.h"
#include "snd_public.h"
#include "../cgame/cg_public.h"
#include "../game/bg_public.h"

#ifdef USE_PRINT_CONSOLE
#undef Com_Printf
#undef Com_DPrintf
#define Com_Printf CL_Printf
#define Com_DPrintf CL_DPrintf
#endif

#ifdef USE_CURL
#include "cl_curl.h"
#endif /* USE_CURL */

#ifdef USE_CURL
//#define	USE_LNBITS	1
#else
#ifdef __WASM__
//#define	USE_LNBITS	1
#else
#ifdef USE_LNBITS
#undef USE_LNBITS
#endif
#endif
#endif

// file full of random crap that gets used to create cl_guid
#define QKEY_FILE "qkey"
#define QKEY_SIZE 2048

#define	RETRANSMIT_TIMEOUT	3000	// time between connection packet retransmits

// snapshots are a view of the server at a given time
typedef struct {
	qboolean		valid;			// cleared if delta parsing was invalid
	int				snapFlags;		// rate delayed and dropped commands

	int				serverTime;		// server time the message is valid for (in msec)

	int				messageNum;		// copied from netchan->incoming_sequence
	int				deltaNum;		// messageNum the delta is from
	int				ping;			// time from when cmdNum-1 was sent to time packet was reeceived
	int				areabytes;
	byte			areamask[MAX_MAP_AREA_BYTES];		// portalarea visibility bits

	int				cmdNum;			// the next cmdNum the server is expecting
	playerState_t	ps;						// complete information about the current player at this time

	int				numEntities;			// all of the entities that need to be presented
	int				parseEntitiesNum;		// at the time of this snapshot

	int				serverCommandNum;		// execute all commands up to this before

// making the snapshot current
#ifdef USE_MV
	struct {
		int				areabytes;
		byte			areamask[MAX_MAP_AREA_BYTES]; // portalarea visibility bits
		byte			entMask[MAX_GENTITIES/8];
		playerState_t	ps;
		qboolean		valid;
	} clps[ MAX_CLIENTS ];
	qboolean	multiview;
	int			version;
	int			mergeMask;
	byte		clientMask[MAX_CLIENTS/8];
#endif // USE_MV
#ifdef USE_MULTIVM_CLIENT
	int     world;
#endif

} clSnapshot_t;



/*
=============================================================================

the clientActive_t structure is wiped completely at every
new gamestate_t, potentially several times during an established connection

=============================================================================
*/

typedef struct {
	int		p_cmdNumber;		// cl.cmdNumber when packet was sent
	int		p_serverTime;		// usercmd->serverTime when packet was sent
	int		p_realtime;			// cls.realtime when packet was sent
} outPacket_t;

// the parseEntities array must be large enough to hold PACKET_BACKUP frames of
// entities, so that when a delta compressed message arives from the server
// it can be un-deltad from the original 
#ifdef USE_MV
#define	MAX_PARSE_ENTITIES	( PACKET_BACKUP * MAX_GENTITIES )
#else
#define	MAX_PARSE_ENTITIES	( PACKET_BACKUP * MAX_SNAPSHOT_ENTITIES )
#endif

extern int g_console_field_width;

typedef struct {
	int			timeoutcount;		// it requres several frames in a timeout condition
									// to disconnect, preventing debugging breaks from
									// causing immediate disconnects on continue
#ifdef USE_MULTIVM_CLIENT
  clSnapshot_t	snapWorlds[MAX_NUM_VMS];			// latest received from server
#define snap snapWorlds[igs]
int			serverTimes[MAX_NUM_VMS];
// can't use pre-compile because serverTime also exists in cl.snap.serverTime
int			oldServerTimes[MAX_NUM_VMS];
#define oldServerTime oldServerTimes[igs]
int			oldFrameServerTimes[MAX_NUM_VMS];
#define oldFrameServerTime oldFrameServerTimes[igs]
int			serverTimeDeltas[MAX_NUM_VMS];
#define serverTimeDelta serverTimeDeltas[igs]
#else
	clSnapshot_t	snap;			// latest received from server
  int			serverTime;			// may be paused during play
	int			oldServerTime;		// to prevent time from flowing bakcwards
	int			oldFrameServerTime;	// to check tournament restarts
	int			serverTimeDelta;	// cl.serverTime = cls.realtime + cl.serverTimeDelta
									// this value changes as net lag varies
#endif

	qboolean	extrapolatedSnapshot;	// set if any cgame frame has been forced to extrapolate
									// cleared when CL_AdjustTimeDelta looks at it
	qboolean	newSnapshots;		// set on parse of any valid packet

#ifdef USE_MULTIVM_CLIENT
	gameState_t	gameStates[MAX_NUM_VMS];			// configstrings
#define gameState gameStates[igs]
#else
  gameState_t	gameState;			// configstrings
#endif
	char		mapname[MAX_QPATH];	// extracted from CS_SERVERINFO

#ifdef USE_MULTIVM_CLIENT
	int			parseEntitiesNumWorlds[MAX_NUM_VMS];	// index (not anded off) into cl_parse_entities[]
#else
  int			parseEntitiesNum;	// index (not anded off) into cl_parse_entities[]
#endif

	int			mouseDx[2], mouseDy[2];	// added to by mouse events
	int			mouseIndex;
	int			joystickAxis[MAX_JOYSTICK_AXIS];	// set by joystick events

	// cgame communicates a few values to the client system
#ifdef USE_MULTIVM_CLIENT
	int			cgameUserCmdValue[MAX_NUM_VMS];	// current weapon to add to usercmd_t
#define cgameUserCmdValue cgameUserCmdValue[igvm]
#else
  int			cgameUserCmdValue;	// current weapon to add to usercmd_t
#endif

	float		cgameSensitivity;

	// cmds[cmdNumber] is the predicted command, [cmdNumber-1] is the last
	// properly generated command
#ifdef USE_MULTIVM_CLIENT
	usercmd_t	cmdWorlds[MAX_NUM_VMS][CMD_BACKUP];	// each mesage will send several old cmds
#define cmds         cmdWorlds[igvm]  // `igvm` because it is based on number of client VMs, not server worlds
  int			cmdNumber;			// incremented each frame, because multiple
  int     clCmdNumbers[MAX_NUM_VMS];
#else
  usercmd_t	cmds[CMD_BACKUP];	// each mesage will send several old cmds
  int			cmdNumber;			// incremented each frame, because multiple
#endif
									// frames may need to be packed into a single packet

	outPacket_t	outPackets[PACKET_BACKUP];	// information about each packet we have sent out

	// the client maintains its own idea of view angles, which are
	// sent to the server each frame.  It is cleared to 0 upon entering each level.
	// the server sends a delta each frame which is added to the locally
	// tracked view angles to account for standing on rotating objects,
	// and teleport direction changes
	vec3_t		viewangles;

	int			serverId;			// included in each client message so the server
												// can tell if it is for a prior map_restart
	// big stuff at end of structure so most offsets are 15 bits or less
#ifdef USE_MULTIVM_CLIENT
	clSnapshot_t	snapshotWorlds[MAX_NUM_VMS][PACKET_BACKUP];
#define snapshots snapshotWorlds[igs] // `igs` because it is based on number of server worlds, not cgames
	entityState_t	entityBaselines[MAX_NUM_VMS][MAX_GENTITIES];	// for delta compression when not in previous frame
#define entityBaselines entityBaselines[igs]
	entityState_t	parseEntities[MAX_NUM_VMS][MAX_PARSE_ENTITIES];
#define parseEntities parseEntities[igs]
	byte			baselineUsed[MAX_NUM_VMS][MAX_GENTITIES];
#define baselineUsed baselineUsed[igs]
#else
  clSnapshot_t	snapshots[PACKET_BACKUP];

  entityState_t	entityBaselines[MAX_GENTITIES];	// for delta compression when not in previous frame

  entityState_t	parseEntities[MAX_PARSE_ENTITIES];

  byte			baselineUsed[MAX_GENTITIES];
#endif
} clientActive_t;

extern	clientActive_t		cl;

#define EM_GAMESTATE 1
#define EM_SNAPSHOT  2
#define EM_COMMAND   4

/*
=============================================================================

the clientConnection_t structure is wiped when disconnecting from a server,
either to go to a full screen console, play a demo, or connect to a different server

A connection can be to either a server through the network layer or a
demo through a file.

=============================================================================
*/

typedef struct demoIndex_s
{
	int serverTime;
	int offset;
	entityState_t	entities[MAX_GENTITIES];
} demoIndex_t;

typedef struct {

	int			clientNum;
#ifdef USE_MV
	int			zexpectDeltaSeq;			// for compressed server commands
#endif
#ifdef USE_MULTIVM_CLIENT
	int     currentView; // force the client to load a new VM
#endif
	int			lastPacketSentTime;			// for retransmits during connection
	int			lastPacketTime;				// for timeouts

	netadr_t	serverAddress;
	int			connectTime;				// for connection retransmits
	int			connectPacketCount;			// for display on connection dialog
	char		serverMessage[MAX_STRING_CHARS]; // for display on connection dialog

	int			challenge;					// from the server to use for connecting
	int			checksumFeed;				// from the server for checksum calculations

	// these are our reliable messages that go to the server
	int			reliableSequence;
	int			reliableAcknowledge;		// the last one the server has executed
	char		reliableCommands[MAX_RELIABLE_COMMANDS][MAX_STRING_CHARS];

	// server message (unreliable) and command (reliable) sequence
	// numbers are NOT cleared at level changes, but continue to
	// increase as long as the connection is valid

	// message sequence is used by both the network layer and the
	// delta compression layer
	int			serverMessageSequence;

	// reliable messages received from server
	int			serverCommandSequence;
	int			lastExecutedServerCommand;		// last server command grabbed or executed with CL_GetServerCommand
	char		serverCommands[MAX_RELIABLE_COMMANDS][MAX_STRING_CHARS];
	qboolean	serverCommandsIgnore[MAX_RELIABLE_COMMANDS];

	// file transfer from server
	fileHandle_t download;
	char		downloadName[MAX_OSPATH];
	char		downloadTempName[MAX_OSPATH + 4]; // downloadName + ".tmp"
	int			sv_allowDownload;

  qboolean isMultiGame;

#ifdef USE_MULTIVM_CLIENT
	char    *world;
#endif
	char		sv_dlURL[MAX_CVAR_VALUE_STRING];
	int			downloadNumber;
	int			downloadBlock;	// block we are waiting for
	int			downloadCount;	// how many bytes we got
	int			downloadSize;	// how many bytes we got
	char		downloadList[BIG_INFO_STRING]; // list of paks we need to download
#ifdef __WASM__
	qboolean  dlDisconnect;
#endif
	qboolean	downloadRestart;	// if true, we need to do another FS_Restart because we downloaded a pak

#ifdef USE_CURL
	qboolean	cURLEnabled;
	qboolean	cURLUsed;
	qboolean	cURLDisconnected;
	char		downloadURL[MAX_OSPATH];
	CURL		*downloadCURL;
	CURLM		*downloadCURLM;
#endif /* USE_CURL */

	// demo information
	char		demoName[MAX_OSPATH];
	char		recordName[MAX_OSPATH]; // without extension
	qboolean	explicitRecordName;
	char		recordNameShort[TRUNCATE_LENGTH]; // for recording message
	qboolean	dm68compat;
	qboolean	spDemoRecording;
	qboolean	demorecording;
	qboolean	demoplaying;
	qboolean	demowaiting;	// don't record until a non-delta message is received
	qboolean	firstDemoFrameSkipped;
#ifdef USE_MULTIVM_CLIENT
  fileHandle_t	demofiles[MAX_NUM_VMS];
#define demofile demofiles[igs]
  int			      numDemoIndexes[MAX_NUM_VMS];
#define numDemoIndex numDemoIndexes[igs]
  demoIndex_t  *demoIndexes[MAX_NUM_VMS];
#define demoIndex demoIndexes[igs]
#else
	fileHandle_t	demofile;
  int			      numDemoIndex;
	demoIndex_t  *demoIndex;
#endif
	fileHandle_t	recordfile;

	int		timeDemoFrames;		// counter of rendered frames
	int		timeDemoStart;		// cls.realtime before first frame
	int		timeDemoBaseTime;	// each frame will be at this time + frameNum * 50

	float	aviVideoFrameRemainder;
	float	aviSoundFrameRemainder;
  int		aviFrameEndTime;
	char	videoName[MAX_QPATH];
	int		videoIndex;

	// big stuff at end of structure so most offsets are 15 bits or less
	netchan_t	netchan;

	qboolean compat;

	// simultaneous demo playback and recording
	int		eventMask;
	int		demoCommandSequence;
	int		demoDeltaNum;
	int		demoMessageSequence;

} clientConnection_t;

extern	clientConnection_t clc;

/*
==================================================================

the clientStatic_t structure is never wiped, and is used even when
no client connection is active at all

==================================================================
*/

typedef struct {
	netadr_t	adr;
	int			start;
	int			time;
	char		info[MAX_INFO_STRING];
} ping_t;

typedef struct {
	netadr_t	adr;
	char	  	hostName[MAX_NAME_LENGTH];
	char	  	mapName[MAX_NAME_LENGTH];
	char	  	game[MAX_NAME_LENGTH];
	int			netType;
	int			gameType;
	int		  	clients;
	int		  	maxClients;
	int			minPing;
	int			maxPing;
	int			ping;
	qboolean	visible;
	int			punkbuster;
	int			g_humanplayers;
	int			g_needpass;
} serverInfo_t;

#ifdef USE_VID_FAST

#define MAX_PATCHES  8

typedef enum {
	PATCH_NONE,
	PATCH_XSCALE,
	PATCH_YSCALE,
	PATCH_BIAS
} patch_type_t;

typedef struct patch_s {
	patch_type_t type;
	void *addr;
} patch_t;

#endif

typedef struct {
	connstate_t	state;				// connection status
	qboolean	gameSwitch;

	qboolean	cddialog;			// bring up the cd needed dialog next frame

	char		servername[MAX_OSPATH];		// name of server from original connect (used by reconnect)

	// when the server clears the hunk, all of these must be restarted
	qboolean	rendererStarted;
	qboolean	soundStarted;
	qboolean  firstClick;
	qboolean	soundRegistered;
	qboolean	uiStarted;
	qboolean	rmlStarted;
	qboolean	cgameStarted;

	int			framecount;
	int			frametime;			// msec since last frame

	int			realtime;			// ignores pause
	int			realFrametime;		// ignoring pause, so console always works

	int			numlocalservers;
	serverInfo_t	localServers[MAX_OTHER_SERVERS];

	int			numglobalservers;
	serverInfo_t  globalServers[MAX_GLOBAL_SERVERS];
	// additional global servers
	int			numGlobalServerAddresses;
	netadr_t		globalServerAddresses[MAX_GLOBAL_SERVERS];

	int			numfavoriteservers;
	serverInfo_t	favoriteServers[MAX_OTHER_SERVERS];

	int pingUpdateSource;		// source currently pinging or updating

	// update server info
	netadr_t	updateServer;
	char		updateChallenge[MAX_TOKEN_CHARS];
	char		updateInfoString[MAX_INFO_STRING];

	netadr_t	authorizeServer;

	// rendering info
	glconfig_t	glconfig;
	qhandle_t	charSetShader;
	qhandle_t	whiteShader;
	qhandle_t	consoleShader;
  qhandle_t	lagometerShader;
#ifdef USE_LNBITS
	qhandle_t qrCodeShader;
#endif

	int			lastVidRestart;
	int			soundMuted;

	qboolean	startCgame;

	int			captureWidth;
	int			captureHeight;

	float		scale;
	float		biasX;
	float		biasY;

	float		 cursorx;
	float    cursory;
	qboolean postgame;
#ifdef USE_VID_FAST
	glconfig_t *uiGlConfig;

	patch_t uiPatches[MAX_PATCHES];
	unsigned numUiPatches;

	// the cgame scales are normally stuffed somewhere inbetween
	// cgameGlConfig and cgameFirstCvar
	glconfig_t *cgameGlConfig;
	vmCvar_t *cgameFirstCvar;

	patch_t cgamePatches[MAX_PATCHES];
	unsigned numCgamePatches;
#endif

  qboolean synchronousClients;
  int meanPing;

} clientStatic_t;

extern int bigchar_width;
extern int bigchar_height;
extern int smallchar_width;
extern int smallchar_height;

extern	clientStatic_t		cls;

extern	char		cl_oldGame[MAX_QPATH];
extern	qboolean	cl_oldGameSet;

#ifdef USE_CURL

extern		download_t	download;
qboolean	Com_DL_Perform( download_t *dl );
void		Com_DL_Cleanup( download_t *dl );
qboolean	Com_DL_Begin( download_t *dl, const char *localName, const char *remoteURL, qboolean autoDownload );
qboolean	Com_DL_InProgress( const download_t *dl );
qboolean	Com_DL_ValidFileName( const char *fileName );
qboolean	CL_Download( const char *cmd, const char *pakname, qboolean autoDownload );

#endif

//=============================================================================

extern	refexport_t		re;		// interface to refresh .dll


//
// cvars
//
extern	cvar_t	*cl_noprint;
extern	cvar_t	*cl_debugMove;
extern	cvar_t	*cl_timegraph;
extern	cvar_t	*cl_shownet;
extern	cvar_t	*cl_autoNudge;
extern	cvar_t	*cl_timeNudge;
extern	cvar_t	*cl_showTimeDelta;

extern	cvar_t	*com_timedemo;
extern	cvar_t	*cl_aviFrameRate;
extern	cvar_t	*cl_aviMotionJpeg;
extern	cvar_t	*cl_aviPipeFormat;

extern	cvar_t	*cl_activeAction;

#ifdef USE_DRAGDROP
extern  cvar_t  *cl_dropAction;
#endif
#ifdef USE_ABS_MOUSE
extern  cvar_t  *in_mouseAbsolute;
#endif
#ifdef USE_MULTIVM_CLIENT
extern  cvar_t  *cl_mvHighlight;
#endif
#ifdef USE_LNBITS
extern  cvar_t	*cl_lnInvoice;
#endif
extern	cvar_t	*cl_allowDownload;
#ifdef USE_CURL
extern	cvar_t	*cl_mapAutoDownload;
extern	cvar_t	*cl_dlDirectory;
#endif
extern	cvar_t	*cl_conXOffset;
extern	cvar_t	*cl_conColor;
extern	cvar_t	*cl_inGameVideo;

extern	cvar_t	*cl_lanForcePackets;
extern	cvar_t	*cl_autoRecordDemo;

extern	cvar_t	*com_maxfps;

extern	cvar_t	*vid_xpos;
extern	cvar_t	*vid_ypos;
extern	cvar_t	*r_noborder;

extern	cvar_t	*r_allowSoftwareGL;
extern	cvar_t	*r_swapInterval;
extern	cvar_t	*r_glDriver;

extern	cvar_t	*r_displayRefresh;
extern	cvar_t	*r_fullscreen;
extern	cvar_t	*r_mode;
extern	cvar_t	*r_modeFullscreen;
extern	cvar_t	*r_customwidth;
extern	cvar_t	*r_customheight;
extern	cvar_t	*r_customPixelAspect;
extern	cvar_t	*r_colorbits;
extern	cvar_t	*cl_stencilbits;
extern	cvar_t	*cl_depthbits;
extern	cvar_t	*cl_drawBuffer;
extern  cvar_t  *cl_snaps;
extern  cvar_t  *cl_drawFPS;
extern  cvar_t  *cl_lagometer;
extern  cvar_t  *cl_nopredict;

//=================================================

//
// cl_main
//
#ifdef USE_MULTIVM_CLIENT
void CL_World_f( void );
#endif
void CL_AddReliableCommand( const char *cmd, qboolean isDisconnectCmd );

void CL_StartHunkUsers( void );

void CL_Disconnect_f( void );
void CL_ReadDemoMessage( void );
extern int serverShift;
void CL_StopRecord_f( void );

void CL_InitDownloads( void );
void CL_NextDownload( void );

void CL_GetPing( int n, char *buf, int buflen, int *pingtime );
void CL_GetPingInfo( int n, char *buf, int buflen );
void CL_ClearPing( int n );
int CL_GetPingQueueCount( void );

void CL_ClearState( void );

int CL_ServerStatus( const char *serverAddress, char *serverStatusString, int maxLen );

qboolean CL_CheckPaused( void );
qboolean CL_NoDelay( void );

qboolean CL_GetModeInfo( int *width, int *height, float *windowAspect, int mode, const char *modeFS, int dw, int dh, qboolean fullscreen );

void CL_LoadVM_f( void );

//
// cl_input
//
void CL_InitInput( void );
void CL_ClearInput( void );
void CL_SendCmd( void );
void CL_WritePacket( void );

//
// cl_keys.c
//
extern  field_t     chatField;
extern  field_t     g_consoleField;

void Field_Draw( field_t *edit, int x, int y, int width, qboolean showCursor, qboolean noColorEscape );
void Field_BigDraw( field_t *edit, int x, int y, int width, qboolean showCursor, qboolean noColorEscape );

//
// cl_parse.c
//
extern int cl_connectedToPureServer;
extern int cl_connectedToCheatServer;

void CL_ParseServerInfo( int igs );
void CL_ParseServerMessage( msg_t *msg );
void CL_ParseSnapshot( msg_t *msg, qboolean multiview );

//====================================================================

qboolean CL_UpdateVisiblePings_f( int source );
qboolean CL_ValidPakSignature( const byte *data, int len );


//
// console
//
void Con_CheckResize( void );
void Con_Init( void );
void Con_Shutdown( void );
void Con_ToggleConsole_f( void );
void Con_DrawNotify( void );
void Con_ClearNotify( void );
void Con_RunConsole( void );
void Con_DrawConsole( void );
void Con_PageUp( int lines );
void Con_PageDown( int lines );
void Con_Top( void );
void Con_Bottom( void );
void Con_Close( void );

void CL_LoadConsoleHistory( void );
void CL_SaveConsoleHistory( void );

//
// cl_scrn.c
//
void	SCR_Init (void);
void	SCR_UpdateScreen (qboolean fromVM);

void	SCR_DebugGraph( float value );

int		SCR_GetBigStringWidth( const char *str );	// returns in virtual 640x480 coordinates

void	SCR_AdjustFrom640( float *x, float *y, float *w, float *h );
void	SCR_FillRect( float x, float y, float width, float height, 
					 const float *color );
void	SCR_DrawPic( float x, float y, float width, float height, qhandle_t hShader );
void	SCR_DrawNamedPic( float x, float y, float width, float height, const char *picname );

void	SCR_DrawBigString( int x, int y, const char *s, float alpha, qboolean noColorEscape );			// draws a string with embedded color control characters with fade
void	SCR_DrawStringExt( int x, int y, float size, const char *string, const float *setColor, qboolean forceColor, qboolean noColorEscape );
void	SCR_DrawSmallStringExt( int x, int y, const char *string, const float *setColor, qboolean forceColor, qboolean noColorEscape );
void	SCR_DrawSmallChar( int x, int y, int ch );
void	SCR_DrawSmallString( int x, int y, const char *s, int len );

//
// cl_cin.c
//

void CL_PlayCinematic_f( void );
void SCR_DrawCinematic (void);
void SCR_RunCinematic (void);
void SCR_StopCinematic (void);
int CIN_PlayCinematic( const char *arg0, int xpos, int ypos, int width, int height, int bits);
e_status CIN_StopCinematic(int handle);
e_status CIN_RunCinematic (int handle);
e_status CIN_RunCinematic_Fake (int handle);
void CIN_DrawCinematic (int handle);
void CIN_SetExtents (int handle, int x, int y, int w, int h);
void CIN_UploadCinematic(int handle);
void CIN_CloseAllVideos(void);

//
// cl_cgame.c
//
extern int clientMaps[MAX_NUM_VMS];
extern float clientScreens[MAX_NUM_VMS][4];
extern int clientWorlds[MAX_NUM_VMS];
extern int clientGames[MAX_NUM_VMS];

#ifdef USE_LAZY_LOAD
// TODO: make these work on native, by checking files.c for rediness or something?
void CL_UpdateShader( void );
void CL_UpdateSound( void );
void CL_UpdateModel( void );
#endif
#ifdef __WASM__
void CL_InitCGameFinished( void );
#endif
void CL_InitCGame( int igvm );
void CL_ShutdownCGame( void );
qboolean CL_GameCommand( int igvm );
void CL_CGameRendering( stereoFrame_t stereo );
void CL_SetCGameTime( void );

//
// cl_ui.c
//
void CL_InitUI( qboolean createNew );
void CL_ShutdownRmlUi( void );
void CL_InitRmlUi( void );
void CL_UIContextRender(void);
void CL_ShutdownUI( void );
int Key_GetCatcher( void );
void Key_SetCatcher( int catcher );
void LAN_LoadCachedServers( void );
void LAN_SaveServersToCache( void );


//
// cl_net_chan.c
//
void CL_Netchan_Transmit( netchan_t *chan, msg_t *msg );
qboolean CL_Netchan_Process( netchan_t *chan, msg_t *msg );

//
// cl_avi.c
//
extern byte *previousFrame;
extern byte *captureBuffer;
extern byte *encodeBuffer;
qboolean CL_OpenAVIForWriting( const char *filename, qboolean pipe );
void CL_TakeVideoFrame( void );
void CL_WriteAVIVideoFrame( const byte *imageBuffer, int size );
void CL_WriteAVIAudioFrame( const byte *pcmBuffer, int size );
qboolean CL_CloseAVI( void );
qboolean CL_VideoRecording( void );

//
// cl_jpeg.c
//
size_t	CL_SaveJPGToBuffer( byte *buffer, size_t bufSize, int quality, int image_width, int image_height, byte *image_buffer, int padding );
void	CL_SaveJPG( const char *filename, int quality, int image_width, int image_height, byte *image_buffer, int padding );
void	CL_LoadJPG( const char *filename, unsigned char **pic, int *width, int *height );

// platform-specific
void	GLimp_Init( glconfig_t *config );
void	GLimp_Shutdown( qboolean unloadDLL );
void	GLimp_EndFrame( void );

void  GLimp_UpdateMode( glconfig_t *config );
void	GLimp_InitGamma( glconfig_t *config );
void	GLimp_SetGamma( unsigned char red[256], unsigned char green[256], unsigned char blue[256] );
void IN_ShowKeyboard (void);

void	*GL_GetProcAddress( const char *name );

// Vulkan
#ifdef USE_VULKAN_API
void	VKimp_Init( glconfig_t *config );
void	VKimp_Shutdown( qboolean unloadDLL );
void	*VK_GetInstanceProcAddr( VkInstance instance, const char *name );
qboolean VK_CreateSurface( VkInstance instance, VkSurfaceKHR* pSurface );
#endif
