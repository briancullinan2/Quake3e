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
// tr_map.c
#include "tr_local.h"

#ifdef USE_BSP1

#include "../qcommon/cm_load_bsp1.h"

extern void ParseFace( dsurface_t *ds, drawVert_t *verts, float *hdrVertColors, msurface_t *surf, int *indexes  );
extern void R_LoadSubmodels( lump_t *l );


/*
=================
R_LoadShaders
=================
*/
void R_LoadShaders1( lump_t *l ) {	
	int		i, count;
  dBsp1Miptex_t *in;
	dshader_t	*out;
  miptex_t *mt;
	
	in = (void *)(fileBase + l->fileofs);
  count = LittleLong ( in->nummiptex );
	out = ri.Hunk_Alloc ( count*sizeof(*out), h_low );

	s_worldData.shaders = out;
	s_worldData.numShaders = count;

	for ( i=0 ; i<count ; i++ ) {
    if (in->dataofs[i] == -1) {
      continue;
    }

    mt = (miptex_t *)((byte *)in + in->dataofs[i]);
    memcpy(out[i].shader, va("textures/%s", mt->name), MAX_QPATH);
		out[i].surfaceFlags = 0;
		//out[i].contentFlags = LittleLong( out[i].contentFlags );
    if (strstr(mt->name, "water") || strstr(mt->name, "mwat")) {
      out[i].contentFlags = CONTENTS_WATER;
    }
    else if (strstr(mt->name, "slime")) {
      out[i].contentFlags = CONTENTS_SLIME;
    }
    else if (strstr(mt->name, "lava")) {
      out[i].contentFlags = CONTENTS_LAVA;
    }
    //else if (strstr(mt->name, "tele")) {
    //  out[i].contentFlags = TEXTURE_TURB_TELE;
    //} 
    //else {
    //  out[i].contentFlags = CONTENTS_SOLID;
    //}

    /* TODO:
    if()
    #define	CONTENTS_Q1_SOLID		-2
    #define	CONTENTS_Q1_WATER		-3
    #define	CONTENTS_Q1_SLIME		-4
    #define	CONTENTS_Q1_LAVA		-5
    if(in->flags & Q2_SURF_SKY)
			out->surfaceFlags |= SURF_SKY;
		if(in->flags & Q2_SURF_NODRAW)
			out->surfaceFlags |= SURF_NODRAW;
		if (in->flags & MATERIAL_METAL)
			out->surfaceFlags |= SURF_METALSTEPS;
		if (in->flags & MATERIAL_SILENT)
			out->surfaceFlags |= SURF_NOSTEPS;
    */
	}
}


/*
=================
R_LoadPlanes
=================
*/
void R_LoadPlanes1( lump_t *l ) {
	int			i, j;
	cplane_t	*out;
	dBsp1Plane_t 	*in;
	int			count;
	int			bits;
	
	in = (void *)(fileBase + l->fileofs);
	if (l->filelen % sizeof(*in))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);
	count = l->filelen / sizeof(*in);
	out = ri.Hunk_Alloc ( count*2*sizeof(*out), h_low);	
	
	s_worldData.planes = out;
	s_worldData.numplanes = count;

	for ( i=0 ; i<count ; i++, in++, out++) {
		bits = 0;
		for (j=0 ; j<3 ; j++) {
			out->normal[j] = LittleFloat (in->normal[j]);
			if (out->normal[j] < 0) {
				bits |= 1<<j;
			}
		}

		out->dist = LittleFloat (in->dist);
		out->type = PlaneTypeForNormal( out->normal );
		out->signbits = bits;
	}
}


