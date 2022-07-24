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
// sv_client.c -- server code for dealing with clients

#include "server.h"
//#if defined(USE_PERSIST_CLIENT) || defined(USE_MULTIVM_SERVER) || defined(USE_REFEREE_CMDS)
//#include "../game/g_local.h" // get both the definitions of gentity_t (to get gentity_t->health field) AND sharedEntity_t, so that we can convert a sharedEntity_t into a gentity_t (see more details in SV_GentityUpdateHealthField() notes)
//#endif

#ifdef USE_CURL
download_t			svDownload;
#ifdef DEDICATED
clientConnection_t	clc;
clientStatic_t		  cls;
cvar_t	            *cl_dlDirectory;
#endif
#else
qboolean        svDownload;
#endif

#ifdef USE_LNBITS
invoice_t *maxInvoices;
int       numInvoices;
invoice_t *requestInvoice; // the invoice request currently being downloaded by svDownload
char invoicePostData[MAX_OSPATH];
char invoicePostHeaders[2*MAX_OSPATH];
#endif

static void SV_CloseDownload( client_t *cl );

//
// Server-side Stateless Challenges
// backported from https://github.com/JACoders/OpenJK/pull/832
//

#define TS_SHIFT 14 // ~16 seconds to reply to the challenge

/*
=================
SV_CreateChallenge

Create an unforgeable, temporal challenge for the given client address
=================
*/
static int SV_CreateChallenge( int timestamp, const netadr_t *from )
{
	int challenge;

	// Create an unforgeable, temporal challenge for this client using HMAC(secretKey, clientParams + timestamp)
	// Use first 4 bytes of the HMAC digest as an int (client only deals with numeric challenges)
	// The most-significant bit stores whether the timestamp is odd or even. This lets later verification code handle the
	// case where the engine timestamp has incremented between the time this challenge is sent and the client replies.
	challenge = Com_MD5Addr( from, timestamp );
	challenge &= 0x7FFFFFFF;
	challenge |= (unsigned int)(timestamp & 0x1) << 31;

	return challenge;
}


/*
=================
SV_CreateChallenge

Verify a challenge received by the client matches the expected challenge
=================
*/
static qboolean SV_VerifyChallenge( int receivedChallenge, const netadr_t *from )
{
	int currentTimestamp = svs.time >> TS_SHIFT;
	int currentPeriod = currentTimestamp & 0x1;

	// Use the current timestamp for verification if the current period matches the client challenge's period.
	// Otherwise, use the previous timestamp in case the current timestamp incremented in the time between the
	// client being sent a challenge and the client's reply that's being verified now.
	int challengePeriod = ((unsigned int)receivedChallenge >> 31) & 0x1;
	int challengeTimestamp = currentTimestamp - ( currentPeriod ^ challengePeriod );

	int expectedChallenge = SV_CreateChallenge( challengeTimestamp, from );

	return (receivedChallenge == expectedChallenge) ? qtrue : qfalse;
}


/*
=================
SV_InitChallenger
=================
*/
void SV_InitChallenger( void )
{
	Com_MD5Init();
}


/*
=================
SV_GetChallenge

A "getchallenge" OOB command has been received
Returns a challenge number that can be used
in a subsequent connectResponse command.
We do this to prevent denial of service attacks that
flood the server with invalid connection IPs.  With a
challenge, they must give a valid IP address.

If we are authorizing, a challenge request will cause a packet
to be sent to the authorize server.

When an authorizeip is returned, a challenge response will be
sent to that ip.

ioquake3: we added a possibility for clients to add a challenge
to their packets, to make it more difficult for malicious servers
to hi-jack client connections.
Also, the auth stuff is completely disabled for com_standalone games
as well as IPv6 connections, since there is no way to use the
v4-only auth server for these new types of connections.
=================
*/
void SV_GetChallenge( const netadr_t *from ) {
	int		challenge;
	int		clientChallenge;

	// ignore if we are in single player
#ifndef DEDICATED
#ifdef USE_LOCAL_DED
	// allow people to connect to your single player server
	if(!com_dedicated->integer)
#endif
	if (Cvar_VariableIntegerValue( "g_gametype" ) == GT_SINGLE_PLAYER || Cvar_VariableIntegerValue("ui_singlePlayerActive")) {
		return;
	}
#endif

	// Prevent using getchallenge as an amplifier
	if ( SVC_RateLimitAddress( from, 10, 1000 ) ) {
		if ( com_developer->integer ) {
			Com_Printf( "SV_GetChallenge: rate limit from %s exceeded, dropping request\n",
				NET_AdrToString( from ) );
		}
		return;
	}

	// Create a unique challenge for this client without storing state on the server
	challenge = SV_CreateChallenge( svs.time >> TS_SHIFT, from );
	
	if ( Cmd_Argc() < 2 ) {
		// legacy client query, don't send unneeded information
		NET_OutOfBandPrint( NS_SERVER, from, "challengeResponse %i", challenge );
	} else {
		int sv_proto = com_protocol->integer;
		if ( sv_proto == DEFAULT_PROTOCOL_VERSION ) {
			// we support new protocol features by default
			sv_proto = NEW_PROTOCOL_VERSION;
		}

		// Grab the client's challenge to echo back (if given)
		clientChallenge = atoi( Cmd_Argv( 1 ) );

		NET_OutOfBandPrint( NS_SERVER, from, "challengeResponse %i %i %i",
			challenge, clientChallenge, sv_proto );
	}
}


/*
==================
SV_IsBanned

Check whether a certain address is banned
==================
*/
#ifdef USE_BANS

static qboolean SV_IsBanned( const netadr_t *from, qboolean isexception )
{
	int index;
	serverBan_t *curban;

	if(!isexception)
	{
		// If this is a query for a ban, first check whether the client is excepted
		if(SV_IsBanned(from, qtrue))
			return qfalse;
	}
	
	for(index = 0; index < serverBansCount; index++)
	{
		curban = &serverBans[index];
		
		if(curban->isexception == isexception)
		{
			if(NET_CompareBaseAdrMask(&curban->ip, from, curban->subnet))
				return qtrue;
		}
	}
	
	return qfalse;
}
#endif


/*
==================
SV_SetClientTLD
==================
*/
#pragma pack(push,1)

typedef struct iprange_s {
	uint32_t from;
	uint32_t to;
} iprange_t;

typedef struct iprange_tld_s {
	char tld[2];
} iprange_tld_t;

#pragma pack(pop)

static qboolean ipdb_loaded;
static iprange_t *ipdb_range;
static iprange_tld_t *ipdb_tld;
static int num_tlds;

typedef struct tld_info_s {
	const char *tld;
	const char *country;
} tld_info_t;

static const tld_info_t tld_info[] = {
#include "tlds.h"
};

/*
==================
SV_FreeIP4DB
==================
*/
void SV_FreeIP4DB( void )
{
	if ( ipdb_range )
		Z_Free( ipdb_range );

	ipdb_loaded = qfalse;
	ipdb_range = NULL;
	ipdb_tld = NULL;
}


/*
==================
SV_LoadIP4DB

Loads geoip database into memory
==================
*/
static qboolean SV_LoadIP4DB( const char *filename )
{
	fileHandle_t fh = FS_INVALID_HANDLE;
	uint32_t last_ip;
	void *buf;
	int len, i;
	
	len = FS_SV_FOpenFileRead( filename, &fh );
	
	if ( len <= 0 )
	{
		if ( fh != FS_INVALID_HANDLE )
			FS_FCloseFile( fh );
		return qfalse;
	}

	if ( len % 10 ) // should be a power of IP4:IP4:TLD2
	{
		Com_DPrintf( "%s(%s): invalid file size %i\n", __func__, filename, len );
		if ( fh != FS_INVALID_HANDLE )
			FS_FCloseFile( fh );
		return qfalse;
	}

	SV_FreeIP4DB();

	buf = Z_Malloc( len );

	FS_Read( buf, len, fh );
	FS_FCloseFile( fh );

	// check integrity of loaded databse
	last_ip = 0;
	num_tlds = len / 10;

	// database format:
	// [range1][range2]...[rangeN]
	// [tld1][tld2]...[tldN]

	ipdb_range = (iprange_t*)buf;
	ipdb_tld = (iprange_tld_t*)(ipdb_range + num_tlds);

	for ( i = 0; i < num_tlds; i++ )
	{
#ifdef Q3_LITTLE_ENDIAN
		ipdb_range[i].from = LongSwap( ipdb_range[i].from );
		ipdb_range[i].to = LongSwap( ipdb_range[i].to );
#endif
		if ( last_ip && last_ip >= ipdb_range[i].from )
			break;
		if ( ipdb_range[i].from > ipdb_range[i].to )
			break;
		if ( ipdb_tld[i].tld[0] < 'A' || ipdb_tld[i].tld[0] > 'Z' || ipdb_tld[i].tld[1] < 'A' || ipdb_tld[i].tld[1] > 'Z' )
			break;
		last_ip = ipdb_range[i].to;
	}

	if ( i != num_tlds ) {
			Com_Printf( S_COLOR_YELLOW "invalid ip4db entry #%i: range=[%08x..%08x], tld=%c%c\n", 
				i, ipdb_range[i].from, ipdb_range[i].to, ipdb_tld[i].tld[0], ipdb_tld[i].tld[1] );
			SV_FreeIP4DB();
			return qtrue; // to not try to load it again
	}

	Com_Printf( "ip4db: %i entries loaded\n", num_tlds );
	return qtrue;
}


static void SV_SetTLD( char *str, const netadr_t *from, qboolean isLAN )
{
	const iprange_t *e;
	int lo, hi, m;
	uint32_t ip;

	str[0] = '\0';

	if ( sv_clientTLD->integer == 0 )
		return;

	if ( isLAN )
	{
		strcpy( str, "**" );
		return;
	}

	if ( from->type != NA_IP ) // ipv4-only
		return;

	if ( !ipdb_loaded )
		ipdb_loaded = SV_LoadIP4DB( "ip4db.dat" );

	if ( !ipdb_range )
		return;

	lo = 0;
	hi = num_tlds;

	// big-endian to host-endian
#ifdef Q3_LITTLE_ENDIAN
	ip =  from->ipv._4[3] | from->ipv._4[2] << 8 | from->ipv._4[1] << 16 | from->ipv._4[0] << 24;
#else
	ip =  from->ipv._4[0] | from->ipv._4[1] << 8 | from->ipv._4[2] << 16 | from->ipv._4[3] << 24;
#endif

	// binary search
	while ( lo <= hi )
	{
		m = ( lo + hi ) / 2;
		e = ipdb_range + m;
		if ( ip >= e->from && ip <= e->to )
		{
			const iprange_tld_t *tld = ipdb_tld + m;
			str[0] = tld->tld[0];
			str[1] = tld->tld[1];
			str[2] = '\0';
			return;
		}

		if ( e->from > ip )
			hi = m - 1;
		else
			lo = m + 1;
	}
}


static int seqs[ MAX_CLIENTS ];

static void SV_SaveSequences( void ) {
	int i;
	for ( i = 0; i < sv_maxclients->integer; i++ ) {
		seqs[i] = svs.clients[i].reliableSequence;
	}
}


static void SV_InjectLocation( const char *tld, const char *country ) {
	char *cmd, *str;
	int i, n;
	for ( i = 0; i < sv_maxclients->integer; i++ ) {
		if ( seqs[i] != svs.clients[i].reliableSequence ) {
			for ( n = seqs[i]; n != svs.clients[i].reliableSequence + 1; n++ ) {
				cmd = svs.clients[i].reliableCommands[n & (MAX_RELIABLE_COMMANDS-1)];
				str = strstr( cmd, "connected\n\"" );
				if ( str && str[11] == '\0' && str < cmd + 512 ) {
					if ( *tld == '\0' )
						sprintf( str, S_COLOR_WHITE "connected (%s)\n\"", country );
					else
						sprintf( str, S_COLOR_WHITE "connected (" S_COLOR_RED "%s" S_COLOR_WHITE ", %s)\n\"", tld, country );
					break;
				}
			}
		}
	}
}


static const char *SV_FindCountry( const char *tld ) {
	int i;

	if ( *tld == '\0' )
		return "Unknown Location";

	for ( i = 0; i < ARRAY_LEN( tld_info ); i++ ) {
		if ( !strcmp( tld, tld_info[i].tld ) ) {
			return tld_info[i].country;
		}
	}

	return "Unknown Location";
}


#if defined(USE_PERSIST_CLIENT) || defined(USE_MULTIVM_SERVER) || defined(USE_ENGINE_TELE)
/*
==================
SetClientViewAngle
==================
*/
void SV_SetClientViewAngle( int clientNum, vec3_t angle ) {
	int	i, cmdAngle;
	playerState_t *ps = SV_GameClientNum( clientNum );
	//gentity_t *ent = (void *)SV_GentityNum( clientNum ); //->r.s;

	// set the delta angle
	for (i = 0 ; i < 3 ; i++) {
		cmdAngle = ANGLE2SHORT(angle[i]);
		ps->delta_angles[i] = cmdAngle; // - client->pers.cmd.angles[i];
	}
	VectorCopy( angle, ps->viewangles );
	//VectorCopy( angle, ent->s.angles );
}
#endif


#ifdef USE_PERSIST_CLIENT
void SV_PersistClient( int c ) {
	client_t *cl = &svs.clients[c];
	char *cl_guid = Info_ValueForKey(cl->userinfo, "cl_guid");
	if(!cl_guid[0] || cl->state != CS_ACTIVE) { // client is too fresh, don't overwite session data
		return;
	}
	playerState_t *ps = SV_GameClientNum( c );
	void *ent = SV_GentityNum( c ); //->r.s;
	cl->persisted = sv.time;
	//Com_Printf("Persisting client: %i, %f x %f\n", ent->health, ps->viewangles[0], ps->viewangles[1]);

	fileHandle_t h = FS_SV_FOpenFileWrite( va("client_%s.session", cl_guid) );
	time_t t = I_FloatTime();
	FS_Write(&t, sizeof(long), h);

	int size = sizeof(playerState_t);
	FS_Write(&size, sizeof(int), h);
	FS_Write(ps, size, h);

#ifdef USE_MULTIVM_SERVER
	size = sv.gentitySizes[gvmi];
#else
	size = sv.gentitySize;
#endif
	FS_Write(&size, sizeof(int), h);
	FS_Write(ent, size, h);

	size = strlen(cl->userinfo);
	FS_Write(&size, sizeof(int), h);
	FS_Write(cl->userinfo, size, h);
	
	// TODO: leave open? (PHP leaves them open with non-blocking read/non-exclusive write)  TODO: pipe?
	FS_FCloseFile(h);
}


