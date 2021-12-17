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
// cmodel.c -- model loading

#include "cm_local.h"
#include "cm_public.h"


#ifdef BSPC

#include "../bspc/l_qfiles.h"

void SetPlaneSignbits( cplane_t *out ) {
	int	bits, j;

	// for fast box on planeside test
	bits = 0;
	for ( j = 0; j < 3; j++) {
		if ( out->normal[j] < 0 ) {
			bits |= 1<<j;
		}
	}
	out->signbits = bits;
}
#endif //BSPC

// to allow boxes to be treated as brush models, we allocate
// some extra indexes along with those needed by the map
#define	BOX_BRUSHES		1
#define	BOX_SIDES		6
#define	BOX_LEAFS		2
#define	BOX_PLANES		12

#define	LL(x) x=LittleLong(x)


#if defined(USE_MULTIVM_CLIENT) || defined(USE_MULTIVM_SERVER)
clipMap_t cmWorlds[MAX_NUM_VMS];
int       cmi = 0;
#else
clipMap_t	cm;
#endif

int			c_pointcontents;
int			c_traces, c_brush_traces, c_patch_traces;


byte		*cmod_base;

#ifndef BSPC
cvar_t		*cm_noAreas;
cvar_t		*cm_noCurves;
cvar_t		*cm_playerCurveClip;
cvar_t    *cm_saveEnts;
#endif

#if defined(USE_MULTIVM_CLIENT) || defined(USE_MULTIVM_SERVER)
cmodel_t	box_modelWorlds[MAX_NUM_MAPS];
cplane_t	*box_planesWorlds[MAX_NUM_MAPS];
cbrush_t	*box_brushWorlds[MAX_NUM_MAPS];
#else
cmodel_t	box_model;
cplane_t	*box_planes;
cbrush_t	*box_brush;
#endif



void	CM_InitBoxHull (void);
void	CM_FloodAreaConnections (void);


/*
===============================================================================

					MAP LOADING

===============================================================================
*/

/*
=================
CMod_LoadShaders
=================
*/
void CMod_LoadShaders( lump_t *l ) {
	dshader_t	*in, *out;
	int			i, count;

	in = (void *)(cmod_base + l->fileofs);
	if (l->filelen % sizeof(*in)) {
		Com_Error (ERR_DROP, "%s: funny lump size", __func__ );
	}

	count = l->filelen / sizeof(*in);
	if ( count < 1 )
		Com_Error (ERR_DROP, "%s: map with no shaders", __func__ );

	cm.shaders = Hunk_Alloc( count * sizeof( *cm.shaders ), h_high );
	cm.numShaders = count;

	Com_Memcpy( cm.shaders, in, count * sizeof( *cm.shaders ) );

	out = cm.shaders;
	for ( i=0 ; i<count ; i++, in++, out++ ) {
		out->contentFlags = LittleLong( out->contentFlags );
		out->surfaceFlags = LittleLong( out->surfaceFlags );
	}
}


/*
=================
CMod_LoadSubmodels
=================
*/
void CMod_LoadSubmodels( lump_t *l ) {
	dmodel_t	*in;
	cmodel_t	*out;
	int			i, j, count;
	int			*indexes;

	in = (void *)(cmod_base + l->fileofs);
	if (l->filelen % sizeof(*in))
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);
	if ( count < 1 )
		Com_Error( ERR_DROP, "%s: map with no models", __func__ );

	cm.cmodels = Hunk_Alloc( count * sizeof( *cm.cmodels ), h_high );
	cm.numSubModels = count;

	if ( count > MAX_SUBMODELS )
		Com_Error( ERR_DROP, "%s: MAX_SUBMODELS exceeded", __func__ );

	for ( i=0 ; i<count ; i++, in++)
	{
		out = &cm.cmodels[i];

		for (j=0 ; j<3 ; j++)
		{	// spread the mins / maxs by a pixel
			out->mins[j] = LittleFloat (in->mins[j]) - 1;
			out->maxs[j] = LittleFloat (in->maxs[j]) + 1;
		}

		if ( i == 0 ) {
			continue;	// world model doesn't need other info
		}

		// make a "leaf" just to hold the model's brushes and surfaces
		out->leaf.numLeafBrushes = LittleLong( in->numBrushes );
		indexes = Hunk_Alloc( out->leaf.numLeafBrushes * 4, h_high );
		out->leaf.firstLeafBrush = indexes - cm.leafbrushes;
		for ( j = 0 ; j < out->leaf.numLeafBrushes ; j++ ) {
			indexes[j] = LittleLong( in->firstBrush ) + j;
		}

		out->leaf.numLeafSurfaces = LittleLong( in->numSurfaces );
		indexes = Hunk_Alloc( out->leaf.numLeafSurfaces * 4, h_high );
		out->leaf.firstLeafSurface = indexes - cm.leafsurfaces;
		for ( j = 0 ; j < out->leaf.numLeafSurfaces ; j++ ) {
			indexes[j] = LittleLong( in->firstSurface ) + j;
		}
	}
}


