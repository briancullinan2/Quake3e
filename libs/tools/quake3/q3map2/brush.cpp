/* -------------------------------------------------------------------------------

   Copyright (C) 1999-2007 id Software, Inc. and contributors.
   For a list of contributors, see the accompanying CONTRIBUTORS file.

   This file is part of GtkRadiant.

   GtkRadiant is free software; you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation; either version 2 of the License, or
   (at your option) any later version.

   GtkRadiant is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with GtkRadiant; if not, write to the Free Software
   Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

   ----------------------------------------------------------------------------------

   This code has been altered significantly from its original form, to support
   several games based on the Quake III Arena engine, in the form of "Q3Map2."

   ------------------------------------------------------------------------------- */



/* dependencies */
#include "q3map2.h"



/* -------------------------------------------------------------------------------

   functions

   ------------------------------------------------------------------------------- */

/*
   AllocSideRef() - ydnar
   allocates and assigns a brush side reference
 */

sideRef_t *AllocSideRef( side_t *side, sideRef_t *next ){
	sideRef_t *sideRef;


	/* dummy check */
	if ( side == NULL ) {
		return next;
	}

	/* allocate and return */
	sideRef = safe_malloc( sizeof( *sideRef ) );
	sideRef->side = side;
	sideRef->next = next;
	return sideRef;
}



/*
   CountBrushList()
   counts the number of brushes in a brush linked list
 */

int CountBrushList( brush_t *brushes ){
	int c = 0;


	/* count brushes */
	for ( ; brushes != NULL; brushes = brushes->next )
		c++;
	return c;
}



/*
   AllocBrush()
   allocates a new brush
 */

brush_t *AllocBrush( int numSides ){
	return safe_calloc( offsetof( brush_t, sides[numSides] ) );
}



/*
   FreeBrush()
   frees a single brush and all sides/windings
 */

void FreeBrush( brush_t *b ){
	int i;


	/* error check */
	if ( *( (unsigned int*) b ) == 0xFEFEFEFE ) {
		Sys_FPrintf( SYS_WRN | SYS_VRBflag, "WARNING: Attempt to free an already freed brush!\n" );
		return;
	}

	/* free brush sides */
	for ( i = 0; i < b->numsides; i++ )
		if ( b->sides[i].winding != NULL ) {
			FreeWinding( b->sides[ i ].winding );
		}

	/* ydnar: overwrite it */
	memset( b, 0xFE, offsetof( brush_t, sides[b->numsides] ) );
	*( (unsigned int*) b ) = 0xFEFEFEFE;

	/* free it */
	free( b );
}



/*
   FreeBrushList()
   frees a linked list of brushes
 */

void FreeBrushList( brush_t *brushes ){
	brush_t     *next;


	/* walk brush list */
	for ( ; brushes != NULL; brushes = next )
	{
		next = brushes->next;
		FreeBrush( brushes );
	}
}



/*
   CopyBrush()
   duplicates the brush, sides, and windings
 */

brush_t *CopyBrush( const brush_t *brush ){
	/* copy brush */
	brush_t *newBrush = AllocBrush( brush->numsides );
	memcpy( newBrush, brush, offsetof( brush_t, sides[brush->numsides] ) );

	/* ydnar: nuke linked list */
	newBrush->next = NULL;

	/* copy sides */
	for ( int i = 0; i < brush->numsides; i++ )
	{
		if ( brush->sides[ i ].winding != NULL ) {
			newBrush->sides[ i ].winding = CopyWinding( brush->sides[ i ].winding );
		}
	}

	/* return it */
	return newBrush;
}




/*
   BoundBrush()
   sets the mins/maxs based on the windings
   returns false if the brush doesn't enclose a valid volume
 */

bool BoundBrush( brush_t *brush ){
	brush->minmax.clear();
	for ( int i = 0; i < brush->numsides; i++ )
	{
		const winding_t *w = brush->sides[ i ].winding;
		if ( w != NULL ) {
			WindingExtendBounds( w, brush->minmax );
		}
	}

	return brush->minmax.valid() && c_worldMinmax.surrounds( brush->minmax );
}




/*
   SnapWeldVector() - ydnar
   welds two Vector3's into a third, taking into account nearest-to-integer
   instead of averaging
 */

#define SNAP_EPSILON    0.01

