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
// cl_scrn.c -- master for refresh, status bar, console, chat, notify, etc

#include "client.h"

#ifdef USE_LNBITS
#include "../qcommon/qrcodegen.h"
#endif

qboolean	scr_initialized;		// ready to draw

cvar_t		*cl_timegraph;
static cvar_t		*cl_debuggraph;
static cvar_t		*cl_graphheight;
static cvar_t		*cl_graphscale;
static cvar_t		*cl_graphshift;

#ifdef USE_MULTIVM_CLIENT
float clientScreens[MAX_NUM_VMS][4] = {
	{0,0,0,0},    {-1,-1,-1,-1},
	{-1,-1,-1,-1},{-1,-1,-1,-1},
	{-1,-1,-1,-1},{-1,-1,-1,-1},
	{-1,-1,-1,-1},{-1,-1,-1,-1},
	{-1,-1,-1,-1},{-1,-1,-1,-1}
};

refdef_t views[MAX_NUM_VMS];
qboolean viewsUpdated[MAX_NUM_VMS] = {
  qtrue, qtrue, qtrue, qtrue, qtrue,
  qtrue, qtrue, qtrue, qtrue, qtrue
};
#endif

/*
================
SCR_DrawNamedPic

Coordinates are 640*480 virtual values
=================
*/
void SCR_DrawNamedPic( float x, float y, float width, float height, const char *picname ) {
	qhandle_t	hShader;

	assert( width != 0 );

	hShader = re.RegisterShader( picname );
	SCR_AdjustFrom640( &x, &y, &width, &height );
	re.DrawStretchPic( x, y, width, height, 0, 0, 1, 1, hShader );
}


/*
================
SCR_AdjustFrom640

Adjusted for resolution and screen aspect ratio
================
*/
void SCR_AdjustFrom640( float *x, float *y, float *w, float *h ) {
	float	xscale;
	float	yscale;

#if 0
		// adjust for wide screens
		if ( cls.glconfig.vidWidth * 480 > cls.glconfig.vidHeight * 640 ) {
			*x += 0.5 * ( cls.glconfig.vidWidth - ( cls.glconfig.vidHeight * 640 / 480 ) );
		}
#endif

	// scale for screen sizes
	xscale = cls.glconfig.vidWidth / 640.0;
	yscale = cls.glconfig.vidHeight / 480.0;
	if ( x ) {
		*x *= xscale;
	}
	if ( y ) {
		*y *= yscale;
	}
	if ( w ) {
		*w *= xscale;
	}
	if ( h ) {
		*h *= yscale;
	}
}

/*
================
SCR_FillRect

Coordinates are 640*480 virtual values
=================
*/
void SCR_FillRect( float x, float y, float width, float height, const float *color ) {
	re.SetColor( color );

	SCR_AdjustFrom640( &x, &y, &width, &height );
	re.DrawStretchPic( x, y, width, height, 0, 0, 0, 0, cls.whiteShader );

	re.SetColor( NULL );
}


/*
================
SCR_DrawPic

Coordinates are 640*480 virtual values
=================
*/
void SCR_DrawPic( float x, float y, float width, float height, qhandle_t hShader ) {
	SCR_AdjustFrom640( &x, &y, &width, &height );
	re.DrawStretchPic( x, y, width, height, 0, 0, 1, 1, hShader );
}


/*
** SCR_DrawChar
** chars are drawn at 640*480 virtual screen size
*/
static void SCR_DrawChar( int x, int y, float size, int ch ) {
	int row, col;
	float frow, fcol;
	float	ax, ay, aw, ah;

	ch &= 255;

	if ( ch == ' ' ) {
		return;
	}

	if ( y < -size ) {
		return;
	}

	ax = x;
	ay = y;
	aw = size;
	ah = size;
	SCR_AdjustFrom640( &ax, &ay, &aw, &ah );

	row = ch>>4;
	col = ch&15;

	frow = row*0.0625;
	fcol = col*0.0625;
	size = 0.0625;

	re.DrawStretchPic( ax, ay, aw, ah,
					   fcol, frow, 
					   fcol + size, frow + size, 
					   cls.charSetShader );
}


/*
** SCR_DrawSmallChar
** small chars are drawn at native screen resolution
*/
void SCR_DrawSmallChar( int x, int y, int ch ) {
	int row, col;
	float frow, fcol;
	float size;

	ch &= 255;

	if ( ch == ' ' ) {
		return;
	}

	if ( y < -smallchar_height ) {
		return;
	}

	row = ch>>4;
	col = ch&15;

	frow = row*0.0625;
	fcol = col*0.0625;
	size = 0.0625;

	re.DrawStretchPic( x, y, smallchar_width, smallchar_height,
					   fcol, frow, 
					   fcol + size, frow + size, 
					   cls.charSetShader );
}