/*
=================
CMod_LoadNodes

=================
*/
void CMod_LoadNodes( lump_t *l ) {
	dnode_t	*in;
	int		child;
	cNode_t	*out;
	int		i, j, count;

  in = (dnode_t *)(cmod_base + l->fileofs);
	if (l->filelen % sizeof(*in))
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);
	if ( count < 1 )
		Com_Error( ERR_DROP, "%s: map has no nodes", __func__ );

	cm.nodes = Hunk_Alloc( count * sizeof( *cm.nodes ), h_high );
	cm.numNodes = count;

	out = cm.nodes;

	for ( i = 0; i < count; i++, out++, in++ )
	{
		out->plane = cm.planes + LittleLong( in->planeNum );
		for ( j = 0; j < 2; j++ )
		{
			child = LittleLong( in->children[j] );
			out->children[j] = child;
		}
	}

}

/*
=================
CM_BoundBrush

=================
*/
void CM_BoundBrush( cbrush_t *b ) {
	b->bounds[0][0] = -b->sides[0].plane->dist;
	b->bounds[1][0] = b->sides[1].plane->dist;

	b->bounds[0][1] = -b->sides[2].plane->dist;
	b->bounds[1][1] = b->sides[3].plane->dist;

	b->bounds[0][2] = -b->sides[4].plane->dist;
	b->bounds[1][2] = b->sides[5].plane->dist;
}


/*
=================
CMod_LoadBrushes

=================
*/
void CMod_LoadBrushes( lump_t *l ) {
	dbrush_t	*in;
	cbrush_t	*out;
	int			i, count;

	in = (void *)(cmod_base + l->fileofs);
	if ( l->filelen % sizeof(*in) )
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);

	cm.brushes = Hunk_Alloc( ( BOX_BRUSHES + count ) * sizeof( *cm.brushes ), h_high );
	cm.numBrushes = count;

	out = cm.brushes;

	for ( i = 0; i < count; i++, out++, in++ ) {
		out->sides = cm.brushsides + LittleLong( in->firstSide );
		out->numsides = LittleLong( in->numSides );

		out->shaderNum = LittleLong( in->shaderNum );
		if ( out->shaderNum < 0 || out->shaderNum >= cm.numShaders ) {
			Com_Error( ERR_DROP, "%s: bad shaderNum: %i", __func__, out->shaderNum );
		}
		out->contents = cm.shaders[out->shaderNum].contentFlags;

		CM_BoundBrush( out );
	}

}


