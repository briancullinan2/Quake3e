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
along with Foobar; if not, write to the Free Software
Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
===========================================================================
*/

#include "q_shared.h"
#include "qcommon.h"

typedef enum {
	EVENT_NA = 0x00,
	EVENT_WAIT,
	EVENT_TARGETWAIT,
	EVENT_SPEED,
	EVENT_TARGET,
	EVENT_SNAPTARGET,
	EVENT_FOV,
	EVENT_SCRIPT,
	EVENT_TRIGGER,
	EVENT_STOP,
	EVENT_START,
	EVENT_COUNT
} eventType;

typedef enum {
	CP_FIXED = 0x00,
	CP_INTERPOLATED,
	CP_SPLINE,
	POSITION_COUNT
} positionType;

typedef struct {
	char name[MAX_QPATH];
	vec3_t *controlPoints;
	int    numControlPoints;
	vec3_t *splinePoints;
	int    numSplinePoints;
	double *splineTime;
	vec3_t *selected;
	int    numSelected;
	vec3_t pathColor, segmentColor, controlColor, activeColor;
	float granularity;
	qboolean editMode;
	qboolean dirty;
	int activeSegment;
	long baseTime;
	long time;
} idSplineList;

typedef struct {
	long	startTime;
	long	time;
	float	speed;
} idVelocity;

typedef struct {
	vec3_t *points;
	int numPoints;
	const char* positionStr[POSITION_COUNT];
	long		startTime;
	long		time;
	positionType type;
	char		name[MAX_QPATH];
	qboolean	editMode;
	idVelocity *velocities;
	int numVelocities;
	float		baseVelocity;
} idCameraPosition;

typedef struct {
	idCameraPosition base;
	vec3_t			     pos;
} idFixedPosition;

typedef struct {
	idCameraPosition pos;
	qboolean first;
	vec3_t startPos;
	vec3_t endPos;
	long lastTime;
	float distSoFar;
} idInterpolatedPosition;

typedef struct {
	idCameraPosition pos;
	idSplineList *target;
} idSplinePosition;

typedef struct {
	float fov;
	float startFOV;
	float endFOV;
	int startTime;
	int time;
} idCameraFOV;

typedef struct {
	eventType type;
	char paramStr[MAX_QPATH];
	long time;
	qboolean triggered;
} idCameraEvent;

typedef struct {
	char name[MAX_QPATH];
	int currentCameraPosition;
	vec3_t lastDirection;
	qboolean cameraRunning;
	idCameraPosition *cameraPosition;
	int numCameraPositions;
	idCameraPosition *targetPositions;
	int numTargetPositions;
	idCameraEvent *events;
	int numEvents;
	idCameraFOV fov;
	int activeTarget;
	float totalTime;
	float baseTime;
	long startTime;
	int lastUsed;
	qboolean cameraEdit;
	qboolean editMode;
} idCameraDef;

#define MAX_CAMERA_EVENTS 1024
#define MAX_CAMERA_POSITIONS 1024
#define MAX_CONTROL_POINTS 1024
#define MAX_CAMERAS 8
idCameraDef  splineList;
idCameraDef *g_splineList = &splineList;
idCameraDef  camera[MAX_CAMERAS];
cvar_t      *com_maxSplines;

/*
void glLabeledPoint(vec3_t &color, vec3_t &point, float size, const char *label) {
	qglColor3fv(color);
	qglPointSize(size);
	qglBegin(GL_POINTS);
	qglVertex3fv(point);
	qglEnd();
	vec3_t v = point;
	v.x += 1;
	v.y += 1;
	v.z += 1;
	qglRasterPos3fv (v);
	qglCallLists (strlen(label), GL_UNSIGNED_BYTE, label);
}


void glBox(vec3_t &color, vec3_t &point, float size) {
	vec3_t mins(point);
	vec3_t maxs(point);
	mins[0] -= size;
	mins[1] += size;
	mins[2] -= size;
	maxs[0] += size;
	maxs[1] -= size;
	maxs[2] += size;
	qglColor3fv(color);
	qglBegin(GL_LINE_LOOP);
	qglVertex3f(mins[0],mins[1],mins[2]);
	qglVertex3f(maxs[0],mins[1],mins[2]);
	qglVertex3f(maxs[0],maxs[1],mins[2]);
	qglVertex3f(mins[0],maxs[1],mins[2]);
	qglEnd();
	qglBegin(GL_LINE_LOOP);
	qglVertex3f(mins[0],mins[1],maxs[2]);
	qglVertex3f(maxs[0],mins[1],maxs[2]);
	qglVertex3f(maxs[0],maxs[1],maxs[2]);
	qglVertex3f(mins[0],maxs[1],maxs[2]);
	qglEnd();

	qglBegin(GL_LINES);
  	qglVertex3f(mins[0],mins[1],mins[2]);
	qglVertex3f(mins[0],mins[1],maxs[2]);
	qglVertex3f(mins[0],maxs[1],maxs[2]);
	qglVertex3f(mins[0],maxs[1],mins[2]);
	qglVertex3f(maxs[0],mins[1],mins[2]);
	qglVertex3f(maxs[0],mins[1],maxs[2]);
	qglVertex3f(maxs[0],maxs[1],maxs[2]);
	qglVertex3f(maxs[0],maxs[1],mins[2]);
	qglEnd();

}

void splineTest() {
	//g_splineList->load("p:/doom/base/maps/test_base1.camera");
}

void splineDraw() {
	//g_splineList->addToRenderer();
}


//extern void D_DebugLine( const vec3_t &color, const vec3_t &start, const vec3_t &end );

void debugLine(vec3_t &color, float x, float y, float z, float x2, float y2, float z2) {
	//vec3_t from(x, y, z);
	//vec3_t to(x2, y2, z2);
	//D_DebugLine(color, from, to);
}


void idSplineList::addToRenderer() {

	if (controlPoints.Num() == 0) {
		return;
	}

	vec3_t mins, maxs;
	vec3_t yellow(1.0, 1.0, 0);
	vec3_t white(1.0, 1.0, 1.0);
        int i;
        
	for(i = 0; i < controlPoints.Num(); i++) {
		VectorCopy(*controlPoints[i], mins);
		VectorCopy(mins, maxs);
		mins[0] -= 8;
		mins[1] += 8;
		mins[2] -= 8;
		maxs[0] += 8;
		maxs[1] -= 8;
		maxs[2] += 8;
		debugLine( yellow, mins[0], mins[1], mins[2], maxs[0], mins[1], mins[2]);
		debugLine( yellow, maxs[0], mins[1], mins[2], maxs[0], maxs[1], mins[2]);
		debugLine( yellow, maxs[0], maxs[1], mins[2], mins[0], maxs[1], mins[2]);
		debugLine( yellow, mins[0], maxs[1], mins[2], mins[0], mins[1], mins[2]);
		
		debugLine( yellow, mins[0], mins[1], maxs[2], maxs[0], mins[1], maxs[2]);
		debugLine( yellow, maxs[0], mins[1], maxs[2], maxs[0], maxs[1], maxs[2]);
		debugLine( yellow, maxs[0], maxs[1], maxs[2], mins[0], maxs[1], maxs[2]);
		debugLine( yellow, mins[0], maxs[1], maxs[2], mins[0], mins[1], maxs[2]);
	    
	}

	int step = 0;
	vec3_t step1;
	for(i = 3; i < controlPoints.Num(); i++) {
		for (float tension = 0.0f; tension < 1.001f; tension += 0.1f) {
			float x = 0;
			float y = 0;
			float z = 0;
			for (int j = 0; j < 4; j++) {
				x += controlPoints[i - (3 - j)]->x * calcSpline(j, tension);
				y += controlPoints[i - (3 - j)]->y * calcSpline(j, tension);
				z += controlPoints[i - (3 - j)]->z * calcSpline(j, tension);
			}
			if (step == 0) {
				step1[0] = x;
				step1[1] = y;
				step1[2] = z;
				step = 1;
			} else {
				debugLine( white, step1[0], step1[1], step1[2], x, y, z);
				step = 0;
			}

		}
	}
}
*/