/*
** SCR_DrawSmallString
** small string are drawn at native screen resolution
*/
void SCR_DrawSmallString( int x, int y, const char *s, int len ) {
	int row, col, ch, i;
	float frow, fcol;
	float size;

	if ( y < -smallchar_height ) {
		return;
	}

	size = 0.0625;

	for ( i = 0; i < len; i++ ) {
		ch = *s++ & 255;
		row = ch>>4;
		col = ch&15;

		frow = row*0.0625;
		fcol = col*0.0625;

		re.DrawStretchPic( x, y, smallchar_width, smallchar_height,
						   fcol, frow, fcol + size, frow + size, 
						   cls.charSetShader );

		x += smallchar_width;
	}
}


/*
==================
SCR_DrawBigString[Color]

Draws a multi-colored string with a drop shadow, optionally forcing
to a fixed color.

Coordinates are at 640 by 480 virtual resolution
==================
*/
void SCR_DrawStringExt( int x, int y, float size, const char *string, const float *setColor, qboolean forceColor,
		qboolean noColorEscape ) {
	vec4_t		color;
	const char	*s;
	int			xx;

	// draw the drop shadow
	color[0] = color[1] = color[2] = 0.0;
	color[3] = setColor[3];
	re.SetColor( color );
	s = string;
	xx = x;
	while ( *s ) {
		if ( !noColorEscape && Q_IsColorString( s ) ) {
			s += 2;
			continue;
		}
		SCR_DrawChar( xx+2, y+2, size, *s );
		xx += size;
		s++;
	}


	// draw the colored text
	s = string;
	xx = x;
	re.SetColor( setColor );
	while ( *s ) {
		if ( Q_IsColorString( s ) ) {
			if ( !forceColor ) {
				Com_Memcpy( color, g_color_table[ ColorIndexFromChar( *(s+1) ) ], sizeof( color ) );
				color[3] = setColor[3];
				re.SetColor( color );
			}
			if ( !noColorEscape ) {
				s += 2;
				continue;
			}
		}
		SCR_DrawChar( xx, y, size, *s );
		xx += size;
		s++;
	}
	re.SetColor( NULL );
}


/*
==================
SCR_DrawBigString
==================
*/
void SCR_DrawBigString( int x, int y, const char *s, float alpha, qboolean noColorEscape ) {
	float	color[4];

	color[0] = color[1] = color[2] = 1.0;
	color[3] = alpha;
	SCR_DrawStringExt( x, y, BIGCHAR_WIDTH, s, color, qfalse, noColorEscape );
}


/*
==================
SCR_DrawSmallString[Color]

Draws a multi-colored string with a drop shadow, optionally forcing
to a fixed color.
==================
*/
void SCR_DrawSmallStringExt( int x, int y, const char *string, const float *setColor, qboolean forceColor,
		qboolean noColorEscape ) {
	vec4_t		color;
	const char	*s;
	int			xx;

	// draw the colored text
	s = string;
	xx = x;
	re.SetColor( setColor );
	while ( *s ) {
		if ( Q_IsColorString( s ) ) {
			if ( !forceColor ) {
				Com_Memcpy( color, g_color_table[ ColorIndexFromChar( *(s+1) ) ], sizeof( color ) );
				color[3] = setColor[3];
				re.SetColor( color );
			}
			if ( !noColorEscape ) {
				s += 2;
				continue;
			}
		}
		SCR_DrawSmallChar( xx, y, *s );
		xx += smallchar_width;
		s++;
	}
	re.SetColor( NULL );
}


/*
** SCR_Strlen -- skips color escape codes
*/
static int SCR_Strlen( const char *str ) {
	const char *s = str;
	int count = 0;

	while ( *s ) {
		if ( Q_IsColorString( s ) ) {
			s += 2;
		} else {
			count++;
			s++;
		}
	}

	return count;
}


/*
** SCR_GetBigStringWidth
*/ 
int SCR_GetBigStringWidth( const char *str ) {
	return SCR_Strlen( str ) * BIGCHAR_WIDTH;
}


//===============================================================================

/*
=================
SCR_DrawDemoRecording
=================
*/
static void SCR_DrawDemoRecording( void ) {
	char	string[sizeof(clc.recordNameShort)+32];
	int		pos;

	if ( !clc.demorecording ) {
		return;
	}
	if ( clc.spDemoRecording ) {
		return;
	}

	pos = FS_FTell( clc.recordfile );
	sprintf( string, "RECORDING %s: %ik", clc.recordNameShort, pos / 1024 );

	SCR_DrawStringExt( 320 - strlen( string ) * 4, 20, 8, string, g_color_table[ ColorIndex( COLOR_WHITE ) ], qtrue, qfalse );
}