void SV_RestoreClient( int clientNum ) {
#ifdef USE_MULTIVM_SERVER
	byte buffer[sv.gentitySizes[gvmi] * 2];
#else
	byte buffer[sv.gentitySize * 2];
#endif
	client_t *cl = &svs.clients[clientNum];
	char *cl_guid = Info_ValueForKey(cl->userinfo, "cl_guid");
	if(!cl_guid[0] || cl->state != CS_ACTIVE) {
		return;
	}
	cl->persisted = 0; // start saving again 

	fileHandle_t h;
	int size = FS_SV_FOpenFileRead( va("client_%s.session", cl_guid), &h );
	if(size == -1) {
		return;
	}
	time_t t = 0;
	FS_Read(&t, sizeof(long), h);
  
  // don't restore client is certain time has passed
	if(sv_clSessions->integer != -1 && I_FloatTime() - t > sv_clSessions->integer) {
    Com_DPrintf("Client %i not restored because session expired after %li seconds\n", 
      clientNum, I_FloatTime() - t);
    return;
  }

	playerState_t *ps = SV_GameClientNum( clientNum );
	FS_Read(buffer, sizeof(int), h);
	memcpy(&size, buffer, sizeof(int));
	FS_Read(buffer, size, h);
	if(size != sizeof(playerState_t)) {
		Com_Printf( S_COLOR_RED "SESSION ERROR: Player state sizes do not match (%i != %lu).\n", size, sizeof(playerState_t));
	} else {
		//memcpy(ps, buffer, sizeof(playerState_t));
		memcpy(ps->origin, ((playerState_t*)buffer)->origin, sizeof(vec3_t));
		SV_SetClientViewAngle(clientNum, ((playerState_t*)buffer)->viewangles);
	}

	// weird because the struct lists player state twice or something? In sharedEntity_t and in entityShared_t
	int restoreOffset = sizeof(entityShared_t) - sizeof(entityState_t) + 4; // 4 for the ptr
	//byte *clientEnt = (void *)SV_GentityNum( clientNum );
	//void *ent = (void *)&clientEnt[-restoreOffset]; //->r.s;

	FS_Read(buffer, sizeof(int), h);
	memcpy(&size, buffer, sizeof(int));
	memset(buffer, 0, sizeof(buffer));
	FS_Read(&buffer[restoreOffset], size, h);
	if(
#ifdef USE_MULTIVM_SERVER
		size != sv.gentitySizes[gvmi]
#else
		size != sv.gentitySize
#endif
	) {
		Com_Printf( S_COLOR_RED "SESSION ERROR: Player entity sizes do not match (%i != %lu).\n", size, sizeof(playerState_t));
	} else {
		//memcpy(&ent->health, &((gentity_t*)buffer)->health, sizeof(int));
		Com_Printf("Restoring client %i: %f x %f\n", clientNum, ps->origin[0], ps->origin[1]);
	}

	FS_Read(buffer, sizeof(int), h);
	memcpy(&size, buffer, sizeof(int));
	if(size > MAX_INFO_STRING) {
		Com_Printf( S_COLOR_RED "SESSION ERROR: User info too long (%i != %lu).\n", size, sizeof(playerState_t));
	} else {
		FS_Read(buffer, size, h);
	}
	memcpy(cl->userinfo, buffer, sizeof(MAX_INFO_STRING));

	FS_FCloseFile(h);
}
#endif


/*
==================
SV_DirectConnect

A "connect" OOB command has been received
==================
*/
void SV_DirectConnect( const netadr_t *from ) {
	static		rateLimit_t bucket;
	char		userinfo[MAX_INFO_STRING], tld[3];
	int			i, n;
	client_t	*cl, *newcl;
#ifdef USE_LNBITS
	invoice_t *invoice;
#endif
	//sharedEntity_t *ent;
	int			clientNum;
	int			qport;
	int			challenge;
	char		*password;
	int			startIndex;
	intptr_t	denied;
	int			count;
	int			cl_proto, sv_proto;
	const char	*ip, *info, *v;
	qboolean	compat;
	qboolean	longstr;

//#ifdef USE_MULTIVM_SERVER
//	Com_Printf( "SVC_DirectConnect(%i)\n", from->netWorld );
//#else
	Com_DPrintf( "SVC_DirectConnect()\n" );
//#endif

#ifdef USE_BANS
	// Check whether this client is banned.
	if(SV_IsBanned(from, qfalse))
	{
		NET_OutOfBandPrint(NS_SERVER, &from, "print\nYou are banned from this server.\n");
		return;
	}
#endif

	// Prevent using connect as an amplifier
	if ( SVC_RateLimitAddress( from, 10, 1000 ) ) {
		if ( com_developer->integer ) {
			Com_Printf( "SV_DirectConnect: rate limit from %s exceeded, dropping request\n",
				NET_AdrToString( from ) );
		}
		return;
	}

	// check for concurrent connections
	for ( i = 0, n = 0; i < sv_maxclients->integer; i++ ) {
		const netadr_t *addr = &svs.clients[ i ].netchan.remoteAddress;
		if ( addr->type != NA_BOT && NET_CompareBaseAdr( addr, from ) ) {
			if ( svs.clients[ i ].state >= CS_CONNECTED && !svs.clients[ i ].justConnected ) {
				if ( ++n >= sv_maxclientsPerIP->integer ) {
					// avoid excessive outgoing traffic
					if ( !SVC_RateLimit( &bucket, 10, 200 ) ) {
						NET_OutOfBandPrint( NS_SERVER, from, "print\nToo many connections.\n" );
					}
					return;
				}
			}
		}
	}

	// verify challenge in first place
	info = Cmd_Argv( 1 );
	v = Info_ValueForKey( info, "challenge" );
	if ( *v == '\0' )
	{
		if ( !SVC_RateLimit( &bucket, 10, 200 ) )
		{
			NET_OutOfBandPrint( NS_SERVER, from, "print\nMissing challenge in userinfo.\n" );
		}
		return;
	}
	challenge = atoi( v );

	// see if the challenge is valid (localhost clients don't need to challenge)
	if ( !NET_IsLocalAddress( from ) )
	{
		// Verify the received challenge against the expected challenge
		if ( !SV_VerifyChallenge( challenge, from ) )
		{
			// avoid excessive outgoing traffic
			if ( !SVC_RateLimit( &bucket, 10, 200 ) )
			{
				NET_OutOfBandPrint( NS_SERVER, from, "print\nIncorrect challenge, please reconnect.\n" );
			}
			return;
		}
	}

	Q_strncpyz( userinfo, info, sizeof( userinfo ) );

	v = Info_ValueForKey( userinfo, "protocol" );
	if ( *v == '\0' )
	{
		if ( !SVC_RateLimit( &bucket, 10, 200 ) )
		{
			NET_OutOfBandPrint( NS_SERVER, from, "print\nMissing protocol in userinfo.\n" );
		}
		return;
	}
	cl_proto = atoi( v );

	sv_proto = com_protocol->integer;
	if ( sv_proto == DEFAULT_PROTOCOL_VERSION )
	{
		// we support new protocol features by default
		sv_proto = NEW_PROTOCOL_VERSION;
	}

	if ( cl_proto <= OLD_PROTOCOL_VERSION )
		compat = qtrue;
	else
	{
		if ( cl_proto != sv_proto )
		{
			// avoid excessive outgoing traffic
			if ( !SVC_RateLimit( &bucket, 10, 200 ) )
			{
				NET_OutOfBandPrint( NS_SERVER, from, "print\nServer uses protocol version %i "
					"(yours is %i).\n", sv_proto, cl_proto );
			}
			Com_DPrintf( "    rejected connect from version %i\n", cl_proto );
			return;
		}
		compat = qfalse;
	}

	v = Info_ValueForKey( userinfo, "qport" );
	if ( *v == '\0' )
	{
		if ( !SVC_RateLimit( &bucket, 10, 200 ) )
		{
			NET_OutOfBandPrint( NS_SERVER, from, "print\nMissing qport in userinfo.\n" );
		}
		return;
	}
	qport = atoi( Info_ValueForKey( userinfo, "qport" ) );

	// if "client" is present in userinfo and it is a modern client
	// then assume it can properly decode long strings and protocol extensions
	if ( !compat && *Info_ValueForKey( userinfo, "client" ) != '\0' ) {
		longstr = qtrue;
	} else {
		longstr = qfalse;
		if ( com_protocolCompat ) {
			// enforce dm68-compatible stream for other clients
			compat = qtrue;
		}
	}

	// we don't need these keys after connection, release some space in userinfo
	Info_RemoveKey( userinfo, "challenge" );
	Info_RemoveKey( userinfo, "qport" );
	Info_RemoveKey( userinfo, "protocol" );
	Info_RemoveKey( userinfo, "client" );

	// don't let "ip" overflow userinfo string
	if ( NET_IsLocalAddress( from ) )
		ip = "127.0.0.1";
	else
		ip = NET_AdrToString( from );

	if ( !Info_SetValueForKey( userinfo, "ip", ip ) ) {
		// avoid excessive outgoing traffic
		if ( !SVC_RateLimit( &bucket, 10, 200 ) ) {
			NET_OutOfBandPrint( NS_SERVER, from, "print\nUserinfo string length exceeded.  "
				"Try removing setup cvars from your config.\n" );
		}
		return;
	}

#ifdef USE_CVAR_UNCHEAT
  // check cheat cvars from client, make sure none of them are disabled
  // TODO: probably just use sv_filter for this
  char *uncheat = Info_ValueForKey( userinfo, "cl_uncheat" );
  int cheatCount = 0;
  const char *bannedCheats = "\0";
  char *cheats = Cmd_TokenizeAlphanumeric(uncheat, &cheatCount);
  for(int i = 0; i < cheatCount && i < 128; i++) {
    if(cheats[0] == '\0') continue;
    // check if the banned cheat value is set on the client
    for(int j = 0; j < ARRAY_LEN(svUncheats); j++) {
      if(!Q_stricmp(svUncheats[j], cheats)) {
        bannedCheats = va("%s %s", bannedCheats, cheats);
      }
    }
    cheats = &cheats[strlen(cheats)+1];
  }
  if(bannedCheats[0] != '\0') {
    // kick the user with instructions
    NET_OutOfBandPrint( NS_SERVER, from, "print\nUsing banned cheat settings.  "
      "Try clearing cl_uncheat, specifically: %s\n", bannedCheats );
    return;
  }
#endif

	// run userinfo filter
	SV_SetTLD( tld, from, Sys_IsLANAddress( from ) );
	Info_SetValueForKey( userinfo, "tld", tld );
	v = SV_RunFilters( userinfo, from );
	if ( *v != '\0' ) {
		NET_OutOfBandPrint( NS_SERVER, from, "print\n%s\n", v );
		Com_DPrintf( "Engine rejected a connection: %s.\n", v );
		return;
	}

	// restore burst capacity
	SVC_RateRestoreBurstAddress( from, 10, 1000 );

	// quick reject
	newcl = NULL;
	for ( i = 0, cl = svs.clients ; i < sv_maxclients->integer ; i++, cl++ ) {
		if ( NET_CompareAdr( from, &cl->netchan.remoteAddress ) ) {
#ifndef USE_LOCAL_DED
			int elapsed = svs.time - cl->lastConnectTime;
			if ( elapsed < ( sv_reconnectlimit->integer * 1000 ) && elapsed >= 0 ) {
				int remains = ( ( sv_reconnectlimit->integer * 1000 ) - elapsed + 999 ) / 1000;
				if ( com_developer->integer ) {
					Com_Printf( "%s:reconnect rejected : too soon\n", NET_AdrToString( from ) );
				}
				// avoid excessive outgoing traffic
				if ( !SVC_RateLimit( &bucket, 10, 200 ) ) {
					NET_OutOfBandPrint( NS_SERVER, from, "print\nReconnecting, please wait %i second%s.\n",
						remains, (remains != 1) ? "s" : "" );
				}
				return;
			}
#endif
			newcl = cl; // we may reuse this slot
			break;
		}
	}

	// if there is already a slot for this ip, reuse it
	for ( i = 0, cl = svs.clients ; i < sv_maxclients->integer ; i++, cl++ ) {
		if ( cl->state == CS_FREE ) {
			continue;
		}
		if ( NET_CompareAdr( from, &cl->netchan.remoteAddress ) && cl->netchan.qport == qport ) {
			// both qport and netport should match for a reconnecting client
			Com_Printf( "%s:reconnect\n", NET_AdrToString( from ) );
			newcl = cl;

			// this doesn't work because it nukes the players userinfo

//			// disconnect the client from the game first so any flags the
//			// player might have are dropped
//			VM_Call( gvm, GAME_CLIENT_DISCONNECT, 1, newcl - svs.clients );
			//
			goto gotnewcl;
		}
	}

	// find a client slot
	// if "sv_privateClients" is set > 0, then that number
	// of client slots will be reserved for connections that
	// have "password" set to the value of "sv_privatePassword"
	// Info requests will report the maxclients as if the private
	// slots didn't exist, to prevent people from trying to connect
	// to a full server.
	// This is to allow us to reserve a couple slots here on our
	// servers so we can play without having to kick people.

	// check for privateClient password
	password = Info_ValueForKey( userinfo, "password" );
	if ( *password && !strcmp( password, sv_privatePassword->string ) ) {
		startIndex = sv_democlients->integer;
	} else {
		// skip past the reserved slots
		startIndex = sv_privateClients->integer + sv_democlients->integer;
	}

	if ( newcl && newcl >= svs.clients + startIndex && newcl->state == CS_FREE ) {
		Com_Printf( "%s: reuse slot %i\n", NET_AdrToString( from ), (int)(newcl - svs.clients) );
		goto gotnewcl;
	}

	// select least used free slot
	n = 0;
	newcl = NULL;
	for ( i = startIndex; i < sv_maxclients->integer ; i++ ) {
		cl = &svs.clients[i];
		if ( cl->state == CS_FREE && ( newcl == NULL || svs.time - cl->lastDisconnectTime > n ) ) {
			n = svs.time - cl->lastDisconnectTime;
			newcl = cl;
		}
	}

	if ( !newcl ) {
		if ( NET_IsLocalAddress( from ) ) {
			count = 0;
			for ( i = startIndex; i < sv_maxclients->integer ; i++ ) {
				cl = &svs.clients[i];
				if (cl->netchan.remoteAddress.type == NA_BOT) {
					count++;
				}
			}
			// if they're all bots
			if (count >= sv_maxclients->integer - startIndex) {
				SV_DropClient(&svs.clients[sv_maxclients->integer - 1], "only bots on server");
				newcl = &svs.clients[sv_maxclients->integer - 1];
			}
			else {
				Com_Error( ERR_DROP, "server is full on local connect" );
				return;
			}
		}
		else {
			NET_OutOfBandPrint( NS_SERVER, from, "print\nServer is full.\n" );
			Com_DPrintf ("Rejected a connection.\n");
			return;
		}
	}

gotnewcl:
	// build a new connection
	// accept the new client
	// this is the only place a client_t is ever initialized
	// we got a newcl, so reset the reliableSequence and reliableAcknowledge
	Com_Memset( newcl, 0, sizeof( *newcl ) );
	clientNum = newcl - svs.clients;
#if 0 // skip this until CS_PRIMED
	//ent = SV_GentityNum( clientNum );
	//newcl->gentity = ent;
#endif

#ifdef USE_LNBITS
	if(sv_lnWallet->string[0] && sv_lnMatchPrice->integer > 0) {
		// generate an invoice for lnbits for this client
		invoice = SVC_ClientRequiresInvoice(from, userinfo, challenge);
		if(!invoice) {
			return;
		} else {
			invoice->cl = newcl;
		}
	}
#endif

#ifdef USE_MULTIVM_SERVER
	//if(from->type == NA_LOOPBACK) {
	gvmi = newcl->gameWorld = newcl->newWorld = from->netWorld;
	Com_Printf( "SVC_DirectConnect(%i)\n", from->netWorld );
	//} else {
	//	gvmi = newcl->gameWorld = newcl->newWorld = 1;
	//}
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif

	// save the challenge
	newcl->challenge = challenge;

	// save the address
	newcl->compat = compat;
	Netchan_Setup( NS_SERVER, &newcl->netchan, from, qport, challenge, compat );

	// init the netchan queue
	newcl->netchan_end_queue = &newcl->netchan_start_queue;

	// save the userinfo
	Q_strncpyz( newcl->userinfo, userinfo, sizeof(newcl->userinfo) );

	newcl->longstr = longstr;

	strcpy( newcl->tld, tld );
	newcl->country = SV_FindCountry( newcl->tld );

	SV_UserinfoChanged( newcl, qtrue, qfalse ); // update userinfo, do not run filter

	if ( sv_clientTLD->integer ) {
		SV_SaveSequences();
	}

#ifdef USE_MULTIVM_SERVER
	newcl->netchan.remoteAddress.netWorld = from->netWorld;
  // add new clients to all worlds
	if(atoi(Info_ValueForKey( userinfo, "mvproto" )) != MV_PROTOCOL_VERSION) {
		if(sv_mvOmnipresent->integer > 0) {
				NET_OutOfBandPrint( NS_SERVER, from, "print\nSorry, but this server requires multiview %i\n", MV_PROTOCOL_VERSION );
				Com_DPrintf( "Multiview rejected a regular client.\n" );
				return;
		}
	} else {
		// start multiview automatically in the case where multiview client starts on a different port and doesn't take up the wrong slot.
		// TODO: too soon! must have at least 1 frame sent
		//newcl->multiview.protocol = atoi(Info_ValueForKey( userinfo, "mvproto" ));
		//newcl->multiview.scoreQueryTime = 0;
	}
	for(int igvm = 0; igvm < MAX_NUM_VMS; igvm++) {
		if(!gvmWorlds[igvm]) continue;
		gvmi = igvm;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
		// only join 1 world
		if(sv_mvOmnipresent->integer <= 0 && igvm != newcl->gameWorld) {
			SV_SetConfigstring(CS_PLAYERS + clientNum, "");
			continue;
		}
		denied = VM_Call( gvm, 3, GAME_CLIENT_CONNECT, clientNum, qtrue, qfalse ); // firstTime = qtrue
		if ( denied ) {
#ifndef BUILD_GAME_STATIC
			const char *str = GVM_ArgPtr( denied );
#else
			const char *str = (void *)denied;
#endif
			NET_OutOfBandPrint( NS_SERVER, from, "print\n%s\n", str );
			Com_Printf("WARNING: client (%i) denied.", clientNum);
		}
	}
	gvmi = newcl->gameWorld;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#else
	// get the game a chance to reject this connection or modify the userinfo
	denied = VM_Call( gvm, 3, GAME_CLIENT_CONNECT, clientNum, qtrue, qfalse ); // firstTime = qtrue
	if ( denied ) {
		// we can't just use VM_ArgPtr, because that is only valid inside a VM_Call
#ifndef BUILD_GAME_STATIC
		const char *str = GVM_ArgPtr( denied );
#else
    const char *str = (void *)denied;
#endif

		NET_OutOfBandPrint( NS_SERVER, from, "print\n%s\n", str );
		Com_DPrintf( "Game rejected a connection: %s.\n", str );
		return;
	}
#endif

	if ( sv_clientTLD->integer ) {
		SV_InjectLocation( newcl->tld, newcl->country );
	}

#ifdef USE_MV
#ifdef USE_MV_ZCMD
	newcl->multiview.z.deltaSeq = 0; // reset on DirectConnect();
#endif
	newcl->multiview.recorder = qfalse;
#endif

	// send the connect packet to the client
	if ( longstr /*&& !compat*/ ) {
		NET_OutOfBandPrint( NS_SERVER, from, "connectResponse %d %d", challenge, sv_proto );
	} else {
	NET_OutOfBandPrint( NS_SERVER, from, "connectResponse %d", challenge );
	}

	Com_DPrintf( "Going from CS_FREE to CS_CONNECTED for %s\n", newcl->name );

	newcl->state = CS_CONNECTED;
#ifdef USE_PERSIST_CLIENT
	newcl->persisted = sv.time; // don't save empty state until client has a change to join
#endif
	newcl->lastSnapshotTime = svs.time - 9999; // generate a snapshot immediately
	newcl->lastPacketTime = svs.time;
	newcl->lastConnectTime = svs.time;
	newcl->lastDisconnectTime = svs.time;

	SVC_RateRestoreToxicAddress( &newcl->netchan.remoteAddress, 10, 1000 );
	newcl->justConnected = qtrue;

	// when we receive the first packet from the client, we will
	// notice that it is from a different serverid and that the
	// gamestate message was not just sent, forcing a retransmit
	newcl->gamestateMessageNum = newcl->messageAcknowledge - 1; // force gamestate retransmit

	// if this was the first client on the server, or the last client
	// the server can hold, send a heartbeat to the master.
	count = 0;
	for (i=0,cl=svs.clients ; i < sv_maxclients->integer ; i++,cl++) {
		if ( svs.clients[i].state >= CS_CONNECTED ) {
			count++;
		}
	}
	if ( count == 1 || count == sv_maxclients->integer ) {
		SV_Heartbeat_f();
	}
	
#ifdef USE_RECENT_EVENTS
  SV_RecentEvent(va(RECENT_TEMPLATE_STR, sv.time, SV_EVENT_CONNECTED, SV_EscapeStr(newcl->userinfo, sizeof(newcl->userinfo))));
#endif
	
#ifdef USE_MULTIVM_SERVER
	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif
}


