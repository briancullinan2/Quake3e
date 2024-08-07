
#include "server.h"

#if defined(USE_MULTIVM_SERVER) || defined(USE_ENGINE_TELE)

void SV_CreateBaseline( void ) ;

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

		Cvar_Set( "mapname", Cvar_VariableString( va("mapname_%i", client->newWorld) ) );
		Cvar_Set( "sv_mapChecksum", Cvar_VariableString( va("sv_mapChecksum_%i", client->newWorld) ) );
		SV_SetConfigstring( CS_SYSTEMINFO, Cvar_InfoString_Big( CVAR_SYSTEMINFO, NULL ) );
		cvar_modifiedFlags &= ~CVAR_SYSTEMINFO;
		SV_SetConfigstring( CS_SERVERINFO, Cvar_InfoString( CVAR_SERVERINFO, NULL ) );
		cvar_modifiedFlags &= ~CVAR_SERVERINFO;
		SV_CreateBaseline();
		SV_SendClientGameState( client );

		//return; // skip update location below
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
	//int tokenStartPos = 0;
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
			//tokenStartPos = count+1;
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
	const char *userOrigin[3];
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


#if defined(USE_PERSIST_CLIENT) || defined(USE_MULTIVM_SERVER) || defined(USE_ENGINE_TELE)
/*
==================
SetClientViewAngle
==================
*/
void SV_SetClientViewAngle( int clientNum, const vec3_t angle ) {
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


#ifdef USE_MULTIVM_SERVER


// TODO: alloc as needed?
multiworld_t multiworldEntities[MAX_NUM_VMS * MAX_GENTITIES];
int numMultiworldEntities = 0;
// per client check if 
qboolean multiworldInView[MAX_NUM_VMS * MAX_GENTITIES];
qboolean hasMultiworldInView[MAX_NUM_VMS];


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
