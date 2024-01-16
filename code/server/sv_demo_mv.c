
#include "server.h"

#ifdef USE_MV

#define MV_CACHE_FILE "demos/mv-cache.dat"
#define MV_FILTER "/mv-*-*.dm_71"

int mv_record_count;
int mv_total_size;
int mv_insert_index;

typedef struct {
	char name[28];
	int  size;
} mv_file_record_t;
mv_file_record_t mvrecords[ MAX_MV_FILES ];


static void SV_TrimRecords( int add_count, int add_size );

static void SV_CreateRecordCache( void )
{
	mv_file_record_t *mvr;
	int nfiles, i, len, size;
	char **list, *name;

	//Com_Printf( S_COLOR_CYAN "...creating record cache\n" );

	mv_insert_index = mv_record_count;
	mv_record_count = 0;
	mv_total_size = 0;

	Com_Memset( mvrecords, 0, sizeof( mvrecords ) );
	list = FS_ListFiles( "demos", ".dm_71", &nfiles );
	for ( i = 0; i < nfiles; i++ ) 
	{
		name = list[i];
		if ( name[0] == '\\' || name[0] == '/' )
			name++;
		len = (int)strlen( list[i] );
		if ( len < 22 || len >= sizeof( mvr->name ) )
			continue;

		size = FS_SV_FOpenFileRead( va( "demos/%s", name ), NULL );
		if ( size <= 0 )
			continue;

		mvr = &mvrecords[ mv_record_count ];
		mvr->size = PAD( size, 4096 );
		strcpy( mvr->name, name );
			
		mv_total_size += mvr->size;

		mv_record_count++;

		if ( mv_record_count >= MAX_MV_FILES )
			break;
	}
	FS_FreeFileList( list );

	mv_insert_index = mv_record_count;
	mv_insert_index &= (MAX_MV_FILES-1);
}


/*
==================
SV_LoadRecordCache
==================
*/
void SV_LoadRecordCache( void ) 
{
	mv_file_record_t *mvr;
	fileHandle_t fh;
	int fileSize, i;

	mv_record_count = 0;
	mv_insert_index = 0;
	mv_total_size = 0;

	fileSize = FS_SV_FOpenFileRead( MV_CACHE_FILE, &fh );
	if ( fh == FS_INVALID_HANDLE )
	{
		SV_CreateRecordCache();
		SV_TrimRecords( 0, 0 );
		return;
	}

	if ( fileSize != sizeof( mvrecords ) )
	{
		FS_FCloseFile( fh );
		SV_CreateRecordCache();
		SV_TrimRecords( 0, 0 );
		return;
	}

	//Com_Printf( S_COLOR_CYAN "...reading record cache from file\n" );
	FS_Read( mvrecords, sizeof( mvrecords ), fh );
	FS_FCloseFile( fh );

	mvr = mvrecords;
	for ( i = 0; i < MAX_MV_FILES; i++, mvr++ )
	{
		if ( !mvr->name[0] || mvr->size <= 0 )
			break;
		mv_total_size += PAD( mvr->size, 4096 );
	}

	mv_record_count = i;
	mv_insert_index = i & (MAX_MV_FILES-1);

	SV_TrimRecords( 0, 0 );

	//Com_Printf( S_COLOR_CYAN "cache: %i items, %i bytes\n", mv_record_count, mv_total_size );
}


void SV_SaveRecordCache( void )
{
	mv_file_record_t z;
	fileHandle_t fh;
	int start;
	int n, count, pad;

	if(!FS_Initialized()) return;

	fh = FS_FOpenFileWrite( MV_CACHE_FILE );
	if ( fh == FS_INVALID_HANDLE ) 
		return;

	count = mv_record_count;
	if ( count > MAX_MV_FILES )
		count = MAX_MV_FILES;

	pad = MAX_MV_FILES - count;
	Com_Memset( &z, 0, sizeof( z ) );

	start = ( mv_insert_index - count ) & (MAX_MV_FILES-1);
	//Com_Printf( S_COLOR_CYAN "writing %i cache records from %i\n", count, start );

	while ( count > 0 )
	{
		n = count;
		if ( start + n > MAX_MV_FILES )
			n = MAX_MV_FILES - start;

		FS_Write( &mvrecords[ start ], sizeof( mv_file_record_t ) * n, fh );
		start = ( start + n ) & (MAX_MV_FILES-1);
		count -= n;
	}

	for ( n = 0; n < pad; n++ )
	{
		FS_Write( &z, sizeof( z ), fh );
	}

	FS_FCloseFile( fh );
}