static float calcSpline(int step, float tension) {
	switch(step) {
		case 0:	return (pow(1 - tension, 3)) / 6;
		case 1:	return (3 * pow(tension, 3) - 6 * pow(tension, 2) + 4) / 6;
		case 2:	return (-3 * pow(tension, 3) + 3 * pow(tension, 2) + 3 * tension + 1) / 6;
		case 3:	return pow(tension, 3) / 6;
	}
	return 0.0;
}

static void buildSpline(idSplineList *spline) {
	//int start = Sys_Milliseconds();
	spline->numSplinePoints = 0;
	for(int i = 3; i < spline->numControlPoints; i++) {
		for (float tension = 0.0f; tension < 1.001f; tension += spline->granularity) {
			float x = 0;
			float y = 0;
			float z = 0;
			for (int j = 0; j < 4; j++) {
				x += spline->controlPoints[i - (3 - j)][0] * calcSpline(j, tension);
				y += spline->controlPoints[i - (3 - j)][1] * calcSpline(j, tension);
				z += spline->controlPoints[i - (3 - j)][2] * calcSpline(j, tension);
			}
			spline->splinePoints[spline->numSplinePoints][0] = x;
			spline->splinePoints[spline->numSplinePoints][1] = y;
			spline->splinePoints[spline->numSplinePoints][2] = z;
			spline->numSplinePoints++;
		}
	}
	spline->dirty = qfalse;
	//Com_Printf("Spline build took %f seconds\n", (float)(Sys_Milliseconds() - start) / 1000);
}

/*
void idSplineList::draw(qboolean editMode) {
	int i;
	vec4_t yellow(1, 1, 0, 1);
        
	if (controlPoints.Num() == 0) {
		return;
	}

	if (dirty) {
		buildSpline();
	}


	qglColor3fv(controlColor);
	qglPointSize(5);
	
	qglBegin(GL_POINTS);
	for (i = 0; i < controlPoints.Num(); i++) {
		qglVertex3fv(*controlPoints[i]);
	}
	qglEnd();
	
	if (editMode) {
		for(i = 0; i < controlPoints.Num(); i++) {
			glBox(activeColor, *controlPoints[i], 4);
		}
	}

	//Draw the curve
	qglColor3fv(pathColor);
	qglBegin(GL_LINE_STRIP);
	int count = splinePoints.Num();
	for (i = 0; i < count; i++) {
		qglVertex3fv(*splinePoints[i]);
	}
	qglEnd();

	if (editMode) {
		qglColor3fv(segmentColor);
		qglPointSize(3);
		qglBegin(GL_POINTS);
		for (i = 0; i < count; i++) {
			qglVertex3fv(*splinePoints[i]);
		}
		qglEnd();
	}
	if (count > 0) {
		//assert(activeSegment >=0 && activeSegment < count);
		if (activeSegment >=0 && activeSegment < count) {
			glBox(activeColor, *splinePoints[activeSegment], 6);
			glBox(yellow, *splinePoints[activeSegment], 8);
		}
	}

}
*/

static float totalDistance(idSplineList *spline) {

	if (spline->numControlPoints == 0) {
		return 0.0;
	}

	if (spline->dirty) {
		buildSpline(spline);
	}

	float dist = 0.0;
	vec3_t temp;
	int count = spline->numSplinePoints;
	for(int i = 1; i < count; i++) {
		VectorCopy(spline->splinePoints[i-1], temp);
		VectorSubtract(temp, spline->splinePoints[i], temp);
		dist += VectorLength(temp);
	}
	return dist;
}

static void initPosition(long bt, long totalTime, idSplineList *spline) {

	if (spline->dirty) {
		buildSpline(spline);
	}

	if (spline->numSplinePoints == 0) {
		return;
	}

	spline->baseTime = bt;
	spline->time = totalTime;

	// calc distance to travel ( this will soon be broken into time segments )
	spline->splineTime[0] = bt;
	double dist = totalDistance(spline);
	double distSoFar = 0.0;
	vec3_t temp;
	int count = spline->numSplinePoints;
	//for(int i = 2; i < count - 1; i++) {
	for(int i = 1; i < count; i++) {
		VectorCopy(spline->splinePoints[i-1], temp);
		VectorSubtract(temp, spline->splinePoints[i], temp);
		distSoFar += VectorLength(temp);
		double percent = distSoFar / dist;
		percent *= totalTime;
		spline->splineTime[i] = percent + bt;
	}
	//assert(splineTime.Num() == splinePoints.Num());
	spline->activeSegment = 0;
}


#if 0
static void updateSelection(const vec3_t move, idSplineList *spline) {
	if (spline->selected) {
		spline->dirty = qtrue;
		VectorAdd(*spline->selected, move, *spline->selected);
	}
}
#endif


/*
// TODO: in game spline editing?
static void setSelectedPoint(vec3_t *p, idSplineList *spline) {
	if (p) {
		SnapVector(*p);
		for(int i = 0; i < spline->numControlPoints; i++) {
			if (!VectorCompare(*p, spline->controlPoints[i])) {
				spline->selected = &spline->controlPoints[i];
			}
		}
	} else {
		spline->selected = NULL;
	}
}
*/


