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

#include "../client/client.h"
#include "../renderercommon/tr_public.h"
#include "./sys_glw.h"
#include "../qcommon/q_shared.h"
#include "../client/snd_local.h"

qboolean snd_inited = qfalse;

extern cvar_t *s_khz;
cvar_t *s_sdlBits;
cvar_t *s_sdlChannels;
cvar_t *s_sdlDevSamps;
cvar_t *s_sdlMixSamps;

/* The audio callback. All the magic happens here. */
static int dmapos = 0;
static int dmasize = 0;

static SDL_AudioDeviceID sdlPlaybackDevice;

// TODO: krunker.io supports VOIP
//#define USE_SDL_AUDIO_CAPTURE

#ifdef USE_SDL_AUDIO_CAPTURE
static SDL_AudioDeviceID sdlCaptureDevice;
static cvar_t *s_sdlCapture;
static float sdlMasterGain = 1.0f;
#endif


typedef enum {
RSERR_OK,
RSERR_INVALID_FULLSCREEN,
RSERR_INVALID_MODE,
RSERR_FATAL_ERROR,
RSERR_UNKNOWN
} rserr_t;

glwstate_t glw_state;

SDL_Window *SDL_window = NULL;
void *SDL_glContext = NULL;

cvar_t *r_stereoEnabled;
cvar_t *in_nograb;

void SDL_LockAudioDevice(SDL_AudioDeviceID dev) { }

void SDL_UnlockAudioDevice(SDL_AudioDeviceID dev) { }

void SDL_QuitSubSystem(uint32_t flags) { }

int SDL_SetRelativeMouseMode(qboolean enabled) { return 0; }

void SDL_GL_SwapWindow(void *window) {
  // this probably prevents that flashing when changing mods
}


const char *SDL_GetCurrentAudioDriver(void) {
  return "wasm";
}


int SDL_GL_SetSwapInterval(int interval) {
  // set values for request animation frame?
  return 0;
}



__attribute__((import_module("INPUT"), import_name("SDL_OpenAudioDevice")))
int SDL_OpenAudioDevice(const char *device, int iscapture,
                    const SDL_AudioSpec * desired, SDL_AudioSpec * obtained,
                    int allowed_changes);

__attribute__((import_module("INPUT"), import_name("SDL_PauseAudioDevice")))
void SDL_PauseAudioDevice(int dev, int pause_on);

__attribute__((import_module("INPUT"), import_name("SDL_CloseAudioDevice")))
void SDL_CloseAudioDevice(int dev);

/*
===============
GLimp_Shutdown
===============
*/




/*
===============
GLimp_LogComment
===============
*/
void GLimp_LogComment( char *comment )
{
}


__attribute__((import_module("INPUT"), import_name("GL_GetDrawableSize")))
extern void  GL_GetDrawableSize(int *w, int *h);
__attribute__((import_module("INPUT"), import_name("GLimp_StartDriverAndSetMode")))
rserr_t GLimp_StartDriverAndSetMode(int mode, const char *modeFS, qboolean fullscreen, qboolean fallback);
__attribute__((import_module("INPUT"), import_name("GLimp_Shutdown")))
void GLimp_Shutdown( qboolean unloadDLL );


/*
===============
GLimp_Init

This routine is responsible for initializing the OS specific portions
of OpenGL
===============
*/
void GLimp_Init( glconfig_t *config )
{
  rserr_t err;

#if 0
  InitSig();
#endif

  Com_DPrintf( "GLimp_Init()\n" );

  glw_state.config = config; // feedback renderer configuration

  in_nograb = Cvar_Get( "in_nograb", "0", CVAR_ARCHIVE );

  r_allowSoftwareGL = Cvar_Get( "r_allowSoftwareGL", "0", CVAR_LATCH );

  r_swapInterval = Cvar_Get( "r_swapInterval", "0", CVAR_ARCHIVE | CVAR_LATCH );
  r_stereoEnabled = Cvar_Get( "r_stereoEnabled", "0", CVAR_ARCHIVE | CVAR_LATCH );

  // Create the window and set up the context
  err = GLimp_StartDriverAndSetMode( r_mode->integer, r_modeFullscreen->string, r_fullscreen->integer, qfalse );
  if ( err != RSERR_OK )
  {
    if ( err == RSERR_FATAL_ERROR )
    {
      Com_Error( ERR_FATAL, "GLimp_Init() - could not load OpenGL subsystem" );
      return;
    }

    // instead of changing r_mode, which is just the default resolution,
    //   we try a different opengl version
    Com_Printf( "Setting \\r_mode %d failed, falling back on \\r_mode %d\n", r_mode->integer, 3 );
    if ( GLimp_StartDriverAndSetMode( r_mode->integer, "", r_fullscreen->integer, qtrue ) != RSERR_OK )
    {
      // Nothing worked, give up
      Com_Error( ERR_FATAL, "GLimp_Init() - could not load OpenGL subsystem" );
      return;
    }
  }

  GL_GetDrawableSize( &config->vidWidth, &config->vidHeight );

  // These values force the UI to disable driver selection
  config->driverType = GLDRV_ICD;
  config->hardwareType = GLHW_GENERIC;

  Key_ClearStates();

  // This depends on SDL_INIT_VIDEO, hence having it here
  IN_Init();
}


