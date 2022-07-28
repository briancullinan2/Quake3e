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
#ifndef __SPLINES_H
#define __SPLINES_H


#include "q_shared.h"
#include "qcommon.h"

typedef int fileHandle_t;

//extern void glBox(vec3_t &color, vec3_t &point, float size);
//extern void glLabeledPoint(vec3_t &color, vec3_t &point, float size, const char *label);

static vec4_t blue = {0, 0, 1, 1};
static vec4_t red = {1, 0, 0, 1};

//class idPointListInterface {
//public:

//virtual 
//void addPointXYZ(const float x, const float y, const float z);
//virtual 
//void addPoint(const vec3_t v);
//virtual 
//void removePoint(int index);
//virtual 
//vec3_t *getPoint(int index);

//protected:
//static int *selectedPoints;

void deselectAll( int *numPoints, int **selectedPoints ) {
	Z_Free(*selectedPoints);
	*numPoints = 0;
}

int isPointSelected(int index, int numPoints, int *selectedPoints ) {
	for (int i = 0; i < numPoints; i++) {
		if (selectedPoints[i] == index) {
			return i;
		}
	}
	return -1;
}

int selectPoint(int index, qboolean single, int *numPoints, int **selectedPoints ) {
	if (index >= 0 && index < *numPoints) {
		if (single) {
			deselectAll(numPoints, selectedPoints);
		} else {
			int i;
			if ((i = isPointSelected(index, *numPoints, *selectedPoints)) >= 0) {
				memcpy(&(*selectedPoints)[i - 1], &(*selectedPoints)[i], sizeof(int));
				(*numPoints)--;
			}
		}
		(*selectedPoints)[*numPoints] = index;
		(*numPoints)++;
		return *numPoints;
	}
	return -1;
}

int	selectPointByRay(const vec3_t origin, const vec3_t direction, qboolean single, 
	int *numPoints, int **selectedPoints, vec3_t *points )
{
	int		i, besti;
	float	d, bestd;
	vec3_t	temp, temp2;

	// find the point closest to the ray
	besti = -1;
	bestd = 8;

	for (i=0; i < *numPoints; i++) {
		VectorCopy(points[i], temp);
		VectorCopy(temp, temp2);
		VectorSubtract(temp, origin, temp);
		d = DotProduct(temp, direction);
		VectorMA (origin, d, direction, temp);
		VectorSubtract(temp2, temp, temp2);
		d = VectorNormalize(temp2);
		if (d <= bestd) {
			bestd = d;
			besti = i;
		}
	}

	if (besti >= 0) {
		selectPoint(besti, single, numPoints, selectedPoints);
	}

	return besti;
}

int	selectPointByRayXYZ(float ox, float oy, float oz, float dx, float dy, float dz, qboolean single, 
	int *numPoints, int **selectedPoints, vec3_t *points ) 
{
	vec3_t origin = {ox, oy, oz};
	vec3_t dir = {dx, dy, dz};
	return selectPointByRay(origin, dir, single, numPoints, selectedPoints, points);
}

void selectAll(int *numPoints, int **selectedPoints ) {
	int pointsTotal = *numPoints;
	deselectAll(numPoints, selectedPoints);
	for (int i = 0; i < pointsTotal; i++) {
		selectPoint(i, qfalse, numPoints, selectedPoints);
	}
}

void updateSelection(const vec3_t move, int numPoints, int *selectedPoints, vec3_t *points ) {
	for (int i = 0; i < numPoints; i++) {
		VectorAdd(points[selectedPoints[i]], move, points[selectedPoints[i]]);
	}
}

void updateSelectionXYZ(float x, float y, float z, int numPoints, int *selectedPoints, vec3_t *points) {
	vec3_t move = {x, y, z};
	updateSelection(move, numPoints, selectedPoints, points);
}

/*
void drawSelection() {
	int count = selectedPoints.Num();
	for (int i = 0; i < count; i++) {
		glBox(red, *getPoint(selectedPoints[i]), 4);
	}
}
*/




//class idSplineList {

//protected:


//public:
idSplineList *initSplineList(const char *p) {
	idSplineList *result = Z_Malloc(sizeof(idSplineList));
	memcpy(result->name, p, sizeof(result->name));
	return result;
}