static const vec3_t *getSplinePosition(long t, idSplineList *spline) {
	static vec3_t interpolatedPos;
	//static long lastTime = -1;

	int count = spline->numSplinePoints;
	if (count == 0) {
		return &vec3_origin;
	}

	Com_Printf("Time: %ld\n", t);
	//assert(splineTime.Num() == splinePoints.Num());

	while (spline->activeSegment < count) {
		if (spline->splineTime[spline->activeSegment] >= t) {
			if (spline->activeSegment > 0 && spline->activeSegment < count - 1) {
				double timeHi = spline->splineTime[spline->activeSegment + 1];
				double timeLo = spline->splineTime[spline->activeSegment - 1];
				double percent = (timeHi - t) / (timeHi - timeLo); 
				// pick two bounding points
				vec3_t v1, v2;
				VectorCopy(spline->splinePoints[spline->activeSegment - 1], v1);
				VectorCopy(spline->splinePoints[spline->activeSegment + 1], v2);
				VectorScale(v2, 1.0 - percent, v2);
				VectorScale(v1, percent, v1);
				VectorAdd(v2, v1, v2);
				VectorCopy(v2, interpolatedPos);
				return &interpolatedPos;
			}
			return &spline->splinePoints[spline->activeSegment];
		} else {
			spline->activeSegment++;
		}
	}
	return &spline->splinePoints[count-1];
}

/*
static void addPoint(const vec3_t v, idSplineList *spline) {
	VectorCopy(v, spline->controlPoints[spline->numControlPoints]);
	spline->numControlPoints++;
	spline->dirty = qtrue;
}
*/

static void addPointXYZ(float x, float y, float z, idSplineList *spline) {
	spline->controlPoints[spline->numControlPoints][0] = x;
	spline->controlPoints[spline->numControlPoints][1] = y;
	spline->controlPoints[spline->numControlPoints][2] = z;
	spline->numControlPoints++;
	spline->dirty = qtrue;
}

static void parseSplines(const char *(*text), idSplineList *spline ) {
	const char *token;
	const char *t;

	//COM_MatchToken( text, "{" );
	do {
		t = *text;
		token = COM_Parse(text);
	
		if ( !token[0] ) {
			break;
		}
		if ( !Q_stricmp (token, "}") ) {
			break;
		}

		do {
			// if token is not a brace, it is a key for a key/value pair
			if ( !token[0] || !Q_stricmp (token, "(") || !Q_stricmp(token, "}")) {
				break;
			}

			*text = t; // UnParse
			const char *key = COM_Parse(text);
			if (Q_stricmp(key, "granularity") == 0) {
				token = COM_Parse(text);
				spline->granularity = atof(token);
			} else if (Q_stricmp(key, "name") == 0) {
				token = COM_Parse(text);
				memcpy(spline->name, token, sizeof(spline->name));
			}

			t = *text;
			token = COM_Parse(text);
		} while (1);

		if ( !Q_stricmp (token, "}") ) {
			break;
		}

		*text = t;
		// read the control point
		vec3_t point;
		Parse1DMatrix( text, 3, point );
		addPointXYZ(point[0], point[1], point[2], spline);
	} while (1);
 
	//Com_UngetToken();
	//COM_MatchToken( text, "}" );
	spline->dirty = qtrue;
}


/*
static void getActiveSegmentInfo(int segment, vec3_t origin, vec3_t direction, float *fov, idCameraDef *cam) {
#if 0
	if (!cameraSpline.validTime()) {
		buildCamera();
	}
	double d = (double)segment / numSegments();
	getCameraInfo_real(d * totalTime * 1000, origin, direction, fov, cam);
#endif
	if (!cameraSpline.validTime()) {
		buildCamera();
	}
	origin = *cameraSpline.getSegmentPoint(segment);
	

	vec3_t temp;

	int numTargets = getTargetSpline()->controlPoints.Num();
	int count = cameraSpline.splineTime.Num();
	if (numTargets == 0) {
		// follow the path
		if (cameraSpline.getActiveSegment() < count - 1) {
			temp = *cameraSpline.splinePoints[cameraSpline.getActiveSegment()+1];
		}
	} else if (numTargets == 1) {
		temp = *getTargetSpline()->controlPoints[0];
	} else {
		temp = *getTargetSpline()->getSegmentPoint(segment);
	}

	temp -= origin;
	temp.Normalize();
	direction = temp;
}
*/


static idInterpolatedPosition *initInterpolatedPosition(vec3_t start, vec3_t end, long time) {
	idInterpolatedPosition *result = Z_Malloc(sizeof(idInterpolatedPosition));
	result->pos.time = time;
	result->pos.type = CP_INTERPOLATED;
	result->pos.numVelocities = 0;
	result->pos.velocities = Z_Malloc(sizeof(idVelocity) * MAX_CAMERA_EVENTS);
	result->first = qtrue;
	VectorClear(result->startPos);
	VectorClear(result->endPos);
	return result;
}

static idSplineList *initSplineList(const char *p) {
	idSplineList *result = Z_Malloc(sizeof(idSplineList));
	strcpy(result->name, p);
	result->controlPoints = Z_Malloc(sizeof(vec3_t) * MAX_CONTROL_POINTS);
	result->numControlPoints = 0;
	result->dirty = qtrue;
	return result;
}

static idSplinePosition *initSplinePosition(long time) {
	idSplinePosition *result = Z_Malloc(sizeof(idSplinePosition));
	result->target = initSplineList("");
	result->pos.time = time;
	result->pos.numVelocities = 0;
	result->pos.velocities = Z_Malloc(sizeof(idVelocity) * MAX_CAMERA_EVENTS);
	return result;
}

static idCameraPosition *newFromType(positionType t) {
	switch (t) {
		case CP_FIXED :	
		{
			idFixedPosition *pos = (idFixedPosition *)Z_Malloc(sizeof(idFixedPosition));
			pos->base.type = CP_FIXED;
			VectorClear(pos->pos);
			pos->base.numVelocities = 0;
			pos->base.velocities = Z_Malloc(sizeof(idVelocity) * MAX_CAMERA_EVENTS);
			return (idCameraPosition *)pos;
		} 
		case CP_INTERPOLATED : return (idCameraPosition *)initInterpolatedPosition(vec3_origin, vec3_origin, 0);
	  case CP_SPLINE : return (idCameraPosition *)initSplinePosition(0);
	  default:
			break;
	};
	return NULL;
}

