#include "server.h"

#ifdef USE_MEMORY_MAPS

#include "../qcommon/cm_local.h"

// This has kind of turned into more of a facet system.

// store every facet in one color channel normalized to 255
// Or up to 3 traces / per XY coordinate can be summarized for things like caves, if we wanted
//   automatically simulate a cave in or rocks falling during Ground Zero opening maps
//  Or an avalanche we could detect all of the bumps or roofs or sides that stick out 
//    when it's over using RGB as XY with the color value being Z, or even XZ, YZ

#define CHANNEL_TOPDOWN 0 // height map of the first floor
#define CHANNEL_WALLS 1 // bit mask of hitting a wall in 6 directions, 2 floors
#define CHANNEL_CEILINGS 2 // bitmask ceiling heights
#define CHANNEL_THICKNESS 3 // sum of all solid volumes

#define CHANNEL_REACHABLE 4 // filling every space with an empty box, the distance to the center of the largest boxes that fit
#define CHANNEL_VISIBLE 5 // amount of unobstructed view subtracted from 360
#define CHANNEL_FACETS 6 // baseline of height normalized to v/256/256, 1 stands for bitmask for critical points
#define CHANNEL_FLOORS 7 // bounce pads, ladders, doorways, stairs? bitmask floor heights, chop off top quarter as assumed of being covered by heightmap

#define CHANNEL_LANDSCAPE 8 // average angle of all the planes in the space
#define CHANNEL_TEXTURES 9 // bit-mask for specific types of shaders, grass, rock, slick, lava, etc for adding
#define CHANNEL_CORNERS 10 // detect all the possible places to add bump map images to cover seams
#define CHANNEL_HOLES 11 // gaps in the map that look like players can see through but not move through

#define CHANNEL_PITCH 12 // average angle of all the planes in the space
#define CHANNEL_YAW 13 // bounce pads, ladders, doorways?
#define CHANNEL_ROLL 14 // detect all the possible places to add bump map images to cover seams
#define CHANNEL_LENGTH 15 // detect all the possible places to add bump map images to cover seams

#define CHANNEL_SHADOWS 20 // angle of shadow volumes for adding to lights, organized and separated by subsurfaces
#define CHANNEL_DLIGHTS 16 // add extra lighting to entities, or figure out where atmospheric lighting should be improved, bugs around lights, castable shadows, r_shadows = 2?
#define CHANNEL_ENVIRONMENT 17 // all environmental information, water playing, lights buzzing, portal visibility
#define CHANNEL_BLUEPRINT 18 // show all walls starting and ending points on the blue channel
#define CHANNEL_POINTCLOUD 19 // data organized on all 3 axis to represent intersecting layers where the intersection points can be sumerized to represent a scene

#define MAX_CHANNELS 20

#define TRACE_DISTANCE  0x0   // the default trace, returns the distance from the trace starting point
#define TRACE_HEIGHTS   0x1   // the most basic trace is to show a heightmap from the top down
#define TRACE_VOLUME    0x2   // add each trace difference on to eachother to create a thickness map
#define TRACE_FLOORS    0x4   // set the trace area to all the floor values
#define TRACE_SIDES     0x8   // test in 6 directions and use the bit-mask as the new trace and color mask
#define TRACE_NEARBY    0x10  // set the color value to the distance of the nearest surface excluding the one directly in front of the trace angle, i.e. TOPDOWN, shows closest plane excluding ground
#define TRACE_MASK      0x20  // use the results, or missing results, as a mask to exclude re-tracing that area, mask only works on images and future traces
#define TRACE_UNMASK    0x40  // reset the test values so traces aren't skipped by the mask, i.e. retrace the whole space even if the image is masked. Unmask only works on the float data, doesn't do anything to images
#define TRACE_SCALE     0x80  // divide the trace value, not only by 256, but divide and float-modulo the remainder of another 256 dividing sample, used to show things on a scale like steps, or little dips and ledges
#define TRACE_SAMPLE    0x100 // divide the trace value again into 8 and use a bit mask to display
#define TRACE_MINS      0x200 // do multiple traces, but keep the min values
#define TRACE_MAXS      0x400 // do multiple traces, but keep the max values
#define TRACE_ANGLE     0x800 // trace and return the angle of the plane that was hit
#define TRACE_ROTATION  0x1000 // trace and return the rotation of the plane that was hit
#define TRACE_FACETS    0x2000 // find a specific facet to mask future traces against
#define TRACE_INVERTED  0x4000 // invert the sampling values far shows up bright, and near shows up dark
#define TRACE_CORRECTED 0x8000  // fix ceiling/floor/opposite heights as we xray