void SnapWeldVector( const Vector3& a, const Vector3& b, Vector3& out ){
	int i;
	float ai, bi, outi;


	/* do each element */
	for ( i = 0; i < 3; i++ )
	{
		/* round to integer */
		ai = std::rint( a[ i ] );
		bi = std::rint( b[ i ] );

		/* prefer exact integer */
		if ( ai == a[ i ] ) {
			out[ i ] = a[ i ];
		}
		else if ( bi == b[ i ] ) {
			out[ i ] = b[ i ];
		}

		/* use nearest */
		else if ( fabs( ai - a[ i ] ) < fabs( bi - b[ i ] ) ) {
			out[ i ] = a[ i ];
		}
		else{
			out[ i ] = b[ i ];
		}

		/* snap */
		outi = std::rint( out[ i ] );
		if ( fabs( outi - out[ i ] ) <= SNAP_EPSILON ) {
			out[ i ] = outi;
		}
	}
}

/*
   ==================
   SnapWeldVectorAccu

   Welds two vectors into a third, taking into account nearest-to-integer
   instead of averaging.
   ==================
 */
void SnapWeldVectorAccu( const DoubleVector3& a, const DoubleVector3& b, DoubleVector3& out ){
	// I'm just preserving what I think was the intended logic of the original
	// SnapWeldVector().  I'm not actually sure where this function should even
	// be used.  I'd like to know which kinds of problems this function addresses.

	// TODO: I thought we're snapping all coordinates to nearest 1/8 unit?
	// So what is natural about snapping to the nearest integer?  Maybe we should
	// be snapping to the nearest 1/8 unit instead?

	int i;
	double ai, bi, ad, bd;

	for ( i = 0; i < 3; i++ )
	{
		ai = std::rint( a[i] );
		bi = std::rint( b[i] );
		ad = fabs( ai - a[i] );
		bd = fabs( bi - b[i] );

		if ( ad < bd ) {
			if ( ad < SNAP_EPSILON ) {
				out[i] = ai;
			}
			else{
				out[i] = a[i];
			}
		}
		else
		{
			if ( bd < SNAP_EPSILON ) {
				out[i] = bi;
			}
			else{
				out[i] = b[i];
			}
		}
	}
}

/*
   FixWinding() - ydnar
   removes degenerate edges from a winding
   returns true if the winding is valid
 */

#define DEGENERATE_EPSILON  0.1

bool FixWinding( winding_t *w ){
	bool valid = true;
	int i, j, k;
	Vector3 vec;


	/* dummy check */
	if ( !w ) {
		return false;
	}

	/* check all verts */
	for ( i = 0; i < w->numpoints; i++ )
	{
		/* don't remove points if winding is a triangle */
		if ( w->numpoints == 3 ) {
			return valid;
		}

		/* get second point index */
		j = ( i + 1 ) % w->numpoints;

		/* degenerate edge? */
		if ( vector3_length( w->p[ i ] - w->p[ j ] ) < DEGENERATE_EPSILON ) {
			valid = false;
			//Sys_FPrintf( SYS_WRN | SYS_VRBflag, "WARNING: Degenerate winding edge found, fixing...\n" );

			/* create an average point (ydnar 2002-01-26: using nearest-integer weld preference) */
			SnapWeldVector( w->p[ i ], w->p[ j ], vec );
			w->p[ i ] = vec;
			//VectorAdd( w->p[ i ], w->p[ j ], vec );
			//VectorScale( vec, 0.5, w->p[ i ] );

			/* move the remaining verts */
			for ( k = i + 2; k < w->numpoints; k++ )
			{
				w->p[ k - 1 ] = w->p[ k ];
			}
			w->numpoints--;
		}
	}

	/* one last check and return */
	if ( w->numpoints < 3 ) {
		valid = false;
	}
	return valid;
}

/*
   ==================
   FixWindingAccu

   Removes degenerate edges (edges that are too short) from a winding.
   Returns true if the winding has been altered by this function.
   Returns false if the winding is untouched by this function.

   It's advised that you check the winding after this function exits to make
   sure it still has at least 3 points.  If that is not the case, the winding
   cannot be considered valid.  The winding may degenerate to one or two points
   if the some of the winding's points are close together.
   ==================
 */