/*
===============
R_LoadSurfaces
===============
*/
void R_LoadSurfaces1( lump_t *surfs, lump_t *verts, lump_t *edgesLump, 
  lump_t *surfEdgesLump, lump_t *textures ) {

	dBsp1Face_t *in;
  dBsp1Texinfo_t *texinfo;
	msurface_t	*out;
	vec3_t	*dv;
  dedge_t *edges;
	int			*surfEdges;
	int			count;
	int			numFaces;
	int			i, j;
	float *hdrVertColors = NULL;
  drawVert_t pverts[MAX_POLYVERTS];
  int pindex[MAX_POLYVERTS];

	numFaces = 0;

	if (surfs->filelen % sizeof(*in))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);
	count = surfs->filelen / sizeof(*in);

	dv = (void *)(fileBase + verts->fileofs);
	if (verts->filelen % sizeof(*dv))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);

	surfEdges = (void *)(fileBase + surfEdgesLump->fileofs);
	if ( surfEdgesLump->filelen % sizeof(*surfEdges))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);

	texinfo = (void *)(fileBase + textures->fileofs);
	if ( textures->filelen % sizeof(*texinfo))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);

	edges = (void *)(fileBase + edgesLump->fileofs);
	if ( edgesLump->filelen % sizeof(*edges))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);

	out = ri.Hunk_Alloc ( count * sizeof(*out), h_low );	

	s_worldData.surfaces = out;
	s_worldData.numsurfaces = count;
	s_worldData.surfacesViewCount = ri.Hunk_Alloc ( count * sizeof(*s_worldData.surfacesViewCount), h_low );
	s_worldData.surfacesDlightBits = ri.Hunk_Alloc ( count * sizeof(*s_worldData.surfacesDlightBits), h_low );
	s_worldData.surfacesPshadowBits = ri.Hunk_Alloc ( count * sizeof(*s_worldData.surfacesPshadowBits), h_low );

	in = (void *)(fileBase + surfs->fileofs);
	out = s_worldData.surfaces;
	for ( i = 0 ; i < count ; i++, in++, out++ ) {
    out->data = ri.Hunk_Alloc( sizeof(srfBspSurface_t), h_low);
	}

	in = (void *)(fileBase + surfs->fileofs);
	out = s_worldData.surfaces;
	for ( i = 0 ; i < count ; i++, in++, out++ ) {
    dsurface_t ds;
    memset(&ds, 0, sizeof(ds));
    ds.shaderNum = texinfo[in->texinfo].miptex;
    ds.fogNum = -1;
    ds.surfaceType = MST_PLANAR;

    ds.firstVert = 0;
    ds.numVerts = in->numedges;
    
    ds.firstIndex = 0;
    ds.numIndexes = (ds.numVerts - 2) * 3;
    
    ds.lightmapNum = 0;
    int planenum = LittleShort(in->planenum);
	int side = LittleShort(in->side);
	
	if (side) {
	    // Invert the structural vector alignment if the face is flagged on the back of the plane splitting node
	    ds.lightmapVecs[2][0] = -s_worldData.planes[planenum].normal[0];
	    ds.lightmapVecs[2][1] = -s_worldData.planes[planenum].normal[1];
	    ds.lightmapVecs[2][2] = -s_worldData.planes[planenum].normal[2];
	} else {
	    ds.lightmapVecs[2][0] = s_worldData.planes[planenum].normal[0];
	    ds.lightmapVecs[2][1] = s_worldData.planes[planenum].normal[1];
	    ds.lightmapVecs[2][2] = s_worldData.planes[planenum].normal[2];
	}

    int firstEdge = LittleLong(in->firstedge);
    dBsp1Texinfo_t *ti = &texinfo[in->texinfo]; // Capture the texture projection layout

    for(j = 0; j < ds.numVerts; j++) {
        int edge = surfEdges[firstEdge + j];
        vec3_t raw_xyz;

        // 1. Extract the raw structural vertex position
        if (edge >= 0) {
            VectorCopy(dv[edges[edge].v[0]], raw_xyz);
        } else {
            VectorCopy(dv[edges[-edge].v[1]], raw_xyz);
        }

        // 2. Downscale the spatial layout to match your Node/Leaf bounds (0.125f)
        pverts[j].xyz[0] = raw_xyz[0] * 0.125f;
        pverts[j].xyz[1] = raw_xyz[1] * 0.125f;
        pverts[j].xyz[2] = raw_xyz[2] * 0.125f;

        // 3. Compute the proper projected Quake 1 texture coordinates (ST/UV)
        // Math: Dot product of the raw coordinates against the axis alignment vector + offset
        float raw_s = DotProduct(raw_xyz, ti->vecs[0]) + ti->offs[0];
        float raw_t = DotProduct(raw_xyz, ti->vecs[1]) + ti->offs[1];

        // Normalize the coordinate space by the texture sheet dimensions
        // (Default to a 64x64 safety block if miptex width/height calculations are unread)
        float texWidth  = (ti->miptex >= 0) ? 64.0f : 64.0f; 
        float texHeight = (ti->miptex >= 0) ? 64.0f : 64.0f;

        pverts[j].st[0] = raw_s / texWidth;
        pverts[j].st[1] = raw_t / texHeight;
    }

	for (j = 0; j < ds.numVerts - 2; j++)
	{
		pindex[j*3+0] = BigLong(0);
	    pindex[j*3+1] = BigLong(j + 1);
	    pindex[j*3+2] = BigLong(j + 2);
	}

    ParseFace( &ds, pverts, hdrVertColors, out, pindex );
    numFaces++;
	}

	if (hdrVertColors)
	{
		ri.FS_FreeFile(hdrVertColors);
	}

	R_FixSharedVertexLodError();

	ri.Printf( PRINT_ALL, "...loaded %d faces\n", numFaces );
}