/*
===============
GLimp_EndFrame

Responsible for doing a swapbuffers
===============
*/
void GLimp_EndFrame( void )
{
  // don't flip if drawing to front buffer
  if ( Q_stricmp( cl_drawBuffer->string, "GL_FRONT" ) != 0 )
  {
    SDL_GL_SwapWindow( SDL_window );
  }
}


void GLimp_InitGamma( glconfig_t *config )
{
}


void GLimp_SetGamma( unsigned char red[256], unsigned char green[256], unsigned char blue[256] )
{
}


/*
===============
Sys_SetClipboardBitmap
===============
*/
void Sys_SetClipboardBitmap( const byte *bitmap, int length )
{

}


/*
===============
SNDDMA_AudioCallback
===============
*/
static void SNDDMA_AudioCallback(void *userdata, uint8_t *stream, int len)
{
	int pos = (dmapos * (dma.samplebits/8));
	if (pos >= dmasize)
		dmapos = pos = 0;

	if (!snd_inited)  /* shouldn't happen, but just in case... */
	{
		memset(stream, '\0', len);
		return;
	}
	else
	{
		int tobufend = dmasize - pos;  /* bytes to buffer's end. */
		int len1 = len;
		int len2 = 0;

		if (len1 > tobufend)
		{
			len1 = tobufend;
			len2 = len - len1;
		}
		memcpy(stream, dma.buffer + pos, len1);
		if (len2 <= 0)
			dmapos += (len1 / (dma.samplebits/8));
		else  /* wraparound? */
		{
			memcpy(stream+len1, dma.buffer, len2);
			dmapos = (len2 / (dma.samplebits/8));
		}
	}

	if (dmapos >= dmasize)
		dmapos = 0;

#ifdef USE_SDL_AUDIO_CAPTURE
	if (sdlMasterGain != 1.0f)
	{
		int i;
		if (dma.isfloat && (dma.samplebits == 32))
		{
			float *ptr = (float *) stream;
			len /= sizeof (*ptr);
			for (i = 0; i < len; i++, ptr++)
			{
				*ptr *= sdlMasterGain;
			}
		}
		else if (dma.samplebits == 16)
		{
			int16_t *ptr = (int16_t *) stream;
			len /= sizeof (*ptr);
			for (i = 0; i < len; i++, ptr++)
			{
				*ptr = (int16_t) (((float) *ptr) * sdlMasterGain);
			}
		}
		else if (dma.samplebits == 8)
		{
			uint8_t *ptr = (uint8_t *) stream;
			len /= sizeof (*ptr);
			for (i = 0; i < len; i++, ptr++)
			{
				*ptr = (uint8_t) (((float) *ptr) * sdlMasterGain);
			}
		}
	}
#endif
}

static const struct
{
	uint16_t	enumFormat;
	const char	*stringFormat;
} formatToStringTable[ ] =
{
	{ AUDIO_U8,     "AUDIO_U8" },
	{ AUDIO_S8,     "AUDIO_S8" },
	{ AUDIO_U16LSB, "AUDIO_U16LSB" },
	{ AUDIO_S16LSB, "AUDIO_S16LSB" },
	{ AUDIO_U16MSB, "AUDIO_U16MSB" },
	{ AUDIO_S16MSB, "AUDIO_S16MSB" },
	{ AUDIO_F32LSB, "AUDIO_F32LSB" },
	{ AUDIO_F32MSB, "AUDIO_F32MSB" }
};

static int formatToStringTableSize = ARRAY_LEN( formatToStringTable );

/*
===============
SNDDMA_PrintAudiospec
===============
*/
static void SNDDMA_PrintAudiospec(const char *str, const SDL_AudioSpec *spec)
{
	const char *fmt = NULL;
	int i;

	Com_Printf( "%s:\n", str );

	for ( i = 0; i < formatToStringTableSize; i++ ) {
		if( spec->format == formatToStringTable[ i ].enumFormat ) {
			fmt = formatToStringTable[ i ].stringFormat;
		}
	}

	if ( fmt ) {
		Com_Printf( "  Format:   %s\n", fmt );
	} else {
		Com_Printf( "  Format:   " S_COLOR_RED "UNKNOWN\n");
	}

	Com_Printf( "  Freq:     %d\n", (int) spec->freq );
	Com_Printf( "  Samples:  %d\n", (int) spec->samples );
	Com_Printf( "  Channels: %d\n", (int) spec->channels );
}