bool FixWindingAccu( winding_accu_t *w ){
	int i, j, k;
	bool done, altered;

	if ( w == NULL ) {
		Error( "FixWindingAccu: NULL argument" );
	}

	altered = false;

	while ( true )
	{
		if ( w->numpoints < 2 ) {
			break;                   // Don't remove the only remaining point.
		}
		done = true;
		for ( i = 0; i < w->numpoints; i++ )
		{
			j = ( ( ( i + 1 ) == w->numpoints ) ? 0 : ( i + 1 ) );

			DoubleVector3 vec = w->p[i] - w->p[j];
			if ( vector3_length( vec ) < DEGENERATE_EPSILON ) {
				// TODO: I think the "snap weld vector" was written before
				// some of the math precision fixes, and its purpose was
				// probably to address math accuracy issues.  We can think
				// about changing the logic here.  Maybe once plane distance
				// gets 64 bits, we can look at it then.
				SnapWeldVectorAccu( w->p[i], w->p[j], vec );
				w->p[i] = vec;
				for ( k = j + 1; k < w->numpoints; k++ )
				{
					w->p[k - 1] = w->p[k];
				}
				w->numpoints--;
				altered = true;
				// The only way to finish off fixing the winding consistently and
				// accurately is by fixing the winding all over again.  For example,
				// the point at index i and the point at index i-1 could now be
				// less than the epsilon distance apart.  There are too many special
				// case problems we'd need to handle if we didn't start from the
				// beginning.
				done = false;
				break; // This will cause us to return to the "while" loop.
			}
		}
		if ( done ) {
			break;
		}
	}

	return altered;
}


/*
   CreateBrushWindings()
   makes basewindigs for sides and mins/maxs for the brush
   returns false if the brush doesn't enclose a valid volume
 */

bool CreateBrushWindings( brush_t *brush ){
	int i, j;
#if Q3MAP2_EXPERIMENTAL_HIGH_PRECISION_MATH_FIXES
	winding_accu_t  *w;
#else
	winding_t   *w;
#endif
	side_t      *side;
	plane_t     *plane;


	/* walk the list of brush sides */
	for ( i = 0; i < brush->numsides; i++ )
	{
		/* get side and plane */
		side = &brush->sides[ i ];
		plane = &mapplanes[ side->planenum ];

		/* make huge winding */
#if Q3MAP2_EXPERIMENTAL_HIGH_PRECISION_MATH_FIXES
		w = BaseWindingForPlaneAccu( plane->plane );
#else
		w = BaseWindingForPlane( plane->plane );
#endif

		/* walk the list of brush sides */
		for ( j = 0; j < brush->numsides && w != NULL; j++ )
		{
			if ( i == j ) {
				continue;
			}
			if ( brush->sides[ j ].planenum == ( brush->sides[ i ].planenum ^ 1 ) ) {
				continue;       /* back side clipaway */
			}
			if ( brush->sides[ j ].bevel ) {
				continue;
			}
			plane = &mapplanes[ brush->sides[ j ].planenum ^ 1 ];
#if Q3MAP2_EXPERIMENTAL_HIGH_PRECISION_MATH_FIXES
			ChopWindingInPlaceAccu( &w, plane->plane, 0 );
#else
			ChopWindingInPlace( &w, plane->plane, 0 ); // CLIP_EPSILON );
#endif

			/* ydnar: fix broken windings that would generate trifans */
#if Q3MAP2_EXPERIMENTAL_HIGH_PRECISION_MATH_FIXES
			// I think it's better to FixWindingAccu() once after we chop with all planes
			// so that error isn't multiplied.  There is nothing natural about welding
			// the points unless they are the final endpoints.  ChopWindingInPlaceAccu()
			// is able to handle all kinds of degenerate windings.
#else
			FixWinding( w );
#endif
		}

		/* set side winding */
#if Q3MAP2_EXPERIMENTAL_HIGH_PRECISION_MATH_FIXES
		if ( w != NULL ) {
			FixWindingAccu( w );
			if ( w->numpoints < 3 ) {
				FreeWindingAccu( w );
				w = NULL;
			}
		}
		side->winding = ( w ? CopyWindingAccuToRegular( w ) : NULL );
		if ( w ) {
			FreeWindingAccu( w );
		}
#else
		side->winding = w;
#endif
	}

	/* find brush bounds */
	return BoundBrush( brush );
}




/*
   ==================
   BrushFromBounds

   Creates a new axial brush
   ==================
 */
brush_t *BrushFromBounds( const Vector3& mins, const Vector3& maxs ){
	brush_t     *b;
	int i;
	float dist;

	b = AllocBrush( 6 );
	b->numsides = 6;
	for ( i = 0 ; i < 3 ; i++ )
	{
		dist = maxs[i];
		b->sides[i].planenum = FindFloatPlane( g_vector3_axes[i], dist, 1, &maxs );

		dist = -mins[i];
		b->sides[3 + i].planenum = FindFloatPlane( -g_vector3_axes[i], dist, 1, &mins );
	}

	CreateBrushWindings( b );

	return b;
}