#ifdef USE_VOIP
/*
=================
SCR_DrawVoipMeter
=================
*/
static void SCR_DrawVoipMeter( void ) {
	char	buffer[16];
	char	string[256];
	int limit, i;

	if (!cl_voipShowMeter->integer)
		return;  // player doesn't want to show meter at all.
	else if (!cl_voipSend->integer)
		return;  // not recording at the moment.
	else if (clc.state != CA_ACTIVE)
		return;  // not connected to a server.
	else if (!clc.voipEnabled)
		return;  // server doesn't support VoIP.
	else if (clc.demoplaying)
		return;  // playing back a demo.
	else if (!cl_voip->integer)
		return;  // client has VoIP support disabled.

	limit = (int) (clc.voipPower * 10.0f);
	if (limit > 10)
		limit = 10;

	for (i = 0; i < limit; i++)
		buffer[i] = '*';
	while (i < 10)
		buffer[i++] = ' ';
	buffer[i] = '\0';

	sprintf( string, "VoIP: [%s]", buffer );
	SCR_DrawStringExt( 320 - strlen( string ) * 4, 10, 8, string, g_color_table[ ColorIndex( COLOR_WHITE ) ], qtrue, qfalse );
}
#endif


/*
===============================================================================

DEBUG GRAPH

===============================================================================
*/

static	int			current;
static	float		values[1024];

/*
==============
SCR_DebugGraph
==============
*/
void SCR_DebugGraph (float value)
{
	values[current] = value;
	current = (current + 1) % ARRAY_LEN(values);
}


/*
==============
SCR_DrawDebugGraph
==============
*/
static void SCR_DrawDebugGraph( void )
{
	int		a, x, y, w, i, h;
	float	v;

	//
	// draw the graph
	//
	w = cls.glconfig.vidWidth;
	x = 0;
	y = cls.glconfig.vidHeight;
	re.SetColor( g_color_table[ ColorIndex( COLOR_BLACK ) ] );
	re.DrawStretchPic(x, y - cl_graphheight->integer, 
		w, cl_graphheight->integer, 0, 0, 0, 0, cls.whiteShader );
	re.SetColor( NULL );

	for (a=0 ; a<w ; a++)
	{
		i = (ARRAY_LEN(values)+current-1-(a % ARRAY_LEN(values))) % ARRAY_LEN(values);
		v = values[i];
		v = v * cl_graphscale->integer + cl_graphshift->integer;
		
		if (v < 0)
			v += cl_graphheight->integer * (1+(int)(-v / cl_graphheight->integer));
		h = (int)v % cl_graphheight->integer;
		re.DrawStretchPic( x+w-1-a, y - h, 1, h, 0, 0, 0, 0, cls.whiteShader );
	}
}

//=============================================================================
#ifdef USE_XDAMAGE
void X_DMG_Init( void );
#endif

/*
==================
SCR_Init
==================
*/
void SCR_Init( void ) {
	cl_timegraph = Cvar_Get ("timegraph", "0", CVAR_CHEAT);
	cl_debuggraph = Cvar_Get ("debuggraph", "0", CVAR_CHEAT);
	cl_graphheight = Cvar_Get ("graphheight", "32", CVAR_CHEAT);
	cl_graphscale = Cvar_Get ("graphscale", "1", CVAR_CHEAT);
	cl_graphshift = Cvar_Get ("graphshift", "0", CVAR_CHEAT);

	scr_initialized = qtrue;
#ifdef USE_XDAMAGE
  X_DMG_Init();
#endif
}