/*
=====================
SV_FreeClient

Destructor for data allocated in a client structure
=====================
*/
void SV_FreeClient(client_t *client)
{
	SV_Netchan_FreeQueue(client);
	SV_CloseDownload(client);
}


/*
=====================
SV_DropClient

Called when the player is totally leaving the server, either willingly
or unwillingly.  This is NOT called if the entire server is quiting
or crashing -- SV_FinalMessage() will handle that
=====================
*/
void SV_DropClient( client_t *drop, const char *reason ) {
	char	name[ MAX_NAME_LENGTH ];
	qboolean isBot;
	int		i;
	
#ifdef USE_RECENT_EVENTS
  SV_RecentEvent(va(RECENT_TEMPLATE_STR, sv.time, SV_EVENT_DISCONNECT, SV_EscapeStr(drop->userinfo, sizeof(drop->userinfo))));
#endif

#ifdef USE_DEMO_CLIENTS
	if(drop->demorecording) {
		SV_StopRecord(drop);
	}
#endif

#ifdef USE_DEMO_SERVER
	if ( drop->state == CS_ZOMBIE || drop->demoClient ) {
		return;		// already dropped
	}
#endif

	isBot = drop->netchan.remoteAddress.type == NA_BOT;

	Q_strncpyz( name, drop->name, sizeof( name ) );	// for further DPrintf() because drop->name will be nuked in SV_SetUserinfo()

	// Free all allocated data on the client structure
	SV_FreeClient( drop );

#ifdef USE_MV
	SV_TrackDisconnect( drop - svs.clients );
#endif

	// tell everyone why they got dropped
	if ( reason ) {
		SV_SendServerCommand( NULL, "print \"%s" S_COLOR_WHITE " %s\n\"", name, reason );
	}

	// call the prog function for removing a client
	// this will remove the body, among other things
#ifdef USE_MULTIVM_SERVER
	// disconnect from all worlds
	for(int igvm = 0; igvm < MAX_NUM_VMS; igvm++) {
		if(!gvmWorlds[igvm]) continue;
		gvmi = igvm;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
		VM_Call( gvm, 1, GAME_CLIENT_DISCONNECT, drop - svs.clients );
		// also clear the entity type because this is how multiworld 
		//   figures out of a client has been there before to send gamestates
    SV_SetConfigstring(CS_PLAYERS + (int)(drop - svs.clients), "");
    // happens in SV_CheckTimeouts
	}
	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#else	
	VM_Call( gvm, 1, GAME_CLIENT_DISCONNECT, drop - svs.clients );
#endif

	// add the disconnect command
	if ( reason ) {
		SV_SendServerCommand( drop, "disconnect \"%s\"", reason );
	}

	if ( isBot ) {
		SV_BotFreeClient( drop - svs.clients );
	}

	// nuke user info
	SV_SetUserinfo( drop - svs.clients, "" );

	drop->justConnected = qfalse;

	drop->lastDisconnectTime = svs.time;

#ifdef USE_PERSIST_CLIENT
	drop->persisted = 0;
#endif

	if ( isBot ) {
		// bots shouldn't go zombie, as there's no real net connection.
		drop->state = CS_FREE;
	} else {
		Com_DPrintf( "Going to CS_ZOMBIE for %s, %s\n", name, reason );
		drop->state = CS_ZOMBIE;		// become free in a few seconds
	}

#ifdef USE_MULTIVM_SERVER
	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif

	if ( !reason ) {
		return;
	}

	// if this was the last client on the server, send a heartbeat
	// to the master so it is known the server is empty
	// send a heartbeat now so the master will get up to date info
	for ( i = 0 ; i < sv_maxclients->integer ; i++ ) {
#ifdef USE_DEMO_SERVER
    if( svs.clients[i].demoClient )
      continue;
#endif

		if ( svs.clients[i].state >= CS_CONNECTED ) {
			break;
		}
	}
	if ( i == sv_maxclients->integer ) {
		SV_Heartbeat_f();
	}
}


/*
================
SV_RemainingGameState

estimates free space available for additional systeminfo keys
================
*/
int SV_RemainingGameState( void )
{
	int			len;
	int			start, i;
	entityState_t nullstate;
	const svEntity_t *svEnt;
	msg_t		msg;
	byte		msgBuffer[ MAX_MSGLEN_BUF ];

	MSG_Init( &msg, msgBuffer, MAX_MSGLEN );

	MSG_WriteLong( &msg, 7 ); // last client command

	for ( i = 0; i < 256; i++ ) // simulate dummy client commands
		MSG_WriteByte( &msg, i & 127 );

	// send the gamestate
	MSG_WriteByte( &msg, svc_gamestate );
	MSG_WriteLong( &msg, 7 ); // client->reliableSequence

	// write the configstrings
	for ( start = 0 ; start < MAX_CONFIGSTRINGS ; start++ ) {
		if ( start == CS_SERVERINFO ) {
			MSG_WriteByte( &msg, svc_configstring );
			MSG_WriteShort( &msg, start );
#ifdef USE_MULTIVM_SERVER
			MSG_WriteBigString( &msg, Cvar_InfoString( CVAR_SERVERINFO, NULL, gvmi ) );
#else
#ifdef USE_MULTIVM_CLIENT
      MSG_WriteBigString( &msg, Cvar_InfoString( CVAR_SERVERINFO, NULL, 0 ) );
#else
      MSG_WriteBigString( &msg, Cvar_InfoString( CVAR_SERVERINFO, NULL ) );
#endif
#endif
			continue;
		}
		if ( start == CS_SYSTEMINFO ) {
			MSG_WriteByte( &msg, svc_configstring );
			MSG_WriteShort( &msg, start );
#ifdef USE_MULTIVM_SERVER
      MSG_WriteBigString( &msg, Cvar_InfoString_Big( CVAR_SYSTEMINFO, NULL, gvmi ) );
#else
#ifdef USE_MULTIVM_CLIENT
			MSG_WriteBigString( &msg, Cvar_InfoString_Big( CVAR_SYSTEMINFO, NULL, 0 ) );
#else
			MSG_WriteBigString( &msg, Cvar_InfoString_Big( CVAR_SYSTEMINFO, NULL ) );
#endif
#endif
			continue;
		}
		if ( sv.configstrings[start][0] ) {
			MSG_WriteByte( &msg, svc_configstring );
			MSG_WriteShort( &msg, start );
			MSG_WriteBigString( &msg, sv.configstrings[start] );
		}
	}

	// write the baselines
	Com_Memset( &nullstate, 0, sizeof( nullstate ) );
	for ( start = 0 ; start < MAX_GENTITIES; start++ ) {
		if ( !sv.baselineUsed[ start ] ) {
			continue;
		}
		svEnt = &sv.svEntities[ start ];
		MSG_WriteByte( &msg, svc_baseline );
		MSG_WriteDeltaEntity( &msg, &nullstate, &svEnt->baseline, qtrue );
	}

	MSG_WriteByte( &msg, svc_EOF );

	MSG_WriteLong( &msg, 7 ); // client num

	// write the checksum feed
	MSG_WriteLong( &msg, sv.checksumFeed );

	// finalize packet
	MSG_WriteByte( &msg, svc_EOF );

	len = PAD( msg.bit, 8 ) / 8;

	// reserve some space for potential userinfo expansion
	len += 512;
	
	return MAX_MSGLEN - len;
}


/*
================
SV_SendClientGameState

Sends the first message from the server to a connected client.
This will be sent on the initial connection and upon each new map load.

It will be resent if the client acknowledges a later message but has
the wrong gamestate.
================
*/
static void SV_SendClientGameState( client_t *client ) {
	int			start, headerBytes;
	entityState_t nullstate;
	const svEntity_t *svEnt;
	msg_t		msg;
	byte		msgBuffer[ MAX_MSGLEN_BUF ];
#ifdef USE_MULTIVM_SERVER
	int prevGvm = gvmi;
	gvmi = client->newWorld;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif

	Com_DPrintf( "SV_SendClientGameState() for %s\n", client->name );

	if ( client->state != CS_PRIMED ) {
		Com_DPrintf( "Going from CS_CONNECTED to CS_PRIMED for %s\n", client->name );
	}

	client->state = CS_PRIMED;

	client->pureAuthentic = qfalse;
	client->gotCP = qfalse;

	// to start generating delta for packet entities
	client->gentity = SV_GentityNum( client - svs.clients );

	// when we receive the first packet from the client, we will
	// notice that it is from a different serverid and that the
	// gamestate message was not just sent, forcing a retransmit
	client->gamestateMessageNum = client->netchan.outgoingSequence;

	MSG_Init( &msg, msgBuffer, MAX_MSGLEN );
	headerBytes = msg.cursize;


	// NOTE, MRE: all server->client messages now acknowledge
	// let the client know which reliable clientCommands we have received
	MSG_WriteLong( &msg, client->lastClientCommand );

	// send any server commands waiting to be sent first.
	// we have to do this cause we send the client->reliableSequence
	// with a gamestate and it sets the clc.serverCommandSequence at
	// the client side
	SV_UpdateServerCommandsToClient( client, &msg );

#ifdef USE_MV
#ifdef USE_MV_ZCMD
	// reset command compressor and score timer
	//client->multiview.encoderInited = qfalse;
	client->multiview.z.deltaSeq = 0; // force encoder reset on gamestate change
#endif
	client->multiview.scoreQueryTime = 0;
#endif

	// send the gamestate
	MSG_WriteByte( &msg, svc_gamestate );

	MSG_WriteLong( &msg, client->reliableSequence );

#ifdef USE_MULTIVM_SERVER
	if(atoi(Info_ValueForKey( client->userinfo, "mvproto" )) > 1) {
		MSG_WriteByte( &msg, svc_mvWorld );
		MSG_WriteByte( &msg, gvmi );
	}
#endif

	// write the configstrings
	for ( start = 0 ; start < MAX_CONFIGSTRINGS ; start++ ) {
		if (sv.configstrings[start][0]) {
			MSG_WriteByte( &msg, svc_configstring );
			MSG_WriteShort( &msg, start );
			MSG_WriteBigString( &msg, sv.configstrings[start] );
		}
	}

	// write the baselines
	Com_Memset( &nullstate, 0, sizeof( nullstate ) );
	for ( start = 0 ; start < MAX_GENTITIES; start++ ) {
		if ( !sv.baselineUsed[ start ] ) {
			continue;
		}
		svEnt = &sv.svEntities[ start ];
		MSG_WriteByte( &msg, svc_baseline );
		MSG_WriteDeltaEntity( &msg, &nullstate, &svEnt->baseline, qtrue );
	}

	MSG_WriteByte( &msg, svc_EOF );

	MSG_WriteLong( &msg, client - svs.clients );

	// write the checksum feed
	MSG_WriteLong( &msg, sv.checksumFeed );

#ifdef USE_DEMO_CLIENTS
	if ( client->demorecording && !client->demowaiting) {
		msg_t copyMsg;
		Com_Memcpy(&copyMsg, &msg, sizeof(msg));
 		SV_WriteDemoMessage( client, &copyMsg, headerBytes );
 	}
#endif

#ifdef USE_MULTIVM_SERVER
	gvmi = prevGvm;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif

	// it is important to handle gamestate overflow
	// but at this stage client can't process any reliable commands
	// so at least try to inform him in console and release connection slot
	if ( msg.overflowed ) {
		if ( client->netchan.remoteAddress.type == NA_LOOPBACK ) {
			Com_Error( ERR_DROP, "gamestate overflow" );
		} else {
			NET_OutOfBandPrint( NS_SERVER, &client->netchan.remoteAddress, "print\n" S_COLOR_RED "SERVER ERROR: gamestate overflow\n" );
			SV_DropClient( client, "gamestate overflow" );
		}
		return;
	}

	// deliver this to the client
	SV_SendMessageToClient( &msg, client );

}