static void SV_TrimRecords( int add_count, int add_size )
{
	int max_count;
	mv_file_record_t *mvr;

	//Com_Printf( S_COLOR_YELLOW "trim records count:%i size%i\n", mv_record_count, mv_total_size );

	// by file count
	if (  sv_mvFileCount->integer > 0 || mv_record_count + add_count > MAX_MV_FILES )
	{
		if ( sv_mvFileCount->integer > 0 && sv_mvFileCount->integer < MAX_MV_FILES )
			max_count = sv_mvFileCount->integer;
		else
			max_count = MAX_MV_FILES;

		while ( mv_record_count + add_count > max_count && mv_record_count > 0 )
		{
				mvr = mvrecords + (( mv_insert_index - mv_record_count ) & (MAX_MV_FILES-1));
				//Com_Printf( S_COLOR_RED "trim.count %i %s\n", mvr->size, mvr->name );
				if ( mvr->name[0] ) 
				{
					FS_HomeRemove( va( "demos/%s", mvr->name ) );
					mv_total_size -= mvr->size;
				}
				Com_Memset( mvr, 0, sizeof( *mvr ) );
				mv_record_count--;
		}
	}

	// by total size
	if ( sv_mvFolderSize->integer > 0 )
	{
		while ( (mv_total_size + add_size) > (sv_mvFolderSize->integer * 1024 * 1024) && mv_record_count > 0 ) 
		{
				mvr = mvrecords + (( mv_insert_index - mv_record_count ) & (MAX_MV_FILES-1));
				//Com_Printf( S_COLOR_RED "trim.size %i %s\n", mvr->size, mvr->name );
				if ( mvr->name[0] ) 
				{
					FS_HomeRemove( va( "demos/%s", mvr->name ) );
					mv_total_size -= mvr->size;
				}
				Com_Memset( mvr, 0, sizeof( *mvr ) );
				mv_record_count--;
		}
	}
}


static void SV_InsertFileRecord( const char *name )
{
	mv_file_record_t *mvr;
	int size, len;
	
	if ( !Q_stricmpn( name, "demos/", 6 ) )
		name += 5;
	else
		return;

	if ( !Com_FilterPath( MV_FILTER, name ) ) {
		//Com_Printf( "filtered %s\n", name );
		return;
	}
	name++; // skip '/'
	
	len = strlen( name );
	if ( len < 22 || len >= sizeof( mvr->name ) ) {
		//Com_Printf( "filtered1 %s\n", name );
		return;
	}

	size = FS_SV_FOpenFileWrite( va( "demos/%s", name ) );
	if ( size <= 0 ) {
		return;
	}

	size = PAD( size, 4096 );

	SV_TrimRecords( 1, size );

	mvr = &mvrecords[ mv_insert_index ];
	strcpy( mvr->name, name );
	mvr->size = size;

	mv_total_size += mvr->size;
	mv_insert_index = ( mv_insert_index + 1 ) & (MAX_MV_FILES-1);

	if ( mv_record_count < MAX_MV_FILES )
		mv_record_count++;

	//Com_Printf( S_COLOR_CYAN "Record index %i, count %i\n", mv_insert_index, mv_record_count );
	//SV_SaveRecordCache();
}



/*
==================
SV_SetTargetClient
==================
*/
void SV_SetTargetClient( int clientNum )
{
	sv_lastAck = 0; // force to fetch latest target' reliable acknowledge
	sv_lastClientSeq = 0;
	sv_demoClientID = clientNum;
}