/*
=================
CMod_LoadLeafs
=================
*/
void CMod_LoadLeafs( lump_t *l )
{
	int			i;
	cLeaf_t		*out;
	dleaf_t 	*in;
	int			count;

	in = (void *)(cmod_base + l->fileofs);
	if ( l->filelen % sizeof(*in) )
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);
	if ( count < 1 )
		Com_Error( ERR_DROP, "%s: map with no leafs", __func__ );

	cm.leafs = Hunk_Alloc( ( BOX_LEAFS + count ) * sizeof( *cm.leafs ), h_high );
	cm.numLeafs = count;

	out = cm.leafs;
	for ( i = 0; i < count; i++, in++, out++ )
	{
		out->cluster = LittleLong( in->cluster );
		out->area = LittleLong( in->area );
		out->firstLeafBrush = LittleLong( in->firstLeafBrush );
		out->numLeafBrushes = LittleLong( in->numLeafBrushes );
		out->firstLeafSurface = LittleLong( in->firstLeafSurface );
		out->numLeafSurfaces = LittleLong( in->numLeafSurfaces );

		if ( out->cluster >= cm.numClusters )
			cm.numClusters = out->cluster + 1;
		if ( out->area >= cm.numAreas )
			cm.numAreas = out->area + 1;
	}

	cm.areas = Hunk_Alloc( cm.numAreas * sizeof( *cm.areas ), h_high );
	cm.areaPortals = Hunk_Alloc( cm.numAreas * cm.numAreas * sizeof( *cm.areaPortals ), h_high );
}


/*
=================
CMod_LoadPlanes
=================
*/
void CMod_LoadPlanes( const lump_t *l )
{
	int			i, j;
	cplane_t	*out;
	dplane_t 	*in;
	int			count;
	int			bits;

	in = (void *)(cmod_base + l->fileofs);
	if ( l->filelen % sizeof(*in) )
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);
	if ( count < 1 )
		Com_Error( ERR_DROP, "%s: map with no planes", __func__ );

	cm.planes = Hunk_Alloc( ( BOX_PLANES + count ) * sizeof( *cm.planes ), h_high );
	cm.numPlanes = count;

	out = cm.planes;

	for ( i = 0; i < count; i++, in++, out++ )
	{
		bits = 0;
		for ( j = 0; j < 3; j++ )
		{
			out->normal[j] = LittleFloat( in->normal[j] );
			if ( out->normal[j] < 0 )
				bits |= 1<<j;
		}

		out->dist = LittleFloat( in->dist );
		out->type = PlaneTypeForNormal( out->normal );
		out->signbits = bits;
	}
}


/*
=================
CMod_LoadLeafBrushes
=================
*/
void CMod_LoadLeafBrushes( const lump_t *l )
{
	int i;
	int *out;
	int *in;
	int count;

	in = (void *)(cmod_base + l->fileofs);
	if ( l->filelen % sizeof(*in) )
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);

	cm.leafbrushes = Hunk_Alloc( (count + BOX_BRUSHES) * sizeof( *cm.leafbrushes ), h_high );
	cm.numLeafBrushes = count;

	out = cm.leafbrushes;

	for ( i = 0; i < count; i++, in++, out++ ) {
		*out = LittleLong( *in );
	}
}


/*
=================
CMod_LoadLeafSurfaces
=================
*/
void CMod_LoadLeafSurfaces( const lump_t *l )
{
	int i;
	int *out;
	int *in;
	int count;

	in = (void *)(cmod_base + l->fileofs);
	if ( l->filelen % sizeof(*in) )
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	count = l->filelen / sizeof(*in);

	cm.leafsurfaces = Hunk_Alloc( count * sizeof( *cm.leafsurfaces ), h_high );
	cm.numLeafSurfaces = count;

	out = cm.leafsurfaces;

	for ( i = 0; i < count; i++, in++, out++ ) {
		*out = LittleLong( *in );
	}
}


/*
=================
CMod_CheckLeafBrushes
=================
*/
void CMod_CheckLeafBrushes( void )
{
	int	i;

	for ( i = 0; i < cm.numLeafBrushes; i++ ) {
		if ( cm.leafbrushes[ i ] < 0 || cm.leafbrushes[ i ] >= cm.numBrushes ) {
			Com_DPrintf( S_COLOR_YELLOW "[%i] invalid leaf brush %08x\n", i, cm.leafbrushes[i] );
			cm.leafbrushes[ i ] = 0;
		}
	}
}