static void buildCamera(idCameraDef *cam);

static void addTarget(const char *name, positionType type, idCameraDef *cam) {
	//const char *text = (name == NULL) ? va("target0%d", numTargets()+1) : name; // TTimo: unused
	idCameraPosition *pos = newFromType(type);
	if (pos) {
		if(name && name[0] != '\0') {
			memcpy(pos->name, name, sizeof(pos->name));
		} else {
			strcpy(pos->name, "position");
		}
		cam->targetPositions[cam->numTargetPositions] = *pos;
		cam->numTargetPositions++;
		cam->activeTarget = cam->numTargetPositions-1;
		if (cam->activeTarget == 0) {
			// first one
			cam->events[cam->numEvents].type = EVENT_START;
			memcpy(cam->events[cam->numEvents].paramStr, name, MAX_QPATH);
			cam->events[cam->numEvents].time = 0;
			cam->numEvents++;
			buildCamera(cam);
		}
	}
}

static idCameraPosition *getActiveTarget(idCameraDef *cam) {
	if (cam->numTargetPositions == 0) {
		addTarget(NULL, CP_FIXED, cam);
		return &cam->targetPositions[0];
	}
	return &cam->targetPositions[cam->activeTarget];
}

static void setActiveTargetByName(const char *name, idCameraDef *cam) {
	for (int i = 0; i < cam->numTargetPositions; i++) {
		if (Q_stricmp(name, cam->targetPositions[i].name) == 0) {
			assert(i >= 0 && i < cam->numTargetPositions);
			cam->activeTarget = i;
			return;
		}
	}
}

static const vec3_t *getInterpolatedPosition(long t, idInterpolatedPosition *pos);
static const vec3_t *getSplinePosition(long t, idSplineList *spline);

static const vec3_t *getPosition(long t, idCameraPosition *pos) {
	const vec3_t *result = NULL;
	if(pos->type == CP_FIXED) {
		result = &((idFixedPosition *)(pos))->pos;
	} else if (pos->type == CP_INTERPOLATED) {
		result = getInterpolatedPosition(t, (idInterpolatedPosition *)pos);
	} else if (pos->type == CP_SPLINE) {
		result = getSplinePosition(t, ((idSplinePosition *)pos)->target);
	} else {
		Com_Error(ERR_DROP, "Unknown camera position\n");
	}
	return result;
}

static float getFOV(long t, idCameraFOV *fov) {
	if (fov->time) {
		assert(fov->startTime);
		float percent = t / fov->startTime;
		float temp = fov->startFOV - fov->endFOV;
		temp *= percent;
		fov->fov = fov->startFOV + temp;
	}
	return fov->fov;
}

/*
qboolean getCameraInfo(long time, float *origin, float *direction, float *fv, idCameraDef *cam) {
	vec3_t org, dir;
	org[0] = origin[0];
	org[1] = origin[1];
	org[2] = origin[2];
	dir[0] = direction[0];
	dir[1] = direction[1];
	dir[2] = direction[2];
	qboolean b = getCameraInfo_real(time, org, dir, fv, cam);
	origin[0] = org[0];
	origin[1] = org[1];
	origin[2] = org[2];
	direction[0] = dir[0];
	direction[1] = dir[1];
	direction[2] = dir[2];
	return b;
}
*/

static qboolean getCameraInfo_real(long time, vec3_t origin, vec3_t direction, float *fv, idCameraDef *cam) {
	vec3_t temp;

	if ((time - cam->startTime) / 1000 > cam->totalTime) {
		return qfalse;
	}

	for (int i = 0; i < cam->numEvents; i++) {
		if (time >= cam->startTime + cam->events[i].time && !cam->events[i].triggered) {
			cam->events[i].triggered = qtrue;
			if (cam->events[i].type == EVENT_TARGET) {
				setActiveTargetByName(cam->events[i].paramStr, cam);
				getActiveTarget(cam)->startTime = cam->startTime + cam->events[i].time;
				//Com_Printf("Triggered event switch to target: %s\n",events[i]->getParam());
			} else if (cam->events[i].type == EVENT_TRIGGER) {
				//idEntity *ent = NULL;
				//ent = level.FindTarget( ent, events[i]->getParam());
				//if (ent) {
				//	ent->signal( SIG_TRIGGER );
				//	ent->ProcessEvent( &EV_Activate, world );
				//}
			} else if (cam->events[i].type == EVENT_FOV) {
				//*fv = fov = atof(events[i]->getParam());
			} else if (cam->events[i].type == EVENT_STOP) {
				return qfalse;
			}
		}
	}

	*fv = getFOV(time, &cam->fov);

	VectorCopy(*getPosition(time, cam->cameraPosition), origin);
	VectorCopy(origin, temp);
	int numTargets = cam->numTargetPositions;
	if (numTargets == 0) {
/*
		// follow the path
		if (cameraSpline.getActiveSegment() < count - 1) {
			temp = *cameraSpline.splinePoints[cameraSpline.getActiveSegment()+1];
			if (temp == origin) {
				int index = cameraSpline.getActiveSegment() + 2;
				while (temp == origin && index < count - 1) {
					temp = *cameraSpline.splinePoints[index++];
				}
			}
		}
*/
	} else {
		VectorCopy(*getPosition(time, getActiveTarget(cam)), temp);
	}

	VectorSubtract(temp, origin, temp);
	VectorNormalize(temp);
	VectorCopy(temp, direction);

	return qtrue;
}

//qboolean idCameraDef::waitEvent(int index) {
	//for (int i = 0; i < events.Num(); i++) {
	//	if (events[i]->getSegment() == index && events[i]->getType() == EVENT_WAIT) {
	//		return true;
	//	}
  //}
//	return false;
//}


#define NUM_CCELERATION_SEGS 10
#define CELL_AMT 5

static void addVelocity(long start, long duration, float speed, idCameraPosition *pos) {
	pos->velocities[pos->numVelocities].startTime = start;
	pos->velocities[pos->numVelocities].time = duration;
	pos->velocities[pos->numVelocities].speed = speed;
	pos->numVelocities++;
}