/*
==================
SV_ForwardServerCommands
==================
*/
void SV_ForwardServerCommands( client_t *recorder /*, const client_t *client */ )
{
	const client_t *client;
	const char *cmd;
	int src_index;
	int	dst_index;
	int i;

	if ( sv_demoClientID < 0 )
		return;

	client = svs.clients + sv_demoClientID;

	// FIXME: track reliableSequence globally?
	if ( !sv_lastAck ) {
		sv_lastAck = client->reliableAcknowledge;
	}

	//if ( client->reliableAcknowledge >= client->reliableSequence )
	if ( sv_lastAck >= client->reliableSequence )
		return; // nothing to send

	//for ( i = client->reliableAcknowledge + 1 ; i <= client->reliableSequence ; i++ ) {
	for ( i = sv_lastAck + 1 ; i <= client->reliableSequence ; i++ ) {
		src_index = i & ( MAX_RELIABLE_COMMANDS - 1 );
		cmd = client->reliableCommands[ src_index ];
		// filter commands here:
		if ( strncmp( cmd, "tell ", 5 ) == 0 ) // TODO: other commands
			continue;
		dst_index = ++recorder->reliableSequence & ( MAX_RELIABLE_COMMANDS - 1 );
		Q_strncpyz( recorder->reliableCommands[ dst_index ], cmd, sizeof( recorder->reliableCommands[ dst_index ] ) );
	}

	sv_lastAck = client->reliableSequence;
}


/*
==================
SV_MultiViewRecord_f
==================
*/
void SV_MultiViewRecord_f( void )
{
	entityState_t *base, nullstate;

	client_t	*recorder;	// recorder slot
	byte		msgData[ MAX_MSGLEN_BUF ];
	msg_t		msg;

	char demoName[ MAX_QPATH ];
	char name[ MAX_QPATH ];
	const char *s;
	int i, cid, len;

	if ( Cmd_Argc() > 2 ) {
		Com_Printf( "Usage: mvrecord [filename]\n" );
		return;
	}

	if ( sv_demoFile != FS_INVALID_HANDLE ) {
		Com_Printf( "Already recording multiview.\n" );
		return;
	}	

	if ( sv.state != SS_GAME || !svs.clients ) {
		Com_Printf( "Game is not running.\n" );
		return;
	}

	cid = SV_FindActiveClient( qfalse /* checkCommands */, -1 /* skipClientNum */, 0 /* minActive */ );

	if ( cid < 0 ) {
		Com_Printf( "No active clients connected.\n" );
		return;
	}

	if ( Cmd_Argc() == 2 ) {
		s = Cmd_Argv( 1 );
		Q_strncpyz( demoName, s, sizeof( demoName ) );
		Com_sprintf( name, sizeof( name ), "demos/%s.%s%d", demoName, DEMOEXT, NEW_PROTOCOL_VERSION );
	} else {
		qtime_t t;
		
		Com_RealTime( &t );
		// name in format mv-YYMMDD-HHmmSS.dm_71 (23+4) = 27, ok
		sprintf( demoName, "mv-%02i%02i%02i-%02i%02i%02i", t.tm_year-100, t.tm_mon+1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec );
		Com_sprintf( name, sizeof( name ), "demos/%s.%s%d", demoName, DEMOEXT, NEW_PROTOCOL_VERSION );
				
		i = 0;
		// try with suffix: mv-YYMMDD-HHmmSS-[0..999].dm_71
		while ( FS_FileExists( name ) && i++ <= 999 )
			Com_sprintf( name, sizeof( name ), "demos/%s-%i.%s%d", demoName, i, DEMOEXT, NEW_PROTOCOL_VERSION );
	}

	strcpy( sv_demoFileNameLast, name );
	strcpy( sv_demoFileName, name );
	// add .tmp to server-side demos so we can rename them later
	Q_strcat( sv_demoFileName, sizeof( sv_demoFileName ), ".tmp" );

	Com_Printf( S_COLOR_CYAN "start recording to %s using primary client id %i.\n", sv_demoFileName, cid );
	sv_demoFile = FS_FOpenFileWrite( sv_demoFileName );

	if ( sv_demoFile == FS_INVALID_HANDLE ) {
		Com_Printf( "ERROR: couldn't open %s.\n", sv_demoFileName );
		sv_demoFileName[0] = '\0';
		sv_demoFileNameLast[0] = '\0';
		return;
	}

	recorder = svs.clients + sv_maxclients->integer; // reserved recorder slot

	SV_SetTargetClient( cid );

	Com_Memset( recorder, 0, sizeof( *recorder ) );

	recorder->multiview.protocol = MV_PROTOCOL_VERSION;
	recorder->multiview.recorder = qtrue;
	recorder->state = CS_ACTIVE;

	recorder->deltaMessage = -1; // reset delta encoding in next snapshot
	recorder->netchan.outgoingSequence = 1;
	recorder->netchan.remoteAddress.type = NA_LOOPBACK;

	// empty command buffer
	recorder->reliableSequence = 0;
	recorder->reliableAcknowledge = 0;

	recorder->lastClientCommand = 1;

	MSG_Init( &msg, msgData, MAX_MSGLEN );
	MSG_Bitstream( &msg );

	// NOTE, MRE: all server->client messages now acknowledge
	MSG_WriteLong( &msg, recorder->lastClientCommand );

	SV_UpdateServerCommandsToClient( recorder, &msg );	

#ifdef USE_MV_ZCMD
	// we are resetting delta sequence after gamestate
	recorder->multiview.z.deltaSeq = 0;
#endif

	MSG_WriteByte( &msg, svc_gamestate );

	// all future zcmds must have reliableSequence greater than this
	MSG_WriteLong( &msg, recorder->reliableSequence );

	// write the configstrings
	for ( i = 0 ; i < MAX_CONFIGSTRINGS ; i++ ) {
		if ( sv.configstrings[i][0] ) {
			MSG_WriteByte( &msg, svc_configstring );
			MSG_WriteShort( &msg, i );
			MSG_WriteBigString( &msg, sv.configstrings[i] );
		}
	}

	// write the baselines
	Com_Memset( &nullstate, 0, sizeof( nullstate ) );
	for ( i = 0 ; i < MAX_GENTITIES; i++ ) {
		base = &sv.svEntities[ i ].baseline;
		if ( !sv.baselineUsed[ i ] ) {
			continue;
		}
		MSG_WriteByte( &msg, svc_baseline );
		MSG_WriteDeltaEntity( &msg, &nullstate, base, qtrue );
	}

	MSG_WriteByte( &msg, svc_EOF );

	MSG_WriteLong( &msg, sv_demoClientID ); // selected client id

	// write the checksum feed
	MSG_WriteLong( &msg, sv.checksumFeed );

	// finalize packet
	MSG_WriteByte( &msg, svc_EOF );

	len = LittleLong( recorder->netchan.outgoingSequence - 1 );
	FS_Write( &len, 4, sv_demoFile );
	
	// data size
	len = LittleLong( msg.cursize );
	FS_Write( &len, 4, sv_demoFile );
	
	// data
	FS_Write( msg.data, msg.cursize, sv_demoFile );
}