/*
=================
CMod_LoadBrushSides
=================
*/
void CMod_LoadBrushSides (lump_t *l)
{
	int				i;
	cbrushside_t	*out;
	dbrushside_t	*in;
	int				count;
	int				num;

  in = (dbrushside_t *)(cmod_base + l->fileofs);
	if ( l->filelen % sizeof(*in) ) {
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );
	}
	count = l->filelen / sizeof(*in);

	cm.brushsides = Hunk_Alloc( ( BOX_SIDES + count ) * sizeof( *cm.brushsides ), h_high );
	cm.numBrushSides = count;

	out = cm.brushsides;

	for ( i= 0; i < count; i++, in++, out++ ) {
		num = LittleLong( in->planeNum );
		out->plane = &cm.planes[num];
		out->shaderNum = LittleLong( in->shaderNum );
		if ( out->shaderNum < 0 || out->shaderNum >= cm.numShaders ) {
			Com_Error( ERR_DROP, "%s: bad shaderNum: %i", __func__, out->shaderNum );
		}
		out->surfaceFlags = cm.shaders[out->shaderNum].surfaceFlags;
	}
}


/*
=================
CMod_LoadEntityString
=================
*/
void CMod_LoadEntityString( lump_t *l, const char *name ) {
	fileHandle_t h;
	char entName[MAX_QPATH];
	size_t entNameLen = 0;
	int entFileLen = 0;

	// Attempt to load entities from an external .ent file if available
	if(name[0] != '\0' && l->fileofs != 0) { // don't do memory loading
		Q_strncpyz(entName, name, sizeof(entName));
		entNameLen = strlen(entName);
		entName[entNameLen - 3] = 'e';
		entName[entNameLen - 2] = 'n';
		entName[entNameLen - 1] = 't';
		entFileLen = FS_FOpenFileRead( entName, &h, qtrue );
		if (h && entFileLen > 0)
		{
			cm.entityString = (char *)Hunk_Alloc(entFileLen + 1, h_high );
			cm.numEntityChars = entFileLen + 1;
			FS_Read( cm.entityString, entFileLen, h );
			FS_FCloseFile(h);
			cm.entityString[entFileLen] = '\0';
			Com_Printf( S_COLOR_CYAN "Loaded entities from %s\n", entName );
			return;
		}
	}
	cm.entityString = Hunk_Alloc( l->filelen, h_high );
	cm.numEntityChars = l->filelen;
	memcpy( cm.entityString, cmod_base + l->fileofs, l->filelen );

	if(cm_saveEnts && cm_saveEnts->integer && l->fileofs != 0) {
		FS_WriteFile(entName, cm.entityString, cm.numEntityChars);
	} else {
		Com_Printf("Entities: %s\n", cm.entityString);
	}
}


/*
=================
CMod_LoadVisibility
=================
*/
#define	VIS_HEADER	8
void CMod_LoadVisibility( lump_t *l ) {
	int		len;
	byte	*buf;

	len = l->filelen;
	if ( !len ) {
		cm.clusterBytes = ( cm.numClusters + 31 ) & ~31;
		cm.visibility = Hunk_Alloc( cm.clusterBytes, h_high );
		Com_Memset( cm.visibility, 255, cm.clusterBytes );
		return;
	}

	buf = cmod_base + l->fileofs;

	cm.vised = qtrue;
	cm.visibility = Hunk_Alloc( len, h_high );
	cm.numClusters = LittleLong( ((int *)buf)[0] );
	cm.clusterBytes = LittleLong( ((int *)buf)[1] );
	Com_Memcpy (cm.visibility, buf + VIS_HEADER, len - VIS_HEADER );
}

//==================================================================