/*
   ==================
   BrushVolume

   ==================
 */
float BrushVolume( brush_t *brush ){
	int i;
	winding_t   *w;
	Vector3 corner;
	float volume;

	if ( !brush ) {
		return 0;
	}

	// grab the first valid point as the corner

	w = NULL;
	for ( i = 0 ; i < brush->numsides ; i++ )
	{
		w = brush->sides[i].winding;
		if ( w ) {
			break;
		}
	}
	if ( !w ) {
		return 0;
	}
	corner = w->p[0];

	// make tetrahedrons to all other faces

	volume = 0;
	for ( ; i < brush->numsides ; i++ )
	{
		w = brush->sides[i].winding;
		if ( !w ) {
			continue;
		}
		volume += -plane3_distance_to_point( mapplanes[brush->sides[i].planenum].plane, corner ) * WindingArea( w );
	}

	volume /= 3;
	return volume;
}



/*
   WriteBSPBrushMap()
   writes a map with the split bsp brushes
 */

void WriteBSPBrushMap( const char *name, brush_t *list ){
	side_t      *s;
	int i;
	winding_t   *w;


	/* note it */
	Sys_Printf( "Writing %s\n", name );

	/* open the map file */
	FILE *f = SafeOpenWrite( name );

	fprintf( f, "{\n\"classname\" \"worldspawn\"\n" );

	for ( ; list ; list = list->next )
	{
		fprintf( f, "{\n" );
		for ( i = 0,s = list->sides ; i < list->numsides ; i++,s++ )
		{
			// TODO: See if we can use a smaller winding to prevent resolution loss.
			// Is WriteBSPBrushMap() used only to decompile maps?
			w = BaseWindingForPlane( mapplanes[s->planenum].plane );

			fprintf( f, "( %i %i %i ) ", (int)w->p[0][0], (int)w->p[0][1], (int)w->p[0][2] );
			fprintf( f, "( %i %i %i ) ", (int)w->p[1][0], (int)w->p[1][1], (int)w->p[1][2] );
			fprintf( f, "( %i %i %i ) ", (int)w->p[2][0], (int)w->p[2][1], (int)w->p[2][2] );

			fprintf( f, "notexture 0 0 0 1 1\n" );
			FreeWinding( w );
		}
		fprintf( f, "}\n" );
	}
	fprintf( f, "}\n" );

	fclose( f );

}



/*
   FilterBrushIntoTree_r()
   adds brush reference to any intersecting bsp leafnode
 */

int FilterBrushIntoTree_r( brush_t *b, node_t *node ){
	brush_t     *front, *back;
	int c;


	/* dummy check */
	if ( b == NULL ) {
		return 0;
	}

	/* add it to the leaf list */
	if ( node->planenum == PLANENUM_LEAF ) {
		/* something somewhere is hammering brushlist */
		b->next = node->brushlist;
		node->brushlist = b;

		/* classify the leaf by the structural brush */
		if ( !b->detail ) {
			if ( b->opaque ) {
				node->opaque = true;
				node->areaportal = false;
			}
			else if ( b->compileFlags & C_AREAPORTAL ) {
				if ( !node->opaque ) {
					node->areaportal = true;
				}
			}
		}

		return 1;
	}

	/* split it by the node plane */
	c = b->numsides;
	SplitBrush( b, node->planenum, &front, &back );
	FreeBrush( b );

	c = 0;
	c += FilterBrushIntoTree_r( front, node->children[ 0 ] );
	c += FilterBrushIntoTree_r( back, node->children[ 1 ] );

	return c;
}



/*
   FilterDetailBrushesIntoTree
   fragment all the detail brushes into the structural leafs
 */

void FilterDetailBrushesIntoTree( entity_t *e, tree_t *tree ){
	brush_t             *b, *newb;
	int r;
	int c_unique, c_clusters;
	int i;


	/* note it */
	Sys_FPrintf( SYS_VRB,  "--- FilterDetailBrushesIntoTree ---\n" );

	/* walk the list of brushes */
	c_unique = 0;
	c_clusters = 0;
	for ( b = e->brushes; b; b = b->next )
	{
		if ( !b->detail ) {
			continue;
		}
		c_unique++;
		newb = CopyBrush( b );
		r = FilterBrushIntoTree_r( newb, tree->headnode );
		c_clusters += r;

		/* mark all sides as visible so drawsurfs are created */
		if ( r ) {
			for ( i = 0; i < b->numsides; i++ )
			{
				if ( b->sides[ i ].winding ) {
					b->sides[ i ].visible = true;
				}
			}
		}
	}

	/* emit some statistics */
	Sys_FPrintf( SYS_VRB, "%9d detail brushes\n", c_unique );
	Sys_FPrintf( SYS_VRB, "%9d cluster references\n", c_clusters );
}