static int SNDDMA_KHzToHz( int khz )
{
	switch ( khz )
	{
		default:
		case 22: return 22050;
		case 48: return 48000;
		case 44: return 44100;
		case 11: return 11025;
	}
}


/*
===============
SNDDMA_Init
===============
*/
qboolean SNDDMA_Init( void )
{
	SDL_AudioSpec desired;
	SDL_AudioSpec obtained;
	int tmp;

	if ( snd_inited )
		return qtrue;

	//if ( !s_sdlBits )
	{
		s_sdlBits = Cvar_Get( "s_sdlBits", "16", CVAR_ARCHIVE_ND | CVAR_LATCH );
		Cvar_CheckRange( s_sdlBits, "8", "16", CV_INTEGER );

		s_sdlChannels = Cvar_Get( "s_sdlChannels", "2", CVAR_ARCHIVE_ND | CVAR_LATCH );
		Cvar_CheckRange( s_sdlChannels, "1", "2", CV_INTEGER );

		s_sdlDevSamps = Cvar_Get( "s_sdlDevSamps", "0", CVAR_ARCHIVE_ND | CVAR_LATCH );
		s_sdlMixSamps = Cvar_Get( "s_sdlMixSamps", "0", CVAR_ARCHIVE_ND | CVAR_LATCH );
	}

	Com_Printf( "SDL_Init( SDL_INIT_AUDIO )... " );

	if ( SDL_Init( SDL_INIT_AUDIO ) != 0 )
	{
		return qfalse;
	}

	Com_Printf( "OK\n" );

	Com_Printf( "SDL audio driver is \"%s\".\n", SDL_GetCurrentAudioDriver() );

	memset( &desired, '\0', sizeof (desired) );
	memset( &obtained, '\0', sizeof (obtained) );

	desired.freq = SNDDMA_KHzToHz( s_khz->integer );
	if ( desired.freq == 0 )
		desired.freq = 22050;

	tmp = s_sdlBits->integer;
	if ( tmp < 16 )
		tmp = 8;

	desired.format = ((tmp == 16) ? AUDIO_S16SYS : AUDIO_U8);

	// I dunno if this is the best idea, but I'll give it a try...
	//  should probably check a cvar for this...
	if ( s_sdlDevSamps->integer )
		desired.samples = s_sdlDevSamps->value;
	else
	{
		// just pick a sane default.
		if (desired.freq <= 11025)
			desired.samples = 256;
		else if (desired.freq <= 22050)
			desired.samples = 512;
		else if (desired.freq <= 44100)
			desired.samples = 1024;
		else
			desired.samples = 2048;  // (*shrug*)
	}

	desired.channels = s_sdlChannels->integer;
	desired.callback = SNDDMA_AudioCallback;

	sdlPlaybackDevice = SDL_OpenAudioDevice( NULL, qfalse, &desired, &obtained, SDL_AUDIO_ALLOW_ANY_CHANGE );
	if ( sdlPlaybackDevice == 0 )
	{
		SDL_QuitSubSystem( SDL_INIT_AUDIO );
		return qfalse;
	}

	SNDDMA_PrintAudiospec( "SDL_AudioSpec", &obtained );

	// dma.samples needs to be big, or id's mixer will just refuse to
	//  work at all; we need to keep it significantly bigger than the
	//  amount of SDL callback samples, and just copy a little each time
	//  the callback runs.
	// 32768 is what the OSS driver filled in here on my system. I don't
	//  know if it's a good value overall, but at least we know it's
	//  reasonable...this is why I let the user override.
	tmp = s_sdlMixSamps->integer;
	if ( !tmp )
		tmp = (obtained.samples * obtained.channels) * 10;

	// samples must be divisible by number of channels
	tmp -= tmp % obtained.channels;
	// round up to next power of 2
	tmp = log2pad( tmp, 1 );

	dmapos = 0;
	dma.samplebits = SDL_AUDIO_BITSIZE( obtained.format );
	dma.isfloat = SDL_AUDIO_ISFLOAT( obtained.format );
	dma.channels = obtained.channels;
	dma.samples = tmp;
	dma.fullsamples = dma.samples / dma.channels;
	dma.submission_chunk = 1;
	dma.speed = obtained.freq;
	dmasize = (dma.samples * (dma.samplebits/8));
	dma.buffer = calloc(1, dmasize);

#ifdef USE_SDL_AUDIO_CAPTURE
	// !!! FIXME: some of these SDL_OpenAudioDevice() values should be cvars.
	s_sdlCapture = Cvar_Get( "s_sdlCapture", "1", CVAR_ARCHIVE | CVAR_LATCH );
	// !!! FIXME: pulseaudio capture records audio the entire time the program is running. https://bugzilla.libsdl.org/show_bug.cgi?id=4087
	if (Q_stricmp(SDL_GetCurrentAudioDriver(), "pulseaudio") == 0)
	{
		Com_Printf("SDL audio capture support disabled for pulseaudio (https://bugzilla.libsdl.org/show_bug.cgi?id=4087)\n");
	}
	else if (!s_sdlCapture->integer)
	{
		Com_Printf("SDL audio capture support disabled by user ('+set s_sdlCapture 1' to enable)\n");
	}
#if USE_MUMBLE
	else if (cl_useMumble->integer)
	{
		Com_Printf("SDL audio capture support disabled for Mumble support\n");
	}
#endif
	else
	{
		/* !!! FIXME: list available devices and let cvar specify one, like OpenAL does */
		SDL_AudioSpec spec;
		SDL_zero(spec);
		spec.freq = 48000;
		spec.format = AUDIO_S16SYS;
		spec.channels = 1;
		spec.samples = VOIP_MAX_PACKET_SAMPLES * 4;
		sdlCaptureDevice = SDL_OpenAudioDevice(NULL, SDL_TRUE, &spec, NULL, 0);
		Com_Printf( "SDL capture device %s.\n",
				    (sdlCaptureDevice == 0) ? "failed to open" : "opened");
	}

	sdlMasterGain = 1.0f;
#endif

	Com_Printf("Starting SDL audio callback...\n");
	SDL_PauseAudioDevice(sdlPlaybackDevice, 0);  // start callback.
	// don't unpause the capture device; we'll do that in StartCapture.

	Com_Printf("SDL audio initialized.\n");
	snd_inited = qtrue;
	return qtrue;
}