#ifdef USE_LNBITS
void SCR_GenerateQRCode( void ) {
	int i, j, x, y, border = 4;
	if(!cl_lnInvoice || !cl_lnInvoice->string[0]) return;

	// Text data
	uint8_t qr0[qrcodegen_BUFFER_LEN_MAX];
	uint8_t tempBuffer[qrcodegen_BUFFER_LEN_MAX];
	bool ok = qrcodegen_encodeText(cl_lnInvoice->string,
	    tempBuffer, qr0, qrcodegen_Ecc_MEDIUM,
	    qrcodegen_VERSION_MIN, qrcodegen_VERSION_MAX,
	    qrcodegen_Mask_AUTO, qtrue);
	if (!ok)
	    return;

	int size = qrcodegen_getSize(qr0);
	{
		byte	data[(size+border+border)*4][(size+border+border)*4][4];
		Com_Memset( data, 255, sizeof( data ) );
		for (y = border; y < size+border; y++) {
			for (x = border; x < size+border; x++) {
				for(i = 0; i < 4; i++) {
					for(j = 0; j < 4; j++) {
						data[x*4+i][y*4+j][0] =
						data[x*4+i][y*4+j][1] =
						data[x*4+i][y*4+j][2] = qrcodegen_getModule(qr0, x-border, y-border) ? 0 : 255;
						data[x*4+i][y*4+j][3] = 255;
					}
				}
			}
		}
		cls.qrCodeShader = re.CreateShaderFromImageBytes("_qrCode", (byte *)data, (size+border+border)*4, (size+border+border)*4);
	}

	// Binary data
	/*
	uint8_t dataAndTemp[qrcodegen_BUFFER_LEN_FOR_VERSION(7)]
	    = {0xE3, 0x81, 0x82};
	uint8_t qr1[qrcodegen_BUFFER_LEN_FOR_VERSION(7)];
	ok = qrcodegen_encodeBinary(dataAndTemp, 3, qr1,
	    qrcodegen_Ecc_HIGH, 2, 7, qrcodegen_Mask_4, false);
	*/
}

void SCR_DrawQRCode( void ) {
	if(!cls.qrCodeShader && cl_lnInvoice->string[0]) {
		SCR_GenerateQRCode();
	}
	re.DrawStretchPic( cls.glconfig.vidWidth / 2 - 128,
		cls.glconfig.vidHeight / 2, 256, 256, 0, 0, 1, 1, cls.qrCodeShader );
}
#endif


/*
==================
SCR_Done
==================
*/
void SCR_Done( void ) {
	scr_initialized = qfalse;
}


#define	MAX_LAGOMETER_PING	900
#define	MAX_LAGOMETER_RANGE	300
#define	LAG_SAMPLES		128


typedef struct {
	int		frameSamples[LAG_SAMPLES];
	int		frameCount;
	int		snapshotFlags[LAG_SAMPLES];
	int		snapshotSamples[LAG_SAMPLES];
	int		snapshotCount;
} lagometer_t;

lagometer_t		lagometer;

void CL_AddLagometerSnapshotInfo(clSnapshot_t *snapshot) {
  if ( !snapshot ) {
		lagometer.snapshotSamples[ lagometer.snapshotCount & ( LAG_SAMPLES - 1) ] = -1;
		lagometer.snapshotCount++;
		return;
	}

	// add this snapshot's info
	lagometer.snapshotSamples[ lagometer.snapshotCount & ( LAG_SAMPLES - 1) ] = snapshot->ping;
	lagometer.snapshotFlags[ lagometer.snapshotCount & ( LAG_SAMPLES - 1) ] = snapshot->snapFlags;
	lagometer.snapshotCount++;
}

static void CL_CalculatePing( int ms ) {
	int count, i, v;
  int			offset;
#ifdef USE_MULTIVM_CLIENT
  int igs = clc.currentView;
#endif
	cls.meanPing = 0;

	for ( i = 0, count = 0; i < LAG_SAMPLES; i++ ) {
		v = lagometer.snapshotSamples[i];
		if ( v >= 0 ) {
			cls.meanPing += v;
			count++;
		}
	}

	if ( count ) {
		cls.meanPing /= count;
	}

#ifdef USE_MULTIVM_CLIENT
	offset = cl.serverTimes[clientGames[0]] - cl.snapWorlds[igs].serverTime;
#else
	offset = cl.serverTime - cl.snap.serverTime;
#endif
	lagometer.frameSamples[ lagometer.frameCount & ( LAG_SAMPLES - 1) ] = offset;
	lagometer.frameCount++;
}