/*
==================
SV_MultiViewStopRecord_f
==================
*/
void SV_MultiViewStopRecord_f( void )
{
	client_t *recorder;

	if ( !svs.clients )
		return;

	recorder = svs.clients + sv_maxclients->integer; // recorder slot

	if ( sv_demoFile != FS_INVALID_HANDLE ) {

		FS_FCloseFile( sv_demoFile );
		sv_demoFile = FS_INVALID_HANDLE;

		// rename final file
		if ( sv_demoFileNameLast[0] && sv_demoFileName[0] ) {
			FS_Rename( sv_demoFileName, sv_demoFileNameLast );
		}
		
		// store in cache
		SV_InsertFileRecord( sv_demoFileNameLast );

		Com_Printf( S_COLOR_CYAN "DEMO: stopped multiview recording %s.\n", sv_demoFileName );
		return;
	}

	sv_demoFileName[0] = '\0';
	sv_demoFileNameLast[0] = '\0';

	SV_SetTargetClient( -1 );
#if 1
	Com_Memset( recorder, 0, sizeof( *recorder ) );
#else
	recorder->netchan.outgoingSequence = 0;
	recorder->multiview.protocol = 0;
	recorder->multiview.recorder = qfalse;
	recorder->state = CS_FREE;
#endif
}