/*
=================
R_LoadMarksurfaces
=================
*/
void R_LoadMarksurfaces1 (lump_t *l)
{	
	int		i, count;
	short		*in;
	int     *out;
	
	in = (void *)(fileBase + l->fileofs);
	if (l->filelen % sizeof(*in))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);
	count = l->filelen / sizeof(*in);
	out = ri.Hunk_Alloc ( count*sizeof(*out), h_low);	

	s_worldData.marksurfaces = out;
	s_worldData.nummarksurfaces = count;

	for ( i=0 ; i<count ; i++)
	{
		out[i] = in[i];
	}
}


/*
=================
R_LoadNodesAndLeafs
=================
*/
/*
=================
R_LoadNodesAndLeafs
=================
*/
void R_LoadNodesAndLeafs1 (lump_t *nodeLump, lump_t *leafLump) {
	int			i, j;
	dBsp1Node_t		*in;
	dBsp1Leaf_t		*inLeaf;
	mnode_t 	*out;
	int			numNodes, numLeafs;
	int      numSolidLeafs;

	in = (void *)(fileBase + nodeLump->fileofs);
	if (nodeLump->filelen % sizeof(*in) ||
		leafLump->filelen % sizeof(*inLeaf) ) {
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);
	}
	numNodes = nodeLump->filelen / sizeof(dnode_t);
	numLeafs = leafLump->filelen / sizeof(dleaf_t);

	numSolidLeafs = 0;
	for ( i=0 ; i<numNodes; i++, in++)
	{
		// FIX: in->children needs LittleLong translation
		if(LittleLong(in->children[0]) == -1
		  || LittleLong(in->children[1]) == -1) {
			numSolidLeafs++;
		}
	}

	out = ri.Hunk_Alloc ( (numNodes + numLeafs + numSolidLeafs) * sizeof(*out), h_low);	

	s_worldData.nodes = out;
	s_worldData.numnodes = numNodes + numLeafs + numSolidLeafs;
	s_worldData.numDecisionNodes = numNodes;

	// load nodes
	in = (void *)(fileBase + nodeLump->fileofs);
	for ( i=0 ; i<numNodes; i++, in++, out++)
	{
		for (j=0 ; j<3 ; j++)
		{
			// Explicitly read as short, swap endianness if needed, cast to float, and scale
			out->mins[j] = (float)(LittleShort(in->mins[j])) * 0.125f;
			out->maxs[j] = (float)(LittleShort(in->maxs[j])) * 0.125f;
		}
	
		// FIX: Swap the plane index from file bytes to native integer space!
		int parsedPlaneNum = LittleLong(in->planenum);
		out->plane = s_worldData.planes + parsedPlaneNum;

		out->contents = CONTENTS_NODE;	// differentiate from leafs

		for (j=0 ; j<2 ; j++)
		{
			// FIX: Swap children indices
			int childIdx = LittleLong(in->children[j]);
			if (childIdx >= 0)
				out->children[j] = s_worldData.nodes + childIdx;
			else {
				out->children[j] = s_worldData.nodes + numNodes + (-1 - childIdx);
			}
		}
	}
	
	// load leafs
	inLeaf = (void *)(fileBase + leafLump->fileofs);
	for ( i=0 ; i<numLeafs ; i++, inLeaf++, out++)
	{
		for (j=0 ; j<3 ; j++)
		{
			out->mins[j] = (float)(LittleShort(inLeaf->mins[j])) * 0.125f;
			out->maxs[j] = (float)(LittleShort(inLeaf->maxs[j])) * 0.125f;
		}

		// FIX: Swapping contents/vis layouts if needed
		out->contents = LittleLong(inLeaf->contents);
		out->cluster = out->contents == CONTENTS_Q1_SOLID ? -1 : (i-1);
		out->area = -1;

		if ( out->cluster >= s_worldData.numClusters ) {
			s_worldData.numClusters = out->cluster + 1;
		}

		// FIX: Swap surface tracking hooks for the leaves
		out->firstmarksurface = LittleLong(inLeaf->firstmarksurface);
		out->nummarksurfaces = LittleLong(inLeaf->nummarksurfaces);

		if (out->contents && out->contents != CONTENTS_Q1_SOLID)
			s_worldData.numDecisionNodes++;
	}

	in = (void *)(fileBase + nodeLump->fileofs);
	for ( i=0 ; i<numNodes; i++, in++)
	{
		int c0 = LittleLong(in->children[0]);
		int c1 = LittleLong(in->children[1]);
		if(c0 == -1 || c1 == -1) {
			out->cluster = -1;
			out->area = 0;
			// FIX: Swap face trackers for the virtual solid leaves
			out->firstmarksurface = LittleLong(in->firstface);
			out->nummarksurfaces = LittleLong(in->numfaces);
			out++;
		}
	}

	// chain descendants
	R_SetParent (s_worldData.nodes, NULL);
}