/*
==================
SV_ClientEnterWorld
==================
*/
void SV_ClientEnterWorld( client_t *client, usercmd_t *cmd ) {
	int		clientNum;
	sharedEntity_t *ent;

#ifdef USE_MULTIVM_SERVER
  Com_DPrintf( "Going from CS_PRIMED to CS_ACTIVE for %s (world %i)\n", client->name, gvmi );
#else
  Com_DPrintf( "Going from CS_PRIMED to CS_ACTIVE for %s\n", client->name );
#endif
	client->state = CS_ACTIVE;
#ifdef USE_MULTIVM_SERVER
	if(sv_mvWorld->integer 
		// check client is multiworld capable, even if it's not enabled
		//   we still send world command to set the right starting world
		&& atoi(Info_ValueForKey( client->userinfo, "mvproto" )) > 1) {
		SV_SendServerCommand(client, "world %i", client->newWorld);
	}
#endif

	// resend all configstrings using the cs commands since these are
	// no longer sent when the client is CS_PRIMED
	SV_UpdateConfigstrings( client );

	// set up the entity for the client
	clientNum = client - svs.clients;
	ent = SV_GentityNum( clientNum );
	ent->s.number = clientNum;
	client->gentity = ent;

	client->deltaMessage = client->netchan.outgoingSequence - (PACKET_BACKUP + 1); // force delta reset
	client->lastSnapshotTime = svs.time - 9999; // generate a snapshot immediately

	if(cmd)
		memcpy(&client->lastUsercmd, cmd, sizeof(client->lastUsercmd));
	else
		memset(&client->lastUsercmd, '\0', sizeof(client->lastUsercmd));
#ifdef USE_MULTIVM_SERVER
	if(sv_mvWorld->integer) {
		// always uses 0 slot :(
		memset(&client->lastUsercmds[client->gameWorld], '\0', sizeof(usercmd_t));
	}
#endif

	// call the game begin function
	VM_Call( gvm, 1, GAME_CLIENT_BEGIN, client - svs.clients );

#ifdef USE_DEMO_SERVER
	// server-side demo playback: prevent players from joining the game when a demo is replaying (particularly if the gametype is non-team based, by default the gamecode force players to join in)
	if (sv.demoState == DS_PLAYBACK &&
	    ( (client - svs.clients) >= sv_democlients->integer ) && ( (client - svs.clients) < sv_maxclients->integer ) ) { // check that it's a real player
		SV_ExecuteClientCommand(client, "team spectator");
	}
#endif

#ifdef USE_PERSIST_CLIENT
	if(sv_clSessions->integer != 0) {
		client->persisted = 0;
		SV_RestoreClient(client - svs.clients);
	}
#endif

	// serverside demo
#ifdef USE_DEMO_CLIENTS
#ifdef USE_DEMO_SERVER
  if( !client->demoClient )
#endif
 	if (sv_autoRecord->integer && client->netchan.remoteAddress.type != NA_BOT) { 
  // don't record server side demo playbacks automatically
 		if (client->demorecording) {
 			SV_StopRecord( client );
 		}
    SV_Record(client, 0);
 	}
#endif
}


/*
============================================================

CLIENT COMMAND EXECUTION

============================================================
*/

/*
==================
SV_CloseDownload

clear/free any download vars
==================
*/
static void SV_CloseDownload( client_t *cl ) {
	int i;

	// EOF
	if ( cl->download != FS_INVALID_HANDLE ) {
		FS_FCloseFile( cl->download );
		cl->download = FS_INVALID_HANDLE;
	}

	*cl->downloadName = '\0';

	// Free the temporary buffer space
	for (i = 0; i < MAX_DOWNLOAD_WINDOW; i++) {
		if (cl->downloadBlocks[i]) {
			Z_Free( cl->downloadBlocks[i] );
			cl->downloadBlocks[i] = NULL;
		}
	}

}


/*
==================
SV_StopDownload_f

Abort a download if in progress
==================
*/
static void SV_StopDownload_f( client_t *cl ) {
	if (*cl->downloadName)
		Com_DPrintf( "clientDownload: %d : file \"%s\" aborted\n", (int) (cl - svs.clients), cl->downloadName );

	SV_CloseDownload( cl );
}


/*
==================
SV_DoneDownload_f

Downloads are finished
==================
*/
static void SV_DoneDownload_f( client_t *cl ) {
	if ( cl->state == CS_ACTIVE ) {
		Com_DPrintf( "clientDownload: %s: %i Done\n", cl->name, cl->state);
		return;
	}

	Com_DPrintf( "clientDownload: %s Done\n", cl->name);

	// resend the game state to update any clients that entered during the download
	SV_SendClientGameState( cl );
}


/*
==================
SV_NextDownload_f

The argument will be the last acknowledged block from the client, it should be
the same as cl->downloadClientBlock
==================
*/
static void SV_NextDownload_f( client_t *cl )
{
	int block = atoi( Cmd_Argv(1) );

	if (block == cl->downloadClientBlock) {
		Com_DPrintf( "clientDownload: %d : client acknowledge of block %d\n", (int) (cl - svs.clients), block );

		// Find out if we are done.  A zero-length block indicates EOF
		if (cl->downloadBlockSize[cl->downloadClientBlock % MAX_DOWNLOAD_WINDOW] == 0) {
			Com_Printf( "clientDownload: %d : file \"%s\" completed\n", (int) (cl - svs.clients), cl->downloadName );
			SV_CloseDownload( cl );
			return;
		}

		cl->downloadSendTime = svs.time;
		cl->downloadClientBlock++;
		return;
	}
	// We aren't getting an acknowledge for the correct block, drop the client
	// FIXME: this is bad... the client will never parse the disconnect message
	//			because the cgame isn't loaded yet
	SV_DropClient( cl, "broken download" );
}


/*
==================
SV_BeginDownload_f
==================
*/
static void SV_BeginDownload_f( client_t *cl ) {
#ifdef USE_DEMO_CLIENTS
 	// Stop serverside demo from this client
  if (sv_autoRecord->integer && cl->demorecording) {
  	SV_StopRecord( cl );
 	}
#endif

	// Kill any existing download
	SV_CloseDownload( cl );

	// cl->downloadName is non-zero now, SV_WriteDownloadToClient will see this and open
	// the file itself
	Q_strncpyz( cl->downloadName, Cmd_Argv(1), sizeof(cl->downloadName) );
}


/*
==================
SV_WriteDownloadToClient

Check to see if the client wants a file, open it if needed and start pumping the client
Fill up msg with data, return number of download blocks added
==================
*/
static int SV_WriteDownloadToClient( client_t *cl )
{
	int curindex;
	int unreferenced = 1;
	char errorMessage[1024];
	char pakbuf[MAX_QPATH], *pakptr;
	int numRefPaks;
	msg_t msg;
	byte msgBuffer[MAX_DOWNLOAD_BLKSIZE*2+8];

	if ( cl->download == FS_INVALID_HANDLE) {
		qboolean idPack = qfalse;
		qboolean missionPack = qfalse;
 		// Chop off filename extension.
		Q_strncpyz( pakbuf, cl->downloadName, sizeof( pakbuf ) );
		pakptr = strrchr( pakbuf, '.' );
		
		if(pakptr)
		{
			*pakptr = '\0';

			// Check for pk3 filename extension
			if ( !Q_stricmp( pakptr + 1, "pk3" ) )
			{
				// Check whether the file appears in the list of referenced
				// paks to prevent downloading of arbitrary files.
				Cmd_TokenizeStringIgnoreQuotes( sv_referencedPakNames->string );
				numRefPaks = Cmd_Argc();

				for(curindex = 0; curindex < numRefPaks; curindex++)
				{
					if(!FS_FilenameCompare(Cmd_Argv(curindex), pakbuf))
					{
						unreferenced = 0;

						// now that we know the file is referenced,
						// check whether it's legal to download it.
						missionPack = FS_idPak(pakbuf, BASETA, NUM_TA_PAKS);
						idPack = missionPack || FS_idPak(pakbuf, BASEGAME, NUM_ID_PAKS);

						break;
					}
				}
			}
      else {
#if defined(USE_DYNAMIC_ZIP) || defined(USE_ASYNCHRONOUS)
        if(FS_SV_FileExists(cl->downloadName)) {
          unreferenced = 0;
        }
#endif
      }
		}

		cl->download = FS_INVALID_HANDLE;

		// We open the file here
		if ( !(sv_allowDownload->integer & DLF_ENABLE) ||
			(sv_allowDownload->integer & DLF_NO_UDP) ||
			idPack || unreferenced ||
			( cl->downloadSize = FS_SV_FOpenFileRead( cl->downloadName, &cl->download ) ) < 0 ) {

			// cannot auto-download file
			if(unreferenced)
			{
				Com_Printf("clientDownload: %d : \"%s\" is not referenced and cannot be downloaded.\n", (int) (cl - svs.clients), cl->downloadName);
				Com_sprintf(errorMessage, sizeof(errorMessage), "File \"%s\" is not referenced and cannot be downloaded.", cl->downloadName);
			}
			else if (idPack) {
				Com_Printf("clientDownload: %d : \"%s\" cannot download id pk3 files\n", (int) (cl - svs.clients), cl->downloadName);
				if (missionPack) {
					Com_sprintf(errorMessage, sizeof(errorMessage), "Cannot autodownload Team Arena file \"%s\"\n"
									"The Team Arena mission pack can be found in your local game store.", cl->downloadName);
				}
				else {
					Com_sprintf(errorMessage, sizeof(errorMessage), "Cannot autodownload id pk3 file \"%s\"", cl->downloadName);
				}
			}
			else if ( !(sv_allowDownload->integer & DLF_ENABLE) ||
				(sv_allowDownload->integer & DLF_NO_UDP) ) {

				Com_Printf("clientDownload: %d : \"%s\" download disabled\n", (int) (cl - svs.clients), cl->downloadName);
				if (sv_pure->integer) {
					Com_sprintf(errorMessage, sizeof(errorMessage), "Could not download \"%s\" because autodownloading is disabled on the server.\n\n"
										"You will need to get this file elsewhere before you "
										"can connect to this pure server.\n", cl->downloadName);
				} else {
					Com_sprintf(errorMessage, sizeof(errorMessage), "Could not download \"%s\" because autodownloading is disabled on the server.\n\n"
                    "The server you are connecting to is not a pure server, "
                    "set autodownload to No in your settings and you might be "
                    "able to join the game anyway.\n", cl->downloadName);
				}
			} else {
        // NOTE TTimo this is NOT supposed to happen unless bug in our filesystem scheme?
        //   if the pk3 is referenced, it must have been found somewhere in the filesystem
				Com_Printf("clientDownload: %d : \"%s\" file not found on server\n", (int) (cl - svs.clients), cl->downloadName);
				Com_sprintf(errorMessage, sizeof(errorMessage), "File \"%s\" not found on server for autodownloading.\n", cl->downloadName);
			}

			MSG_Init( &msg, msgBuffer, sizeof( msgBuffer ) - 8 );
			MSG_WriteLong( &msg, cl->lastClientCommand );

			MSG_WriteByte( &msg, svc_download );
			MSG_WriteShort( &msg, 0 ); // client is expecting block zero
			MSG_WriteLong( &msg, -1 ); // illegal file size
			MSG_WriteString( &msg, errorMessage );

			MSG_WriteByte( &msg, svc_EOF );
			SV_Netchan_Transmit( cl, &msg );

			*cl->downloadName = '\0';
			
			if ( cl->download != FS_INVALID_HANDLE ) {
				FS_FCloseFile( cl->download );
				cl->download = FS_INVALID_HANDLE;
			}
			
			return 1;
		}
 
		Com_Printf( "clientDownload: %d : beginning \"%s\"\n", (int) (cl - svs.clients), cl->downloadName );
		
		// Init
		cl->downloadCurrentBlock = cl->downloadClientBlock = cl->downloadXmitBlock = 0;
		cl->downloadCount = 0;
		cl->downloadEOF = qfalse;
	}

	// Perform any reads that we need to
	while (cl->downloadCurrentBlock - cl->downloadClientBlock < MAX_DOWNLOAD_WINDOW &&
		cl->downloadSize != cl->downloadCount) {

		curindex = (cl->downloadCurrentBlock % MAX_DOWNLOAD_WINDOW);

		if (!cl->downloadBlocks[curindex])
			cl->downloadBlocks[curindex] = Z_Malloc( MAX_DOWNLOAD_BLKSIZE );

		cl->downloadBlockSize[curindex] = FS_Read( cl->downloadBlocks[curindex], MAX_DOWNLOAD_BLKSIZE, cl->download );

		if (cl->downloadBlockSize[curindex] < 0) {
			// EOF right now
			cl->downloadCount = cl->downloadSize;
			break;
		}

		cl->downloadCount += cl->downloadBlockSize[curindex];

		// Load in next block
		cl->downloadCurrentBlock++;
	}

	// Check to see if we have eof condition and add the EOF block
	if (cl->downloadCount == cl->downloadSize &&
		!cl->downloadEOF &&
		cl->downloadCurrentBlock - cl->downloadClientBlock < MAX_DOWNLOAD_WINDOW) {

		cl->downloadBlockSize[cl->downloadCurrentBlock % MAX_DOWNLOAD_WINDOW] = 0;
		cl->downloadCurrentBlock++;

		cl->downloadEOF = qtrue;  // We have added the EOF block
	}

	if (cl->downloadClientBlock == cl->downloadCurrentBlock)
		return 0; // Nothing to transmit

	// Write out the next section of the file, if we have already reached our window,
	// automatically start retransmitting
	if (cl->downloadXmitBlock == cl->downloadCurrentBlock)
	{
		// We have transmitted the complete window, should we start resending?
		if (svs.time - cl->downloadSendTime > 1000)
			cl->downloadXmitBlock = cl->downloadClientBlock;
		else
			return 0;
	}

	// Send current block
	curindex = (cl->downloadXmitBlock % MAX_DOWNLOAD_WINDOW);

	MSG_Init( &msg, msgBuffer, sizeof( msgBuffer ) - 8 );
	MSG_WriteLong( &msg, cl->lastClientCommand );

	MSG_WriteByte( &msg, svc_download );
	MSG_WriteShort( &msg, cl->downloadXmitBlock );

	// block zero is special, contains file size
	if ( cl->downloadXmitBlock == 0 )
		MSG_WriteLong( &msg, cl->downloadSize );

	MSG_WriteShort( &msg, cl->downloadBlockSize[curindex] );

	// Write the block
	if ( cl->downloadBlockSize[curindex] > 0 )
		MSG_WriteData( &msg, cl->downloadBlocks[curindex], cl->downloadBlockSize[curindex] );

	MSG_WriteByte( &msg, svc_EOF );
	SV_Netchan_Transmit( cl, &msg );

	Com_DPrintf( "clientDownload: %d : writing block %d\n", (int) (cl - svs.clients), cl->downloadXmitBlock );

	// Move on to the next block
	// It will get sent with next snap shot.  The rate will keep us in line.
	cl->downloadXmitBlock++;
	cl->downloadSendTime = svs.time;

	return 1;
}