static void buildCamera(idCameraDef *cam) {
	int i;
	//int lastSwitch = 0;
	float waits[MAX_CAMERA_EVENTS];
	int targets[MAX_CAMERA_EVENTS];
	int numWaits = 0;
	int numTargets = 0;

	cam->totalTime = cam->baseTime;
	cam->cameraPosition->time = cam->totalTime * 1000;
	// we have a base time layout for the path and the target path
	// now we need to layer on any wait or speed changes
	for (i = 0; i < cam->numEvents; i++) {
		//idCameraEvent *ev = events[i];
		cam->events[i].triggered = qfalse;
		switch (cam->events[i].type) {
			case EVENT_TARGET : {
				targets[numTargets] = i;
				numTargets++;
				break;
			}
			case EVENT_WAIT : {
				waits[numWaits] = atof(cam->events[i].paramStr);
				numWaits++;
				addVelocity(cam->events[i].time, atof(cam->events[i].paramStr) * 1000, 0, cam->cameraPosition);
				break;
			}
			case EVENT_TARGETWAIT : {
				//targetWaits.Append(i);
				break;
			}
			case EVENT_SPEED : {
/*
				// take the average delay between up to the next five segments
				float adjust = atof(events[i]->getParam());
				int index = events[i]->getSegment();
				total = 0;
				count = 0;

				// get total amount of time over the remainder of the segment
				for (j = index; j < cameraSpline.numSegments() - 1; j++) {
					total += cameraSpline.getSegmentTime(j + 1) - cameraSpline.getSegmentTime(j);
					count++;
				}

				// multiply that by the adjustment
				double newTotal = total * adjust;
				// what is the difference.. 
				newTotal -= total;
				totalTime += newTotal / 1000;

				// per segment difference
				newTotal /= count;
				int additive = newTotal;

				// now propogate that difference out to each segment
				for (j = index; j < cameraSpline.numSegments(); j++) {
					cameraSpline.addSegmentTime(j, additive);
					additive += newTotal;
				}
				break;
*/
			}
    	default: break; // FIXME: what about other idCameraEvent?
		}
	}


	for (i = 0; i < numWaits; i++) {
		cam->totalTime += waits[i];
	}

	// on a new target switch, we need to take time to this point ( since last target switch ) 
	// and allocate it across the active target, then reset time to this point
	long timeSoFar = 0;
	long total = (int)(cam->totalTime * 1000);
	for (i = 0; i < numTargets; i++) {
		long t;
		if (i < numTargets - 1) {
			t = cam->events[targets[i+1]].time;
		} else {
			t = total - timeSoFar;
		}
		// t is how much time to use for this target
		setActiveTargetByName(cam->events[targets[i]].paramStr, cam);
		getActiveTarget(cam)->time = t;
		timeSoFar += t;
	}
}

static void calcVelocity(float distance, idCameraPosition *pos) {
	float secs = (float)pos->time / 1000;
	pos->baseVelocity = distance / secs;
}

static void startInterpolatedPosition(long t, idInterpolatedPosition *ip) {
	vec3_t temp;
	ip->pos.startTime = t;
	ip->lastTime = ip->pos.startTime;
	ip->distSoFar = 0.0;
	VectorCopy(ip->startPos, temp);
	VectorSubtract(ip->startPos, ip->endPos, temp);
	calcVelocity(VectorLength(temp), &ip->pos);
}

static void startSplinePosition(long t, idSplinePosition *sp) {
	sp->pos.startTime = t;
	initPosition(t, sp->pos.time, sp->target);
	calcVelocity(totalDistance(sp->target), &sp->pos);
}

static void startPosition(long t, idCameraPosition *pos) {
	if(pos->type == CP_INTERPOLATED) {
		startInterpolatedPosition(t, (idInterpolatedPosition *)pos);
	} else if (pos->type == CP_SPLINE) {
		startSplinePosition(t, (idSplinePosition *)pos);
	} else if (pos->type == CP_FIXED) {

	}
}


static void startCamera_real(long t, idCameraDef *cam) {
	buildCamera(cam);
	cam->cameraPosition->time = t;
	startPosition(t, cam->cameraPosition);
	cam->fov.startTime = t;
	//for (int i = 0; i < targetPositions.Num(); i++) {
	//	targetPositions[i]->
	//}
	cam->startTime = t;
	cam->cameraRunning = qtrue;
}

static void parseFixed(const char *(*text), idFixedPosition *pos );
static void parseInterpolated(const char *(*text), idInterpolatedPosition *pos );
static void parseSpline(const char *(*text), idSplinePosition *pos );
static void parseFOV(const char *(*text), idCameraFOV *fov );
static void parseEvent(const char *(*text), idCameraEvent *ev );

static void parseCamera(const char *(*text), idCameraDef *cam ) {
	const char	*token;
	const char *t;

	do {
		t = *text;
		token = COM_Parse(text);

		if ( !token[0] ) {
			break;
		}
		if ( !Q_stricmp (token, "}") ) {
			break;
		}

		if (Q_stricmp(token, "time") == 0) {
			cam->baseTime = atof(COM_Parse(text));
		}

		if (Q_stricmp(token, "camera_fixed") == 0) {
			cam->cameraPosition = Z_Malloc(sizeof(idFixedPosition));
			parseFixed(text, (idFixedPosition *)cam->cameraPosition);
		}

		if (Q_stricmp(token, "camera_interpolated") == 0) {
			cam->cameraPosition = (idCameraPosition *)initInterpolatedPosition(vec3_origin, vec3_origin, 0);
			parseInterpolated(text, (idInterpolatedPosition *)cam->cameraPosition);
		}

		if (Q_stricmp(token, "camera_spline") == 0) {
			cam->cameraPosition = (idCameraPosition *)initSplinePosition(0);
			parseSpline(text, (idSplinePosition *)cam->cameraPosition);
		}

		if (Q_stricmp(token, "target_fixed") == 0) {
			idFixedPosition *pos = Z_Malloc(sizeof(idFixedPosition));
			parseFixed(text, pos);
			cam->targetPositions[cam->numTargetPositions] = *(idCameraPosition *)pos;
			cam->numTargetPositions++;
		}

		if (Q_stricmp(token, "target_interpolated") == 0) {
			idInterpolatedPosition *pos = initInterpolatedPosition(vec3_origin, vec3_origin, 0);
			parseInterpolated(text, pos);
			cam->targetPositions[cam->numTargetPositions] = *(idCameraPosition *)pos;
			cam->numTargetPositions++;
		}

		if (Q_stricmp(token, "target_spline") == 0) {
			idSplinePosition *pos = initSplinePosition(0);
			parseSpline(text, pos);
			cam->targetPositions[cam->numTargetPositions] = *(idCameraPosition *)pos;
			cam->numTargetPositions++;
		}

		if (Q_stricmp(token, "fov") == 0) {
			parseFOV(text, &cam->fov);
		}

		if (Q_stricmp(token, "event") == 0) {
			idCameraEvent *event = &cam->events[cam->numEvents];
			parseEvent(text, event);
			cam->numEvents++;
		}

	} while (1);

	*text = t;
	COM_MatchToken( text, "}" );
}