/*
==================
SV_TrackDisconnect
==================
*/
void SV_TrackDisconnect( int clientNum ) 
{
	int cid;

	svs.clients[ clientNum ].multiview.scoreQueryTime = 0;

	if ( clientNum == sv_demoClientID ) {
		cid = SV_FindActiveClient( qfalse, sv_demoClientID, 0 ); // TODO: count sv_autoRecord?
		if ( cid < 0 ) {
			SV_MultiViewStopRecord_f();
			return;			
		}
		Com_DPrintf( "mvrecorder: switch primary client id to %i\n", cid );
		SV_SetTargetClient( cid );
	}
}

/*
=================
void SV_MultiView_f
=================
*/
void SV_MultiView_f( client_t *client ) {
	int i, n;

	if (  Q_stricmp( Cmd_Argv( 0 ), "mvjoin" ) == 0 ) {
		if ( client->multiview.protocol > 0 ) {
			SV_SendServerCommand( client, "print \"You are already in multiview state.\n\"" );
			return;
		}

		// count active multiview clients
		for ( i = 0, n = 0; i < sv_maxclients->integer; i++ ) {
			if ( svs.clients[ i ].multiview.protocol > 0 )
				n++;
		}

		if ( n >= sv_mvClients->integer ) {
			SV_SendServerCommand( client, "print \""S_COLOR_YELLOW"No free multiview slots.\n\"" );
			return;
		}

		if ( sv_mvPassword->string[0] != '\0' ) {
			if ( Cmd_Argc() < 2 || strcmp( sv_mvPassword->string, Cmd_Argv(1) ) ) {
				SV_SendServerCommand( client, "print \""S_COLOR_YELLOW"Invalid password.\n\"" );
				return;
			}
		}

		if(atoi(Info_ValueForKey( client->userinfo, "mvproto" )) != MV_PROTOCOL_VERSION) {
			NET_OutOfBandPrint( NS_SERVER, &client->netchan.remoteAddress, "print\nSorry, but this server requires multiview %i\n", MV_PROTOCOL_VERSION );
			Com_DPrintf( "Multiview join comand rejected a regular client.\n" );
			return;
		}

		client->multiview.protocol = atoi(Info_ValueForKey( client->userinfo, "mvproto" ));;
		client->multiview.scoreQueryTime = 0;
#ifdef USE_MV_ZCMD
		client->multiview.z.deltaSeq = 0; // reset on transition to multiview
#endif
		// FIXME: only local print?
		SV_SendServerCommand( client, "print \"%s "S_COLOR_WHITE "joined multiview.\n\"", client->name );

	} else if ( Q_stricmp( Cmd_Argv( 0 ), "mvleave" ) == 0 ) { // assume "mvleave" in opposition to "mvjoin"
		if ( client->multiview.protocol == 0 ) {
			SV_SendServerCommand( client, "print \"You are not in multiview state.\n\"" );
		} else {
			SV_SendServerCommand( client, "print \"%s "S_COLOR_WHITE"left multiview.\n\"", client->name );
			// FIXME: broadcast?
			client->multiview.protocol = 0;
			client->multiview.scoreQueryTime = 0;
#ifdef USE_MV_ZCMD
			client->multiview.z.deltaSeq = 0; // reset on leaving multiview state
#endif
		}
	}
}

void SV_MV_BoundMaxClients( void )
{
  sv_maxclients->modified = qfalse;

  // get the current demoClients value
  Cvar_Get( "sv_mvClients", "8", 0 );
  sv_mvClients->modified = qfalse;

  if ( sv_mvClients->integer > sv_maxclients->integer ) {
    Cvar_Set( "sv_mvClients", va( "%i", sv_maxclients->integer ) );
    sv_mvClients->modified = qfalse;
  }
}

void SV_MV_SetSnapshotParams( void ) 
{
	svs.numSnapshotPSF = sv_mvClients->integer * PACKET_BACKUP * MAX_CLIENTS;

	// reserve 2 additional frames for recorder slot
#ifdef USE_MULTIVM_SERVER
	svs.numSnapshotPSF += 2 * MAX_CLIENTS * MAX_NUM_VMS;
#else
	svs.numSnapshotPSF += 2 * MAX_CLIENTS;
#endif

	if ( svs.numSnapshotPSF )
		svs.modSnapshotPSF = ( 0x10000000 / svs.numSnapshotPSF ) * svs.numSnapshotPSF;
	else
		svs.modSnapshotPSF = 1;
}