/*
   =====================
   FilterStructuralBrushesIntoTree

   Mark the leafs as opaque and areaportals
   =====================
 */
void FilterStructuralBrushesIntoTree( entity_t *e, tree_t *tree ) {
	brush_t         *b, *newb;
	int r;
	int c_unique, c_clusters;
	int i;

	Sys_FPrintf( SYS_VRB, "--- FilterStructuralBrushesIntoTree ---\n" );

	c_unique = 0;
	c_clusters = 0;
	for ( b = e->brushes ; b ; b = b->next ) {
		if ( b->detail ) {
			continue;
		}
		c_unique++;
		newb = CopyBrush( b );
		r = FilterBrushIntoTree_r( newb, tree->headnode );
		c_clusters += r;

		// mark all sides as visible so drawsurfs are created
		if ( r ) {
			for ( i = 0 ; i < b->numsides ; i++ ) {
				if ( b->sides[i].winding ) {
					b->sides[i].visible = true;
				}
			}
		}
	}

	/* emit some statistics */
	Sys_FPrintf( SYS_VRB, "%9d structural brushes\n", c_unique );
	Sys_FPrintf( SYS_VRB, "%9d cluster references\n", c_clusters );
}



/*
   ================
   AllocTree
   ================
 */
tree_t *AllocTree( void ){
	tree_t *tree = safe_calloc( sizeof( *tree ) );
	tree->minmax.clear();
	return tree;
}

/*
   ================
   AllocNode
   ================
 */
node_t *AllocNode( void ){
	return safe_calloc( sizeof( node_t ) );
}


/*
   ================
   WindingIsTiny

   Returns true if the winding would be crunched out of
   existance by the vertex snapping.
   ================
 */
#define EDGE_LENGTH 0.2
bool WindingIsTiny( winding_t *w ){
/*
	if (WindingArea (w) < 1)
		return true;
	return false;
 */
	int i, j;
	int edges = 0;

	for ( i = 0 ; i < w->numpoints ; i++ )
	{
		j = ( i == w->numpoints - 1 )? 0 : i + 1;
		if ( vector3_length( w->p[j] - w->p[i] ) > EDGE_LENGTH ) {
			if ( ++edges == 3 ) {
				return false;
			}
		}
	}
	return true;
}

/*
   ================
   WindingIsHuge

   Returns true if the winding still has one of the points
   from basewinding for plane
   ================
 */
bool WindingIsHuge( winding_t *w ){
	for ( int i = 0; i < w->numpoints; i++ )
		if ( !c_worldMinmax.test( w->p[i] ) )
			return true;
	return false;
}

//============================================================

/*
   ==================
   BrushMostlyOnSide

   ==================
 */
int BrushMostlyOnSide( brush_t *brush, plane_t *plane ){
	int i, j;
	winding_t   *w;
	float max;
	int side;

	max = 0;
	side = PSIDE_FRONT;
	for ( i = 0 ; i < brush->numsides ; i++ )
	{
		w = brush->sides[i].winding;
		if ( !w ) {
			continue;
		}
		for ( j = 0 ; j < w->numpoints ; j++ )
		{
			const double d = plane3_distance_to_point( plane->plane, w->p[j] );
			if ( d > max ) {
				max = d;
				side = PSIDE_FRONT;
			}
			if ( -d > max ) {
				max = -d;
				side = PSIDE_BACK;
			}
		}
	}
	return side;
}



/*
   SplitBrush()
   generates two new brushes, leaving the original unchanged
 */