#define TRACE_BIAS      0x10000
#define TRACE_RADIAL    0x20000
#define TRACE_NORMAL    0x40000

#define TRACE_XRAY1     0x10000000  // x-ray one time, early out that doesn't look up again, unless being corrected
#define TRACE_XRAY2     0x20000000  // x-ray 2 times, get an idea if there is a sub-surface
#define TRACE_XRAY4     0x40000000  // x-ray 4 times, if there is a sub-floor or tunnels, it should be fully visible
#define TRACE_XRAY8     0x80000000  // x-ray 8 times, used to create a volume map, make sure to trace through all the walls of the clip-map, takes a long time (10 seconds)
//#define TRACE_

#define MOST_USEFUL (int[]){CHANNEL_TOPDOWN, CHANNEL_WALLS, CHANNEL_CEILINGS, CHANNEL_THICKNESS}
#define MOST_BOTFUL (int[]){CHANNEL_REACHABLE, CHANNEL_VISIBLE, CHANNEL_FACETS, CHANNEL_FLOORS}
#define MOST_ARTFUL (int[]){CHANNEL_LANDSCAPE, CHANNEL_TEXTURES, CHANNEL_CORNERS, CHANNEL_HOLES}
#define MOST_ANGLED (int[]){CHANNEL_PITCH, CHANNEL_YAW, CHANNEL_ROLL, CHANNEL_LENGTH}
#define MOST_LOOKED (int[]){CHANNEL_DLIGHTS, CHANNEL_ENVIRONMENT, CHANNEL_BLUEPRINT}

#define MAX_IMAGES 6


static uint32_t PASSES[MAX_CHANNELS] = {
	TRACE_HEIGHTS|TRACE_XRAY1|TRACE_MASK|TRACE_FACETS|TRACE_UNMASK|TRACE_MAXS, // CHANNEL_TOPDOWN
	TRACE_HEIGHTS|TRACE_XRAY4|TRACE_NEARBY, // CHANNEL_WALLS
	TRACE_SAMPLE|TRACE_SCALE|TRACE_MASK|TRACE_XRAY8, //CHANNEL_CEILINGS
	TRACE_VOLUME|TRACE_XRAY8|TRACE_UNMASK, //CHANNEL_THICKNESS
	TRACE_NEARBY|0, //CHANNEL_REACHABLE
	//CHANNEL_VISIBLE
	//CHANNEL_FACETS
	//CHANNEL_FLOORS
	//CHANNEL_LANDSCAPE
	//CHANNEL_TEXTURES
	//CHANNEL_CORNERS
	//CHANNEL_HOLES
	//CHANNEL_PITCH
	//CHANNEL_YAW
	//CHANNEL_ROLL
	//CHANNEL_LENGTH
	//CHANNEL_DLIGHTS
	//CHANNEL_ENVIRONMENT
	//CHANNEL_BLUEPRINT
};



#define TGA_R 0x1
#define TGA_G 0x2
#define TGA_B 0x4
#define TGA_A 0x8
#define TGA_E 0x10
#define TGA_RGBA (TGA_R|TGA_G|TGA_B|TGA_A)

/*
   ================
   WriteTGA
   ================
 */