static void clearCamera(idCameraDef *cam);

static qboolean loadCamera_real(const char *filename, idCameraDef *cam) {
	char *buf;
	const char *buf_p;
	//int length = 
  FS_ReadFile( filename, (void **)&buf );
	if ( !buf ) {
		return qfalse;
	}

	clearCamera(cam);
	cam->targetPositions = Z_Malloc(sizeof(idCameraPosition) * MAX_CAMERA_POSITIONS);
	cam->events = Z_Malloc(sizeof(idCameraEvent) * MAX_CAMERA_EVENTS);
	COM_BeginParseSession( filename );
	buf_p = buf;
	parseCamera(&buf_p, cam);
	//COM_EndParseSession();
	FS_FreeFile( buf );

	return qtrue;
}


#if 0
static void writeInterpolated(fileHandle_t file, const char *p, idInterpolatedPosition *pos);
static void writeFixed(fileHandle_t file, const char *p, idFixedPosition *pos);
static void writeSpline(fileHandle_t file, const char *p, idSplinePosition *pos);
static void writeEvent(fileHandle_t file, const char *name, idCameraEvent *event);
static void writePosition(fileHandle_t file, const char *p, idCameraPosition *pos);
static void writeFOV(fileHandle_t file, const char *p, idCameraFOV *fov);

const char *positionStr[] = {
	"Fixed",
	"Interpolated",
	"Spline",
};


static void writeEvent(fileHandle_t file, const char *name, idCameraEvent *event) {
	const char *s = va("\t%s {\n", name);
	FS_Write(s, strlen(s), file);
	s = va("\t\ttype %d\n", event->type);
	FS_Write(s, strlen(s), file);
	s = va("\t\tparam %s\n", event->paramStr);
	FS_Write(s, strlen(s), file);
	s = va("\t\ttime %ld\n", event->time);
	FS_Write(s, strlen(s), file);
	s = "\t}\n";
	FS_Write(s, strlen(s), file);
}


static void writeSplines(fileHandle_t file, const char *p, idSplineList *spline) {
	const char *s = va("\t\t%s {\n", p);
	FS_Write(s, strlen(s), file);
	//s = va("\t\tname %s\n", name);
	//FS_Write(s, s.length(), file);
	s = va("\t\t\tgranularity %f\n", spline->granularity);
	FS_Write(s, strlen(s), file);
	int count = spline->numControlPoints;
	for (int i = 0; i < count; i++) {
		s = va("\t\t\t( %f %f %f )\n", spline->controlPoints[i][0], spline->controlPoints[i][1], spline->controlPoints[i][2]);
		FS_Write(s, strlen(s), file);
	}
	s = "\t\t}\n";
	FS_Write(s, strlen(s), file);
}


static void saveCamera(const char *filename, idCameraDef *cam) {
	fileHandle_t file = FS_FOpenFileWrite(filename);
	if (file) {
		int i;
		const char *s = "cameraPathDef { \n"; 
		FS_Write(s, strlen(s), file);
		s = va("\ttime %f\n", cam->baseTime);
		FS_Write(s, strlen(s), file);

		if(cam->cameraPosition->type == CP_INTERPOLATED) {
			writeInterpolated(file, 
				va("camera_%s", positionStr[cam->cameraPosition->type]), 
				(idInterpolatedPosition *)cam->cameraPosition);
		} else if (cam->cameraPosition->type == CP_FIXED) {
			writeFixed(file, 
				va("camera_%s", positionStr[cam->cameraPosition->type]), 
				(idFixedPosition *)cam->cameraPosition);
		} else if (cam->cameraPosition->type == CP_SPLINE) {
			writeSpline(file, 
				va("camera_%s", positionStr[cam->cameraPosition->type]), 
				(idSplinePosition *)cam->cameraPosition);
		} else {
			
		}

		for (i = 0; i < cam->numTargetPositions; i++) {
			writePosition(file, 
				va("target_%s", positionStr[cam->targetPositions[i].type]), 
				&cam->targetPositions[i]);
		}

		for (i = 0; i < cam->numEvents; i++) {
			writeEvent(file, "event", &cam->events[i]);
		}

		writeFOV(file, "fov", &cam->fov);

		s = "}\n";
		FS_Write(s, strlen(s), file);
	}
	FS_FCloseFile(file);
}
#endif


/*
static int sortEvents(const void *p1, const void *p2, idCameraDef *cam) {
	idCameraEvent *ev1 = (idCameraEvent*)(p1);
	idCameraEvent *ev2 = (idCameraEvent*)(p2);

	if (ev1->time > ev2->time) {
		return -1;
	}
	if (ev1->time < ev2->time) {
		return 1;
	}
	return 0; 
}
*/


const char *eventStr[] = {
	"NA",
	"WAIT",
	"TARGETWAIT",
	"SPEED",
	"TARGET",
	"SNAPTARGET",
	"FOV",
	"SCRIPT",
	"TRIGGER",
	"STOP"
};

static void parseEvent(const char *(*text), idCameraEvent *event ) {
	const char *token;
	const char *t;

	COM_MatchToken( text, "{" );
	do {
		t = *text;
		token = COM_Parse(text);
	
		if ( !token[0] ) {
			break;
		}
		if ( !strcmp (token, "}") ) {
			break;
		}

		// here we may have to jump over brush epairs ( only used in editor )
		do {
			// if token is not a brace, it is a key for a key/value pair
			if ( !token[0] || !strcmp (token, "(") || !strcmp(token, "}")) {
				break;
			}

			*text = t; // UnParse
			const char *key = COM_Parse(text);
			if (Q_stricmp(key, "type") == 0) {
				token = COM_Parse(text);
				event->type = atoi(token);
			} else if (Q_stricmp(key, "param") == 0) {
				token = COM_Parse(text);
				memcpy(event->paramStr, token, sizeof(event->paramStr));
			} else if (Q_stricmp(key, "time") == 0) {
				token = COM_Parse(text);
				event->time = atoi(token);
			}

			t = *text;
			token = COM_Parse(text);
		} while (1);

		if ( !strcmp (token, "}") ) {
			break;
		}

	} while (1);
 
	*text = t; // UnParse
	COM_MatchToken( text, "}" );
}