void SplitBrush( brush_t *brush, int planenum, brush_t **front, brush_t **back ){
	brush_t     *b[2];
	int i, j;
	winding_t   *w, *cw[2], *midwinding;
	plane_t     *plane, *plane2;
	side_t      *s, *cs;
	float d_front, d_back;


	*front = NULL;
	*back = NULL;
	plane = &mapplanes[planenum];

	// check all points
	d_front = d_back = 0;
	for ( i = 0 ; i < brush->numsides ; i++ )
	{
		w = brush->sides[i].winding;
		if ( !w ) {
			continue;
		}
		for ( j = 0 ; j < w->numpoints ; j++ )
		{
			const float d = plane3_distance_to_point( plane->plane, w->p[j] );
			if ( d > 0 ) {
				value_maximize( d_front, d );
			}
			if ( d < 0 ) {
				value_minimize( d_back, d );
			}
		}
	}

	if ( d_front < 0.1 ) { // PLANESIDE_EPSILON)
		// only on back
		*back = CopyBrush( brush );
		return;
	}

	if ( d_back > -0.1 ) { // PLANESIDE_EPSILON)
		// only on front
		*front = CopyBrush( brush );
		return;
	}

	// create a new winding from the split plane
	w = BaseWindingForPlane( plane->plane );
	for ( i = 0 ; i < brush->numsides && w ; i++ )
	{
		plane2 = &mapplanes[brush->sides[i].planenum ^ 1];
		ChopWindingInPlace( &w, plane2->plane, 0 ); // PLANESIDE_EPSILON);
	}

	if ( !w || WindingIsTiny( w ) ) { // the brush isn't really split
		int side;

		side = BrushMostlyOnSide( brush, plane );
		if ( side == PSIDE_FRONT ) {
			*front = CopyBrush( brush );
		}
		if ( side == PSIDE_BACK ) {
			*back = CopyBrush( brush );
		}
		return;
	}

	if ( WindingIsHuge( w ) ) {
		Sys_FPrintf( SYS_WRN | SYS_VRBflag, "WARNING: huge winding\n" );
	}

	midwinding = w;

	// split it for real

	for ( i = 0 ; i < 2 ; i++ )
	{
		b[i] = AllocBrush( brush->numsides + 1 );
		memcpy( b[i], brush, sizeof( brush_t ) );
		b[i]->numsides = 0;
		b[i]->next = NULL;
		b[i]->original = brush->original;
	}

	// split all the current windings

	for ( i = 0 ; i < brush->numsides ; i++ )
	{
		s = &brush->sides[i];
		w = s->winding;
		if ( !w ) {
			continue;
		}
		ClipWindingEpsilonStrict( w, plane->plane,
		                          0 /*PLANESIDE_EPSILON*/, &cw[0], &cw[1] ); /* strict, in parallel case we get the face back because it also is the midwinding */
		for ( j = 0 ; j < 2 ; j++ )
		{
			if ( !cw[j] ) {
				continue;
			}
			cs = &b[j]->sides[b[j]->numsides];
			b[j]->numsides++;
			*cs = *s;
			cs->winding = cw[j];
		}
	}


	// see if we have valid polygons on both sides
	for ( i = 0 ; i < 2 ; i++ )
	{
		if ( b[i]->numsides < 3 || !BoundBrush( b[i] ) ) {
			if ( b[i]->numsides >= 3 ) {
				Sys_FPrintf( SYS_WRN | SYS_VRBflag, "bogus brush after clip\n" );
			}
			FreeBrush( b[i] );
			b[i] = NULL;
		}
	}

	if ( !( b[0] && b[1] ) ) {
		if ( !b[0] && !b[1] ) {
			Sys_FPrintf( SYS_WRN | SYS_VRBflag, "split removed brush\n" );
		}
		else{
			Sys_FPrintf( SYS_WRN | SYS_VRBflag, "split not on both sides\n" );
		}
		if ( b[0] ) {
			FreeBrush( b[0] );
			*front = CopyBrush( brush );
		}
		if ( b[1] ) {
			FreeBrush( b[1] );
			*back = CopyBrush( brush );
		}
		return;
	}

	// add the midwinding to both sides
	for ( i = 0 ; i < 2 ; i++ )
	{
		cs = &b[i]->sides[b[i]->numsides];
		b[i]->numsides++;

		cs->planenum = planenum ^ i ^ 1;
		cs->shaderInfo = NULL;
		if ( i == 0 ) {
			cs->winding = CopyWinding( midwinding );
		}
		else{
			cs->winding = midwinding;
		}
	}

	{
		float v1;
		int i;


		for ( i = 0 ; i < 2 ; i++ )
		{
			v1 = BrushVolume( b[i] );
			if ( v1 < 1.0 ) {
				FreeBrush( b[i] );
				b[i] = NULL;
				//			Sys_FPrintf( SYS_WRN | SYS_VRBflag, "tiny volume after clip\n" );
			}
		}
	}

	*front = b[0];
	*back = b[1];
}