/*
==============
CG_DrawLagometer
==============
*/
static void SCR_DrawLagometer( void ) {
	int		a, x, y, i;
	float	v;
	float	ax, ay, aw, ah, mid, range;
	int		color;
	float	vscale;

	//
	// draw the graph
	//
#ifdef MISSIONPACK
	x = 640 + 1 - 48;
	y = 480 + 1 - 144;
#else
	x = 640 + 1 - 48;
	y = 480 + 1 - 48;
#endif

	re.SetColor( NULL );
  ax = x;
  ay = y;
  aw = 48;
  ah = 48;

  SCR_AdjustFrom640(&ax, &ay, &aw, &ah);

  re.DrawStretchPic( 
    ax, 
    ay, 
    aw, 
    ah, 
    0, 0, 1, 1, 
    cls.lagometerShader );

	color = -1;
	range = ah / 3;
	mid = ay + range;
	vscale = range / MAX_LAGOMETER_RANGE;

	// draw the frame interpoalte / extrapolate graph
	for ( a = 0 ; a < aw ; a++ ) {
		i = ( lagometer.frameCount - 1 - a ) & (LAG_SAMPLES - 1);
		v = lagometer.frameSamples[i];
		v *= vscale;
		if ( v > 0 ) {
			if ( color != 1 ) {
				color = 1;
				re.SetColor( g_color_table[ColorIndex(COLOR_YELLOW)] );
			}
			if ( v > range ) {
				v = range;
			}
			re.DrawStretchPic ( ax + aw - a, mid - v, 1, v, 0, 0, 0, 0, cls.whiteShader );
		} else if ( v < 0 ) {
			if ( color != 2 ) {
				color = 2;
				re.SetColor( g_color_table[ColorIndex(COLOR_BLUE)] );
			}
			v = -v;
			if ( v > range ) {
				v = range;
			}
			re.DrawStretchPic( ax + aw - a, mid, 1, v, 0, 0, 0, 0, cls.whiteShader );
		}
	}

	// draw the snapshot latency / drop graph
	range = ah / 2;
	vscale = range / MAX_LAGOMETER_PING;

	for ( a = 0 ; a < aw ; a++ ) {
		i = ( lagometer.snapshotCount - 1 - a ) & (LAG_SAMPLES - 1);
		v = lagometer.snapshotSamples[i];
		if ( v > 0 ) {
			if ( lagometer.snapshotFlags[i] & SNAPFLAG_RATE_DELAYED ) {
				if ( color != 5 ) {
					color = 5;	// YELLOW for rate delay
					re.SetColor( g_color_table[ColorIndex(COLOR_YELLOW)] );
				}
			} else {
				if ( color != 3 ) {
					color = 3;
					re.SetColor( g_color_table[ColorIndex(COLOR_GREEN)] );
				}
			}
			v = v * vscale;
			if ( v > range ) {
				v = range;
			}
			re.DrawStretchPic( ax + aw - a, ay + ah - v, 1, v, 0, 0, 0, 0, cls.whiteShader );
		} else if ( v < 0 ) {
			if ( color != 4 ) {
				color = 4;		// RED for dropped snapshots
				re.SetColor( g_color_table[ColorIndex(COLOR_RED)] );
			}
			re.DrawStretchPic( ax + aw - a, ay + ah - range, 1, range, 0, 0, 0, 0, cls.whiteShader );
		}
	}

	re.SetColor( NULL );

	if ( cl_nopredict->integer || cls.synchronousClients ) {
    SCR_DrawSmallStringExt( 
      cls.glconfig.vidWidth-1 - 3 * smallchar_width, 
      ay,
      "snc",
      g_color_table[ ColorIndex( COLOR_WHITE ) ],
      qtrue, qfalse );
	}

	if ( !clc.demoplaying ) {
    SCR_DrawSmallStringExt( 
      ax+1, 
      ay,
      va( "%ims", cls.meanPing ),
      g_color_table[ ColorIndex( COLOR_WHITE ) ],
      qtrue, qfalse );
	}

	//CG_DrawDisconnect();
}


#define	FPS_FRAMES	4
static void SCR_DrawFPS( int t ) {
	const char	*s;
	static int	previousTimes[FPS_FRAMES];
	static int	index;
	int		i, total;
	int		fps;
	static	int	previous;
	int		frameTime;

  if(!cl_drawFPS->integer) {
    return;
  }

	// don't use serverTime, because that will be drifting to
	// correct for internet lag changes, timescales, timedemos, etc
	frameTime = t - previous;
	previous = t;

	previousTimes[index % FPS_FRAMES] = frameTime;
	index++;
	if ( index > FPS_FRAMES ) {
		// average multiple frames together to smooth changes out a bit
		total = 0;
		for ( i = 0 ; i < FPS_FRAMES ; i++ ) {
			total += previousTimes[i];
		}
		if ( !total ) {
			total = 1;
		}
		fps = 1000 * FPS_FRAMES / total;

		s = va( "%ifps", fps );
		SCR_DrawStringExt( 
      640 - 4 - strlen(s) * BIGCHAR_WIDTH, 
      2,
      BIGCHAR_WIDTH, 
      s,
      g_color_table[ ColorIndex( COLOR_WHITE ) ],
      qtrue, qfalse );
	}
}