static float getVelocity(long t, idCameraPosition *pos) {
	long check = t - pos->startTime;
	for (int i = 0; i < pos->numVelocities; i++) {
		if (check >= pos->velocities[i].startTime 
			&& check <= pos->velocities[i].startTime + pos->velocities[i].time) {
			return pos->velocities[i].speed;
		}
	}
	return pos->baseVelocity;
}

static const vec3_t *getInterpolatedPosition(long t, idInterpolatedPosition *pos) { 
	static vec3_t interpolatedPos;

	float velocity = getVelocity(t, (idCameraPosition *)pos);
	float timePassed = t - pos->lastTime;
	pos->lastTime = t;

	// convert to seconds	
	timePassed /= 1000;

	float distToTravel = timePassed *= velocity;

	vec3_t temp;
	VectorCopy(pos->startPos, temp);
	VectorSubtract(temp, pos->endPos, temp);
	float distance = VectorLength(temp);

	pos->distSoFar += distToTravel;
	float percent = (float)(pos->distSoFar) / distance;

	if (percent > 1.0) {
		percent = 1.0;
	} else if (percent < 0.0) {
		percent = 0.0;
	}

	// the following line does a straigt calc on percentage of time
	// float percent = (float)(startTime + time - t) / time;

	vec3_t v1;
	vec3_t v2;
	VectorCopy(pos->startPos, v1);
	VectorCopy(pos->endPos, v2);
	VectorScale(v1, 1.0 - percent, v1);
	VectorScale(v2, percent, v2);
	VectorAdd(v1, v2, v1);
	VectorCopy(v1, interpolatedPos);
	return &interpolatedPos;
}


static void parseFOV(const char *(*text), idCameraFOV *fov ) {
	const char *token;
	const char *t;

	COM_MatchToken( text, "{" );
	do {
		t = *text;
		token = COM_Parse(text);
	
		if ( !token[0] ) {
			break;
		}
		if ( !strcmp (token, "}") ) {
			break;
		}

		// here we may have to jump over brush epairs ( only used in editor )
		do {
			// if token is not a brace, it is a key for a key/value pair
			if ( !token[0] || !strcmp (token, "(") || !strcmp(token, "}")) {
				break;
			}

			*text = t; // UnParse
			const char *key = COM_Parse(text);
			if (Q_stricmp(key, "fov") == 0) {
				token = COM_Parse(text);
				fov->fov = atof(token);
			} else if (Q_stricmp(key, "startFOV") == 0) {
				token = COM_Parse(text);
				fov->startFOV = atof(token);
			} else if (Q_stricmp(key, "endFOV") == 0) {
				token = COM_Parse(text);
				fov->endFOV = atof(token);
			} else if (Q_stricmp(key, "time") == 0) {
				token = COM_Parse(text);
				fov->time = atoi(token);
			}

			t = *text;
			token = COM_Parse(text);
		} while (1);

		if ( !strcmp (token, "}") ) {
			break;
		}

	} while (1);

	*text = t; // UnParse
	COM_MatchToken( text, "}" );
}

static qboolean parseToken(const char *key, const char *(*text), idCameraPosition *pos) {
	const char *t = *text;
	const char *token;

	if (Q_stricmp(key, "time") == 0) {
		token = COM_Parse(text);
		pos->time = atol(token);
		return qtrue;
	} else if (Q_stricmp(key, "type") == 0) {
		token = COM_Parse(text);
		pos->type = atoi(token);
		return qtrue;
	} else if (Q_stricmp(key, "velocity") == 0) {
		token = COM_Parse(text);
		long t = atol(token);
		token = COM_Parse(text);
		long d = atol(token);
		token = COM_Parse(text);
		float s = atof(token);
		addVelocity(t, d, s, pos);
		return qtrue;
	} else if (Q_stricmp(key, "baseVelocity") == 0) {
		token = COM_Parse(text);
		pos->baseVelocity = atof(token);
		return qtrue;
	} else if (Q_stricmp(key, "name") == 0) {
		token = COM_Parse(text);
		memcpy(pos->name, token, sizeof(pos->name));
		return qtrue;
	}
	*text = t; // UnParse
	return qfalse;
}



static void parseFixed(const char *(*text), idFixedPosition *pos ) {
	const char *token;
	const char *t;

	COM_MatchToken( text, "{" );
	do {
		t = *text;
		token = COM_Parse(text);
	
		if ( !token[0] ) {
			break;
		}
		if ( !strcmp (token, "}") ) {
			break;
		}

		// here we may have to jump over brush epairs ( only used in editor )
		do {
			// if token is not a brace, it is a key for a key/value pair
			if ( !token[0] || !strcmp (token, "(") || !strcmp(token, "}")) {
				break;
			}

			*text = t; // UnParse
			const char *key = COM_Parse(text);
			if (Q_stricmp(key, "pos") == 0) {
				Parse1DMatrix( text, 3, pos->pos );
			} else {
				parseToken(key, text, (idCameraPosition *)pos);	
			}

			t = *text;
			token = COM_Parse(text);
		} while (1);

		if ( !strcmp (token, "}") ) {
			break;
		}

	} while (1);
 
	*text = t; // UnParse
	COM_MatchToken( text, "}" );
}

static void parseInterpolated(const char *(*text), idInterpolatedPosition *pos ) {
	const char *token;
	const char *t;

	COM_MatchToken( text, "{" );
	do {
		t = *text;
		token = COM_Parse(text);
	
		if ( !token[0] ) {
			break;
		}
		if ( !strcmp (token, "}") ) {
			break;
		}

		// here we may have to jump over brush epairs ( only used in editor )
		do {
			// if token is not a brace, it is a key for a key/value pair
			if ( !token[0] || !strcmp (token, "(") || !strcmp(token, "}")) {
				break;
			}

			*text = t; // UnParse
			const char *key = COM_Parse(text);
			if (Q_stricmp(key, "startPos") == 0) {
				Parse1DMatrix( text, 3, pos->startPos );
			} else if (Q_stricmp(key, "endPos") == 0) {
				Parse1DMatrix( text, 3, pos->endPos );
			} else {
				parseToken(key, text, (idCameraPosition *)pos);	
			}

			t = *text;
			token = COM_Parse(text);
		} while (1);

		if ( !strcmp (token, "}") ) {
			break;
		}

	} while (1);

	*text = t; // UnParse
	COM_MatchToken( text, "}" );
}