void WriteTGA( const char *mapname, byte *data, int width, int height, uint32_t channels ) {
	char minimapFilename[MAX_QPATH];
	byte    *buffer;
	int i;
	int c;

	COM_StripExtension(mapname, minimapFilename, sizeof(minimapFilename));
	Com_Printf( " writing to %s...", FS_BuildOSPath( Cvar_VariableString("fs_homepath"), Cvar_VariableString("fs_game"), va("%s.tga", minimapFilename) ) );

	buffer = Z_Malloc( width * height * 4 + 18 );
	memset( buffer, 0, 18 );

	buffer[2] = 2;      // uncompressed type
	buffer[12] = width & 255;
	buffer[13] = width >> 8;
	buffer[14] = height & 255;
	buffer[15] = height >> 8;
	buffer[16] = 32;    // pixel size

	// swap rgb to bgr
	c = 18 + width * height * 4;
	for ( i = 18 ; i < c ; i += 4 )
	{
		if(channels & TGA_E) {
			buffer[i + 0] = data[i - 18];
			buffer[i + 1] = data[i - 18];
			buffer[i + 2] = data[i - 18];
			buffer[i + 3] = 255;
		} else {
			buffer[i + 0] = data[i - 18 + 2];     // blue
			buffer[i + 1] = data[i - 18 + 1];     // green
			buffer[i + 2] = data[i - 18 + 0];     // red
			buffer[i + 3] = data[i - 18 + 3];     // alpha
		}
	}

	FS_WriteFile( va("%s.tga", minimapFilename), buffer, width * height * 4 + 18 );

	Z_Free( buffer );

	Com_Printf( " done.\n" );
}


static float SV_TraceThrough(trace_t *trace, vec3_t forward, vec3_t start, vec3_t end, int mask) {
	vec3_t dist;
	while (1) {
		printf("trace: %f, %f, %f -> %f, %f, %f\n", start[0], start[1], start[2], end[0], end[1], end[2]);
		CM_BoxTrace( trace, start, end, vec3_origin, vec3_origin, 0, mask, qfalse );
		//trap_Trace (&trace, tracefrom, NULL, NULL, end, passent, MASK_SHOT );

		// Hypo: break if we traversed length of vector tracefrom
		if (trace->fraction == 1.0 
			|| trace->entityNum == ENTITYNUM_NONE
			|| isnan(trace->endpos[2])
		) {
			return MAX_MAP_BOUNDS; //VectorLength(dist);
			break;
		}

		// otherwise continue tracing thru walls
		if ((mask & CONTENTS_SOLID) && mask != CONTENTS_NODE // this should be the TRACE_UNMASK option
			&& ((trace->surfaceFlags & SURF_NODRAW)
			|| (trace->surfaceFlags & SURF_NONSOLID)
			// this is a bit odd, normally we'd stop, but this helps trace through the
			//   tops of skyboxes for outlines
			|| (trace->surfaceFlags & SURF_SKY))
		) {
			VectorMA(trace->endpos, 1, forward, start);
			continue;
		}

		// something was hit
		VectorSubtract(start, trace->endpos, dist);
		//VectorMA(trace->endpos, 1, forward, end);
		//VectorCopy(trace->endpos, end);
		return VectorLength(dist);
		//return trace->endpos[2]; // VectorLength(dist);
		break;
	}
}

static void SV_PrintAngles(vec3_t angle) {
	vec3_t temp;
	CrossProduct(cm.cmodels[0].mins, angle, temp);
	printf("mins: %f, %f, %f\n", 
		temp[0], temp[1], temp[2]);
	CrossProduct(cm.cmodels[0].maxs, angle, temp);
	printf("maxs: %f, %f, %f\n", 
		temp[0], temp[1], temp[2]);
}