void parse(const char *(*text));
void write(fileHandle_t file, const char *name);

void clearSplineList(idSplineList *spline) {
	Z_Free(spline->controlPoints);
	Z_Free(spline->splinePoints);
	Z_Free(spline->splineTime);
	spline->selected = NULL;
	spline->dirty = qtrue;
	spline->activeSegment = 0;
	spline->granularity = 0.025;
	spline->pathColor[0] = 1.0;
	spline->pathColor[1] = 0.5;
	spline->pathColor[2] = 0.0;
	spline->controlColor[0] = 0.7;
	spline->controlColor[1] = 0.0;
	spline->controlColor[2] = 1.0;
	spline->segmentColor[0] = 0.0;
	spline->segmentColor[1] = 0.0;
	spline->segmentColor[2] = 1.0;
	spline->activeColor[0] = 1.0;
	spline->activeColor[1] = 0.0;
	spline->activeColor[2] = 0.0;
}

void initPosition(long startTime, long totalTime, idSplineList *spline);
const vec3_t *getPosition(long time, idSplineList *spline);


//	void draw(qboolean editMode);
void addToRenderer( void );

//void updateSelection(const vec3_t move);

/*
void startEdit() {
	editMode = qtrue;
}
	
void stopEdit() {
	editMode = qfalse;
}

void setGranularity(float f) {
	granularity = f;
}

float getGranularity() {
	return granularity;
}

int numPoints() {
	return controlPoints.Num();
}
*/
void buildSpline( idSplineList *spline );

vec3_t *getPoint(int index, idSplineList *spline) {
	assert(index >= 0 && index < spline->numControlPoints);
	return &spline->controlPoints[index];
}

vec3_t *getSegmentPoint(int index, idSplineList *spline) {
	assert(index >= 0 && index < spline->numSplinePoints);
	return &spline->splinePoints[index];
}


void setSegmentTime(int index, int time, idSplineList *spline) {
	assert(index >= 0 && index < spline->numSplinePoints);
	spline->splineTime[index] = time;
}

double getSegmentTime(int index, idSplineList *spline) {
	assert(index >= 0 && index < spline->numSplinePoints);
	return spline->splineTime[index];
}
void addSegmentTime(int index, int time, idSplineList *spline) {
	assert(index >= 0 && index < spline->numSplinePoints);
	spline->splineTime[index] += time;
}

float totalDistance( idSplineList *spline );

/*
TODO: call this crap directly on object, it's 1 fucking line
int getActiveSegment() {
	return activeSegment;
}

void setActiveSegment(int i) {
	//assert(i >= 0 && (splinePoints.Num() > 0 && i < splinePoints.Num()));
	activeSegment = i;
}

int numSegments() {
	return splinePoints.Num();
}
*/

void setColors(vec3_t path, vec3_t segment, vec3_t control, vec3_t active, idSplineList *spline) {
	VectorCopy(path, spline->pathColor);
	VectorCopy(segment, spline->segmentColor);
	VectorCopy(control, spline->controlColor);
	VectorCopy(active, spline->activeColor);
}

/*
const char *getName() {
	return name.c_str();
}

void setName(const char *p) {
	name = p;
}
*/

qboolean validTime(idSplineList *spline) {
	if (spline->dirty) {
		buildSpline(spline);
	}
	return spline->numSplinePoints > 0; // && spline->numSplinePoints == spline->numSplinePoints);
}


/*
void setTime(long t) {
	time = t;
}

void setBaseTime(long t) {
	baseTime = t;
}
*/

float calcSpline(int step, float tension);



// time in milliseconds 
// velocity where 1.0 equal rough walking speed



// can either be a look at or origin position for a camera
// 
//class idCameraPosition : public idPointListInterface {

// this can be done with RTTI syntax but i like the derived classes setting a type
// makes serialization a bit easier to see
//

//public:

void clearPosition(idCameraPosition *pos) {
	pos->editMode = qfalse;
	for (int i = 0; i < pos->numVelocities; i++) {
		Z_Free(pos->velocities);
	}
	pos->numVelocities = 0;
}


/*
long getTime() {
	return time;
}

//virtual 
void setTime(long t) {
	time = t;
}
*/