int SV_GetMergeMaskEntities( clientSnapshot_t *snap )
{
	const entityState_t *ent;
	psFrame_t *psf;
	int skipMask;
	int i, n;

	n = 0;
	skipMask = 0;
	psf = NULL;

	if ( !svs.currFrame )
		return skipMask;
	
	for ( i = 0; i < sv_maxclients->integer; i++ ) {
		ent = svs.currFrame->ents[ i ];
		if ( ent->number >= sv_maxclients->integer )
			break;
		for ( /*n = 0 */; n < snap->num_psf; n++ ) {
			psf = &svs.snapshotPSF[ ( snap->first_psf + n ) % svs.numSnapshotPSF ];
			if ( psf->clientSlot == ent->number ) {
				
//Com_Printf("Server snapshot: %i (%i -> %i)\n", snap->world, snap->first_psf, snap->num_psf);
				skipMask |= MSG_PlayerStateToEntityStateXMask( &psf->ps, ent, qtrue );
			}
		}
		//if ( n >= snap->num_psf ) {
		//	Com_Error( ERR_DROP, "ent[%i] not found in psf array", ent->number );
		//	break;
		//}
	}
	return skipMask;
}


static void SV_EmitByteMask( msg_t *msg, const byte *mask, const int maxIndex, const int indexBits, qboolean ignoreFirstZero )
{
	int firstIndex;
	int lastIndex;

	for ( firstIndex = 0; firstIndex < maxIndex; firstIndex++ ) {
		if ( mask[ firstIndex ] ) {
			lastIndex = firstIndex;
			while ( lastIndex < maxIndex-1 ) {
				if ( mask[ lastIndex + 1 ] )
					lastIndex++;
				else if ( ignoreFirstZero && lastIndex < maxIndex-2 && mask[ lastIndex + 2 ] )
					lastIndex += 2; // skip single zero block
				else
					break;
			}
			//printf( "start: %i end: %i\n", firstIndex, lastIndex );
			MSG_WriteBits( msg, 1, 1 ); // delta change
			MSG_WriteBits( msg, firstIndex, indexBits );
			MSG_WriteBits( msg, lastIndex, indexBits );
			for ( ; firstIndex < lastIndex + 1 ; firstIndex++ ) {
				MSG_WriteByte( msg, mask[ firstIndex ] );
			}
			firstIndex = lastIndex;
		}
	}
	MSG_WriteBits( msg, 0, 1 ); // no delta
}