static void SV_TraceTopDown(float *d1, int mask) {
	trace_t		trace;
	vec3_t start, end, forward, right, up;
	vec3_t center, midpoint;
	vec3_t newMins, newMaxs, newScale, newAngle;
	float radius;
	newAngle[0] = 89.9;
	newAngle[1] = 0.1;
	newAngle[2] = 0.1;

	AngleVectors(newAngle, forward, right, up);
	VectorCopy(cm.cmodels[0].mins, newMins);
	VectorCopy(cm.cmodels[0].maxs, newMaxs);
	VectorSubtract(newMaxs, newMins, newScale);
	radius = VectorLength(newScale) / 2;
	VectorScale(newScale, 0.5f, center);
	VectorAdd(newMins, center, center);
	VectorMA(center, -radius, forward, midpoint);
	VectorScale(newScale, 1.0f / sv_bspMiniSize->value, newScale);

/*
( Vec3 mins, Vec3 maxs, Vec3 angles ) {
  Vec3 forward, right, up;
  VectorAngles( angles, &forward, &right, &up );

  Vec3 center = ( mins + maxs ) / 2;
  float radius = Length( maxs - mins ) / 2;
  
  Vec3 onSphere = center - forward * radius;
  for( float x = -1; x <= 1; x += 0.1 ) {
    for( float y = -1; y <= 1; y += 0.1 ) {
      //Vec3 onPlane = onSphere + x * right + y * up;
      //Trace( onPlane, forward );
    }
  }
*/

	for ( int y = 0; y < sv_bspMiniSize->integer; ++y ) {
		for ( int x = 0; x < sv_bspMiniSize->integer; ++x ) {
			if(d1[y * sv_bspMiniSize->integer + x] == MAX_MAP_BOUNDS) {
				continue;
			}

			// TODO: at least 2 different types of traces
			//   1) Subtract the distance of the map and scan x/y to the scale perpendicular to view angle
			//   2) This might make for more interesting distance point mappings, rotate the traces 
			//      around the minimum circumferencing ellipses centered on the viewangle
			VectorMA(midpoint, (y - sv_bspMiniSize->integer / 2) * newScale[1], up, start );
			VectorMA(start, (x - sv_bspMiniSize->integer / 2) * newScale[0], right, start );
			VectorMA(start, 8192, forward, end);

			d1[y * sv_bspMiniSize->integer + x] = SV_TraceThrough(&trace, forward, start, end, mask);
		}
	}
}


static void SV_TraceArea(vec3_t angle, vec3_t scale, float *d1, int mask) {
	trace_t		trace;
	vec3_t start, end, forward, right, up;
	vec3_t center, midpoint;
	vec3_t newMins, newMaxs, newScale, newAngle;
	float radius;

	VectorCopy(angle, newAngle);
	AngleVectors(newAngle, forward, right, up);
	VectorCopy(cm.cmodels[0].mins, newMins);
	VectorCopy(cm.cmodels[0].maxs, newMaxs);
	VectorSubtract(newMaxs, newMins, newScale);
	radius = VectorLength(newScale) / 2;
	VectorScale(newScale, 0.5f, center);
	VectorAdd(newMins, center, center);
	VectorMA(center, -radius, forward, midpoint);

	//CrossProduct(newMins, right, newMins);
	VectorMA(center, 2 * -radius, up, newMins);
	VectorMA(newMins, 2 * -radius, right, newMins);
	VectorMA(center, 2 * radius, up, newMaxs);
	VectorMA(newMaxs, 2 * radius, right, newMaxs);
	VectorSubtract(newMaxs, newMins, newScale);

	VectorScale(newScale, 1.0f / sv_bspMiniSize->value, newScale);
	printf("scale: %f, %f, %f\n", newScale[0], newScale[1], newScale[2]);

	for ( int y = 0; y < sv_bspMiniSize->integer; ++y ) {
		for ( int x = 0; x < sv_bspMiniSize->integer; ++x ) {
			if(d1[y * sv_bspMiniSize->integer + x] == MAX_MAP_BOUNDS) {
				continue;
			}

			VectorMA(midpoint, (y - sv_bspMiniSize->integer / 2) * newScale[1], up, start );
			VectorMA(start, (x - sv_bspMiniSize->integer / 2) * newScale[0], right, start );
			VectorMA(start, 8192, forward, end);

			d1[y * sv_bspMiniSize->integer + x] = SV_TraceThrough(&trace, forward, start, end, mask);
		}
	}
}