//virtual 
//const vec3_t *getPosition(long t) { 
//	assert(true);
//	return NULL;
//}

//	virtual void draw(qboolean editMode) {};

//virtual 
void parse(const char *(*text)) {};
//virtual 
void write(fileHandle_t file, const char *name);
//virtual 
qboolean parseToken(const char *key, const char *(*text));

/*
const char *getName() {
	return name.c_str();
}

void setName(const char *p) {
	name = p;
}

//virtual 
void startEdit() {
	editMode = qtrue;
}

//virtual 
void stopEdit() {
	editMode = qfalse;
}

//	virtual void draw() {};

const char *typeStr() {
	return positionStr[static_cast<int>(type)];
}
*/

//};




//class idFixedPosition : public idCameraPosition {
//protected:


//public:

/*
//virtual 
void addPoint(const vec3_t &v) {
	pos = v;
}

//virtual 
void addPoint(const float x, const float y, const float z) {
	pos.set(x, y, z);
}

//virtual 
const vec3_t *getPosition(long t) { 
	return &pos;
}

void parse(const char *(*text));
void write(fileHandle_t file, const char *name);

//virtual 
int numPoints() {
	return 1;
}

//virtual 
vec3_t *getPoint(int index) {
	if (index != 0) {
		assert(true);
	};
	return &pos;
}
*/


/*
virtual void draw(qboolean editMode) {
	glLabeledPoint(blue, pos, (editMode) ? 5 : 3, "Fixed point");
}
*/

//};




//class idInterpolatedPosition : public idCameraPosition {

//protected:

//public:


/*
//virtual 
const vec3_t *getPosition(long t);

void parse(const char *(*text));
void write(fileHandle_t file, const char *name);

//virtual 
int numPoints() {
	return 2;
}

//virtual 
vec3_t *getPoint(int index) {
	assert(index >= 0 && index < 2);
	if (index == 0) {
		return &startPos;
	}
	return &endPos;
}

//virtual 
void addPoint(const float x, const float y, const float z) {
	if (first) {
		startPos.set(x, y, z);
		first = qfalse;
	} else {
		endPos.set(x, y, z);
		first = qtrue;
	}
}

//virtual 
void addPoint(const vec3_t v) {
	if (first) {
		startPos = v;
		first = qfalse;
	} else {
		endPos = v;
		first = qtrue;
	}
}
*/

/*
virtual void draw(qboolean editMode) {
	glLabeledPoint(blue, startPos, (editMode) ? 5 : 3, "Start interpolated");
	glLabeledPoint(blue, endPos, (editMode) ? 5 : 3, "End interpolated");
	qglBegin(GL_LINES);
	qglVertex3fv(startPos);
	qglVertex3fv(endPos);
	qglEnd();
}
*/
//virtual 


//};




//class idSplinePosition : public idCameraPosition {
//protected:

//public:

//virtual 

/*

//virtual 
const vec3_t *getPosition(long t, idSplinePosition *sp) { 
	return getPosition(t, sp->target);
}

//virtual const vec3_t *getPosition(long t) const { 

void addControlPoint(vec3_t &v) {
	target.addPoint(v);
}

void parse(const char *(*text));
void write(fileHandle_t file, const char *name);

//virtual 
int numPoints() {
	return target->numControlPoints;
}

//virtual 
vec3_t *getPoint(int index) {
	return &target->controlPoints[index];
}

//virtual 
void addPoint(const vec3_t &v) {
	target.addPoint(v);
}

//virtual 
void addPointXYZ(const float x, const float y, const float z) {
	target.addPoint(x, y, z);
}

virtual void draw(qboolean editMode) {
	target.draw(editMode);
}

//virtual 
void updateSelection(const vec3_t move, idSplinePosition *sp) {
	updateSelection(move, sp->target);
	buildSpline(sp->target);
}
*/

//};





//class idCameraEvent {
//public:


static const char* eventStr[EVENT_COUNT];

//protected:

//};


//~idCameraEvent() {};