/*
===============
SNDDMA_GetDMAPos
===============
*/
int SNDDMA_GetDMAPos( void )
{
	return dmapos;
}


/*
===============
SNDDMA_Shutdown
===============
*/
void SNDDMA_Shutdown( void )
{
	if (sdlPlaybackDevice != 0)
	{
		Com_Printf("Closing SDL audio playback device...\n");
		SDL_CloseAudioDevice(sdlPlaybackDevice);
		Com_Printf("SDL audio playback device closed.\n");
		sdlPlaybackDevice = 0;
	}

#ifdef USE_SDL_AUDIO_CAPTURE
	if (sdlCaptureDevice)
	{
		Com_Printf("Closing SDL audio capture device...\n");
		SDL_CloseAudioDevice(sdlCaptureDevice);
		Com_Printf("SDL audio capture device closed.\n");
		sdlCaptureDevice = 0;
	}
#endif

	SDL_QuitSubSystem(SDL_INIT_AUDIO);
	free(dma.buffer);
	dma.buffer = NULL;
	dmapos = dmasize = 0;
	snd_inited = qfalse;
	Com_Printf("SDL audio shut down.\n");
}


/*
===============
SNDDMA_Submit

Send sound to device if buffer isn't really the dma buffer
===============
*/
void SNDDMA_Submit( void )
{
	SDL_UnlockAudioDevice( sdlPlaybackDevice );
}


/*
===============
SNDDMA_BeginPainting
===============
*/
void SNDDMA_BeginPainting( void )
{
	SDL_LockAudioDevice( sdlPlaybackDevice );
}


#ifdef USE_VOIP
void SNDDMA_StartCapture(void)
{
#ifdef USE_SDL_AUDIO_CAPTURE
	if (sdlCaptureDevice)
	{
		SDL_ClearQueuedAudio(sdlCaptureDevice);
		SDL_PauseAudioDevice(sdlCaptureDevice, 0);
	}
#endif
}


int SNDDMA_AvailableCaptureSamples(void)
{
#ifdef USE_SDL_AUDIO_CAPTURE
	// divided by 2 to convert from bytes to (mono16) samples.
	return sdlCaptureDevice ? (SDL_GetQueuedAudioSize(sdlCaptureDevice) / 2) : 0;
#else
	return 0;
#endif
}


void SNDDMA_Capture(int samples, byte *data)
{
#ifdef USE_SDL_AUDIO_CAPTURE
	// multiplied by 2 to convert from (mono16) samples to bytes.
	if (sdlCaptureDevice)
	{
		SDL_DequeueAudio(sdlCaptureDevice, data, samples * 2);
	}
	else
#endif
	{
		SDL_memset(data, '\0', samples * 2);
	}
}

void SNDDMA_StopCapture(void)
{
#ifdef USE_SDL_AUDIO_CAPTURE
	if (sdlCaptureDevice)
	{
		SDL_PauseAudioDevice(sdlCaptureDevice, 1);
	}
#endif
}

void SNDDMA_MasterGain( float val )
{
#ifdef USE_SDL_AUDIO_CAPTURE
	sdlMasterGain = val;
#endif
}
#endif