static void parseSpline(const char *(*text), idSplinePosition *spline ) {
	const char *token;
	const char *t;

	COM_MatchToken( text, "{" );
	do {
		t = *text;
		token = COM_Parse(text);

		if ( !token[0] ) {
			break;
		}
		if ( !strcmp (token, "}") ) {
			break;
		}

		// here we may have to jump over brush epairs ( only used in editor )
		do {
			// if token is not a brace, it is a key for a key/value pair
			if ( !token[0] || !strcmp (token, "(") || !strcmp(token, "}")) {
				break;
			}

			*text = t; // UnParse
			const char *key = COM_Parse(text);
			if (Q_stricmp(key, "target") == 0) {
				parseSplines(text, spline->target);
			} else {
				parseToken(key, text, (idCameraPosition *)spline);	
			}

			t = *text;
			token = COM_Parse(text);
		} while (1);

		if ( !strcmp (token, "}") ) {
			break;
		}

	} while (1);

	*text = t; // UnParse
	COM_MatchToken( text, "}" );
}



#if 0
static void writeFOV(fileHandle_t file, const char *p, idCameraFOV *fov) {
	const char *s = va("\t%s {\n", p);
	FS_Write(s, strlen(s), file);
	
	s = va("\t\tfov %f\n", fov->fov);
	FS_Write(s, strlen(s), file);

	s = va("\t\tstartFOV %f\n", fov->startFOV);
	FS_Write(s, strlen(s), file);

	s = va("\t\tendFOV %f\n", fov->endFOV);
	FS_Write(s, strlen(s), file);

	s = va("\t\ttime %i\n", fov->time);
	FS_Write(s, strlen(s), file);

	s = "\t}\n";
	FS_Write(s, strlen(s), file);
}


static void writePosition(fileHandle_t file, const char *p, idCameraPosition *pos) {
	const char *s = va("\t\ttime %li\n", pos->time);
	FS_Write(s, strlen(s), file);

	s = va("\t\ttype %i\n", pos->type);
	FS_Write(s, strlen(s), file);

	s = va("\t\tname %s\n", pos->name);
	FS_Write(s, strlen(s), file);

	s = va("\t\tbaseVelocity %f\n", pos->baseVelocity);
	FS_Write(s, strlen(s), file);

	for (int i = 0; i < pos->numVelocities; i++) {
		s = va("\t\tvelocity %li %li %f\n", 
			pos->velocities[i].startTime, 
			pos->velocities[i].time, 
			pos->velocities[i].speed);
		FS_Write(s, strlen(s), file);
	}
}

static void writeFixed(fileHandle_t file, const char *p, idFixedPosition *pos) {
	const char *s = va("\t%s {\n", p);
	FS_Write(s, strlen(s), file);
	writePosition(file, p, &pos->base);
	s = va("\t\tpos ( %f %f %f )\n", pos->pos[0], pos->pos[1], pos->pos[2]);
	FS_Write(s, strlen(s), file);
	s = "\t}\n";
	FS_Write(s, strlen(s), file);
}

static void writeInterpolated(fileHandle_t file, const char *p, idInterpolatedPosition *pos) {
	const char *s = va("\t%s {\n", p);
	FS_Write(s, strlen(s), file);
	writePosition(file, p, &pos->pos);
	s = va("\t\tstartPos ( %f %f %f )\n", pos->startPos[0], pos->startPos[1], pos->startPos[2]);
	FS_Write(s, strlen(s), file);
	s = va("\t\tendPos ( %f %f %f )\n", pos->endPos[0], pos->endPos[1], pos->endPos[2]);
	FS_Write(s, strlen(s), file);
	s = "\t}\n";
	FS_Write(s, strlen(s), file);
}

static void writeSpline(fileHandle_t file, const char *p, idSplinePosition *spline) {
	const char *s = va("\t%s {\n", p);
	FS_Write(s, strlen(s), file);
	writePosition(file, p, &spline->pos);
	writeSplines(file, "target", spline->target);
	s = "\t}\n";
	FS_Write(s, strlen(s), file);
}
#endif


static void clearCamera(idCameraDef *cam) {
	cam->currentCameraPosition = 0;
	cam->cameraRunning = qfalse;
	VectorClear(cam->lastDirection);
	cam->baseTime = 30;
	cam->activeTarget = 0;
	strcpy(cam->name, "camera01");
	cam->fov.fov = 90;

	if(cam->targetPositions)
		Z_Free(cam->targetPositions);
	cam->targetPositions = NULL;
	cam->numTargetPositions = 0;
	if(cam->events)
		Z_Free(cam->events);
	cam->numEvents = 0;
	if(cam->cameraPosition)
		Z_Free(cam->cameraPosition);
	cam->cameraPosition = NULL;
	cam->numCameraPositions = 0;
}


int loadCamera(const char *name) {
	char lname[MAX_QPATH];
	int i;
	int oldest = -1;
	int oldestTime = 0;
	int now = Sys_Milliseconds();
	for(i = 0; i < MAX_CAMERAS; i++) {
		if(!Q_stricmp(camera[i].name, name)) {
			break;
		} else if (!camera[i].name[0]) {
			break;
		} else if (oldest == -1 || (now - camera[i].lastUsed) > oldestTime) {
			oldest = i;
			oldestTime = now - camera[i].lastUsed;
		}
	}
	if(i == MAX_CAMERAS) {
		i = oldest;
	}
	COM_StripExtension(name, lname, MAX_QPATH);
	Q_strcat( lname, sizeof(lname), ".cam" );
	clearCamera(&camera[i]);
  if(!loadCamera_real(va("cameras/%s", lname), &camera[i])) {
		return -1;
	} else {
		camera[i].lastUsed = now;
		return i;
	}
}


qboolean getCameraInfo(int camNum, int time, float *origin, float *angles, float *fov) {
	vec3_t dir, org;
	if(camNum >= MAX_CAMERAS)
		return qfalse;
	org[0] = origin[0];
	org[1] = origin[1];
	org[2] = origin[2];
	//float fov = 90;
	if (getCameraInfo_real(time, org, dir, fov, &camera[camNum])) {
		origin[0] = org[0];
		origin[1] = org[1];
		origin[2] = org[2];
		angles[1] = atan2 (dir[1], dir[0])*180/3.14159;
		angles[0] = asin (dir[2])*180/3.14159;
		return qtrue;
	}
	return qfalse;
}

void startCamera(int camNum, int time) {
	if(camNum >= MAX_CAMERAS)
		return;
	startCamera_real(time, &camera[camNum]);
}

void stopCamera(int camNum) {
	if(camNum >= MAX_CAMERAS)
		return;
	if(camNum == -1) {
		for(camNum = 0; camNum < MAX_CAMERAS; camNum++) {
			camera[camNum].cameraRunning = qfalse;
		}
	} else {
		camera[camNum].cameraRunning = qfalse;
	}
}