/*
==================
SV_SendQueuedMessages

Send one round of fragments, or queued messages to all clients that have data pending.
Return the shortest time interval for sending next packet to client
==================
*/
int SV_SendQueuedMessages( void )
{
	int i, retval = -1, nextFragT;
	client_t *cl;

	for( i = 0; i < sv_maxclients->integer; i++ )
	{
		cl = &svs.clients[i];

#ifdef USE_DEMO_SERVER
    if( cl->demoClient )
      continue;
#endif

		if ( cl->state )
    {
			nextFragT = SV_RateMsec(cl);

			if(!nextFragT)
				nextFragT = SV_Netchan_TransmitNextFragment(cl);

			if(nextFragT >= 0 && (retval == -1 || retval > nextFragT))
				retval = nextFragT;
		}
	}

	return retval;
}


/*
==================
SV_SendDownloadMessages

Send one round of download messages to all clients
==================
*/
int SV_SendDownloadMessages( void )
{
	int i, numDLs = 0;
	client_t *cl;
	
	for( i = 0; i < sv_maxclients->integer; i++ )
	{
		cl = &svs.clients[i];
		if ( cl->state >= CS_CONNECTED && *cl->downloadName )
		{
			numDLs += SV_WriteDownloadToClient( cl );
		}
	}

	return numDLs;
}


/*
=================
SV_Disconnect_f

The client is going to disconnect, so remove the connection immediately  FIXME: move to game?
=================
*/
static void SV_Disconnect_f( client_t *cl ) {
	SV_DropClient( cl, "disconnected" );
}


/*
=================
SV_VerifyPaks_f

If we are pure, disconnect the client if they do no meet the following conditions:

1. the first two checksums match our view of cgame and ui
2. there are no any additional checksums that we do not have

This routine would be a bit simpler with a goto but i abstained

=================
*/
static void SV_VerifyPaks_f( client_t *cl ) {
	int nChkSum1, nChkSum2, nClientPaks, i, j, nCurArg;
	int nClientChkSum[512];
	const char *pArg;
	qboolean bGood = qtrue;
	char url[MAX_CVAR_VALUE_STRING];

	Com_Printf("VerifyPaks: %s\n", Cmd_ArgsFrom(0));

#ifdef USE_MULTIVM_SERVER
	if(cl->newWorld > 0) {
		cl->gotCP = qtrue;
		cl->pureAuthentic = qtrue;
		return;
	}
#endif

	// if we are pure, we "expect" the client to load certain things from 
	// certain pk3 files, namely we want the client to have loaded the
	// ui and cgame that we think should be loaded based on the pure setting
	//
	if ( sv_pure->integer != 0 ) {

		nChkSum1 = nChkSum2 = 0;

		// we run the game, so determine which cgame and ui the client "should" be running
		bGood = FS_FileIsInPAK( "vm/cgame.qvm", &nChkSum1, url );
    Com_Printf("Pure pak: %s\n", url);
		bGood &= FS_FileIsInPAK( "vm/ui.qvm", &nChkSum2, NULL );

		nClientPaks = Cmd_Argc();

		if ( nClientPaks > ARRAY_LEN( nClientChkSum ) )
			nClientPaks = ARRAY_LEN( nClientChkSum );

		// start at arg 2 ( skip serverId cl_paks )
		nCurArg = 1;

		pArg = Cmd_Argv(nCurArg++);
		if ( !*pArg ) {
			bGood = qfalse;
Com_DPrintf("VerifyPaks: No args at all\n");
		}
		else
		{
			// https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=475
			// we may get incoming cp sequences from a previous checksumFeed, which we need to ignore
			// since serverId is a frame count, it always goes up
			if ( atoi( pArg ) - sv.checksumFeedServerId < 0 )
			{
				Com_DPrintf( "ignoring outdated cp command from client %s\n", cl->name );
				return;
			}
		}
	
		// we basically use this while loop to avoid using 'goto' :)
		while (bGood) {

			// must be at least 6: "cl_paks cgame ui @ firstref ... numChecksums"
			// numChecksums is encoded
			if (nClientPaks < 6) {
				bGood = qfalse;
Com_DPrintf("VerifyPaks: Not enough paks %i\n", nClientPaks);
				break;
			}
			// verify first to be the cgame checksum
			pArg = Cmd_Argv(nCurArg++);
			if ( !*pArg || *pArg == '@' || atoi(pArg) != nChkSum1 ) {
				bGood = qfalse;
Com_DPrintf("VerifyPaks: CGame doesn't match %s != %i (%s)\n", pArg, nChkSum1, url);
				break;
			}
			// verify the second to be the ui checksum
			pArg = Cmd_Argv(nCurArg++);
			if ( !*pArg || *pArg == '@' || atoi(pArg) != nChkSum2 ) {
				bGood = qfalse;
Com_DPrintf("VerifyPaks: UI doesn't match %s != %i\n", pArg, nChkSum2);
				break;
			}
			// should be sitting at the delimeter now
			pArg = Cmd_Argv(nCurArg++);
			if (*pArg != '@') {
				bGood = qfalse;
Com_DPrintf("VerifyPaks: Delimiter is off %s\n", pArg);
				break;
			}
			// store checksums since tokenization is not re-entrant
			for (i = 0; nCurArg < nClientPaks; i++) {
				nClientChkSum[i] = atoi(Cmd_Argv(nCurArg++));
			}

			// store number to compare against (minus one cause the last is the number of checksums)
			nClientPaks = i - 1;

			// make sure none of the client check sums are the same
			// so the client can't send 5 the same checksums
			for (i = 0; i < nClientPaks; i++) {
				for (j = 0; j < nClientPaks; j++) {
					if (i == j)
						continue;
					if (nClientChkSum[i] == nClientChkSum[j]) {
						bGood = qfalse;
Com_DPrintf("VerifyPaks: Duplicate checksums: %i == %i\n", i, j);
						break;
					}
				}
				if (bGood == qfalse)
					break;
			}
			if (bGood == qfalse)
				break;

			// check if the client has provided any pure checksums of pk3 files not loaded by the server
			for ( i = 0; i < nClientPaks; i++ ) {
				if ( !FS_IsPureChecksum( nClientChkSum[i] ) ) {
					bGood = qfalse;
Com_DPrintf("VerifyPaks: Checksum doesn't exist: %i\n", nClientChkSum[i]);
					break;
				}
			}
			if ( bGood == qfalse ) {
				break;
			}

			// check if the number of checksums was correct
			nChkSum1 = sv.checksumFeed;
			for (i = 0; i < nClientPaks; i++) {
				nChkSum1 ^= nClientChkSum[i];
			}
			nChkSum1 ^= nClientPaks;
			if (nChkSum1 != nClientChkSum[nClientPaks]) {
				bGood = qfalse;
Com_DPrintf("VerifyPaks: Number of checksums wrong: %i != %i\n", nChkSum1, nClientChkSum[nClientPaks]);
				break;
			}

			// break out
			break;
		}

		cl->gotCP = qtrue;

		if ( bGood ) {
      Com_Printf("Client is authentic\n");
			cl->pureAuthentic = qtrue;
		} else {
			cl->pureAuthentic = qfalse;
			cl->lastSnapshotTime = svs.time - 9999; // generate a snapshot immediately
			cl->state = CS_ZOMBIE; // skip delta generation
			SV_SendClientSnapshot( cl );
			cl->state = CS_ACTIVE;
			SV_DropClient( cl, "Unpure client detected. Invalid .PK3 files referenced!" );
		}
	}
}


/*
=================
SV_ResetPureClient_f
=================
*/
static void SV_ResetPureClient_f( client_t *cl ) {
	cl->pureAuthentic = qfalse;
	cl->gotCP = qfalse;
}


/*
=================
SV_UserinfoChanged

Pull specific info from a newly changed userinfo string
into a more C friendly form.
=================
*/
void SV_UserinfoChanged( client_t *cl, qboolean updateUserinfo, qboolean runFilter ) {
	const char *val;
	const char *ip;
	int	i;

	if ( cl->netchan.remoteAddress.type == NA_BOT ) {
		cl->lastSnapshotTime = svs.time - 9999; // generate a snapshot immediately
		cl->snapshotMsec = 1000 / sv_fps->integer;
		cl->rate = 0;
		return;
	}

	// rate command

	// if the client is on the same subnet as the server and we aren't running an
	// internet public server, assume they don't need a rate choke
	if ( cl->netchan.remoteAddress.type == NA_LOOPBACK || ( cl->netchan.isLANAddress && com_dedicated->integer != 2 && sv_lanForceRate->integer ) ) {
		cl->rate = 0; // lans should not rate limit
	} else {
		val = Info_ValueForKey( cl->userinfo, "rate" );
		if ( val[0] )
			cl->rate = atoi( val );
		else
			cl->rate = 10000; // was 3000

		if ( sv_maxRate->integer ) {
			if ( cl->rate > sv_maxRate->integer )
				cl->rate = sv_maxRate->integer;
		}

		if ( sv_minRate->integer ) {
			if ( cl->rate < sv_minRate->integer )
				cl->rate = sv_minRate->integer;
		}
	}

	// snaps command
	val = Info_ValueForKey( cl->userinfo, "snaps" );
	if ( val[0] && !NET_IsLocalAddress( &cl->netchan.remoteAddress ) )
		i = atoi( val );
	else
		i = sv_fps->integer; // sync with server

	// range check
	if ( i < 1 )
		i = 1;
	else if ( i > sv_fps->integer )
		i = sv_fps->integer;

	i = 1000 / i; // from FPS to milliseconds
	
	if ( i != cl->snapshotMsec )
	{
		// Reset last sent snapshot so we avoid desync between server frame time and snapshot send time
		cl->lastSnapshotTime = svs.time - 9999; // generate a snapshot immediately
		cl->snapshotMsec = i;
	}

	if ( !updateUserinfo )
		return;

	// name for C code
	val = Info_ValueForKey( cl->userinfo, "name" );
	// truncate if it is too long as it may cause memory corruption in OSP mod
#ifndef BUILD_GAME_STATIC
  char buf[ MAX_NAME_LENGTH ];
	if ( gvm->forceDataMask && strlen( val ) >= sizeof( buf ) ) {
    char buf[ MAX_NAME_LENGTH ];
		Q_strncpyz( buf, val, sizeof( buf ) );
		Info_SetValueForKey( cl->userinfo, "name", buf );
		val = buf;
	}
#endif
	Q_strncpyz( cl->name, val, sizeof( cl->name ) );

	val = Info_ValueForKey( cl->userinfo, "handicap" );
	if ( val[0] ) {
		i = atoi( val );
		if ( i <= 0 || i > 100 || strlen( val ) > 4 ) {
			Info_SetValueForKey( cl->userinfo, "handicap", "100" );
		}
	}
  
#ifdef USE_RECENT_EVENTS
  val = Info_ValueForKey( cl->userinfo, "cl_recentPassword" );
  if (( sv_recentPassword->string[0] && strcmp( val, sv_recentPassword->string ) == 0 )) {
    Com_DPrintf("Recent events for client: %li\n", cl - svs.clients);
    cl->isRecent = qtrue;
  }
#endif

	// TTimo
	// maintain the IP information
	// the banning code relies on this being consistently present
	if ( NET_IsLocalAddress( &cl->netchan.remoteAddress ) )
		ip = "localhost";
	else
		ip = NET_AdrToString( &cl->netchan.remoteAddress );

	if ( !Info_SetValueForKey( cl->userinfo, "ip", ip ) )
		SV_DropClient( cl, "userinfo string length exceeded" );

	Info_SetValueForKey( cl->userinfo, "tld", cl->tld );

	if ( runFilter )
	{
		val = SV_RunFilters( cl->userinfo, &cl->netchan.remoteAddress );
		if ( *val != '\0' ) 
		{
			SV_DropClient( cl, val );
		}
	}
}


/*
==================
SV_UpdateUserinfo_f
==================
*/
void SV_UpdateUserinfo_f( client_t *cl ) {
	const char *info;

#ifdef USE_DEMO_SERVER
	// Save userinfo changes to demo (also in SV_SetUserinfo() in sv_init.c)
	if ( sv.demoState == DS_RECORDING ) {
		SV_DemoWriteClientUserinfo( cl, Cmd_Argv(1) );
	}
#endif

	info = Cmd_Argv( 1 );

	if ( Cmd_Argc() != 2 || *info == '\0' ) {
		// this is something erroneous, client should never send that
		return;
	}

	Q_strncpyz( cl->userinfo, info, sizeof( cl->userinfo ) );

	SV_UserinfoChanged( cl, qtrue, qtrue ); // update userinfo, run filter
	// call prog code to allow overrides
	VM_Call( gvm, 1, GAME_CLIENT_USERINFO_CHANGED, cl - svs.clients );
}

extern int SV_Strlen( const char *str );

/*
==================
SV_PrintLocations_f
==================
*/
void SV_PrintLocations_f( client_t *client ) {
	int i, len;
	client_t *cl;
	int max_namelength;
	int max_ctrylength;
	char line[128];
	char buf[1400-4-8], *s;
	char filln[MAX_NAME_LENGTH];
	char fillc[64];

	if ( !svs.clients )
		return;

	max_namelength = 4; // strlen( "name" )
	max_ctrylength = 7; // strlen( "country" )

	// first pass: save and determine max.legths of name/address fields
	for ( i = 0, cl = svs.clients ; i < sv_maxclients->integer ; i++, cl++ )
	{
		if ( cl->state == CS_FREE )
			continue;

		len = SV_Strlen( cl->name );// name length without color sequences
		if ( len > max_namelength )
			max_namelength = len;

		len = strlen( cl->country );
		if ( len > max_ctrylength )
			max_ctrylength = len;
	}

	s = buf; *s = '\0';
	memset( filln, '-',  max_namelength ); filln[max_namelength] = '\0';
	memset( fillc, '-',  max_ctrylength ); fillc[max_ctrylength] = '\0';
	// Start this on a new line to be viewed properly in console
	s = Q_stradd( s, "\n" );
	Com_sprintf( line, sizeof( line ), "ID %-*s CC Country\n", max_namelength, "Name" );
	s = Q_stradd( s, line );
	Com_sprintf( line, sizeof( line ), "-- %s -- %s\n", filln, fillc );
	s = Q_stradd( s, line );

	for ( i = 0, cl = svs.clients ; i < sv_maxclients->integer ; i++, cl++ )
	{
		if ( cl->state == CS_FREE )
			continue;

		len = Com_sprintf( line, sizeof( line ), "%2i %s%-*s" S_COLOR_WHITE " %2s %s\n",
			i, cl->name, max_namelength-SV_Strlen(cl->name), "", cl->tld, cl->country );

		if ( s - buf + len >= sizeof( buf )-1 ) // flush accumulated buffer
		{
			if ( client )
				NET_OutOfBandPrint( NS_SERVER, &client->netchan.remoteAddress, "print\n%s", buf );
			else
				Com_Printf( "%s", buf );

			s = buf; *s = '\0';
		}

		s = Q_stradd( s, line );
	}
	
	if ( buf[0] )
	{
		if ( client )
			NET_OutOfBandPrint( NS_SERVER, &client->netchan.remoteAddress, "print\n%s", buf );
		else
			Com_Printf( "%s", buf );
	}
}