/*
=================
R_LoadSubmodels
=================
*/
void R_LoadSubmodels1( lump_t *l ) {
	dBsp1Model_t	*in;
	bmodel_t	*out;
	int			i, j, count;

	in = (void *)(fileBase + l->fileofs);
	if (l->filelen % sizeof(*in))
		ri.Error (ERR_DROP, "%s: funny lump size in %s", __func__, s_worldData.name);
	count = l->filelen / sizeof(*in);

	s_worldData.numBModels = count;
	s_worldData.bmodels = out = ri.Hunk_Alloc( count * sizeof(*out), h_low );

	for ( i=0 ; i<count ; i++, in++, out++ ) {
		model_t *model;

		model = R_AllocModel();

		assert( model != NULL );			// this should never happen
		if ( model == NULL ) {
			ri.Error(ERR_DROP, "R_LoadSubmodels: R_AllocModel() failed");
		}

		model->type = MOD_BRUSH;
		model->bmodel = out;
		Com_sprintf( model->name, sizeof( model->name ), "*%d", i );

		// LOOK, i tried to repair this one and commented it out but i had my legendary math wrong
		//for (j=0 ; j<3 ; j++) {
			//--> this was here before below, out->bounds[0][j] = LittleFloat (in->origin[j]) + LittleFloat (in->mins[j]);
			//out->bounds[1][j] = LittleFloat (in->origin[j]) + LittleFloat (in->maxs[j]);
      	//	out->bounds[0][j] = LittleFloat (in->mins[j]);
		//	out->bounds[1][j] = LittleFloat (in->maxs[j]);
		//}
		for ( j=0 ; j<3 ; j++ ) {
		    // Quake 1 submodel bounds are ALSO stored as 16-bit short integers or floats needing scaling
		    out->bounds[0][j] = (float)(LittleFloat(in->mins[j])) * 0.125f;
		    out->bounds[1][j] = (float)(LittleFloat(in->maxs[j])) * 0.125f;
		}

		out->firstSurface = LittleLong( in->firstface );
		out->numSurfaces = LittleLong( in->numfaces );

		if(i == 0)
		{
			// Add this for limiting VAO surface creation
			s_worldData.numWorldSurfaces = out->numSurfaces;
		}
	}
}


/*
=================
R_LoadVisibility
=================
*/

static void DecompressVis(byte *dst, void *vis, int pos, int rowSize)
{
	if (pos == -1)
	{
		memset(dst, 0xFF, rowSize);	// all visible
		dst += rowSize;
		return;
	}

	byte *src = (byte*)vis + pos;
	// decompress vis
	for (int j = rowSize; j; /*empty*/)
	{
		byte c = *src++;
		if (c)
		{	// non-zero byte
			*dst++ = c;
			j--;
		}
		else
		{	// zero byte -- decompress RLE data (with filler 0)
			c = *src++;				// count
			c = MIN(c, j);			// should not be, but ...
			j -= c;
			while (c--)
				*dst++ = 0;
		}
	}
}