void SV_EmitPlayerStates( int baseClientID, const clientSnapshot_t *from, const clientSnapshot_t *to, msg_t *msg, skip_mask sm )
{
	psFrame_t *psf;
	const psFrame_t *old_psf;
	const playerState_t *oldPs;

	int i, n;
	int clientSlot;
	int oldIndex;

	const byte *oldPsMask;
	byte oldPsMaskBuf[MAX_CLIENTS/8];
	byte newPsMask[MAX_CLIENTS/8];

	const byte *oldEntMask;
	byte oldEntMaskBuf[MAX_GENTITIES/8];
	byte newEntMask[MAX_GENTITIES/8];

	// generate playerstate mask
	if ( !from || !from->num_psf ) {
		Com_Memset( oldPsMaskBuf, 0, sizeof( oldPsMaskBuf ) );
		oldPsMask = oldPsMaskBuf;
	} else {
		oldPsMask = from->psMask;
	}

#if 1
	// delta-xor playerstate bitmask
	for ( i = 0; i < ARRAY_LEN( newPsMask ); i++ ) {
		newPsMask[ i ] = to->psMask[ i ] ^ oldPsMask[ i ];
	}
	SV_EmitByteMask( msg, newPsMask, MAX_CLIENTS/8, 3, qfalse );
#else
	MSG_WriteData( msg, to->psMask[ i ], sizeof( to->psMasks ) ); // direct playerstate mask
#endif

	oldIndex = 0;
	clientSlot = 0;
	old_psf = NULL; // silent warning
	
	for ( i = 0; i < to->num_psf; i++ ) 
	{
		psf = &svs.snapshotPSF[ ( to->first_psf + i ) % svs.numSnapshotPSF ];
		clientSlot = psf->clientSlot;
		// check if masked in previous frame:
		if ( !GET_ABIT( oldPsMask, clientSlot ) ) {
			if ( from && clientSlot == baseClientID ) // FIXME: ps->clientNum?
				oldPs = &from->ps; // transition from legacy to multiview mode
			else
				oldPs = NULL; // new playerstate
			// empty entity mask
			Com_Memset( oldEntMaskBuf, 0, sizeof( oldEntMaskBuf ) );
			oldEntMask = oldEntMaskBuf;
		} else {
			// masked in previous frame so MUST exist
			old_psf = NULL;
			 // search for client state in old frame
			for ( ; oldIndex < from->num_psf; oldIndex++ ) {
				old_psf = &svs.snapshotPSF[ ( from->first_psf + oldIndex ) % svs.numSnapshotPSF ];
				if ( old_psf->clientSlot == clientSlot )
					break;
			}
			if ( oldIndex >= from->num_psf ) { // should never happen?
				Com_Error( ERR_DROP, "oldIndex(%i) >= from->num_psf(%i), from->first_pfs=%i", oldIndex, from->num_psf, from->first_psf );
				continue;
			}
			oldPs = &old_psf->ps;
			oldEntMask = old_psf->entMask;
		}
		
		// areabytes
		MSG_WriteBits( msg, psf->areabytes, 6 ); // was 8
		MSG_WriteData( msg, psf->areabits, psf->areabytes );

		// playerstate
		MSG_WriteDeltaPlayerstate( msg, oldPs, &psf->ps );

#if 1
		// delta-xor mask
		for ( n = 0; n < ARRAY_LEN( newEntMask ); n++ ) {
			newEntMask[ n ] = psf->entMask[ n ] ^ oldEntMask[ n ];
		}
		SV_EmitByteMask( msg, newEntMask, sizeof( newEntMask ), 7, qtrue );
#else 
		// direct mask
		MSG_WriteData( msg, psf->entMask.mask, sizeof( psf->entMask.mask ) );
#endif
	}
}

#ifdef USE_MV_ZCMD

static int SV_GetTextBits( const byte *cmd, int cmdlen ) {
	int n;
	for ( n = 0; n < cmdlen; n++ ) {
		if ( cmd[ n ] > 127 ) {
			return 8;
		}
	}
	return 7;
}


static int SV_GetCmdSize( int Cmd ) 
{
	if ( (unsigned)Cmd <= 0xFF ) {
		return 1;
	} else if ( (unsigned)Cmd <= 0xFFFF ) {
		return 2;
	} else if ( (unsigned)Cmd <= 0xFFFFFF ) {
		return 3;
	} else {
		return 4;
	}
}


static qboolean SV_BuildCompressedBuffer( client_t *client, int reliableSequence )
{
	int index;
	int cmdLen;
	const char *cmd;
	lzstream_t *stream;

	index = reliableSequence & (MAX_RELIABLE_COMMANDS-1);

	if ( client->multiview.z.stream[ index ].zcommandNum == reliableSequence )
		return qfalse; // already compressed

	//Com_DPrintf( S_COLOR_YELLOW "zcmd: compressing %i.%i\n", reliableSequence, client->multiview.z.deltaSeq );

	cmd = client->reliableCommands[ index ];
	cmdLen = strlen( cmd );

	if ( client->multiview.z.deltaSeq == 0 ) {
		LZSS_InitContext( &client->multiview.z.ctx );
	} 

	stream = &client->multiview.z.stream[ index ];
	stream->zdelta = client->multiview.z.deltaSeq;
	stream->zcommandNum = reliableSequence;
	stream->zcommandSize = SV_GetCmdSize( reliableSequence );
	stream->zcharbits = SV_GetTextBits( (byte*)cmd, cmdLen );
	/* stream->count = */ LZSS_CompressToStream( &client->multiview.z.ctx, stream, (byte*)cmd, cmdLen );

	// don't forget to update delta sequence
	if ( client->multiview.z.deltaSeq >= 7 )
		client->multiview.z.deltaSeq = 1;
	else
		client->multiview.z.deltaSeq++;

	return qtrue;
}
#endif // USE_MV_ZCMD