// sky, probably dealing with high numbers (i.e. close to top of map), 
//   so subtract it from 128 to get very low numbers, this will have a less 
//   boring effect on the redness of the image
// this has a neat side effect of showing full bright where there is no rain,
//   i.e. start AND stop in the sky, don't come down at all

static void SV_FindFacets(int surfaceFlags, vec3_t angle, vec3_t scale, 
	float *d1, qboolean fromBottom) {
	for(int i = 0; i < cm.numBrushes; i++) {
		for(int j = 0; j < cm.brushes[i].numsides; j++) {
			//vec3_t cover;
			if (cm.brushes[i].sides[j].surfaceFlags & surfaceFlags) {
				if(!cm.brushes[i].sides[j].plane) {
					continue;
				}
				// TODO: transform, brush
				int startX = (cm.brushes[i].bounds[0][0] - cm.cmodels[0].mins[0]) / scale[0];
				int startY = (cm.brushes[i].bounds[0][1] - cm.cmodels[0].mins[1]) / scale[1];
				int endX = (cm.brushes[i].bounds[1][0] - cm.cmodels[0].mins[0]) / scale[0];
				int endY = (cm.brushes[i].bounds[1][1] - cm.cmodels[0].mins[1]) / scale[1];
				for ( int y = startY; y < endY; ++y ) {
					for ( int x = startX; x < endX; ++x ) {
						// mark the spot as being covered by the surface requested
						// MAX of min bounds so we don't accidentally overwrite values with smaller values
						//   from the opposite side
						if(fromBottom) {
							// mins of max-bounds
							if(d1[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS) {
								d1[y * sv_bspMiniSize->integer + x] = MIN(cm.brushes[i].bounds[1][2],
									d1[y * sv_bspMiniSize->integer + x]);
							} else {
								d1[y * sv_bspMiniSize->integer + x] = cm.brushes[i].bounds[1][2];
							}
						} else {
							// max of min bounds
							if(d1[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS) {
								d1[y * sv_bspMiniSize->integer + x] = MAX(cm.brushes[i].bounds[0][2],
									d1[y * sv_bspMiniSize->integer + x]);
							} else {
								d1[y * sv_bspMiniSize->integer + x] = cm.brushes[i].bounds[0][2];
							}
						}
					}
				}
			}
		}
	}

}



// display distance between ground and sub surfaces, i.e. thickness on green channel
//  trace down to find a starting position for measuring the ceiling of the floor
void SV_XRay(vec3_t angle, float *d1, float *d2, float *d3, vec3_t scale, int mask) {
	vec3_t opposite;
	VectorScale(opposite, -1, opposite);
	Sys_SetStatus("X-raying clip map... this might take a while");
	Com_Printf("X-raying clip map... this might take a while\n");
	// basically the original inverted heightmap is not subtracted from the 
	//   alpha channel since it is stored on red, so the heightmap can be reconstructed,
	//   this has the nice side-effect of making the alpha channel nice and bright
	memcpy(d2, d1, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));
	SV_TraceArea(angle, scale, d2, mask);
	memcpy(d3, d2, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));
	SV_TraceArea(opposite, scale, d3, mask);
}