/*
=================
CMod_LoadPatches
=================
*/
#define	MAX_PATCH_VERTS		1024
void CMod_LoadPatches( lump_t *surfs, lump_t *verts ) {
	drawVert_t	*dv, *dv_p;
	dsurface_t	*in;
	int			count;
	int			i, j;
	int			c;
	cPatch_t	*patch;
	vec3_t		points[MAX_PATCH_VERTS];
	int			width, height;
	int			shaderNum;

	in = (void *)(cmod_base + surfs->fileofs);
	if (surfs->filelen % sizeof(*in))
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	cm.numSurfaces = count = surfs->filelen / sizeof(*in);
	cm.surfaces = Hunk_Alloc( cm.numSurfaces * sizeof( cm.surfaces[0] ), h_high );

	dv = (void *)(cmod_base + verts->fileofs);
	if (verts->filelen % sizeof(*dv))
		Com_Error( ERR_DROP, "%s: funny lump size", __func__ );

	// scan through all the surfaces, but only load patches,
	// not planar faces
	for ( i = 0 ; i < count ; i++, in++ ) {
		if ( LittleLong( in->surfaceType ) != MST_PATCH ) {
			continue;		// ignore other surfaces
		}
		// FIXME: check for non-colliding patches

		cm.surfaces[ i ] = patch = Hunk_Alloc( sizeof( *patch ), h_high );

		// load the full drawverts onto the stack
		width = LittleLong( in->patchWidth );
		height = LittleLong( in->patchHeight );

		c = width * height;
		if ( c > MAX_PATCH_VERTS ) {
			Com_Error( ERR_DROP, "%s: MAX_PATCH_VERTS", __func__ );
		}

		dv_p = dv + LittleLong( in->firstVert );
		for ( j = 0 ; j < c ; j++, dv_p++ ) {
			points[j][0] = LittleFloat( dv_p->xyz[0] );
			points[j][1] = LittleFloat( dv_p->xyz[1] );
			points[j][2] = LittleFloat( dv_p->xyz[2] );
		}

		shaderNum = LittleLong( in->shaderNum );
		patch->contents = cm.shaders[shaderNum].contentFlags;
		patch->surfaceFlags = cm.shaders[shaderNum].surfaceFlags;

		// create the internal facet structure
		patch->pc = CM_GeneratePatchCollide( width, height, points );
	}
	
	if(cmod_base == 0) {
		// finalize memory map
		CMod_CheckLeafBrushes();

		CM_InitBoxHull();

		CM_FloodAreaConnections();
	}
}

//==================================================================

unsigned CM_LumpChecksum(lump_t *lump) {
	return LittleLong (Com_BlockChecksum (cmod_base + lump->fileofs, lump->filelen));
}

unsigned CM_Checksum(dheader_t *header) {
	unsigned checksums[16];
	checksums[0] = CM_LumpChecksum(&header->lumps[LUMP_SHADERS]);
	checksums[1] = CM_LumpChecksum(&header->lumps[LUMP_LEAFS]);
	checksums[2] = CM_LumpChecksum(&header->lumps[LUMP_LEAFBRUSHES]);
	checksums[3] = CM_LumpChecksum(&header->lumps[LUMP_LEAFSURFACES]);
	checksums[4] = CM_LumpChecksum(&header->lumps[LUMP_PLANES]);
	checksums[5] = CM_LumpChecksum(&header->lumps[LUMP_BRUSHSIDES]);
	checksums[6] = CM_LumpChecksum(&header->lumps[LUMP_BRUSHES]);
	checksums[7] = CM_LumpChecksum(&header->lumps[LUMP_MODELS]);
	checksums[8] = CM_LumpChecksum(&header->lumps[LUMP_NODES]);
	checksums[9] = CM_LumpChecksum(&header->lumps[LUMP_SURFACES]);
	checksums[10] = CM_LumpChecksum(&header->lumps[LUMP_DRAWVERTS]);

	return LittleLong( Com_BlockChecksum( checksums, ARRAY_LEN( checksums ) * 4 ) );
}


#if defined(USE_MULTIVM_SERVER) || defined(USE_MULTIVM_CLIENT)
/*
==================
CM_SwitchMap
==================
*/
int CM_SwitchMap( int world ) {
	int prev = cmi;
	if(!cmWorlds[world].name[0]) {
		return 0;
	}
	if(world != cmi) {
		//Com_Printf("Switching maps: %i -> %i\n", cm, world);
		cmi = world;
	}
	return prev;
}