/*
==================
SV_FindActiveClient

find first human client we can use as primary/score requester
bots is not good for that because they may not receive all feedback from game VM
==================
*/
int SV_FindActiveClient( qboolean checkCommands, int skipClientNum, int minActive ) {
	playerState_t *ps;
	client_t *clist[ MAX_CLIENTS ];
	client_t *cl;
	int	longestInactivity;
	int	longestSpecInactivity;
	int bestIndex;
	int i, nactive;

	nactive = 0;	// number of active clients
	bestIndex = -1;
	longestInactivity = INT_MIN;
	longestSpecInactivity = INT_MIN;

	for ( i = 0, cl = svs.clients; i < sv_maxclients->integer ; i++, cl++ ) {

		if ( cl->state != CS_ACTIVE || cl->gentity == NULL )
			continue;

		if ( cl->gentity->r.svFlags & SVF_BOT || i == skipClientNum )
			continue;

		if ( checkCommands ) {
			// wait a few seconds after any command received/sent
			// to avoid dropping score request by flood protection
			// or lagging target client too much
			if ( cl->multiview.lastRecvTime + 500 > svs.time )
				continue;

			if ( cl->multiview.lastSentTime + 1500 > svs.time )
				continue;

			// never send anything to client that has unacknowledged commands
			if ( cl->reliableSequence > cl->reliableAcknowledge )
				continue;
		}

		if ( longestInactivity < svs.time - cl->multiview.scoreQueryTime ) {
			longestInactivity = svs.time - cl->multiview.scoreQueryTime;
			bestIndex = cl - svs.clients;
		}

		clist[ nactive++ ] = cl;
	}

	if ( nactive < minActive )
		return -1;

	// count spectators from active
	for ( i = 0; i < nactive; i++ ) {
		cl = clist[ i ];
		ps = SV_GameClientNum( cl - svs.clients );
		if ( ps->persistant[ PERS_TEAM ] == TEAM_SPECTATOR || ps->pm_flags & PMF_FOLLOW ) {
			if ( longestSpecInactivity < svs.time - cl->multiview.scoreQueryTime ) {
				longestSpecInactivity = svs.time - cl->multiview.scoreQueryTime;
				bestIndex = cl - svs.clients;
			}
		}
	}

	return bestIndex;
}


void SV_QueryClientScore( client_t *client )
{
	int clientNum;

	if ( client->multiview.scoreQueryTime == 0 )
	{
		// first time init?
		client->multiview.scoreQueryTime = svs.time + SCORE_PERIOD/3;
	}
	else if ( svs.time >= client->multiview.scoreQueryTime ) 
	{
		//} else if ( svs.time > client->multiview.scoreQueryTime + SCORE_PERIOD ) {
		if ( client->multiview.recorder && sv_demoFlags->integer & SCORE_RECORDER ) {

			clientNum = SV_FindActiveClient( qtrue, -1, 0 ); // count last sent command, ignore noone
			if ( clientNum != -1 ) {
				if ( clientNum != sv_demoClientID ) {
					//Com_DPrintf( S_COLOR_YELLOW " change score target from %i to %i\n", clientNum, sv_demoClientID );
					SV_SetTargetClient( clientNum );
				}

				SV_ExecuteClientCommand( svs.clients + sv_demoClientID, "score" );

				client->multiview.scoreQueryTime = svs.time + SCORE_PERIOD;
				svs.clients[ sv_demoClientID ].multiview.scoreQueryTime = svs.time + SCORE_PERIOD;
					
			} else {
				//Com_DPrintf( S_COLOR_YELLOW "no active clients available for 'score'\n" ); // debug print
			}
		} else if ( sv_demoFlags->integer & SCORE_CLIENT ) {
			SV_ExecuteClientCommand( client, "score" );
			client->multiview.scoreQueryTime = svs.time + SCORE_PERIOD;
		}
	}
}

#endif // USE_MV