#ifdef USE_MULTIVM_SERVER
#ifndef __WASM__
void NET_OpenIP( int igvm );
#endif

void SV_LoadVM( client_t *cl ) {
	char *mapname;
	int checksum;
	int i, previous;

	for(i = 0; i < MAX_NUM_VMS; i++) {
		if(gvmWorlds[i]) continue;
		else {
			previous = gameWorlds[i];
			gvmi = i;
			break;
		}
	}

  for ( i = 0 ; i < MAX_CONFIGSTRINGS; i++ ) {
    sv.configstrings[i] = CopyString("");
  }

  // load clip map
	mapname = Cmd_Argv(2);
	if(mapname[0] == '\0') {
		gameWorlds[gvmi] = previous;
		CM_SwitchMap(gameWorlds[gvmi]);
	} else {
		FS_BypassPure();
#ifdef USE_MEMORY_MAPS
  // TODO: make this asynchronous where the console and server waits for it to compile
		if(sv_memoryMaps->integer)
			SV_MakeMap((const char **)&mapname); // make the BSP and then it will load normally	
#endif
		Sys_SetStatus( "Loading map %s", mapname );
    Cvar_Get( va("mapname_%i", gvmi), mapname, CVAR_TAGGED_SPECIFIC );
    Cvar_Set( va("mapname_%i", gvmi), mapname );
		if(sv_mvWorld->integer) {
			Cvar_Get( va("sv_mvWorld_%i", gvmi), va("%i", gvmi), CVAR_TAGGED_SPECIFIC );
			Cvar_Set( va("sv_mvWorld_%i", gvmi), va("%i", gvmi) );
		}
		gameWorlds[gvmi] = CM_LoadMap( va( "maps/%s.bsp", mapname ), qfalse, &checksum );
		Cvar_Set( va("sv_mapChecksum_%i", gvmi), va( "%i", checksum ) );
    Cvar_Get( va("sv_mapChecksum_%i", gvmi), "", CVAR_TAGGED_SPECIFIC );
		FS_RestorePure();
	}
  
  // settle the new map
	SV_ClearWorld();
  sv.state = SS_LOADING;
	SV_SetAASgvm(gvmi);
#ifndef __WASM__
	NET_OpenIP(gvmi);
#endif
	SV_InitGameProgs(qtrue);
	// catch up with current VM
	for ( i = 4; i > 1; i-- )
	{
		VM_Call( gvm, 1, GAME_RUN_FRAME, sv.time - i * 100 );
		SV_BotFrame( sv.time - i * 100 );
	}

  SV_SetConfigstring( CS_SYSTEMINFO, Cvar_InfoString_Big( CVAR_SYSTEMINFO, NULL, gvmi ) );
  cvar_modifiedFlags &= ~CVAR_SYSTEMINFO;

  SV_SetConfigstring( CS_SERVERINFO, Cvar_InfoString( CVAR_SERVERINFO, NULL, gvmi ) );
  cvar_modifiedFlags &= ~CVAR_SERVERINFO;
	
  sv.state = SS_GAME;	
	Sys_SetStatus( "Running map %s", mapname );
	SV_CreateBaseline();

	// ------------- TODO: add that stuff with reconnecting clients and bots here
	//   make it a cvar like a game dynamic if players should automatically have presence everywhere
	//   like in the game mode with a mirror dimension with synchronized coords
	/*
	for (i=0,cl=svs.clients ; i < sv_maxclients->integer ; i++,cl++) {
		if ( svs.clients[i].state >= CS_CONNECTED
		 	&& svs.clients[i].netchan.remoteAddress.type == NA_BOT) {
			VM_Call( gvm, 3, GAME_CLIENT_CONNECT, i, qtrue, qfalse );
		}
	}
	*/
	VM_Call( gvm, 1, GAME_RUN_FRAME, sv.time );
	SV_BotFrame( sv.time );
	SV_RemainingGameState();
	Com_Printf ("---------------- Finished Starting Map (%i: %s) -------------------\n", gvmi, mapname);

	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
}
#endif


#if defined(USE_MULTIVM_SERVER) || defined(USE_ENGINE_TELE)
typedef enum {

	SPAWNORIGIN,
	SAMEORIGIN,
	COPYORIGIN,
	MOVEORIGIN,
} origin_enum_t;

// TODO: write displacement code like showing a black cat and shifting 32 units to the right and 
//   gibbing like a telefrag if they end up inside a wall, "player was displaced."

void SV_Teleport( client_t *client, int newWorld, origin_enum_t changeOrigin, vec3_t *newOrigin ) {
	int		clientNum; //, i;
	playerState_t	*ps, oldps;
	vec3_t newAngles;
	//gentity_t *gent, oldEnt;
	
	client->state = CS_ACTIVE;
  clientNum = client - svs.clients;
#ifdef USE_MULTIVM_SERVER
  gvmi = client->gameWorld;
	// set up the entity for the client
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif
	ps = SV_GameClientNum( clientNum );
	memcpy(&oldps, ps, sizeof(playerState_t));

#ifdef USE_MULTIVM_SERVER
	// move to same position in new world, or save position in both worlds?
	if(client->gameWorld != newWorld) {
		if(changeOrigin == COPYORIGIN) {
			// copy old view angles from previous world to new world
			memcpy(newOrigin, ps->origin, sizeof(vec3_t));
			VectorClear(ps->delta_angles);
			memcpy(newAngles, ps->viewangles, sizeof(vec3_t));
		}
		// not possible, but if it was, copy delta from new world
		// if(changeOrigin == MOVEORIGIN) {
	} else 
#endif
  {
		if(changeOrigin == MOVEORIGIN) {
			VectorClear(ps->delta_angles);
			// TODO: move in the direction of the view
		}
	}

#ifdef USE_MULTIVM_SERVER
	if(client->gameWorld != newWorld) {
		gvmi = newWorld;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
		// keep the same origin in the new world as if you've switched worlds
		//   but haven't moved, default behavior
		if(changeOrigin == SAMEORIGIN) {
			ps = SV_GameClientNum( clientNum );
			memcpy(newOrigin, ps->origin, sizeof(vec3_t));
			VectorClear(ps->delta_angles);
			memcpy(newAngles, ps->viewangles, sizeof(vec3_t));
		}
		
		// remove from old world?
		gvmi = client->gameWorld;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
    if(sv_mvOmnipresent->integer == 0) {
      VM_Call( gvm, 1, GAME_CLIENT_DISCONNECT, clientNum );	// firstTime = qfalse
			// clear entity type so we know they are no longer present in this world
			SV_SetConfigstring( CS_PLAYERS + clientNum, "" );
			// also prevents server from sending snapshots from this world
    } else if (sv_mvOmnipresent->integer == -1) {
      SV_ExecuteClientCommand(client, "team s");
    }
		client->deltaMessage = -1;
		client->lastSnapshotTime = svs.time - 9999; // generate a snapshot immediately

		gvmi = newWorld;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
		client->newWorld = newWorld;
		if(qtrue || !SV_PlayerPresent(clientNum) || !client->multiview.protocol) {
			// if the client is new to the world, the only option is SPAWNORIGIN
			if(changeOrigin != COPYORIGIN) {
				changeOrigin = SPAWNORIGIN;
			}
			// above must come before this because there is a filter 
			//   to only send commands from a game to the client of the same world
			VM_Call( gvm, 3, GAME_CLIENT_CONNECT, clientNum, qfalse, qfalse );	// firstTime = qfalse
			// if this is the first time they are entering a world, send a gamestate
			client->state = CS_CONNECTED;
			client->gamestateMessageNum = -1; // send a new gamestate
			SV_SendClientGameState( client );
			//return; // update location below
		} else {
			// above must come before this because there is a filter 
			//   to only send commands from a game to the client of the same world
			VM_Call( gvm, 3, GAME_CLIENT_CONNECT, clientNum, qfalse, qfalse );	// firstTime = qfalse
			// not the first time they have entered, automatically connect
			client->gameWorld = newWorld;
			client->state = CS_PRIMED;
			// notify the client of the secondary map
			if(sv_mvWorld->integer) {
				SV_SendServerCommand(client, "world %i", client->newWorld);
			}
		}
		Com_Printf("Switching worlds (client: %i, origin: %i): %i -> %i\n", clientNum, changeOrigin, client->gameWorld, client->newWorld);
	}
#endif

	SV_UpdateConfigstrings( client );
	// modify location
	{
		sharedEntity_t *ent = SV_GentityNum( clientNum );
		ps = SV_GameClientNum( clientNum );
		ent->s.eFlags ^= EF_TELEPORT_BIT;
		ps->eFlags ^= EF_TELEPORT_BIT;
		ent->s.number = clientNum;
		client->gentity = ent;
#ifdef USE_MULTIVM_SERVER
		if(client->newWorld == client->gameWorld) {
			VM_Call( gvm, 1, GAME_CLIENT_BEGIN, clientNum );
			client->state = CS_ACTIVE;
		}
#else
		VM_Call( gvm, 1, GAME_CLIENT_BEGIN, clientNum );
#endif
		

		// if copy, keeping the original/same, or moving origins,
		//   we need to reset a few things
		if(changeOrigin > SPAWNORIGIN) {
			// put up a little so it can drop to the floor on the next frame and 
			//   doesn't bounce with tracing/lerping to the floor
			memcpy(ps->origin, newOrigin, sizeof(vec3_t));
			memcpy(ps->viewangles, newAngles, sizeof(vec3_t));
			//ps->origin[2] = *newOrigin[2] + 9.0f;
			memcpy(ent->r.currentOrigin, ps->origin, sizeof(vec3_t));
			memcpy(ent->r.currentAngles, ps->viewangles, sizeof(vec3_t));
			// keep the same view angles if changing origins
			SV_SetClientViewAngle(clientNum, ((playerState_t*)ps)->viewangles);
		}
	}
	
	// TODO: restore player stats
	//memcpy(&ps->stats, &oldps.stats, sizeof(ps->stats));
	//memcpy(&ps->ammo, &oldps.ammo, sizeof(ps->ammo));
	//memcpy(&ps->persistant, &oldps.persistant, sizeof(ps->persistant));

	// Move Teleporter Res entity to follow player anywhere
	/*
	for(i = 0; i < sv.num_entities; i++) {
		ent = SV_GentityNum(i);
		if(ent->s.clientNum == clientNum 
			&& i != clientNum
			&& (ent->s.eType == (ET_EVENTS + EV_PLAYER_TELEPORT_IN))) {
			rez = SV_GameClientNum(i);
			memcpy(&rez->origin, &ps->origin, sizeof(vec3_t));
			memcpy(&ent->s.origin, &ps->origin, sizeof(vec3_t));
			memcpy(&ent->s.origin2, &ps->origin, sizeof(vec3_t));
			memcpy(&ent->r.currentOrigin, &ps->origin, sizeof(vec3_t));
			memcpy(&ent->s.pos.trBase, &ps->origin, sizeof(vec3_t));
			memset(&ent->s.pos.trDelta, 0, sizeof(vec3_t));
			memcpy(&ent->r.s, &ent->s, sizeof(ent->s));
		}
	}
	*/
}


int parseEntities(const char **ents) {
	const char *buffer = CM_EntityString();
	qboolean ignoreLine = qfalse;
	int count = 0, numEntities = 0, depth = 0;

	// read every brush and entity origin
	while(1) {
		if(buffer[count] == '\0') break;
		// ignore comments
		if(buffer[count] == '/' && buffer[count+1] == '/') {
			ignoreLine = qtrue;
			count++;
			continue;
		}
		if(buffer[count] == '\n') ignoreLine = qfalse;
		if(ignoreLine) {
			count++;
			continue;
		}

		// first curls are entities
		//   second curls are brushes
		if(buffer[count] == '{') {
			if(depth == 0) {
				ents[numEntities] = &buffer[count + 1];
			}
			depth++;
		}
		if(buffer[count] == '}') {
			if(depth == 1) {
				numEntities++;
			}
			depth--;
		}
		count++;
	}
	return numEntities;
}


int parseKeys(const char *buffer, const char **keys, const char **vals) {
#define MAX_KEYVALUES 16
	qboolean ignoreLine = qfalse;
	qboolean isKey = qfalse;
	qboolean isValue = qfalse;
	int tokenStartPos = 0;
	int count = 0, numKeyValues = 0;

	while(1) {
		// ignore comments
		if(buffer[count] == '/' && buffer[count+1] == '/') {
			ignoreLine = qtrue;
			count++;
			continue;
		}
		if(buffer[count] == '\n') ignoreLine = qfalse;
		if(ignoreLine) {
			count++;
			continue;
		}

		if(buffer[count] == '\0'
			|| buffer[count] == '{' || buffer[count] == '}') {
			break;
		}

		if(!isKey && !isValue && buffer[count] == '"') {
			if(keys[numKeyValues] != NULL) {
				vals[numKeyValues] = &buffer[count];
				isValue = qtrue;
			}
			else {
				keys[numKeyValues] = &buffer[count+1];
				isKey = qtrue;
			}
			tokenStartPos = count+1;
		} else if (isKey && buffer[count] == '"') {
			isKey = qfalse;
		} else if (isValue && buffer[count] == '"') {
			isValue = qfalse;
			numKeyValues++;
		} else if (!isKey && !isValue && (buffer[count] == '\t' || buffer[count] == ' ')) {
			// ignore whitespace in between
		}
		count++;
	}
	return numKeyValues;
}