static void CM_MapList_f(void) {
	int count = 0;
	Com_Printf ("-----------------------\n");
	for(int i = 0; i < MAX_NUM_MAPS; i++) {
		if(!cmWorlds[i].name[0]) break;
		count++;
		Com_Printf("%s\n", cmWorlds[i].name);
	}
	Com_Printf ("%i total maps\n", count);
	Com_Printf ("------------------\n");
}
#endif

extern void LoadQ1Map(const char *name);

void LoadQ3Map(const char *name) {
	dheader_t		header;
	int				i;

	header = *(dheader_t *)cmod_base;
	for (i=0 ; i<sizeof(dheader_t)/4 ; i++) {
		((int *)&header)[i] = LittleLong ( ((int *)&header)[i]);
	}

	// load into heap
	CMod_LoadShaders( &header.lumps[LUMP_SHADERS] );
	CMod_LoadLeafs (&header.lumps[LUMP_LEAFS]);
	CMod_LoadLeafBrushes (&header.lumps[LUMP_LEAFBRUSHES]);
	CMod_LoadLeafSurfaces (&header.lumps[LUMP_LEAFSURFACES]);
	CMod_LoadPlanes (&header.lumps[LUMP_PLANES]);
	CMod_LoadBrushSides (&header.lumps[LUMP_BRUSHSIDES]);
	CMod_LoadBrushes (&header.lumps[LUMP_BRUSHES]);
	CMod_LoadSubmodels (&header.lumps[LUMP_MODELS]);
	CMod_LoadNodes (&header.lumps[LUMP_NODES]);
	CMod_LoadEntityString (&header.lumps[LUMP_ENTITIES], name);
	CMod_LoadVisibility( &header.lumps[LUMP_VISIBILITY] );
	CMod_LoadPatches( &header.lumps[LUMP_SURFACES], &header.lumps[LUMP_DRAWVERTS] );

}


static qboolean cmdsAdded = qfalse;
void AddClipMapCommands( void ) {
	if(cmdsAdded) {
		return;
	}
cmdsAdded = qtrue;
#ifndef BSPC
	cm_noAreas = Cvar_Get ("cm_noAreas", "0", CVAR_CHEAT);
	cm_noCurves = Cvar_Get ("cm_noCurves", "0", CVAR_CHEAT);
	cm_playerCurveClip = Cvar_Get ("cm_playerCurveClip", "1", CVAR_ARCHIVE_ND|CVAR_CHEAT);
	cm_saveEnts = Cvar_Get ("cm_saveEnts", "0", CVAR_TEMP);
#endif
#if defined(USE_MULTIVM_SERVER) || defined(USE_MULTIVM_CLIENT)
	Cmd_AddCommand("cmlist", CM_MapList_f);
	Cmd_SetDescription("cmlist", "List the currently loaded clip maps\nUsage: maplist");
#endif
}