static byte SV_WallFlags(vec3_t angle, vec3_t xyz) {
	trace_t trace;
	//vec3_t start, end;
	vec3_t forward, right, up;

	AngleVectors( angle, forward, right, up );
	int directionals = 0;
	float traces[6][2] = {
		{64, 0},
		{0, 64},
		{64, 64},
		{-64, 0},
		{0, -64},
		{-64, -64},
	};

	for(int j = 0; j < ARRAY_LEN(traces); j++) {
		CM_BoxTrace( &trace, (vec3_t){
			xyz[0], 
			xyz[1], 
			xyz[2]
		}, (vec3_t){
			xyz[0] + traces[j][0], 
			xyz[1] + traces[j][1], 
			xyz[2]
		}, vec3_origin, vec3_origin, 0, MASK_PLAYERSOLID, qfalse );
		if(trace.entityNum != ENTITYNUM_NONE
			&& trace.fraction < 1.0) {
			directionals |= 1 << (j + 2);
		}
	}
	return directionals;
}


static float *data1f1, *data1f2, *data1f3;
static byte *data4b;


static void SV_InitData() {
	if(!data1f1)
		data1f1 = (float *)Z_Malloc( sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ) );
	if(!data1f2)
		data1f2 = (float *)Z_Malloc( sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ) );
	if(!data1f3)
		data1f3 = (float *)Z_Malloc( sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ) );
	if(!data4b)
		data4b = (byte *)Z_Malloc( sv_bspMiniSize->integer * sv_bspMiniSize->integer * 4 );
	memset(data4b, 0, sv_bspMiniSize->integer * sv_bspMiniSize->integer * 4);
	memset(data1f1, 0, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));
	memset(data1f2, 0, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));
	memset(data1f3, 0, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));

}


static void SV_ResetData(uint32_t flags) {
	// if ! find facets because this will do a rotation also
	// TODO: use +/- VectorLength(size)
	for (size_t i = 0; i < sv_bspMiniSize->integer * sv_bspMiniSize->integer; ++i) {
		if(!(flags & TRACE_MINS)) {
			data1f1[i] = cm.cmodels[0].maxs[2];
			data1f2[i] = cm.cmodels[0].maxs[2];
			data1f3[i] = cm.cmodels[0].maxs[2];
		} else {
			data1f1[i] = cm.cmodels[0].mins[2];
			data1f2[i] = cm.cmodels[0].mins[2];
			data1f3[i] = cm.cmodels[0].mins[2];
		}
	}
}