qboolean SV_FindLocation(char *loc, vec3_t newOrigin, vec3_t angles) {
#define MAX_NUM_SPAWNS 64
	vec3_t origin;
	vec3_t delta;
	vec3_t spawnPoints[MAX_NUM_SPAWNS];
	static const char *entities[MAX_GENTITIES];
	char nearest[MAX_TOKEN_CHARS];
	char message[MAX_TOKEN_CHARS];
	int len;
	int countSpawns = 0;
	float nearestLocation = 999999.0f;
	qboolean isFound = qfalse;
	int numEntities = parseEntities(entities);

	for(int i = 0; i < numEntities; i++) {
		const char *keys[MAX_KEYVALUES];
		const char *vals[MAX_KEYVALUES];
		memset(keys, 0, sizeof(keys));
		memset(vals, 0, sizeof(vals));
		const char *ent = entities[i];
		qboolean isWorldspawn = qfalse;
		qboolean isLocation = qfalse;
		qboolean isPlayerStart = qfalse;
		int numKeyValues = parseKeys(ent, keys, vals);
		for(int j = 0; j < numKeyValues; j++) {
			if(!Q_stricmpn(keys[j], "classname", 9)) {
				if(!Q_stricmpn(vals[j]+1, "info_player_start", 16)
					|| !Q_stricmpn(vals[j]+1, "info_player_deathmatch", 22)) {
					if(countSpawns > MAX_NUM_SPAWNS) {
						//Com_Printf("Too many spawn points\n");
						break;
					}
					isPlayerStart = qtrue;
				}
				else if (!Q_stricmpn(vals[j]+1, "target_location", 14)) {
					isLocation = qtrue;
				}
				else if (!Q_stricmpn(vals[j]+1, "worldspawn", 10)) {
					isWorldspawn = qtrue;
				}
				else {
				}
			}
			if(!Q_stricmpn(keys[j], "message", 7)) {
				sscanf(vals[j], "\"%s\"", message);
			}
			if(!Q_stricmpn(keys[j], "origin", 6)) {
				sscanf(vals[j], "\"%f %f %f\"", 
					&origin[0], 
					&origin[1], 
					&origin[2]);
			}
		}
		if(isWorldspawn) {
			continue;
		}
		if(isLocation) {
			// check if spawn is shortest distance to target
			VectorSubtract(newOrigin, origin, delta);
			len = VectorNormalize(delta);
			if(len < nearestLocation) {
				nearestLocation = len;
				strcpy(nearest, message);
			}
			// if target matches loc, return origin and angles
			if(loc[0] != '\0' && !Q_stricmp(loc, message)) {
				isFound = qtrue;
				VectorCopy(origin, newOrigin);
			}
		} else if (isPlayerStart && countSpawns < MAX_NUM_SPAWNS) { // tig_ra3 uses more spawn points than that
			VectorCopy(origin, spawnPoints[countSpawns]);
			countSpawns++;
		}
	}

	if(loc[0] == '\0') {
		Com_Printf("Current location:\n");
		Com_Printf("%s\n", nearest);
		return qfalse;
	}

	if(isFound) {
		nearestLocation = 999999.0f;
		for(int i = 0; i < countSpawns; i++) {
			VectorSubtract(newOrigin, spawnPoints[i], delta);
			len = VectorNormalize(delta);
			if(len < nearestLocation) {
				nearestLocation = len;
				VectorCopy(spawnPoints[i], origin);
			}
		}
		VectorCopy(origin, newOrigin);
		Com_Printf("teleporter found: %f, %f, %f\n", newOrigin[0], newOrigin[1], newOrigin[2]);
		return qtrue;
	}

	return qfalse;
}


// Teleporting from a to b in the same map
void SV_Tele_f( client_t *client ) {
	char cmd[MAX_CMD_LINE];
	int i, clientNum;
  float scale, speed;
	vec3_t newOrigin = {0.0, 0.0, 0.0}, wishvel, forward, right, up;
	char *userOrigin[3];
	playerState_t	*ps;
  qboolean anyRelative;
	int count;

	if(!client) return;
	clientNum = client - svs.clients;
#ifdef USE_MULTIVM_SERVER
	gvmi = client->gameWorld;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif
	ps = SV_GameClientNum( clientNum );

	count = Cmd_Argc();
	userOrigin[0] = Cmd_Argv(1);
	userOrigin[1] = Cmd_Argv(2);
	userOrigin[2] = Cmd_Argv(3);

	Q_strncpyz(cmd, Cmd_ArgsFrom(0), sizeof(cmd));

	// TODO: need to check a named list of teleporter locations on map
	// TODO: add levenstient "did you mean?" message from server
	// select closest spawn point to named target_location
	VectorCopy(ps->origin, newOrigin);
	if(SV_FindLocation(Cmd_ArgsFrom(1), newOrigin, forward)) {
		// TODO: setclientangles forward
#ifdef USE_MULTIVM_SERVER
		SV_Teleport(client, client->gameWorld, MOVEORIGIN, &newOrigin);
		gvmi = 0;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
#else
    SV_Teleport(client, 0, MOVEORIGIN, &newOrigin);
#endif
		return;
	} else if(count != 4) {
		Com_Printf("Usage: tele <x> <y> <z>\nOr: tele <location>\n");
#ifdef USE_MULTIVM_SERVER
		gvmi = 0;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
#endif
		return;
	}

	if(userOrigin[0][0] != '\0'
    || userOrigin[1][0] != '\0'
	  || userOrigin[2][0] != '\0') {

    anyRelative = qfalse;
    for(i = 0; i < 3; i++) {
			if(userOrigin[i][0] != '\0') {
				if(userOrigin[i][0] == '-' || userOrigin[i][0] == '+') {
          anyRelative = qtrue;
        }
      }
    }
    
    if(anyRelative) {
      for(i = 0; i < 3; i++) {
  			if(userOrigin[i][0] != '\0') {
  				if(userOrigin[i][0] == '-') {
  					newOrigin[i] = -atoi(&userOrigin[i][1]);
  				} else if (userOrigin[i][0] == '+') {
  					newOrigin[i] = atoi(&userOrigin[i][1]);
  				} else {
  					newOrigin[i] = 0;
  				}
  			}
      }

      // move in the direction the player is facing
      speed = VectorLength(newOrigin);
      scale = speed / sqrt( newOrigin[0] * newOrigin[0]
    		+ newOrigin[1] * newOrigin[1] 
        + newOrigin[2] * newOrigin[2] );

      AngleVectors (ps->viewangles, forward, right, up);

      for ( i = 0 ; i < 3 ; i++ ) {
    		wishvel[i] = forward[i]*newOrigin[0] + right[i]*newOrigin[1];
    	}
      wishvel[2] += newOrigin[2];
      
      speed = VectorNormalize(wishvel) * scale;
      VectorMA( ps->origin, speed, wishvel, newOrigin );
    } else {
      for(i = 0; i < 3; i++) {
  			if(userOrigin[i][0] != '\0') {
          newOrigin[i] = atoi(userOrigin[i]);
        } else {
          newOrigin[i] = ps->origin[i];
        }
      }
    }


#ifdef USE_MULTIVM_SERVER
		SV_Teleport(client, client->gameWorld, MOVEORIGIN, &newOrigin);
#else
    SV_Teleport(client, 0, MOVEORIGIN, &newOrigin);
#endif
	} else {
		// accept new position
#ifdef USE_MULTIVM_SERVER
		SV_Teleport(client, client->gameWorld, SPAWNORIGIN, &newOrigin);
#else
    SV_Teleport(client, 0, SPAWNORIGIN, &newOrigin);
#endif
	}	

#ifdef USE_MULTIVM_SERVER
	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif
}
#endif


#ifdef USE_MULTIVM_SERVER
// The kind of teleports that changes which world we are in
void SV_GameCL_f( client_t *client ) {
	int worldC, count = 0, i;
	char *world, *userOrigin;
	int clientNum;
	origin_enum_t changeOrigin;
	qboolean found = qfalse, tryAgain = qtrue;
	vec3_t newOrigin = {0.0, 0.0, 0.0};

	if(!client) return;
	if(atoi(Info_ValueForKey( client->userinfo, "mvproto" )) != MV_PROTOCOL_VERSION) {
		if(sv_mvOmnipresent->integer > 0) {
			NET_OutOfBandPrint( NS_SERVER, &client->netchan.remoteAddress, "print\nSorry, but this server requires multiview %i\n", MV_PROTOCOL_VERSION );
			Com_DPrintf( "Game comand rejected a regular client.\n" );
			return;
		} else {
			// send a new gamestate just like normal, every time they go through a portal they have to load games
		}
	} else {
		client->multiview.protocol = atoi(Info_ValueForKey( client->userinfo, "mvproto" ));;
		client->multiview.scoreQueryTime = 0;
	}
	clientNum = client - svs.clients;
	
	userOrigin = Cmd_Argv(1);
	if(userOrigin[0] == '0') {
		changeOrigin = SPAWNORIGIN;
	} else if(userOrigin[0] == '2') {
		changeOrigin = COPYORIGIN;
	} else {
		changeOrigin = SAMEORIGIN;
	}
	
	world = Cmd_Argv(2);
	if(world[0] != '\0') {
		worldC = atoi(world);
	} else {
		worldC = client->gameWorld + 1;
	}

resetwithcount:
	count = 0;
	for(i = 0; i < MAX_NUM_VMS; i++) {
		if(!gvmWorlds[i]) continue;
		if(count == worldC) {
			found = qtrue;
			count++;
			break;
		}
		count++;
	}
	if(!found) {
		if(tryAgain) {
			tryAgain = qfalse;
			worldC = worldC % count;
			goto resetwithcount;
		}
		return;
	}
	
	if(client->gameWorld == i) {
		return;
	}
	
	SV_Teleport(client, i, changeOrigin, &newOrigin);
}
#endif

typedef struct {
	const char *name;
	void (*func)( client_t *cl );
} ucmd_t;

static const ucmd_t ucmds[] = {
	{"userinfo", SV_UpdateUserinfo_f},
	{"disconnect", SV_Disconnect_f},
	{"cp", SV_VerifyPaks_f},
	{"vdr", SV_ResetPureClient_f},
	{"download", SV_BeginDownload_f},
	{"nextdl", SV_NextDownload_f},
	{"stopdl", SV_StopDownload_f},
	{"donedl", SV_DoneDownload_f},
	{"locations", SV_PrintLocations_f},

#if defined(USE_MULTIVM_SERVER) || defined (USE_ENGINE_TELE)
  {"tele", SV_Tele_f},
#endif
#ifdef USE_MULTIVM_SERVER
	{"load", SV_LoadVM},
	{"game", SV_GameCL_f},
#endif
#ifdef USE_MV
	{"mvjoin", SV_MultiView_f},
	{"mvleave", SV_MultiView_f},
#endif
	{NULL, NULL}
};


/*
================
SV_FloodProtect
================
*/
static qboolean SV_FloodProtect( client_t *cl ) {
	if ( sv_floodProtect->integer ) {
		return SVC_RateLimit( &cl->cmd_rate, 8, 500 );
	} else {
		return qfalse;
	}
}