/*
=================
R_LoadVisibility1
=================
*/
static void R_LoadVisibility1( lump_t *l, lump_t *leafLump ) {
	int			len;
	byte		*buf;
	dBsp1Leaf_t *in;
	int			i;

	len = l->filelen;
	if ( !len ) {
		// If the map has zero visibility data, explicitly flood the bitmask with 0xFF 
		// so the entire map defaults to completely visible rather than completely black
		s_worldData.numClusters = s_worldData.numnodes - s_worldData.numDecisionNodes;
		s_worldData.clusterBytes = (s_worldData.numClusters + 7) >> 3;
		s_worldData.vis = ri.Hunk_Alloc( s_worldData.numClusters * s_worldData.clusterBytes, h_high );
		memset((void *)s_worldData.vis, 0xFF, s_worldData.numClusters * s_worldData.clusterBytes);
		return;
	}

	buf = fileBase + l->fileofs;
	in = (void *)(fileBase + leafLump->fileofs);

	if ( tr.externalVisData ) {
		s_worldData.vis = tr.externalVisData;
	} else {
		// In our Quake 1 setup, every leaf acts as its own unique visibility cluster
		s_worldData.numClusters = s_worldData.numnodes - s_worldData.numDecisionNodes; // Total Leafs
		s_worldData.clusterBytes = (s_worldData.numClusters + 7) >> 3; // Matrix Row Width
		
		s_worldData.vis = ri.Hunk_Alloc( s_worldData.numClusters * s_worldData.clusterBytes, h_high );
		byte *dst = (void *)s_worldData.vis;

		// Loop through EVERY leaf node (including the dummy solid leaf 0)
		for (i = 0; i < s_worldData.numClusters; i++) {
			// Pull the vis offset directly from file, handle endianness
			int fileVisOfs = LittleLong(in[i].visofs);
			
			// Decompress the byte stream into this specific cluster's row memory slot
			DecompressVis(dst, buf, fileVisOfs, s_worldData.clusterBytes);
			
			// Increment the destination pointer precisely by our row-size stride
			dst += s_worldData.clusterBytes;
		}
	}
}


void LoadBsp1(const char *name) {
	int i;
	dBsp1Hdr_t	*header;
	header = (dBsp1Hdr_t *)fileBase;

	// swap all the lumps
	for (i=0; i < ARRAY_LEN(header->lumps); i++) {
		((int *)header)[i] = LittleLong ( ((int *)header)[i]);
	}
  /*
  CMod_LoadShaders2( &header.lumps[LUMP_Q2_TEXINFO] );
	CMod_LoadLeafs2 (&header.lumps[LUMP_Q2_LEAFS]);
	CMod_LoadLeafBrushes2 (&header.lumps[LUMP_Q2_LEAFBRUSHES]);
	CMod_LoadLeafSurfaces2 (&header.lumps[LUMP_Q2_LEAFFACES]);
	CMod_LoadPlanes2 (&header.lumps[LUMP_Q2_PLANES]);
	CMod_LoadBrushSides2 (&header.lumps[LUMP_Q2_BRUSHSIDES]);
	CMod_LoadBrushes2 (&header.lumps[LUMP_Q2_BRUSHES]);
	CMod_LoadSubmodels2 (&header.lumps[LUMP_Q2_MODELS]);
	CMod_LoadNodes2 (&header.lumps[LUMP_Q2_NODES]);
	CMod_LoadEntityString2 (&header.lumps[LUMP_Q2_ENTITIES], name);
	CMod_LoadVisibility2( &header.lumps[LUMP_Q2_VISIBILITY] );
	// TODO: area portals and area mask stuff
	CMod_LoadAreas( &header.lumps[LUMP_Q2_ZONES] );
	//CMod_LoadAreaPortals( &header.lumps[LUMP_Q2_ZONEPORTALS] );
	//
	//;
	CMod_LoadPatches2( &header.lumps[LUMP_Q2_FACES], &header.lumps[LUMP_Q2_VERTEXES] );
  */
  
	// load into heap
	R_LoadEntities( &header->lumps[LUMP_Q1_ENTITIES] );
	R_LoadShaders1( &header->lumps[LUMP_Q1_TEXTURES] );
	R_LoadPlanes1( &header->lumps[LUMP_Q1_PLANES] );
	R_LoadSurfaces1( &header->lumps[LUMP_Q1_FACES], 
    &header->lumps[LUMP_Q1_VERTEXES],
    &header->lumps[LUMP_Q1_EDGES],
    &header->lumps[LUMP_Q1_SURFEDGES], 
    &header->lumps[LUMP_Q1_TEXINFO] );
  R_LoadMarksurfaces1 (&header->lumps[LUMP_Q1_MARKSURFACES]);
  R_LoadNodesAndLeafs1 (&header->lumps[LUMP_Q1_NODES], 
    &header->lumps[LUMP_Q1_LEAFS]);
	R_LoadSubmodels1( &header->lumps[LUMP_Q1_MODELS] );
  R_LoadVisibility1( &header->lumps[LUMP_Q1_VISIBILITY], &header->lumps[LUMP_Q1_LEAFS] );
}

#endif