#ifdef USE_MULTIVM_CLIENT
// draw a box around the current view where keypresses and mouse input is being sent
void SCR_DrawCurrentView( void ) {
	float	yf, wf;
	float xadjust = 0;
	wf = SCREEN_WIDTH;
	yf = SCREEN_HEIGHT;
	SCR_AdjustFrom640( &xadjust, &yf, &wf, NULL );
	re.SetColor( g_color_table[ ColorIndex( COLOR_RED ) ] );
	
	// TODO: duh re.SetDvrFrame(clientScreens[cgvmi][0], clientScreens[cgvmi][1], clientScreens[cgvmi][2], clientScreens[cgvmi][3]);
	// TODO: draw a box around the edge of the screen but SetDvrFrame right before so its just the edge of the box
  // top
	re.DrawStretchPic( clientScreens[cgvmi][0] * wf, clientScreens[cgvmi][1] * yf, clientScreens[cgvmi][2] * wf, 2, 0, 0, 1, 1, cls.whiteShader );
	// right
	re.DrawStretchPic( clientScreens[cgvmi][2] * wf - 2, 0, 2, clientScreens[cgvmi][3] * yf, 0, 0, 1, 1, cls.whiteShader );
	// bottom 
	re.DrawStretchPic( clientScreens[cgvmi][0] * wf, clientScreens[cgvmi][3] * yf - 2, clientScreens[cgvmi][2] * wf, 2, 0, 0, 1, 1, cls.whiteShader );
	// left
	re.DrawStretchPic( clientScreens[cgvmi][0] * wf, clientScreens[cgvmi][1] * yf, 2, clientScreens[cgvmi][3] * yf, 0, 0, 1, 1, cls.whiteShader);
}

static int lastSubWorld[MAX_NUM_VMS] = {0,0,0,0,0,0,0,0,0,0};

#endif



//=======================================================

/*
==================
SCR_DrawScreenField

This will be called twice if rendering in stereo mode
==================
*/
static void SCR_DrawScreenField( stereoFrame_t stereoFrame ) {
	qboolean uiFullscreen = !!uivm;

	re.BeginFrame( stereoFrame );

	if(uivm) {
		uiFullscreen = (uivm && VM_Call( uivm, 0, UI_IS_FULLSCREEN ));
	}

	// wide aspect ratio screens need to have the sides cleared
	// unless they are displaying game renderings
	if ( uiFullscreen || cls.state <= CA_LOADING 
#ifdef USE_RMLUI
    || cls.rmlStarted
#endif
  ) {
		if ( cls.glconfig.vidWidth * 480 > cls.glconfig.vidHeight * 640 ) {
#if 0 // def __WASM__
			// TODO: fade black background in from full alpha black on web
			//   so the spinning logos slowly disappear
			// TODO: fade between white and black when transitioning to light/dark mode
			int amount = Sys_Milliseconds() - cls.uiStartTime;
			if(cls.uiStartTime && amount < 1000) {
				re.SetColor((vec4_t){0.0f, 0.0f, 0.0f, amount / 1000.0f});
			} else
#endif
			re.SetColor( g_color_table[ ColorIndex( COLOR_BLACK ) ] );

			re.DrawStretchPic( 0, 0, cls.glconfig.vidWidth, cls.glconfig.vidHeight, 0, 0, 0, 0, cls.whiteShader );
			re.SetColor( NULL );
		}
	}

	// if the menu is going to cover the entire screen, we
	// don't need to render anything under it
	if ( !uiFullscreen ) {
		switch( cls.state ) {
		default:
			Com_Error( ERR_FATAL, "SCR_DrawScreenField: bad cls.state" );
			break;
		case CA_CINEMATIC:
			SCR_DrawCinematic();
			break;
		case CA_DISCONNECTED:
			// force menu up
			//S_StopAllSounds();
			if( uivm )
				VM_Call( uivm, 1, UI_SET_ACTIVE_MENU, UIMENU_MAIN );
			break;
		case CA_CONNECTING:
		case CA_CHALLENGING:
		case CA_CONNECTED:
			// connecting clients will only show the connection dialog
			// refresh to update the time
			if( uivm ) {
				VM_Call( uivm, 1, UI_REFRESH, cls.realtime );
				VM_Call( uivm, 1, UI_DRAW_CONNECT_SCREEN, qfalse );
			}
			break;
		case CA_LOADING:
		case CA_PRIMED:
			// draw the game information screen and loading progress
			if(cgvm
#ifdef USE_ASYNCHRONOUS
				// skip drawing until VM is ready
				&& !VM_IsSuspended( cgvm )
#endif
			) {
				CL_CGameRendering( stereoFrame );
			}
			// also draw the connection information, so it doesn't
			// flash away too briefly on local or lan games
			// refresh to update the time
			if( uivm ) {
				VM_Call( uivm, 1, UI_REFRESH, cls.realtime );
				VM_Call( uivm, 1, UI_DRAW_CONNECT_SCREEN, qtrue );
			}
			break;
		case CA_ACTIVE:
			// always supply STEREO_CENTER as vieworg offset is now done by the engine.
			if( cgvm
#ifdef USE_ASYNCHRONOUS
				// skip drawing until VM is ready
				&& !VM_IsSuspended( cgvm )
#endif
			) {
				CL_CGameRendering( stereoFrame );
				SCR_DrawDemoRecording();
			}
#ifdef USE_VOIP
			SCR_DrawVoipMeter();
#endif
			break;
		}
	}

}