/*
==================
SV_ExecuteClientCommand

Also called by bot code
==================
*/
qboolean SV_ExecuteClientCommand( client_t *cl, const char *s ) {
	const ucmd_t *ucmd;
	qboolean bFloodProtect;
	
	Cmd_TokenizeString( s );

#ifdef USE_CMD_CONNECTOR
  // TODO: check implied rconpassword (cl_guid) from previous attempt by client
	char		sv_outputbuf[1024 - 16];
	// Execute client strings as local commands, 
	// in case of running a web-worker dedicated server
	if(cl->netchan.remoteAddress.type == NA_LOOPBACK) {
		redirectAddress = cl->netchan.remoteAddress;
		Com_BeginRedirect( sv_outputbuf, sizeof( sv_outputbuf ), SV_FlushRedirect );
		if(
#ifdef USE_SERVER_ROLES
#ifdef USE_CMD_CONNECTOR
			Cmd_ExecuteLimitedString(s, qtrue, -1)
#else
			Cmd_ExecuteLimitedString(s, -1)
#endif
#else
#ifdef USE_CMD_CONNECTOR
			Cmd_ExecuteString(s, qtrue)
#else
			Cmd_ExecuteString(s)
#endif
#endif
		) {
			Com_EndRedirect();
			return qtrue;
		}
		
		// in baseq3 game (not cgame or ui) the dedicated flag is used for
		// say "server:" and other logging bs. hope this is sufficient?
#ifndef DEDICATED
		int ded = com_dedicated->integer;
		Cvar_Set("dedicated", "0");
#endif
		if(com_sv_running && com_sv_running->integer) {
			VM_Call( gvm, 1, GAME_RUN_FRAME, sv.time );
      SV_GameCommand();
		}
#ifndef DEDICATED
		Cvar_Set("dedicated", va("%i", ded));
#endif
		Com_EndRedirect();
	}
#endif

	// malicious users may try using too many string commands
	// to lag other players.  If we decide that we want to stall
	// the command, we will stop processing the rest of the packet,
	// including the usercmd.  This causes flooders to lag themselves
	// but not other people

	// We don't do this when the client hasn't been active yet since it's
	// normal to spam a lot of commands when downloading
	bFloodProtect = cl->netchan.remoteAddress.type != NA_BOT && cl->state >= CS_ACTIVE;

	// see if it is a server level command
	for ( ucmd = ucmds; ucmd->name; ucmd++ ) {
		if ( !strcmp( Cmd_Argv(0), ucmd->name ) ) {
			if ( ucmd->func == SV_UpdateUserinfo_f ) {
				if ( bFloodProtect ) {
					if ( SVC_RateLimit( &cl->info_rate, 5, 1000 ) ) {
						return qfalse; // lag flooder
					}
				}
			} else if ( ucmd->func == SV_PrintLocations_f && !sv_clientTLD->integer ) {
				continue; // bypass this command to the gamecode
			}
			ucmd->func( cl );
			bFloodProtect = qfalse;
			break;
		}
	}

#ifndef DEDICATED
	if ( !com_cl_running->integer && bFloodProtect && SV_FloodProtect( cl ) ) {
#else
	if ( bFloodProtect && SV_FloodProtect( cl ) ) {
#endif
		// ignore any other text messages from this client but let them keep playing
		Com_DPrintf( "client text ignored for %s: %s\n", cl->name, Cmd_Argv(0) );
	} else {
		// pass unknown strings to the game
		if (!ucmd->name && sv.state == SS_GAME && (cl->state == CS_ACTIVE || cl->state == CS_PRIMED
#ifdef USE_DEMO_SERVER
       || cl->demoClient // accept democlients, else you won't be able to make democlients join teams nor say messages!
#endif
    )) {
#ifdef USE_DEMO_SERVER
			if ( sv.demoState == DS_RECORDING ) { // if demo is recording, we store this command and clientid
				SV_DemoWriteClientCommand( cl, s );
			} else if ( sv.demoState == DS_PLAYBACK &&
				   ( (cl - svs.clients) >= sv_democlients->integer ) && ( (cl - svs.clients) < sv_maxclients->integer ) && // preventing only real clients commands (not democlients commands replayed)
				   ( !Q_stricmp(Cmd_Argv(0), "team") && Q_stricmp(Cmd_Argv(1), "s") && Q_stricmp(Cmd_Argv(1), "spectator") ) ) { // if there is a demo playback, we prevent any real client from doing a team change, if so, we issue a chat messsage (except if the player join team spectator again)
				SV_SendServerCommand(cl, "chat \"^3Can't join a team when a demo is replaying!\""); // issue a chat message only to the player trying to join a team
				SV_SendServerCommand(cl, "cp \"^3Can't join a team when a demo is replaying!\""); // issue a chat message only to the player trying to join a team
				Cmd_Clear();
				return qtrue;
			}
#endif
			if(strcmp(Cmd_Argv(0), "say") && strcmp(Cmd_Argv(0), "say_team")
		 		&& strcmp(Cmd_Argv(0), "tell"))
				Cmd_Args_Sanitize("\n\r;"); //remove \n, \r and ; from string. We don't do that for say-commands because it makes people mad (understandebly)
#ifdef USE_REFEREE_CMDS
			else { // don't sanitize, instead check chat commands for client referee mute
				if(cl->muted) {
					Cmd_Clear();
					return qtrue;
				}
			}
			if( !Q_stricmp(Cmd_Argv(0), "team") ) {
				if(!Q_stricmp(Cmd_Argv(1), "r") || !Q_stricmp(Cmd_Argv(1), "red")) {
					if(sv_lock[0]->integer) {
						SV_SendServerCommand(cl, "cp \"^3Red team is locked!\"");
						Cmd_Clear();
						return qtrue;
					}
				}
				if(!Q_stricmp(Cmd_Argv(1), "b") || !Q_stricmp(Cmd_Argv(1), "blue")) {
					if(sv_lock[1]->integer) {
						SV_SendServerCommand(cl, "cp \"^3Blue team is locked!\"");
						Cmd_Clear();
						return qtrue;
					}
				}
			}
			if(!strcmp(Cmd_Argv(0), "say")
				&& Q_stristr(Cmd_ArgsFrom(1), "server medic")) {
#ifdef USE_RECENT_EVENTS
				char player[MAX_INFO_STRING];
				Com_sprintf( player, sizeof( player ), "%s: %s", cl->name, Cmd_ArgsFrom(1));
				SV_RecentEvent(va(RECENT_TEMPLATE_STR, sv.time, SV_EVENT_CALLADMIN, player));
#endif
				Cmd_Clear();
				return qtrue;
			}
#endif
#ifdef USE_RECENT_EVENTS
			if(!strcmp(Cmd_Argv(0), "say")) {
				char player[MAX_INFO_STRING];
				Com_sprintf( player, sizeof( player ), "%s: %s", cl->name, Cmd_ArgsFrom(1));
				SV_RecentEvent(va(RECENT_TEMPLATE_STR, sv.time, SV_EVENT_CLIENTSAY, player));
			}
#endif
			VM_Call( gvm, 1, GAME_CLIENT_COMMAND, cl - svs.clients );
#ifdef USE_MV
			cl->multiview.lastSentTime = svs.time;
#endif

		}
	}

	return qtrue;
}


/*
===============
SV_ClientCommand
===============
*/
static qboolean SV_ClientCommand( client_t *cl, msg_t *msg ) {
	int		seq;
	const char	*s;

	seq = MSG_ReadLong( msg );
	s = MSG_ReadString( msg );

	// see if we have already executed it
	if ( seq - cl->lastClientCommand <= 0 ) {
		return qtrue;
	}

	Com_DPrintf( "clientCommand: %s : %i : %s\n", cl->name, seq, s );

	// drop the connection if we have somehow lost commands
	if ( seq - cl->lastClientCommand > 1 ) {
		Com_Printf( "Client %s lost %i clientCommands\n", cl->name, seq - cl->lastClientCommand - 1 );
		SV_DropClient( cl, "Lost reliable commands" );
		return qfalse;
	}

#ifdef USE_MULTIVM_SERVER
	int prevGvm = gvmi;
	gvmi = cl->newWorld;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
	if ( !SV_ExecuteClientCommand( cl, s ) ) {
		gvmi = prevGvm;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
		return qfalse;
	}
	gvmi = prevGvm;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#else
	if ( !SV_ExecuteClientCommand( cl, s ) ) {
		return qfalse;
	}
#endif


#ifdef USE_MV
	if ( !cl->multiview.recorder && sv_demoFile != FS_INVALID_HANDLE && sv_demoClientID == (cl - svs.clients) ) {
		// forward changes to recorder slot
		svs.clients[ sv_maxclients->integer ].lastClientCommand++;
	}
#endif

	cl->lastClientCommand = seq;
	Q_strncpyz( cl->lastClientCommandString, s, sizeof( cl->lastClientCommandString ) );

	return qtrue;		// continue procesing
}


//==================================================================================


/*
==================
SV_ClientThink

Also called by bot code
==================
*/
void SV_ClientThink (client_t *cl, usercmd_t *cmd) {
	cl->lastUsercmd = *cmd;

	if ( cl->state != CS_ACTIVE ) {
		return;		// may have been kicked during the last usercmd
	}

	VM_Call( gvm, 1, GAME_CLIENT_THINK, cl - svs.clients );
}


/*
==================
SV_UserMove

The message usually contains all the movement commands 
that were in the last three packets, so that the information
in dropped packets can be recovered.

On very fast clients, there may be multiple usercmd packed into
each of the backup packets.
==================
*/
static void SV_UserMove( client_t *cl, msg_t *msg, qboolean delta ) {
	int			i, key;
	int			cmdCount;
	static const usercmd_t nullcmd = { 0 };
	usercmd_t	cmds[MAX_PACKET_USERCMDS], *cmd;
	const usercmd_t *oldcmd;

#ifdef USE_MULTIVM_SERVER
	if(!gvm) {
		return;
	}
#endif

	if ( delta ) {
		cl->deltaMessage = cl->messageAcknowledge;
	} else {
		cl->deltaMessage = cl->netchan.outgoingSequence - ( PACKET_BACKUP + 1 ); // force delta reset
	}

	cmdCount = MSG_ReadByte( msg );

	if ( cmdCount < 1 ) {
		Com_Printf( "cmdCount < 1\n" );
		return;
	}

	if ( cmdCount > MAX_PACKET_USERCMDS ) {
		Com_Printf( "cmdCount > MAX_PACKET_USERCMDS\n" );
		return;
	}

	// use the checksum feed in the key
	key = sv.checksumFeed;
	// also use the message acknowledge
	key ^= cl->messageAcknowledge;
	// also use the last acknowledged server command in the key
	key ^= MSG_HashKey(cl->reliableCommands[ cl->reliableAcknowledge & (MAX_RELIABLE_COMMANDS-1) ], 32);

	oldcmd = &nullcmd;
	for ( i = 0 ; i < cmdCount ; i++ ) {
		cmd = &cmds[i];
		MSG_ReadDeltaUsercmdKey( msg, key, oldcmd, cmd );
#ifdef USE_REFEREE_CMDS
		if(sv_frozen->integer || cl->frozen /* || sv_paused->integer */) {
			cmd->forwardmove = cmd->rightmove = cmd->upmove = cmd->buttons = 0;
      cmd->angles[0] = cmd->angles[1] = cmd->angles[2] = 0;
		}
		if(sv_frozen->integer || cl->frozen || cl->nofire /* || sv_paused->integer */) {
			cmd->buttons = 0;
		}
#endif
		oldcmd = cmd;
	}

	// save time for ping calculation
#ifdef USE_MULTIVM_SERVER
  if ( cl->frames[gvmi][ cl->messageAcknowledge & PACKET_MASK ].messageAcked == 0 ) {
    cl->frames[gvmi][ cl->messageAcknowledge & PACKET_MASK ].messageAcked = Sys_Milliseconds();
  }
#else
	if ( cl->frames[ cl->messageAcknowledge & PACKET_MASK ].messageAcked == 0 ) {
		cl->frames[ cl->messageAcknowledge & PACKET_MASK ].messageAcked = Sys_Milliseconds();
	}
#endif

	// if this is the first usercmd we have received
	// this gamestate, put the client into the world
	if ( cl->state == CS_PRIMED ) {
		if ( sv_pure->integer != 0 && !cl->gotCP ) {
			// we didn't get a cp yet, don't assume anything and just send the gamestate all over again
			if ( !SVC_RateLimit( &cl->gamestate_rate, 4, 1000 )
#ifdef USE_MULTIVM_SERVER
		 		&& cl->newWorld == cl->gameWorld
#endif
			) {
				Com_Printf( "%s: didn't get cp command, resending gamestate\n", cl->name );
				SV_SendClientGameState( cl );
			}
			return;
		}
#ifdef USE_MULTIVM_SERVER
		int prevGvm = gvmi; // hopefully it is the same but maybe not
		gvmi = cl->gameWorld = cl->newWorld;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
		if(cl->newWorld != cl->gameWorld) {
			// If we don't reset client->lastUsercmd and are restarting during map load,
			// the client will hang because we'll use the last Usercmd from the previous map,
			// which is wrong obviously.
			SV_ClientEnterWorld( cl, NULL );
		} else {
			SV_ClientEnterWorld( cl, &cmds[0] );
		}
		gvmi = prevGvm;
		CM_SwitchMap(gameWorlds[gvmi]);
		SV_SetAASgvm(gvmi);
#else
		SV_ClientEnterWorld( cl, &cmds[0] );
#endif
		// the moves can be processed normally
	}
	
	// a bad cp command was sent, drop the client
	if ( sv_pure->integer != 0 && !cl->pureAuthentic ) {
		SV_DropClient( cl, "Cannot validate pure client!" );
		return;
	}

	if ( cl->state != CS_ACTIVE ) {
		cl->deltaMessage = cl->netchan.outgoingSequence - ( PACKET_BACKUP + 1 ); // force delta reset
		return;
	}

	// usually, the first couple commands will be duplicates
	// of ones we have previously received, but the servertimes
	// in the commands will cause them to be immediately discarded
	for ( i =  0 ; i < cmdCount ; i++ ) {
		// if this is a cmd from before a map_restart ignore it
		if ( cmds[i].serverTime - cmds[cmdCount-1].serverTime > 0 ) {
			continue;
		}
		// extremely lagged or cmd from before a map_restart
		//if ( cmds[i].serverTime > svs.time + 3000 ) {
		//	continue;
		//}
		// don't execute if this is an old cmd which is already executed
		// these old cmds are included when cl_packetdup > 0
		//if ( cmds[i].serverTime <= cl->lastUsercmd.serverTime ) {
		if ( cmds[i].serverTime - cl->lastUsercmd.serverTime <= 0 ) {
			continue;
		}
		SV_ClientThink (cl, &cmds[ i ]);
	}
}


/*
===========================================================================

USER CMD EXECUTION

===========================================================================
*/

/*
===================
SV_ExecuteClientMessage

Parse a client packet
===================
*/
void SV_ExecuteClientMessage( client_t *cl, msg_t *msg ) {
	int			c;
	int			serverId;
	int reliableAcknowledge;

	MSG_Bitstream(msg);

	serverId = MSG_ReadLong( msg );

	cl->messageAcknowledge = MSG_ReadLong( msg );

	//if ( cl->messageAcknowledge < 0 ) {
	if ( cl->netchan.outgoingSequence - cl->messageAcknowledge <= 0 ) {
		// usually only hackers create messages like this
		// it is more annoying for them to let them hanging
#ifdef _DEBUG
		SV_DropClient( cl, "DEBUG: illegible client message" );
#endif
		return;
	}

	reliableAcknowledge = MSG_ReadLong( msg );

	if ( cl->reliableSequence - reliableAcknowledge < 0 ) {
#ifdef _DEBUG
		SV_DropClient( cl, "DEBUG: illegible client message" );
#endif
		return;
	}

	// NOTE: when the client message is fux0red the acknowledgement numbers
	// can be out of range, this could cause the server to send thousands of server
	// commands which the server thinks are not yet acknowledged in SV_UpdateServerCommandsToClient
	if ( cl->reliableSequence - reliableAcknowledge > MAX_RELIABLE_COMMANDS ) {
		// usually only hackers create messages like this
		// it is more annoying for them to let them hanging
#ifdef _DEBUG
		SV_DropClient( cl, "DEBUG: illegible client message" );
#else
		Com_Printf( S_COLOR_YELLOW "WARNING: dropping %i commands from %s\n", cl->reliableSequence - cl->reliableAcknowledge, cl->name );
#endif
		cl->reliableAcknowledge = cl->reliableSequence;
		return;
	}

	cl->reliableAcknowledge = reliableAcknowledge;

	cl->justConnected = qfalse;

	// if this is a usercmd from a previous gamestate,
	// ignore it or retransmit the current gamestate
	// 
	// if the client was downloading, let it stay at whatever serverId and
	// gamestate it was at.  This allows it to keep downloading even when
	// the gamestate changes.  After the download is finished, we'll
	// notice and send it a new game state
	//
	// https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=536
	// don't drop as long as previous command was a nextdl, after a dl is done, downloadName is set back to ""
	// but we still need to read the next message to move to next download or send gamestate
	// I don't like this hack though, it must have been working fine at some point, suspecting the fix is somewhere else
	if ( (serverId != sv.serverId 
#ifdef USE_MULTIVM_SERVER
		|| (cl->newWorld != cl->gameWorld && cl->state == CS_CONNECTED)
#endif
		)
		&& !*cl->downloadName && !strstr(cl->lastClientCommandString, "nextdl")
	) {
		// TTimo - use a comparison here to catch multiple map_restart
		if ( serverId - sv.restartedServerId >= 0 && serverId - sv.serverId < 0 ) {
			// they just haven't caught the \map_restart yet
			Com_DPrintf("%s : ignoring pre map_restart / outdated client message\n", cl->name);
			return;
		}
		// if we can tell that the client has dropped the last gamestate we sent them, resend it
		if ( cl->state != CS_ACTIVE 
#ifndef __WASM__
			&& cl->messageAcknowledge - cl->gamestateMessageNum > 0 
#endif
		) {
			if ( !SVC_RateLimit( &cl->gamestate_rate, 4, 1000 ) ) {
				//if ( cl->gentity )
				Com_Printf( "%s : dropped gamestate, resending\n", cl->name );
				SV_SendClientGameState( cl );
			}
		}
		return;
	}

	// this client has acknowledged the new gamestate so it's
	// safe to start sending it the real time again
	if( cl->oldServerTime && serverId == sv.serverId ){
		Com_DPrintf( "%s acknowledged gamestate\n", cl->name );
		cl->oldServerTime = 0;
	}
	
#ifdef USE_MULTIVM_SERVER
	gvmi = cl->gameWorld;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif

	// read optional clientCommand strings
	do {
		c = MSG_ReadByte( msg );
		if ( c != clc_clientCommand ) {
			break;
		}
		if ( !SV_ClientCommand( cl, msg ) ) {
			return;	// we couldn't execute it because of the flood protection
		}
		if ( cl->state == CS_ZOMBIE ) {
			return;	// disconnect command
		}
	} while ( 1 );

#ifdef USE_ASYNCHRONOUS
	// skip user move commands if server is restarting because of the command above
	if(!FS_Initialized()) {
		Com_Error(ERR_FATAL, "fs restarting?");
		return;
	}
#endif

	// read the usercmd_t
#ifdef USE_MULTIVM_SERVER
	if ( c == clc_mvMove || c == clc_mvMoveNoDelta ) {
		int igs = MSG_ReadByte( msg );
		//if(!sv_mvWorld->integer || sv_mvOmnipresent->integer > 0) {
			gvmi = igs;
			CM_SwitchMap(gameWorlds[gvmi]);
			SV_SetAASgvm(gvmi);
		//}
		SV_UserMove( cl, msg, c == clc_mvMove );
	} else 
#endif
	if ( c == clc_move ) {
		SV_UserMove( cl, msg, qtrue );
	} else if ( c == clc_moveNoDelta ) {
		SV_UserMove( cl, msg, qfalse );
	} else if ( c != clc_EOF ) {
		Com_Printf( "WARNING: bad command byte %i for client %i\n", c, (int)(cl - svs.clients) );
	}
//	if ( msg->readcount != msg->cursize ) {
//		Com_Printf( "WARNING: Junk at end of packet for client %i\n", cl - svs.clients );
//	}
#ifdef USE_MULTIVM_SERVER
	gvmi = 0;
	CM_SwitchMap(gameWorlds[gvmi]);
	SV_SetAASgvm(gvmi);
#endif
}