/*
==================
CM_LoadMap

Loads in the map and all submodels
==================
*/
int CM_LoadMap( const char *name, qboolean clientload, int *checksum ) {
	union {
		int				*i;
		void			*v;
	} buf;
	int				length;
	unsigned id1, id2;
	dheader_t		header;

	if ( !name || !name[0] ) {
		Com_Error( ERR_DROP, "%s: NULL name", __func__ );
	}

#if defined(USE_MULTIVM_SERVER) || defined(USE_MULTIVM_CLIENT)
	int				i, empty = -1;
	for(i = 0; i < MAX_NUM_MAPS; i++) {
		if ( !strcmp( cmWorlds[i].name, name ) /* && clientload */ ) {
			*checksum = cmWorlds[i].checksum;
			CM_SwitchMap(i);
			Com_DPrintf( "CM_LoadMap( %s, %i ) already loaded\n", name, clientload );
			return cmi;
		} else if (cmWorlds[i].name[0] == '\0' && empty == -1) {
			// fill the next empty clipmap slot
			empty = i;
		}
	}
	cmi = empty;
  Com_DPrintf( "%s( '%s', %i )\n", __func__, name, clientload );
#else
  if ( !strcmp( cm.name, name ) && clientload ) {
    *checksum = cm.checksum;
    return 0;
  }

	// free old stuff
	CM_ClearMap();

#endif

#if 0
	if ( !name[0] ) {
		cm.numLeafs = 1;
		cm.numClusters = 1;
		cm.numAreas = 1;
		cm.cmodels = Hunk_Alloc( sizeof( *cm.cmodels ), h_high );
		*checksum = 0;
		return cmi;
	}
#endif

	//
	// load the file
	//
#ifndef BSPC
	length = FS_ReadFile( name, &buf.v );
#else
	length = LoadQuakeFile((quakefile_t *) name, &buf.v);
#endif

	if ( !buf.i ) {
    Com_Error( ERR_DROP, "%s: couldn't load %s", __func__, name );
	}

	cm.checksum = LittleLong (Com_BlockChecksum (buf.i, length));
	*checksum = cm.checksum;
	cmod_base = (byte *)buf.i;
	header = *(dheader_t *)cmod_base;
	id1 = LittleLong(header.ident);
	id2 = LittleLong(header.version);

	switch (id1)
	{
	case BSP_IDENT:
		switch (id2)
		{
		case BSP2_VERSION:
			//LoadQ2Map(name);
			break;
		case BSP_VERSION_QLIVE:
		case BSP_VERSION_OPENJK:
		case BSP3_VERSION:
			LoadQ3Map(name);
			break;
		default:
			Com_Error (ERR_DROP, "CM_LoadMap: %s has wrong version number "
				"(%i should be %i)", name, header.version, BSP_VERSION );
		}
		break;
#ifdef USE_BSP1
	case BSP1_VERSION:
	case BSPHL_VERSION:
		LoadQ1Map(name);
		break;
#endif
	default:
		Com_Error (ERR_DROP, "CM_LoadMap: %s has wrong version number "
			"(%i should be %i)", name, header.version, BSP_VERSION );
	}

	CMod_CheckLeafBrushes();

	// we are NOT freeing the file, because it is cached for the ref
	FS_FreeFile( buf.v );
	CM_InitBoxHull();

	CM_FloodAreaConnections();

	// allow this to be cached if it is loaded by the server
	//if ( !clientload ) {
	Q_strncpyz( cm.name, name, sizeof( cm.name ) );
	//}
	
#if defined(USE_MULTIVM_SERVER) || defined(USE_MULTIVM_CLIENT)
	return cmi;
#else
  return 0;
#endif
}


/*
==================
CM_ClearMap
==================
*/
void CM_ClearMap( void ) {
#if defined(USE_MULTIVM_CLIENT) || defined(USE_MULTIVM_SERVER)
  Com_Memset( &cmWorlds, 0, sizeof( cmWorlds ) );
#else
	Com_Memset( &cm, 0, sizeof( cm ) );
#endif
	CM_ClearLevelPatches();
}


/*
==================
CM_ClipHandleToModel
==================
*/
cmodel_t *CM_ClipHandleToModel( clipHandle_t handle ) {
	if ( handle < 0 ) {
		Com_Error( ERR_DROP, "CM_ClipHandleToModel: bad handle %i", handle );
	}
	if ( handle < cm.numSubModels ) {
		return &cm.cmodels[handle];
	}
	if ( handle == BOX_MODEL_HANDLE ) {
		return &box_model;
	}
	if ( handle < MAX_SUBMODELS ) {
		Com_Error( ERR_DROP, "CM_ClipHandleToModel: bad handle %i < %i < %i", 
			cm.numSubModels, handle, MAX_SUBMODELS );
	}
	Com_Error( ERR_DROP, "CM_ClipHandleToModel: bad handle %i", handle + MAX_SUBMODELS );

	return NULL;
}


/*
==================
CM_InlineModel
==================
*/
clipHandle_t CM_InlineModel( int index, int client, int world ) {
	if ( index < 0 || index >= cm.numSubModels ) {
#if defined(USE_MULTIVM_SERVER) || defined(USE_MULTIVM_CLIENT)
		Com_Error (ERR_DROP, "CM_InlineModel: bad number %i in %i (client: %i, world: %i)", index, cmi, client, world);
#else
    Com_Error (ERR_DROP, "CM_InlineModel: bad number %i (client: %i, world: %i)", index, client, world);
#endif
	}
	return index;
}