/*
==================
SCR_UpdateScreen

This is called every frame, and can also be called explicitly to flush
text to the screen.
==================
*/
void SCR_UpdateScreen( qboolean fromVM ) {
	int i, ms;
	static int recursive;
	static int framecount;
	static int next_frametime;
	qboolean first = qtrue;

	if ( !scr_initialized )
		return; // not initialized yet

  ms = Sys_Milliseconds();
#ifndef __WASM__
  if ( framecount == cls.framecount ) {
		if ( next_frametime && ms - next_frametime < 0 ) {
			re.ThrottleBackend();
		} else {
			next_frametime = ms + 16; // limit to 60 FPS
		}
	} else {
		next_frametime = 0;
		framecount = cls.framecount;
	}
#endif

	if ( ++recursive > 2 ) {
		Com_Error( ERR_FATAL, "SCR_UpdateScreen: recursively called" );
	}
	recursive = 1;

	// If there is no VM, there are also no rendering commands issued. Stop the renderer in
	// that case.
	int in_anaglyphMode = Cvar_VariableIntegerValue("r_anaglyphMode");

	if(fromVM) {
#ifdef USE_LAZY_MEMORY
#ifdef USE_MULTIVM_CLIENT
		re.SetDvrFrame(clientScreens[cgvmi][0], clientScreens[cgvmi][1], clientScreens[cgvmi][2], clientScreens[cgvmi][3]);
#endif
#endif

		// don't switch renderer or clipmap when updated from VM
		if ( cls.glconfig.stereoEnabled || in_anaglyphMode) {
			SCR_DrawScreenField( STEREO_LEFT );
			SCR_DrawScreenField( STEREO_RIGHT );
		} else {
			SCR_DrawScreenField( STEREO_CENTER );
		}

#ifdef USE_RMLUI
    if(cls.rmlStarted)
      CL_UIContextRender();
#endif

		goto donewithupdate;
	}

	for(i = 0; i < MAX_NUM_VMS; i++) {
#ifdef USE_MULTIVM_CLIENT
    cgvmi = i;
		uivmi = i;
#endif
		if(!cgvm && !uivm) continue;

		// if we just switched from a VM, skip it for a few frames so it never times out
		// otherwise there is a time going backwards error
		//if(ms - cls.lastVidRestart <= 5) {
		//	continue;
		//}

#ifdef USE_MULTIVM_CLIENT
		// TODO: fix sounds that leak through
		// skip if we haven't received a snapshot in a while
		if(cl.serverTimes[0] - cl.snapWorlds[clientGames[cgvmi]].serverTime > 1000
			&& clientScreens[cgvmi][0] == -1) continue;
		// skip if we are in world mode, multiworld renderer calls screen refresh
		//   when the portal is visible
		if(clc.sv_mvWorld && clientScreens[cgvmi][0] == -1) {
			// limit secondary screens to 60 FPS using buffers
			if(ms - lastSubWorld[cgvmi] < 13) continue;
			lastSubWorld[cgvmi] = ms;
			// tired renderer :(
			clientScreens[cgvmi][0] =
			clientScreens[cgvmi][1] =
			clientScreens[cgvmi][2] =
			clientScreens[cgvmi][3] = 0;
		}
#endif


		if(first
#ifdef USE_MULTIVM_CLIENT
		  && clientScreens[cgvmi][0] > -1
#endif
		) {
			CL_CalculatePing(ms);
			first = qfalse;
		}

#ifdef USE_MULTIVM_CLIENT
		CM_SwitchMap(clientMaps[cgvmi]);
#ifdef USE_LAZY_MEMORY
    if(!re.SwitchWorld) {
      Com_Error(ERR_FATAL, "WARNING: Renderer compiled without multiworld support!");
    } else {
			re.SwitchWorld(worldMaps[cgvmi]);
      re.SetDvrFrame(clientScreens[cgvmi][0], clientScreens[cgvmi][1], clientScreens[cgvmi][2], clientScreens[cgvmi][3]);
    }
#endif
#endif

		// if running in stereo, we need to draw the frame twice
		if ( cls.glconfig.stereoEnabled || in_anaglyphMode) {
			SCR_DrawScreenField( STEREO_LEFT );
			SCR_DrawScreenField( STEREO_RIGHT );
		} else {
			SCR_DrawScreenField( STEREO_CENTER );
		}
		
		// the menu draws next
		if ( Key_GetCatcher( ) & KEYCATCH_UI && uivm ) {
			VM_Call( uivm, 1, UI_REFRESH, cls.realtime );
		}

#ifdef USE_MULTIVM_CLIENT
		if(clientScreens[cgvmi][0] == 0
			&& clientScreens[cgvmi][1] == 0
			&& clientScreens[cgvmi][2] == 0
			&& clientScreens[cgvmi][3] == 0
		) {
			clientScreens[cgvmi][0] =
			clientScreens[cgvmi][1] =
			clientScreens[cgvmi][2] =
			clientScreens[cgvmi][3] = -1;
		}
#endif
#ifdef USE_RMLUI
    if(cls.rmlStarted)
      CL_UIContextRender();
#endif
	}

#ifdef USE_MULTIVM_CLIENT
#ifdef USE_LAZY_MEMORY
#if 0
  for(i = 0; i < MAX_NUM_VMS; i++) {
    if(cgvmWorlds[i]) continue; // already drew, looking for worlds to draw, not games
    if(clientWorlds[i] == -1) continue;
    if(!re.SwitchWorld) {
      Com_Error(ERR_FATAL, "WARNING: Renderer compiled without multiworld support!");
    } else {
      re.BeginFrame( STEREO_CENTER );
  		re.SwitchWorld(worldMaps[i]);
      //re.SetDvrFrame(clientScreens[i][0], clientScreens[i][1], clientScreens[i][2], clientScreens[i][3]);
      /* q3dm0
      views[i].vieworg[0] = -1148;
      views[i].vieworg[1] = -974;
      views[i].vieworg[2] = 50;
      */
      int prevLock = Cvar_VariableIntegerValue("r_lockpvs");
      if(!viewsUpdated[i]) {
        Cvar_Set("r_lockpvs", "1");
      }
      // 480 -352 88
      views[i].vieworg[0] = 0;
      views[i].vieworg[1] = 0;
      views[i].vieworg[2] = 0;
      /*
      */
      /*
      views[i].vieworg[0] = 480;
      views[i].vieworg[1] = -352;
      views[i].vieworg[2] = 108;
      */
      views[i].viewaxis[0][1] = -1;
      views[i].viewaxis[1][0] = 1;
      views[i].viewaxis[2][2] = 1;
      views[i].fov_x = 100;
    	views[i].fov_y = 78;
    	views[i].x = 0;
    	views[i].y = 0;
    	views[i].width = cls.glconfig.vidWidth;
    	views[i].height = cls.glconfig.vidHeight;
    	views[i].time = Sys_Milliseconds();
      re.RenderScene(&views[i]);
      if(viewsUpdated[i]) {
        viewsUpdated[i] = qfalse;
      }
      Cvar_Set("r_lockpvs", va("%i", prevLock));
    }
  }
#endif
#endif
#endif

donewithupdate:

#ifdef USE_MULTIVM_CLIENT
  cgvmi = clc.currentView;
	uivmi = 0;
  CM_SwitchMap(clientMaps[cgvmi]);
#ifdef USE_LAZY_MEMORY
	re.SwitchWorld(worldMaps[cgvmi]);
	re.SetDvrFrame(0, 0, 1, 1);
#endif
#endif

#ifdef USE_LNBITS
	int igs = clientGames[cgvmi];
	if((cl.snap.ps.pm_type == PM_INTERMISSION
		|| (cls.state == CA_CONNECTING || cls.state == CA_CHALLENGING))
		&& cl_lnInvoice->string[0]) {
		SCR_DrawQRCode();
	}
#endif

#ifdef USE_MULTIVM_CLIENT
	if(cl_mvHighlight && cl_mvHighlight->integer)
	 SCR_DrawCurrentView();
#endif

#ifndef USE_NO_CONSOLE
	// console draws next
	Con_DrawConsole ();
#endif

  SCR_DrawFPS(ms);
  if(cl_lagometer->integer && cls.state == CA_ACTIVE && !clc.demoplaying)
    SCR_DrawLagometer();

	// debug graph can be drawn on top of anything
	if ( cl_debuggraph->integer || cl_timegraph->integer || cl_debugMove->integer ) {
		SCR_DrawDebugGraph ();
	}

	if ( com_speeds->integer ) {
		re.EndFrame( &time_frontend, &time_backend );
	} else {
		re.EndFrame( NULL, NULL );
	}

	recursive = 0;
}