// there are only a few types of data that can be derived
//   1) an area trace on surfaces to find textures
//   2) the length of vectors between wals
//   3) types of surfaces
void SV_MakeMinimap() {
	vec3_t size, angle, opposite, forward, right, up;
	vec3_t scale, newMins, newMaxs;
	float length;

	SV_InitData();

	// this is where a combination solution comes in handy
	//   if trace from infinity, it hits the top of the skybox
	//   trace again and again and again and get some sort of solution
	// combo-solution, trace downward from all sky shaders, then trace
	//   upwards to make sure we hit sky again, if not, then we trace through a ceiling
	// thats only a 2 pass trace solution
	int *CURRENT_IMAGE = NULL;
	int CURRENT_CHANNEL = -4;
	//uint32_t pass = TRACE_HEIGHTS|TRACE_XRAY1|TRACE_MASK|TRACE_FACETS|TRACE_UNMASK|TRACE_MAXS;
	uint32_t pass = TRACE_MAXS|TRACE_VOLUME; 
	//uint32_t pass = PASSES[CURRENT_CHANNEL];
	uint32_t all = pass;
	int max = (all & TRACE_XRAY8) ? 8 : (all & TRACE_XRAY4) ? 4 : (all & TRACE_XRAY2) ? 2 : 1;
	int i = 0;

	if(qtrue) {
		angle[0] = 60.1f;
		angle[1] = 0.1f;
		angle[2] = 0.1f;
		VectorScale(opposite, -3, opposite);
	}
	AngleVectors(angle, forward, right, up);
	VectorCopy(cm.cmodels[0].mins, newMins);
	VectorCopy(cm.cmodels[0].maxs, newMaxs);

	// could use height from above to add a bunch of stupid black space around it
	//   but I like the extra dexterity - Brian Cullinan
	VectorSubtract(newMaxs, newMins, size);
	length = VectorLength(size);
	for(int i = 0; i < 3; i++) {
		scale[i] = size[i] / sv_bspMiniSize->value;
	}
	printf("scale: %f, %f, %f\n", scale[0], scale[1], scale[2]);

	SV_ResetData(pass);


	i = 0;
	while(i < max) {
		if(i == 0 && (pass & TRACE_FACETS)) {
			if(pass & TRACE_MAXS) {
				SV_FindFacets(SURF_SKY, angle, scale, data1f2, qfalse);
			} else {
				SV_FindFacets(SURF_SKY, opposite, scale, data1f2, qtrue);
			}
		}

		if(i == 0 && max == 1
			&& !(pass & TRACE_CORRECTED)
		) {
			if(CURRENT_CHANNEL == CHANNEL_TOPDOWN) {
				SV_TraceTopDown(data1f2, MASK_SOLID|MASK_WATER);
			} else if((pass & TRACE_HEIGHTS) || (pass & TRACE_UNMASK)) {
				SV_TraceArea(angle, scale, data1f2, MASK_SOLID|MASK_WATER);
			} else {
				//SV_TraceArea(angle, scale, data1f2, CONTENTS_STRUCTURAL|CONTENTS_DETAIL);
				SV_TraceArea(angle, scale, data1f2, CONTENTS_NODE);
			}
		} else if ((pass & TRACE_XRAY1)
			|| (pass & TRACE_XRAY2)
			|| (pass & TRACE_XRAY4)
			|| (pass & TRACE_XRAY8)) {
			SV_XRay(angle, data1f1, data1f2, data1f3, scale, MASK_PLAYERSOLID);
		}

		for ( int y = 0; y < sv_bspMiniSize->integer; ++y ) {
			for ( int x = 0; x < sv_bspMiniSize->integer; ++x ) {
				if(data1f2[y * sv_bspMiniSize->integer + x] == MAX_MAP_BOUNDS) {
					// subtract sky
					if(pass & TRACE_MASK) {
						data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL % 4] = 0;
					}
					if(pass & TRACE_CORRECTED) {
						// to get an outline of the map?
						if(data1f1[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS) {
							data1f2[y * sv_bspMiniSize->integer + x] = data1f1[y * sv_bspMiniSize->integer + x];
						} else {
							data1f1[y * sv_bspMiniSize->integer + x] = cm.cmodels[0].maxs[2];
						}
						//data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL] = (int)( Com_Clamp( 0.f, 255.f / 256.f, (cm.cmodels[0].maxs[2] - data1f2[y * sv_bspMiniSize->integer + x]) /length ) * 256 ) | 1;
					} else {
						data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL % 4] = 0;
					}
				} else {
					if(pass & TRACE_MASK) {
						data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL % 4] = 255;
					}
					if(pass & TRACE_HEIGHTS) {
						// always guarantee this is somewhat red to indicate it should rain
						data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL % 4] = (int)( Com_Clamp( 0.f, 254.f / 255.f, (cm.cmodels[0].maxs[2] - data1f2[y * sv_bspMiniSize->integer + x]) / length ) * 255 + 1) | 1;
					}

					if(pass & TRACE_VOLUME) {
						//data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL] -= Com_Clamp( 0.f, 255.f / 256.f, (data1f3[y * sv_bspMiniSize->integer + x] - data1f2[y * sv_bspMiniSize->integer + x]) / size[2] ) * 256;
						data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL % 4] = (int)( Com_Clamp( 0.f, 254.f / 255.f, 1.0f - data1f2[y * sv_bspMiniSize->integer + x] / length ) * 255 + 1) | 1;
						//data4b[((y * sv_bspMiniSize->integer + x) * 4) + CURRENT_CHANNEL] -= 255;
					}

				}
			}
		}

		// switch the floor starting point, d2 will be overwritten
		if(i < max - 1) {
			memcpy(data1f1, data1f2, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));
		}
		i++;
	}