int CM_NumClusters( void ) {
	return cm.numClusters;
}


int CM_NumInlineModels( void ) {
	return cm.numSubModels;
}


char *CM_EntityString( void ) {
	return cm.entityString;
}


int CM_LeafCluster( int leafnum ) {
	if ( leafnum < 0 || leafnum >= cm.numLeafs ) {
		Com_Error( ERR_DROP, "CM_LeafCluster: bad number" );
	}
	return cm.leafs[leafnum].cluster;
}


int CM_LeafArea( int leafnum ) {
	if ( leafnum < 0 || leafnum >= cm.numLeafs ) {
		Com_Error( ERR_DROP, "CM_LeafArea: bad number" );
	}
	return cm.leafs[leafnum].area;
}

//=======================================================================


/*
===================
CM_InitBoxHull

Set up the planes and nodes so that the six floats of a bounding box
can just be stored out and get a proper clipping hull structure.
===================
*/
void CM_InitBoxHull( void )
{
	int			i;
	int			side;
	cplane_t	*p;
	cbrushside_t	*s;

	box_planes = &cm.planes[cm.numPlanes];

	box_brush = &cm.brushes[cm.numBrushes];
	box_brush->numsides = 6;
	box_brush->sides = cm.brushsides + cm.numBrushSides;
	box_brush->contents = CONTENTS_BODY;

	box_model.leaf.numLeafBrushes = 1;
//	box_model.leaf.firstLeafBrush = cm.numBrushes;
	box_model.leaf.firstLeafBrush = cm.numLeafBrushes;
	cm.leafbrushes[cm.numLeafBrushes] = cm.numBrushes;

	for ( i = 0; i < 6; i++ )
	{
		side = i & 1;

		// brush sides
		s = &cm.brushsides[cm.numBrushSides + i];
		s->plane = cm.planes + ( cm.numPlanes + i * 2 + side );
		s->surfaceFlags = 0;

		// planes
		p = &box_planes[i * 2];
		p->type = i >> 1;
		p->signbits = 0;
		VectorClear( p->normal );
		p->normal[i >> 1] = 1;

		p = &box_planes[i * 2 + 1];
		p->type = 3 + ( i >> 1 );
		p->signbits = 0;
		VectorClear( p->normal );
		p->normal[i >> 1] = -1;

		SetPlaneSignbits( p );
	}
}


/*
===================
CM_TempBoxModel

To keep everything totally uniform, bounding boxes are turned into small
BSP trees instead of being compared directly.
Capsules are handled differently though.
===================
*/
clipHandle_t CM_TempBoxModel( const vec3_t mins, const vec3_t maxs, int capsule ) {

	VectorCopy( mins, box_model.mins );
	VectorCopy( maxs, box_model.maxs );

	if ( capsule ) {
		return CAPSULE_MODEL_HANDLE;
	}

	box_planes[0].dist = maxs[0];
	box_planes[1].dist = -maxs[0];
	box_planes[2].dist = mins[0];
	box_planes[3].dist = -mins[0];
	box_planes[4].dist = maxs[1];
	box_planes[5].dist = -maxs[1];
	box_planes[6].dist = mins[1];
	box_planes[7].dist = -mins[1];
	box_planes[8].dist = maxs[2];
	box_planes[9].dist = -maxs[2];
	box_planes[10].dist = mins[2];
	box_planes[11].dist = -mins[2];

	VectorCopy( mins, box_brush->bounds[0] );
	VectorCopy( maxs, box_brush->bounds[1] );

	return BOX_MODEL_HANDLE;
}


/*
===================
CM_ModelBounds
===================
*/
void CM_ModelBounds( clipHandle_t model, vec3_t mins, vec3_t maxs ) {
	cmodel_t *cmod;

	cmod = CM_ClipHandleToModel( model );
	VectorCopy( cmod->mins, mins );
	VectorCopy( cmod->maxs, maxs );
}