/*
eventType getType() {
	return type;
}

const char *typeStr() {
	return eventStr[static_cast<int>(type)];
}

const char *getParam() {
	return paramStr.c_str();
}

long getTime() {
	return time;
}

void setTime(long n) {
	time = n;
}

void parse(const char *(*text));
void write(fileHandle_t file, const char *name);

void setTriggered(qboolean b) {
	triggered = b;
}

qboolean getTriggered() {
	return triggered;
}
*/



//class idCameraDef {

//protected:


//public:


idCameraPosition *startNewCamera(positionType type, idCameraDef *cam) {
	clearCamera(cam);
	if (type == CP_SPLINE) {
		cam->cameraPosition = initSplinePosition(0);
	} else if (type == CP_INTERPOLATED) {
		cam->cameraPosition = initInterpolatedPosition(vec3_origin, vec3_origin, 0);
	} else {
		cam->cameraPosition = initFixedPosition(vec3_origin);
	}
	return cam->cameraPosition;
}


//void addEvent(eventType t, const char *param, long time);
//void addEvent(idCameraEvent *event);
//static int sortEvents(const void *p1, const void *p2);

//int numEvents() {
//	return events.Num();
//}

idCameraEvent *getEvent(int index, idCameraDef *cam) {
	assert(index >= 0 && index < cam->numEvents);
	return &cam->events[index];
}

void parse(const char *(*text));
qboolean load(const char *filename);
void save(const char *filename);

void buildCamera( idCameraDef *cam );


/*
void setRunning(qboolean b) {
	cameraRunning = b;
}

void setBaseTime(float f) {
	baseTime = f;
}

float getBaseTime() {
	return baseTime;
}

float getTotalTime() {
	return totalTime;
}

void startCamera(long t);
void stopCamera() {
	cameraRunning = true;
}
*/


void getActiveSegmentInfo(int segment, vec3_t origin, vec3_t direction, float *fv);

/*
	void draw(qboolean editMode) {
                // gcc doesn't allow casting away from bools
                // why?  I've no idea...
		if (cameraPosition) {
			cameraPosition->draw((qboolean)((editMode || cameraRunning) && cameraEdit));
			int count = targetPositions.Num();
			for (int i = 0; i < count; i++) {
				targetPositions[i]->draw((qboolean)((editMode || cameraRunning) && i == activeTarget && !cameraEdit));
			}
		}
	}
*/
/*
	int numSegments() {
		if (cameraEdit) {
			return cameraPosition.numSegments();
		}
		return getTargetSpline()->numSegments();
	}

	int getActiveSegment() {
		if (cameraEdit) {
			return cameraPosition.getActiveSegment();
		}
		return getTargetSpline()->getActiveSegment();
	}

	void setActiveSegment(int i) {
		if (cameraEdit) {
			cameraPosition.setActiveSegment(i);
		} else {
			getTargetSpline()->setActiveSegment(i);
		}
	}
*/
int numPoints(idCameraDef *cam) {
	if (cam->cameraEdit) {
		return cam->cameraPosition->numPoints;
	}
	return getActiveTarget(cam)->numPoints;
}

const vec3_t *getPoint(int index, idCameraDef *cam) {
	if (cam->cameraEdit) {
		return &cam->cameraPosition->points[index];
	}
	return &getActiveTarget(cam)->points[index];
}

/*
void stopEdit(idCameraDef *cam) {
	cam->editMode = qfalse;
	if (cam->cameraEdit) {
		cam->cameraPosition->stopEdit();
	} else {
		getActiveTarget(cam)->stopEdit();
	}
}

void startEdit(qboolean camera, idCameraDef *cam) {
	cam->cameraEdit = camera;
	if (camera) {
		cam->cameraPosition->startEdit();
		for (int i = 0; i < cam->numTargetPositions; i++) {
			cam->targetPositions[i]->stopEdit();
		}
	} else {
		getActiveTarget(cam)->startEdit();
		cam->cameraPosition->stopEdit();
	}
	cam->editMode = qtrue;
}

qboolean waitEvent(int index);
*/

/*
const char *getName() {
	return name.c_str();
}

void setName(const char *p) {
	name = p;
}

idCameraPosition *getPositionObj() {
	if (cameraPosition == NULL) {
		cameraPosition = new idFixedPosition();
	}
	return cameraPosition;
}
*/


//};

extern qboolean g_splineMode;
extern idCameraDef *g_splineList;


#endif