#if 0
	i = 0;
	while(i < 5) {
		SV_XRay(d1, d2, d3, scale, MASK_PLAYERSOLID);

		p = data4b;
		for ( int y = 0; y < sv_bspMiniSize->integer; ++y ) {
			for ( int x = 0; x < sv_bspMiniSize->integer; ++x ) {
				if(d1[y * sv_bspMiniSize->integer + x] == MAX_MAP_BOUNDS) {
					p += 4;
					continue;
				}

				// if it hit from the first trace, look underneath
				if(d3[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS 
					&& d2[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS
					&& d2[y * sv_bspMiniSize->integer + x] < d3[y * sv_bspMiniSize->integer + x]
					&& d3[y * sv_bspMiniSize->integer + x] < d1[y * sv_bspMiniSize->integer + x]
				) {
					p[CHANNEL_THICKNESS] -= Com_Clamp( 0.f, 255.f / 256.f, (d3[y * sv_bspMiniSize->integer + x] - d2[y * sv_bspMiniSize->integer + x]) / size[2] ) * 256;
					// cut off the bottom 4 bytes
					int ceilingHeight = d3[y * sv_bspMiniSize->integer + x] - d2[y * sv_bspMiniSize->integer + x];
					// ceiling height bit mask
					if(ceilingHeight > 128) {
						p[CHANNEL_CEILINGS] |= 1 << (int)floor( 8 - (cm.cmodels[0].maxs[2] - d3[y * sv_bspMiniSize->integer + x]) / (size[2] / 8) );

					}

				}

				if (i == 0 && d3[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS) {
					// lots of sky?
					// use blue channel for edge detection between floors so we can rewrite bots later
				}

				// test 3 directions for walls within 64 units, 2 floors
				if(!(p[CHANNEL_WALLS] & 1)
					&& d1[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS) {
					// only show second layer
					//if(p[CHANNEL_WALLS] & 2) {
					// TODO: clip the top and bottom 1/8 as assumed to give ceiling heights more resolution
					if(d3[y * sv_bspMiniSize->integer + x] != MAX_MAP_BOUNDS) {
						p[CHANNEL_WALLS] |= SV_WallFlags((vec3_t){89, 0, 0}, (vec3_t){cm.cmodels[0].mins[0] + scale[0] * x, cm.cmodels[0].mins[0] + scale[0] * y, d2[y * sv_bspMiniSize->integer + x] + 64});
					} else {
						p[CHANNEL_WALLS] |= SV_WallFlags((vec3_t){89, 0, 0}, (vec3_t){cm.cmodels[0].mins[0] + scale[0] * x, cm.cmodels[0].mins[0] + scale[0] * y, d1[y * sv_bspMiniSize->integer + x] + 64});
					}
					if(p > 0) {
						p[CHANNEL_WALLS] |= 1;
					} else {
						p[CHANNEL_WALLS] |= 2;
					}

				}

				p += 4;
			}
		}

		// switch the floor starting point, d2 will be overwritten
		memcpy(d1, d2, sv_bspMiniSize->integer * sv_bspMiniSize->integer * sizeof( float ));
		//d2 = data1f;
		i++;
	}

	// TODO: mark all the entities on blue
#endif

	if(CURRENT_IMAGE) {
		WriteTGA( cm.name, data4b, sv_bspMiniSize->integer, sv_bspMiniSize->integer, TGA_RGBA );
	} else {
		WriteTGA( cm.name, data4b, sv_bspMiniSize->integer, sv_bspMiniSize->integer, TGA_E );
	}

	if(data4b)
		Z_Free(data4b);
	if(data1f1)
		Z_Free(data1f1);
	if(data1f2)
		Z_Free(data1f2);
	if(data1f3)
		Z_Free(data1f3);
}

#endif
