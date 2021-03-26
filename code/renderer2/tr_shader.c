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
#include "tr_local.h"

#include "tr_dsa.h"

// tr_shader.c -- this file deals with the parsing and definition of shaders

static char *s_shaderText;

static const char *s_extensionOffset;
static int s_extendedShader;

// the shader is parsed into these global variables, then copied into
// dynamically allocated memory if it is valid.
static	shaderStage_t	stages[MAX_SHADER_STAGES];
static	shader_t		shader;
static	texModInfo_t	texMods[MAX_SHADER_STAGES][TR_MAX_TEXMODS];

#define FILE_HASH_SIZE		1024
static	shader_t*		hashTable[FILE_HASH_SIZE];

#define MAX_SHADERTEXT_HASH		2048
static char **shaderTextHashTable[MAX_SHADERTEXT_HASH];

static qboolean mapShaders;

/*
================
return a hash value for the filename
================
*/
#ifdef __GNUCC__
  #warning TODO: check if long is ok here 
#endif

#define generateHashValue Com_GenerateHashValue

#ifdef USE_LAZY_LOAD
void R_RemapShaderInternal(const char *shaderName, const char *newShaderName, const char *timeOffset, int index) {
#else
void R_RemapShader(const char *shaderName, const char *newShaderName, const char *timeOffset) {
#endif
;
	char		strippedName[MAX_QPATH];
	int			hash;
	shader_t	*sh, *sh2;
	qhandle_t	h;
  qboolean  wasMapping = mapShaders;

  mapShaders = qfalse;
#ifdef USE_LAZY_LOAD
  sh = R_FindDefaultShaderByName( shaderName );
  if (sh == NULL) 
#endif
  {
	   sh = R_FindShaderByName( shaderName );
  }
	if (sh == NULL || sh == tr.defaultShader) {
#ifdef USE_LAZY_LOAD
		h = RE_RegisterShaderLightMap(shaderName, index);
#else
    h = RE_RegisterShaderLightMap(shaderName, 0);
#endif
		sh = R_GetShaderByHandle(h);
	}
	if (sh == NULL || sh == tr.defaultShader) {
		ri.Printf( PRINT_WARNING, "WARNING: R_RemapShader: shader %s not found\n", shaderName );
		return;
	}

  mapShaders = wasMapping;
	sh2 = R_FindShaderByName( newShaderName );
  if (sh2 == NULL || sh2 == tr.defaultShader || mapShaders) {
#ifdef USE_LAZY_LOAD
		h = RE_RegisterShaderLightMap(newShaderName, index);
#else
    h = RE_RegisterShaderLightMap(newShaderName, 0);
#endif
		sh2 = R_GetShaderByHandle(h);
	}

	if (sh2 == NULL || sh2 == tr.defaultShader) {
		ri.Printf( PRINT_WARNING, "WARNING: R_RemapShader: new shader %s not found\n", newShaderName );
		return;
	}

	// remap all the shaders with the given name
	// even tho they might have different lightmaps
	COM_StripExtension(shaderName, strippedName, sizeof(strippedName));
	hash = generateHashValue(strippedName, FILE_HASH_SIZE);
	for (sh = hashTable[hash]; sh; sh = sh->next) {
		if (Q_stricmp(sh->name, strippedName) == 0
#ifdef USE_LAZY_LOAD
      && (index == 0 || sh->lightmapIndex == index) 
#endif
    ) {
			if (sh != sh2) {
				sh->remappedShader = sh2;
			} else {
				sh->remappedShader = NULL;
			}
		}
	}

	if (timeOffset) {
		sh2->timeOffset = Q_atof( timeOffset );
  }
}


#ifdef USE_LAZY_LOAD
void R_RemapShader(const char *shaderName, const char *newShaderName, const char *timeOffset)
{
  // don't fuck with my console, e+ does this
  if(Q_stristr(newShaderName, "empty")) {
    if(Q_stristr(shaderName, "console") || Q_stristr(shaderName, "white")) {
      return;
    }
  }
  Com_Printf("Remapping shader: %s -> %s\n", shaderName, newShaderName);
  R_RemapShaderInternal(shaderName, newShaderName, timeOffset, 0);
}
#endif


/*
===============
ParseVector
===============
*/
static qboolean ParseVector( const char **text, int count, float *v ) {
	char	*token;
	int		i;

	// FIXME: spaces are currently required after parens, should change parseext...
	token = COM_ParseExt( text, qfalse );
	if ( strcmp( token, "(" ) ) {
		ri.Printf( PRINT_WARNING, "WARNING: missing parenthesis in shader '%s'\n", shader.name );
		return qfalse;
	}

	for ( i = 0 ; i < count ; i++ ) {
		token = COM_ParseExt( text, qfalse );
		if ( !token[0] ) {
			ri.Printf( PRINT_WARNING, "WARNING: missing vector element in shader '%s'\n", shader.name );
			return qfalse;
		}
		v[i] = Q_atof( token );
	}

	token = COM_ParseExt( text, qfalse );
	if ( strcmp( token, ")" ) ) {
		ri.Printf( PRINT_WARNING, "WARNING: missing parenthesis in shader '%s'\n", shader.name );
		return qfalse;
	}

	return qtrue;
}


/*
===============
NameToAFunc
===============
*/
static unsigned NameToAFunc( const char *funcname )
{	
	if ( !Q_stricmp( funcname, "GT0" ) )
	{
		return GLS_ATEST_GT_0;
	}
	else if ( !Q_stricmp( funcname, "LT128" ) )
	{
		return GLS_ATEST_LT_80;
	}
	else if ( !Q_stricmp( funcname, "GE128" ) )
	{
		return GLS_ATEST_GE_80;
	}

	ri.Printf( PRINT_WARNING, "WARNING: invalid alphaFunc name '%s' in shader '%s'\n", funcname, shader.name );
	return 0;
}


/*
===============
NameToSrcBlendMode
===============
*/
static int NameToSrcBlendMode( const char *name )
{
	if ( !Q_stricmp( name, "GL_ONE" ) )
	{
		return GLS_SRCBLEND_ONE;
	}
	else if ( !Q_stricmp( name, "GL_ZERO" ) )
	{
		return GLS_SRCBLEND_ZERO;
	}
	else if ( !Q_stricmp( name, "GL_DST_COLOR" ) )
	{
		return GLS_SRCBLEND_DST_COLOR;
	}
	else if ( !Q_stricmp( name, "GL_ONE_MINUS_DST_COLOR" ) )
	{
		return GLS_SRCBLEND_ONE_MINUS_DST_COLOR;
	}
	else if ( !Q_stricmp( name, "GL_SRC_ALPHA" ) )
	{
		return GLS_SRCBLEND_SRC_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_ONE_MINUS_SRC_ALPHA" ) )
	{
		return GLS_SRCBLEND_ONE_MINUS_SRC_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_DST_ALPHA" ) )
	{
		if (r_ignoreDstAlpha->integer)
			return GLS_SRCBLEND_ONE;

		return GLS_SRCBLEND_DST_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_ONE_MINUS_DST_ALPHA" ) )
	{
		if (r_ignoreDstAlpha->integer)
			return GLS_SRCBLEND_ZERO;

		return GLS_SRCBLEND_ONE_MINUS_DST_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_SRC_ALPHA_SATURATE" ) )
	{
		return GLS_SRCBLEND_ALPHA_SATURATE;
	}

	ri.Printf( PRINT_WARNING, "WARNING: unknown blend mode '%s' in shader '%s', substituting GL_ONE\n", name, shader.name );
	return GLS_SRCBLEND_ONE;
}

/*
===============
NameToDstBlendMode
===============
*/
static int NameToDstBlendMode( const char *name )
{
	if ( !Q_stricmp( name, "GL_ONE" ) )
	{
		return GLS_DSTBLEND_ONE;
	}
	else if ( !Q_stricmp( name, "GL_ZERO" ) )
	{
		return GLS_DSTBLEND_ZERO;
	}
	else if ( !Q_stricmp( name, "GL_SRC_ALPHA" ) )
	{
		return GLS_DSTBLEND_SRC_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_ONE_MINUS_SRC_ALPHA" ) )
	{
		return GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_DST_ALPHA" ) )
	{
		if (r_ignoreDstAlpha->integer)
			return GLS_DSTBLEND_ONE;

		return GLS_DSTBLEND_DST_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_ONE_MINUS_DST_ALPHA" ) )
	{
		if (r_ignoreDstAlpha->integer)
			return GLS_DSTBLEND_ZERO;

		return GLS_DSTBLEND_ONE_MINUS_DST_ALPHA;
	}
	else if ( !Q_stricmp( name, "GL_SRC_COLOR" ) )
	{
		return GLS_DSTBLEND_SRC_COLOR;
	}
	else if ( !Q_stricmp( name, "GL_ONE_MINUS_SRC_COLOR" ) )
	{
		return GLS_DSTBLEND_ONE_MINUS_SRC_COLOR;
	}

	ri.Printf( PRINT_WARNING, "WARNING: unknown blend mode '%s' in shader '%s', substituting GL_ONE\n", name, shader.name );
	return GLS_DSTBLEND_ONE;
}

/*
===============
NameToGenFunc
===============
*/
static genFunc_t NameToGenFunc( const char *funcname )
{
	if ( !Q_stricmp( funcname, "sin" ) )
	{
		return GF_SIN;
	}
	else if ( !Q_stricmp( funcname, "square" ) )
	{
		return GF_SQUARE;
	}
	else if ( !Q_stricmp( funcname, "triangle" ) )
	{
		return GF_TRIANGLE;
	}
	else if ( !Q_stricmp( funcname, "sawtooth" ) )
	{
		return GF_SAWTOOTH;
	}
	else if ( !Q_stricmp( funcname, "inversesawtooth" ) )
	{
		return GF_INVERSE_SAWTOOTH;
	}
	else if ( !Q_stricmp( funcname, "noise" ) )
	{
		return GF_NOISE;
	}

	ri.Printf( PRINT_WARNING, "WARNING: invalid genfunc name '%s' in shader '%s'\n", funcname, shader.name );
	return GF_SIN;
}


/*
===================
ParseWaveForm
===================
*/
static void ParseWaveForm( const char **text, waveForm_t *wave )
{
	char *token;

	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 )
	{
		ri.Printf( PRINT_WARNING, "WARNING: missing waveform parm in shader '%s'\n", shader.name );
		return;
	}
	wave->func = NameToGenFunc( token );

	// BASE, AMP, PHASE, FREQ
	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 )
	{
		ri.Printf( PRINT_WARNING, "WARNING: missing waveform parm in shader '%s'\n", shader.name );
		return;
	}
	wave->base = Q_atof( token );

	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 )
	{
		ri.Printf( PRINT_WARNING, "WARNING: missing waveform parm in shader '%s'\n", shader.name );
		return;
	}
	wave->amplitude = Q_atof( token );

	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 )
	{
		ri.Printf( PRINT_WARNING, "WARNING: missing waveform parm in shader '%s'\n", shader.name );
		return;
	}
	wave->phase = Q_atof( token );

	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 )
	{
		ri.Printf( PRINT_WARNING, "WARNING: missing waveform parm in shader '%s'\n", shader.name );
		return;
	}
	wave->frequency = Q_atof( token );
}


/*
===================
ParseTexMod
===================
*/
static void ParseTexMod( const char *_text, shaderStage_t *stage )
{
	const char *token;
	const char **text = &_text;
	texModInfo_t *tmi;

	if ( stage->bundle[0].numTexMods == TR_MAX_TEXMODS ) {
		ri.Error( ERR_DROP, "ERROR: too many tcMod stages in shader '%s'", shader.name );
		return;
	}

	tmi = &stage->bundle[0].texMods[stage->bundle[0].numTexMods];
	stage->bundle[0].numTexMods++;

	token = COM_ParseExt( text, qfalse );

	//
	// turb
	//
	if ( !Q_stricmp( token, "turb" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing tcMod turb parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.base = Q_atof( token );
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing tcMod turb in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.amplitude = Q_atof( token );
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing tcMod turb in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.phase = Q_atof( token );
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing tcMod turb in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.frequency = Q_atof( token );

		tmi->type = TMOD_TURBULENT;
	}
	//
	// scale
	//
	else if ( !Q_stricmp( token, "scale" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing scale parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->scale[0] = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing scale parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->scale[1] = Q_atof( token );
		tmi->type = TMOD_SCALE;
	}
	//
	// scroll
	//
	else if ( !Q_stricmp( token, "scroll" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing scale scroll parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->scroll[0] = Q_atof( token );
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing scale scroll parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->scroll[1] = Q_atof( token );
		tmi->type = TMOD_SCROLL;
	}
	//
	// stretch
	//
	else if ( !Q_stricmp( token, "stretch" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing stretch parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.func = NameToGenFunc( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing stretch parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.base = atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing stretch parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.amplitude = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing stretch parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.phase = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing stretch parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->wave.frequency = Q_atof( token );
		
		tmi->type = TMOD_STRETCH;
	}
	//
	// transform
	//
	else if ( !Q_stricmp( token, "transform" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing transform parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->matrix[0][0] = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing transform parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->matrix[0][1] = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing transform parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->matrix[1][0] = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing transform parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->matrix[1][1] = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing transform parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->translate[0] = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing transform parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->translate[1] = Q_atof( token );

		tmi->type = TMOD_TRANSFORM;
	}
	//
	// rotate
	//
	else if ( !Q_stricmp( token, "rotate" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing tcMod rotate parms in shader '%s'\n", shader.name );
			return;
		}
		tmi->rotateSpeed = Q_atof( token );
		tmi->type = TMOD_ROTATE;
	}
	//
	// entityTranslate
	//
	else if ( !Q_stricmp( token, "entityTranslate" ) )
	{
		tmi->type = TMOD_ENTITY_TRANSLATE;
	}
	else
	{
		ri.Printf( PRINT_WARNING, "WARNING: unknown tcMod '%s' in shader '%s'\n", token, shader.name );
	}
}


/*
===================
ParseStage
===================
*/
static qboolean ParseStage( shaderStage_t *stage, const char **text )
{
	const char *token;
  char path[MAX_QPATH];
	int depthMaskBits = GLS_DEPTHMASK_TRUE, blendSrcBits = 0, blendDstBits = 0, atestBits = 0, depthFuncBits = 0;
	qboolean depthMaskExplicit = qfalse;

	stage->active = qtrue;

	while ( 1 )
	{
		token = COM_ParseExt( text, qtrue );
		if ( !token[0] )
		{
			ri.Printf( PRINT_WARNING, "WARNING: no matching '}' found\n" );
			return qfalse;
		}

		if ( token[0] == '}' )
		{
			break;
		}
		//
		// map <name>
		//
		else if ( !Q_stricmp( token, "map" ) )
		{
			token = COM_ParseExt( text, qfalse );
			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for 'map' keyword in shader '%s'\n", shader.name );
				return qfalse;
			}

			if ( !Q_stricmp( token, "$whiteimage" ) )
			{
				stage->bundle[0].image[0] = tr.whiteImage;
				continue;
			}
			else if ( !Q_stricmp( token, "$lightmap" ) )
			{
				stage->bundle[0].isLightmap = qtrue;
				if ( shader.lightmapIndex < 0 || !tr.lightmaps ) {
					stage->bundle[0].image[0] = tr.whiteImage;
				} else {
					stage->bundle[0].image[0] = tr.lightmaps[shader.lightmapIndex];
				}
				continue;
			}
			else if ( !Q_stricmp( token, "$deluxemap" ) )
			{
				if (!tr.worldDeluxeMapping)
				{
					ri.Printf( PRINT_WARNING, "WARNING: shader '%s' wants a deluxe map in a map compiled without them\n", shader.name );
					return qfalse;
				}

				stage->bundle[0].isLightmap = qtrue;
				if ( shader.lightmapIndex < 0 ) {
					stage->bundle[0].image[0] = tr.whiteImage;
				} else {
					stage->bundle[0].image[0] = tr.deluxemaps[shader.lightmapIndex];
				}
				continue;
			}
			else
			{
				imgType_t type = IMGTYPE_COLORALPHA;
				imgFlags_t flags = IMGFLAG_NONE;

				if (!shader.noMipMaps)
					flags |= IMGFLAG_MIPMAP;

				if (!shader.noPicMip)
					flags |= IMGFLAG_PICMIP;

				if (stage->type == ST_NORMALMAP || stage->type == ST_NORMALPARALLAXMAP)
				{
					type = IMGTYPE_NORMAL;
					flags |= IMGFLAG_NOLIGHTSCALE;

					if (stage->type == ST_NORMALPARALLAXMAP)
						type = IMGTYPE_NORMALHEIGHT;
				}
				else
				{
					if (r_genNormalMaps->integer)
						flags |= IMGFLAG_GENNORMALMAP;
				}

#ifdef USE_LAZY_LOAD
        if(!mapShaders && r_lazyLoad->integer == 2) {
          byte *pic;
          int len;
          R_LoadImage(token, &pic, &len, &len, &len, &len, qtrue);
        } else 
#endif
        {
          stage->bundle[0].image[0] = R_FindImageFile( token, type, flags );
        }

				if ( !stage->bundle[0].image[0] )
				{
					ri.Printf( PRINT_DEVELOPER, "WARNING: R_FindImageFile could not find '%s' in shader '%s'\n", token, shader.name );
					//return qfalse;
          stage->bundle[0].image[0] = tr.defaultImage;
				}
			}
		}
		//
		// clampmap <name>
		//
		else if ( !Q_stricmp( token, "clampmap" ) )
		{
			imgType_t type = IMGTYPE_COLORALPHA;
			imgFlags_t flags = IMGFLAG_CLAMPTOEDGE;

			token = COM_ParseExt( text, qfalse );
			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for 'clampmap' keyword in shader '%s'\n", shader.name );
				return qfalse;
			}

			if (!shader.noMipMaps)
				flags |= IMGFLAG_MIPMAP;

			if (!shader.noPicMip)
				flags |= IMGFLAG_PICMIP;

			if (stage->type == ST_NORMALMAP || stage->type == ST_NORMALPARALLAXMAP)
			{
				type = IMGTYPE_NORMAL;
				flags |= IMGFLAG_NOLIGHTSCALE;

				if (stage->type == ST_NORMALPARALLAXMAP)
					type = IMGTYPE_NORMALHEIGHT;
			}
			else
			{
				if (r_genNormalMaps->integer)
					flags |= IMGFLAG_GENNORMALMAP;
			}


#ifdef USE_LAZY_LOAD
      if(!mapShaders && r_lazyLoad->integer == 2) {
        int len;
        byte *pic;
        R_LoadImage(token, &pic, &len, &len, &len, &len, qtrue);
      } else 
#endif
      {
			  stage->bundle[0].image[0] = R_FindImageFile( token, type, flags );
      }
			if ( !stage->bundle[0].image[0] )
			{
				ri.Printf( PRINT_DEVELOPER, "WARNING: R_FindImageFile could not find '%s' in shader '%s'\n", token, shader.name );
				//return qfalse;
        stage->bundle[0].image[0] = tr.defaultImage;
			}
		}
		//
		// animMap <frequency> <image1> .... <imageN>
		//
		else if ( !Q_stricmp( token, "animMap" ) )
		{
			int	totalImages = 0;
			int maxAnimations = s_extendedShader ? MAX_IMAGE_ANIMATIONS : MAX_IMAGE_ANIMATIONS_VQ3;

			token = COM_ParseExt( text, qfalse );
			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for 'animMap' keyword in shader '%s'\n", shader.name );
				return qfalse;
			}
			stage->bundle[0].imageAnimationSpeed = Q_atof( token );

			// parse up to MAX_IMAGE_ANIMATIONS animations
			while ( 1 ) {
				int		num;

				token = COM_ParseExt( text, qfalse );
				if ( !token[0] ) {
					break;
				}
				num = stage->bundle[0].numImageAnimations;
				if ( num < maxAnimations ) {
					imgFlags_t flags = IMGFLAG_NONE;

					if (!shader.noMipMaps)
						flags |= IMGFLAG_MIPMAP;

					if (!shader.noPicMip)
						flags |= IMGFLAG_PICMIP;

#ifdef USE_LAZY_LOAD
          if(!mapShaders && r_lazyLoad->integer == 2) {
            int len;
            byte *pic;
            R_LoadImage(token, &pic, &len, &len, &len, &len, qtrue);
          } else 
#endif
          {
            stage->bundle[0].image[num] = R_FindImageFile( token, IMGTYPE_COLORALPHA, flags );
          }
					if ( !stage->bundle[0].image[num] )
					{
						ri.Printf( PRINT_DEVELOPER, "WARNING: R_FindImageFile could not find '%s' in shader '%s'\n", token, shader.name );
						//return qfalse;
            stage->bundle[0].image[num] = tr.defaultImage;
					}
					stage->bundle[0].numImageAnimations++;
				}
				totalImages++;
			}

			if ( totalImages > maxAnimations ) {
				ri.Printf( PRINT_WARNING, "WARNING: ignoring excess images for 'animMap' (found %d, max is %d) in shader '%s'\n",
					totalImages, maxAnimations, shader.name );
			}
		}
		else if ( !Q_stricmp( token, "videoMap" ) )
		{
      token = COM_ParseExt( text, qfalse );
			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for 'videoMap' keyword in shader '%s'\n", shader.name );
				return qfalse;
			}
      memcpy(&path, token, sizeof(path));
      token = COM_ParseExt( text, qfalse );
      if(token[0]) {
        stage->bundle[0].videoMapHandle = ri.CIN_PlayCinematic( &path, 0, 0, 256, 256, (CIN_loop | CIN_shader));
      } else {
        stage->bundle[0].videoMapHandle = ri.CIN_PlayCinematic( &path, 0, 0, 256, 256, (CIN_loop | CIN_silent | CIN_shader));
      }
			if (stage->bundle[0].videoMapHandle != -1) {
				stage->bundle[0].isVideoMap = qtrue;
				stage->bundle[0].image[0] = tr.scratchImage[stage->bundle[0].videoMapHandle];
			} else {
				ri.Printf( PRINT_WARNING, "WARNING: could not load '%s' for 'videoMap' keyword in shader '%s'\n", &path, shader.name );
			}
		}
		//
		// alphafunc <func>
		//
		else if ( !Q_stricmp( token, "alphaFunc" ) )
		{
			token = COM_ParseExt( text, qfalse );
			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for 'alphaFunc' keyword in shader '%s'\n", shader.name );
				return qfalse;
			}

			atestBits = NameToAFunc( token );
		}
		//
		// depthFunc <func>
		//
		else if ( !Q_stricmp( token, "depthfunc" ) )
		{
			token = COM_ParseExt( text, qfalse );

			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for 'depthfunc' keyword in shader '%s'\n", shader.name );
				return qfalse;
			}

			if ( !Q_stricmp( token, "lequal" ) )
			{
				depthFuncBits = 0;
			}
			else if ( !Q_stricmp( token, "equal" ) )
			{
				depthFuncBits = GLS_DEPTHFUNC_EQUAL;
			}
			else
			{
				ri.Printf( PRINT_WARNING, "WARNING: unknown depthfunc '%s' in shader '%s'\n", token, shader.name );
				continue;
			}
		}
		//
		// detail
		//
		else if ( !Q_stricmp( token, "detail" ) )
		{
			stage->isDetail = qtrue;
		}
		//
		// blendfunc <srcFactor> <dstFactor>
		// or blendfunc <add|filter|blend>
		//
		else if ( !Q_stricmp( token, "blendfunc" ) )
		{
			token = COM_ParseExt( text, qfalse );
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parm for blendFunc in shader '%s'\n", shader.name );
				continue;
			}
			// check for "simple" blends first
			if ( !Q_stricmp( token, "add" ) ) {
				blendSrcBits = GLS_SRCBLEND_ONE;
				blendDstBits = GLS_DSTBLEND_ONE;
			} else if ( !Q_stricmp( token, "filter" ) ) {
				blendSrcBits = GLS_SRCBLEND_DST_COLOR;
				blendDstBits = GLS_DSTBLEND_ZERO;
			} else if ( !Q_stricmp( token, "blend" ) ) {
				blendSrcBits = GLS_SRCBLEND_SRC_ALPHA;
				blendDstBits = GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA;
			} else {
				// complex double blends
				blendSrcBits = NameToSrcBlendMode( token );

				token = COM_ParseExt( text, qfalse );
				if ( token[0] == 0 )
				{
					ri.Printf( PRINT_WARNING, "WARNING: missing parm for blendFunc in shader '%s'\n", shader.name );
					continue;
				}
				blendDstBits = NameToDstBlendMode( token );
			}

			// clear depth mask for blended surfaces
			if ( !depthMaskExplicit )
			{
				depthMaskBits = 0;
			}
		}
		//
		// stage <type>
		//
		else if(!Q_stricmp(token, "stage"))
		{
			token = COM_ParseExt(text, qfalse);
			if(token[0] == 0)
			{
				ri.Printf(PRINT_WARNING, "WARNING: missing parameters for stage in shader '%s'\n", shader.name);
				continue;
			}

			if(!Q_stricmp(token, "diffuseMap"))
			{
				stage->type = ST_DIFFUSEMAP;
			}
			else if(!Q_stricmp(token, "normalMap") || !Q_stricmp(token, "bumpMap"))
			{
				stage->type = ST_NORMALMAP;
				VectorSet4(stage->normalScale, r_baseNormalX->value, r_baseNormalY->value, 1.0f, r_baseParallax->value);
			}
			else if(!Q_stricmp(token, "normalParallaxMap") || !Q_stricmp(token, "bumpParallaxMap"))
			{
				if (r_parallaxMapping->integer)
					stage->type = ST_NORMALPARALLAXMAP;
				else
					stage->type = ST_NORMALMAP;
				VectorSet4(stage->normalScale, r_baseNormalX->value, r_baseNormalY->value, 1.0f, r_baseParallax->value);
			}
			else if(!Q_stricmp(token, "specularMap"))
			{
				stage->type = ST_SPECULARMAP;
				VectorSet4(stage->specularScale, 1.0f, 1.0f, 1.0f, 1.0f);
			}
			else
			{
				ri.Printf(PRINT_WARNING, "WARNING: unknown stage parameter '%s' in shader '%s'\n", token, shader.name);
				continue;
			}
		}
		//
		// specularReflectance <value>
		//
		else if (!Q_stricmp(token, "specularreflectance"))
		{
			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for specular reflectance in shader '%s'\n", shader.name );
				continue;
			}

			if (r_pbr->integer)
			{
				// interpret specularReflectance < 0.5 as nonmetal
				stage->specularScale[1] = (atof(token) < 0.5f) ? 0.0f : 1.0f;
			}
			else
			{
				stage->specularScale[0] =
				stage->specularScale[1] =
				stage->specularScale[2] = atof( token );
			}
		}
		//
		// specularExponent <value>
		//
		else if (!Q_stricmp(token, "specularexponent"))
		{
			float exponent;

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for specular exponent in shader '%s'\n", shader.name );
				continue;
			}

			exponent = atof( token );

			if (r_pbr->integer)
				stage->specularScale[0] = 1.0f - powf(2.0f / (exponent + 2.0), 0.25);
			else
			{
				// Change shininess to gloss
				// Assumes max exponent of 8190 and min of 0, must change here if altered in lightall_fp.glsl
				exponent = CLAMP(exponent, 0.0f, 8190.0f);
				stage->specularScale[3] = (Q_log2f(exponent + 2.0f) - 1.0f) / 12.0f;
			}
		}
		//
		// gloss <value>
		//
		else if (!Q_stricmp(token, "gloss"))
		{
			float gloss;

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for gloss in shader '%s'\n", shader.name );
				continue;
			}

			gloss = atof(token);

			if (r_pbr->integer)
				stage->specularScale[0] = 1.0f - Q_exp2f(-3.0f * gloss);
			else
				stage->specularScale[3] = gloss;
		}
		//
		// roughness <value>
		//
		else if (!Q_stricmp(token, "roughness"))
		{
			float roughness;

			token = COM_ParseExt(text, qfalse);
			if (token[0] == 0)
			{
				ri.Printf(PRINT_WARNING, "WARNING: missing parameter for roughness in shader '%s'\n", shader.name);
				continue;
			}

			roughness = atof(token);

			if (r_pbr->integer)
				stage->specularScale[0] = 1.0 - roughness;
			else
			{
				if (roughness >= 0.125)
					stage->specularScale[3] = Q_log2f(1.0f / roughness) / 3.0f;
				else
					stage->specularScale[3] = 1.0f;
			}
		}
		//
		// parallaxDepth <value>
		//
		else if (!Q_stricmp(token, "parallaxdepth"))
		{
			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for parallaxDepth in shader '%s'\n", shader.name );
				continue;
			}

			stage->normalScale[3] = atof( token );
		}
		//
		// normalScale <xy>
		// or normalScale <x> <y>
		// or normalScale <x> <y> <height>
		//
		else if (!Q_stricmp(token, "normalscale"))
		{
			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for normalScale in shader '%s'\n", shader.name );
				continue;
			}

			stage->normalScale[0] = atof( token );

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				// one value, applies to X/Y
				stage->normalScale[1] = stage->normalScale[0];
				continue;
			}

			stage->normalScale[1] = atof( token );

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				// two values, no height
				continue;
			}

			stage->normalScale[3] = atof( token );
		}
		//
		// specularScale <rgb> <gloss>
		// or specularScale <metallic> <smoothness> with r_pbr 1
		// or specularScale <r> <g> <b>
		// or specularScale <r> <g> <b> <gloss>
		//
		else if (!Q_stricmp(token, "specularscale"))
		{
			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for specularScale in shader '%s'\n", shader.name );
				continue;
			}

			stage->specularScale[0] = atof( token );

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameter for specularScale in shader '%s'\n", shader.name );
				continue;
			}

			stage->specularScale[1] = atof( token );

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				if (r_pbr->integer)
				{
					// two values, metallic then smoothness
					float smoothness = stage->specularScale[1];
					stage->specularScale[1] = (stage->specularScale[0] < 0.5f) ? 0.0f : 1.0f;
					stage->specularScale[0] = smoothness;
				}
				else
				{
					// two values, rgb then gloss
					stage->specularScale[3] = stage->specularScale[1];
					stage->specularScale[1] =
					stage->specularScale[2] = stage->specularScale[0];
				}
				continue;
			}

			stage->specularScale[2] = atof( token );

			token = COM_ParseExt(text, qfalse);
			if ( token[0] == 0 )
			{
				// three values, rgb
				continue;
			}

			stage->specularScale[3] = atof( token );

		}
		//
		// rgbGen
		//
		else if ( !Q_stricmp( token, "rgbGen" ) )
		{
			token = COM_ParseExt( text, qfalse );
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameters for rgbGen in shader '%s'\n", shader.name );
				continue;
			}

			if ( !Q_stricmp( token, "wave" ) )
			{
				ParseWaveForm( text, &stage->rgbWave );
				stage->rgbGen = CGEN_WAVEFORM;
			}
			else if ( !Q_stricmp( token, "const" ) )
			{
				vec3_t	color;

				VectorClear( color );

				ParseVector( text, 3, color );
				stage->constantColor[0] = 255 * color[0];
				stage->constantColor[1] = 255 * color[1];
				stage->constantColor[2] = 255 * color[2];

				stage->rgbGen = CGEN_CONST;
			}
			else if ( !Q_stricmp( token, "identity" ) )
			{
				stage->rgbGen = CGEN_IDENTITY;
			}
			else if ( !Q_stricmp( token, "identityLighting" ) )
			{
				stage->rgbGen = CGEN_IDENTITY_LIGHTING;
			}
			else if ( !Q_stricmp( token, "entity" ) )
			{
				stage->rgbGen = CGEN_ENTITY;
			}
			else if ( !Q_stricmp( token, "oneMinusEntity" ) )
			{
				stage->rgbGen = CGEN_ONE_MINUS_ENTITY;
			}
			else if ( !Q_stricmp( token, "vertex" ) )
			{
				stage->rgbGen = CGEN_VERTEX;
				if ( stage->alphaGen == 0 ) {
					stage->alphaGen = AGEN_VERTEX;
				}
			}
			else if ( !Q_stricmp( token, "exactVertex" ) )
			{
				stage->rgbGen = CGEN_EXACT_VERTEX;
			}
			else if ( !Q_stricmp( token, "vertexLit" ) )
			{
				stage->rgbGen = CGEN_VERTEX_LIT;
				if ( stage->alphaGen == 0 ) {
					stage->alphaGen = AGEN_VERTEX;
				}
			}
			else if ( !Q_stricmp( token, "exactVertexLit" ) )
			{
				stage->rgbGen = CGEN_EXACT_VERTEX_LIT;
			}
			else if ( !Q_stricmp( token, "lightingDiffuse" ) )
			{
				stage->rgbGen = CGEN_LIGHTING_DIFFUSE;
			}
			else if ( !Q_stricmp( token, "oneMinusVertex" ) )
			{
				stage->rgbGen = CGEN_ONE_MINUS_VERTEX;
			}
			else
			{
				ri.Printf( PRINT_WARNING, "WARNING: unknown rgbGen parameter '%s' in shader '%s'\n", token, shader.name );
				continue;
			}
		}
		//
		// alphaGen
		//
		else if ( !Q_stricmp( token, "alphaGen" ) )
		{
			token = COM_ParseExt( text, qfalse );
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parameters for alphaGen in shader '%s'\n", shader.name );
				continue;
			}

			if ( !Q_stricmp( token, "wave" ) )
			{
				ParseWaveForm( text, &stage->alphaWave );
				stage->alphaGen = AGEN_WAVEFORM;
			}
			else if ( !Q_stricmp( token, "const" ) )
			{
				token = COM_ParseExt( text, qfalse );
				stage->constantColor[3] = 255 * Q_atof( token );
				stage->alphaGen = AGEN_CONST;
			}
			else if ( !Q_stricmp( token, "identity" ) )
			{
				stage->alphaGen = AGEN_IDENTITY;
			}
			else if ( !Q_stricmp( token, "entity" ) )
			{
				stage->alphaGen = AGEN_ENTITY;
			}
			else if ( !Q_stricmp( token, "oneMinusEntity" ) )
			{
				stage->alphaGen = AGEN_ONE_MINUS_ENTITY;
			}
			else if ( !Q_stricmp( token, "vertex" ) )
			{
				stage->alphaGen = AGEN_VERTEX;
			}
			else if ( !Q_stricmp( token, "lightingSpecular" ) )
			{
				stage->alphaGen = AGEN_LIGHTING_SPECULAR;
			}
			else if ( !Q_stricmp( token, "oneMinusVertex" ) )
			{
				stage->alphaGen = AGEN_ONE_MINUS_VERTEX;
			}
			else if ( !Q_stricmp( token, "portal" ) )
			{
				stage->alphaGen = AGEN_PORTAL;
				token = COM_ParseExt( text, qfalse );
				if ( token[0] == 0 )
				{
					shader.portalRange = 256;
					ri.Printf( PRINT_WARNING, "WARNING: missing range parameter for alphaGen portal in shader '%s', defaulting to 256\n", shader.name );
				}
				else
				{
					shader.portalRange = Q_atof( token );
				}
			}
			else
			{
				ri.Printf( PRINT_WARNING, "WARNING: unknown alphaGen parameter '%s' in shader '%s'\n", token, shader.name );
				continue;
			}
		}
		//
		// tcGen <function>
		//
		else if ( !Q_stricmp(token, "texgen") || !Q_stricmp( token, "tcGen" ) ) 
		{
			token = COM_ParseExt( text, qfalse );
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing texgen parm in shader '%s'\n", shader.name );
				continue;
			}

			if ( !Q_stricmp( token, "environment" ) )
			{
				const char *t = *text;
				stage->bundle[0].tcGen = TCGEN_ENVIRONMENT_MAPPED;
				token = COM_ParseExt( text, qfalse );
				if ( Q_stricmp( token, "firstPerson" ) == 0 )
				{
					//stage->bundle[0].tcGen = TCGEN_ENVIRONMENT_MAPPED_FP;
				}
				else
				{
					*text = t; // rewind
				}
			}
			else if ( !Q_stricmp( token, "lightmap" ) )
			{
				stage->bundle[0].tcGen = TCGEN_LIGHTMAP;
			}
			else if ( !Q_stricmp( token, "texture" ) || !Q_stricmp( token, "base" ) )
			{
				stage->bundle[0].tcGen = TCGEN_TEXTURE;
			}
			else if ( !Q_stricmp( token, "vector" ) )
			{
				ParseVector( text, 3, stage->bundle[0].tcGenVectors[0] );
				ParseVector( text, 3, stage->bundle[0].tcGenVectors[1] );

				stage->bundle[0].tcGen = TCGEN_VECTOR;
			}
			else 
			{
				ri.Printf( PRINT_WARNING, "WARNING: unknown texgen parm in shader '%s'\n", shader.name );
			}
		}
		//
		// tcMod <type> <...>
		//
		else if ( !Q_stricmp( token, "tcMod" ) )
		{
			char buffer[1024] = "";

			while ( 1 )
			{
				token = COM_ParseExt( text, qfalse );
				if ( token[0] == 0 )
					break;
				Q_strcat( buffer, sizeof (buffer), token );
				Q_strcat( buffer, sizeof (buffer), " " );
			}

			ParseTexMod( buffer, stage );

			continue;
		}
		//
		// depthmask
		//
		else if ( !Q_stricmp( token, "depthwrite" ) )
		{
			depthMaskBits = GLS_DEPTHMASK_TRUE;
			depthMaskExplicit = qtrue;

			continue;
		}
		else
		{
			ri.Printf( PRINT_WARNING, "WARNING: unknown parameter '%s' in shader '%s'\n", token, shader.name );
			return qfalse;
		}
	}

	//
	// if cgen isn't explicitly specified, use either identity or identitylighting
	//
	if ( stage->rgbGen == CGEN_BAD ) {
		if ( blendSrcBits == 0 ||
			blendSrcBits == GLS_SRCBLEND_ONE ||
			blendSrcBits == GLS_SRCBLEND_SRC_ALPHA ) {
			stage->rgbGen = CGEN_IDENTITY_LIGHTING;
		} else {
			stage->rgbGen = CGEN_IDENTITY;
		}
	}


	//
	// implicitly assume that a GL_ONE GL_ZERO blend mask disables blending
	//
	if ( ( blendSrcBits == GLS_SRCBLEND_ONE ) &&
		 ( blendDstBits == GLS_DSTBLEND_ZERO ) )
	{
		blendDstBits = blendSrcBits = 0;
		depthMaskBits = GLS_DEPTHMASK_TRUE;
	}

	// decide which agens we can skip
	if ( stage->alphaGen == AGEN_IDENTITY ) {
		if ( stage->rgbGen == CGEN_IDENTITY
			|| stage->rgbGen == CGEN_LIGHTING_DIFFUSE ) {
			stage->alphaGen = AGEN_SKIP;
		}
	}

	//
	// compute state bits
	//
	stage->stateBits = depthMaskBits |
		blendSrcBits | blendDstBits |
		atestBits |
		depthFuncBits;

	return qtrue;
}


/*
===============
ParseDeform

deformVertexes wave <spread> <waveform> <base> <amplitude> <phase> <frequency>
deformVertexes normal <frequency> <amplitude>
deformVertexes move <vector> <waveform> <base> <amplitude> <phase> <frequency>
deformVertexes bulge <bulgeWidth> <bulgeHeight> <bulgeSpeed>
deformVertexes projectionShadow
deformVertexes autoSprite
deformVertexes autoSprite2
deformVertexes text[0-7]
===============
*/
static void ParseDeform( const char **text ) {
	char	*token;
	deformStage_t	*ds;

	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 )
	{
		ri.Printf( PRINT_WARNING, "WARNING: missing deform parm in shader '%s'\n", shader.name );
		return;
	}

	if ( shader.numDeforms == MAX_SHADER_DEFORMS ) {
		ri.Printf( PRINT_WARNING, "WARNING: MAX_SHADER_DEFORMS in '%s'\n", shader.name );
		return;
	}

	ds = &shader.deforms[ shader.numDeforms ];
	shader.numDeforms++;

	if ( !Q_stricmp( token, "projectionShadow" ) ) {
		ds->deformation = DEFORM_PROJECTION_SHADOW;
		return;
	}

	if ( !Q_stricmp( token, "autosprite" ) ) {
		ds->deformation = DEFORM_AUTOSPRITE;
		return;
	}

	if ( !Q_stricmp( token, "autosprite2" ) ) {
		ds->deformation = DEFORM_AUTOSPRITE2;
		return;
	}

	if ( !Q_stricmpn( token, "text", 4 ) ) {
		int		n;
		
		n = token[4] - '0';
		if ( n < 0 || n > 7 ) {
			n = 0;
		}
		ds->deformation = DEFORM_TEXT0 + n;
		return;
	}

	if ( !Q_stricmp( token, "bulge" ) )	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes bulge parm in shader '%s'\n", shader.name );
			return;
		}
		ds->bulgeWidth = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes bulge parm in shader '%s'\n", shader.name );
			return;
		}
		ds->bulgeHeight = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes bulge parm in shader '%s'\n", shader.name );
			return;
		}
		ds->bulgeSpeed = Q_atof( token );

		ds->deformation = DEFORM_BULGE;
		return;
	}

	if ( !Q_stricmp( token, "wave" ) )
	{
		float f;
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes parm in shader '%s'\n", shader.name );
			return;
		}

		f = Q_atof( token );
		if ( f != 0.0f )
		{
			ds->deformationSpread = 1.0f / f;
		}
		else
		{
			ds->deformationSpread = 100.0f;
			ri.Printf( PRINT_WARNING, "WARNING: illegal div value of 0 in deformVertexes command for shader '%s'\n", shader.name );
		}

		ParseWaveForm( text, &ds->deformationWave );
		ds->deformation = DEFORM_WAVE;
		return;
	}

	if ( !Q_stricmp( token, "normal" ) )
	{
		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes parm in shader '%s'\n", shader.name );
			return;
		}
		ds->deformationWave.amplitude = Q_atof( token );

		token = COM_ParseExt( text, qfalse );
		if ( token[0] == 0 )
		{
			ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes parm in shader '%s'\n", shader.name );
			return;
		}
		ds->deformationWave.frequency = Q_atof( token );

		ds->deformation = DEFORM_NORMALS;
		return;
	}

	if ( !Q_stricmp( token, "move" ) ) {
		int		i;

		for ( i = 0 ; i < 3 ; i++ ) {
			token = COM_ParseExt( text, qfalse );
			if ( token[0] == 0 ) {
				ri.Printf( PRINT_WARNING, "WARNING: missing deformVertexes parm in shader '%s'\n", shader.name );
				return;
			}
			ds->moveVector[i] = Q_atof( token );
		}

		ParseWaveForm( text, &ds->deformationWave );
		ds->deformation = DEFORM_MOVE;
		return;
	}

	ri.Printf( PRINT_WARNING, "WARNING: unknown deformVertexes subtype '%s' found in shader '%s'\n", token, shader.name );
}


/*
===============
ParseSkyParms

skyParms <outerbox> <cloudheight> <innerbox>
===============
*/
static void ParseSkyParms( const char **text ) {
	char		*token;
	static char	*suf[6] = {"rt", "bk", "lf", "ft", "up", "dn"};
	char		pathname[MAX_QPATH];
	int			i;
	imgFlags_t imgFlags = IMGFLAG_MIPMAP | IMGFLAG_PICMIP;

	// outerbox
	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 ) {
		ri.Printf( PRINT_WARNING, "WARNING: 'skyParms' missing parameter in shader '%s'\n", shader.name );
		return;
	}
	if ( strcmp( token, "-" ) ) {
		for (i=0 ; i<6 ; i++) {
			Com_sprintf( pathname, sizeof(pathname), "%s_%s.tga"
				, token, suf[i] );

#ifdef USE_LAZY_LOAD
      if(!mapShaders && r_lazyLoad->integer == 2) {
        int len;
        byte *pic;
        R_LoadImage((char *) pathname, &pic, &len, &len, &len, &len, qtrue);
        shader.sky.outerbox[i] = tr.defaultImage;
      } else 
#endif
      {
        shader.sky.outerbox[i] = R_FindImageFile( ( char * ) pathname, IMGTYPE_COLORALPHA, imgFlags | IMGFLAG_CLAMPTOEDGE );
      }

			if ( !shader.sky.outerbox[i] ) {
				shader.sky.outerbox[i] = tr.defaultImage;
			}
		}
	}

	// cloudheight
	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 ) {
		ri.Printf( PRINT_WARNING, "WARNING: 'skyParms' missing parameter in shader '%s'\n", shader.name );
		return;
	}
	shader.sky.cloudHeight = Q_atof( token );
	if ( shader.sky.cloudHeight == 0.0 ) {
		shader.sky.cloudHeight = 512.0;
	}
	R_InitSkyTexCoords( shader.sky.cloudHeight );

	// innerbox
	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 ) {
		ri.Printf( PRINT_WARNING, "WARNING: 'skyParms' missing parameter in shader '%s'\n", shader.name );
		return;
	}
	if ( strcmp( token, "-" ) ) {
		for (i=0 ; i<6 ; i++) {
			Com_sprintf( pathname, sizeof(pathname), "%s_%s.tga"
				, token, suf[i] );
#ifdef USE_LAZY_LOAD
      if(!mapShaders && r_lazyLoad->integer == 2) {
        int len;
        byte *pic;
        R_LoadImage((char *) pathname, &pic, &len, &len, &len, &len, qtrue);
        shader.sky.innerbox[i] = tr.defaultImage;
      } else 
#endif
      {
        shader.sky.innerbox[i] = R_FindImageFile( ( char * ) pathname, IMGTYPE_COLORALPHA, imgFlags );
      }
			if ( !shader.sky.innerbox[i] ) {
				shader.sky.innerbox[i] = tr.defaultImage;
			}
		}
	}

	shader.isSky = qtrue;
}


/*
=================
ParseSort
=================
*/
void ParseSort( const char **text ) {
	char	*token;

	token = COM_ParseExt( text, qfalse );
	if ( token[0] == 0 ) {
		ri.Printf( PRINT_WARNING, "WARNING: missing sort parameter in shader '%s'\n", shader.name );
		return;
	}

	if ( !Q_stricmp( token, "portal" ) ) {
		shader.sort = SS_PORTAL;
	} else if ( !Q_stricmp( token, "sky" ) ) {
		shader.sort = SS_ENVIRONMENT;
	} else if ( !Q_stricmp( token, "opaque" ) ) {
		shader.sort = SS_OPAQUE;
	} else if ( !Q_stricmp( token, "decal" ) ) {
		shader.sort = SS_DECAL;
	} else if ( !Q_stricmp( token, "seeThrough" ) ) {
		shader.sort = SS_SEE_THROUGH;
	} else if ( !Q_stricmp( token, "banner" ) ) {
		shader.sort = SS_BANNER;
	} else if ( !Q_stricmp( token, "additive" ) ) {
		shader.sort = SS_BLEND1;
	} else if ( !Q_stricmp( token, "nearest" ) ) {
		shader.sort = SS_NEAREST;
	} else if ( !Q_stricmp( token, "underwater" ) ) {
		shader.sort = SS_UNDERWATER;
	} else {
		shader.sort = Q_atof( token );
	}
}


// this table is also present in q3map

typedef struct {
	const char *name;
	int clearSolid, surfaceFlags, contents;
} infoParm_t;

static const infoParm_t infoParms[] = {
	// server relevant contents
	{"water",		1,	0,	CONTENTS_WATER },
	{"slime",		1,	0,	CONTENTS_SLIME },		// mildly damaging
	{"lava",		1,	0,	CONTENTS_LAVA },		// very damaging
	{"playerclip",	1,	0,	CONTENTS_PLAYERCLIP },
	{"monsterclip",	1,	0,	CONTENTS_MONSTERCLIP },
	{"nodrop",		1,	0,	CONTENTS_NODROP },		// don't drop items or leave bodies (death fog, lava, etc)
	{"nonsolid",	1,	SURF_NONSOLID,	0},						// clears the solid flag

	// utility relevant attributes
	{"origin",		1,	0,	CONTENTS_ORIGIN },		// center of rotating brushes
	{"trans",		0,	0,	CONTENTS_TRANSLUCENT },	// don't eat contained surfaces
	{"detail",		0,	0,	CONTENTS_DETAIL },		// don't include in structural bsp
	{"structural",	0,	0,	CONTENTS_STRUCTURAL },	// force into structural bsp even if trnas
	{"areaportal",	1,	0,	CONTENTS_AREAPORTAL },	// divides areas
	{"clusterportal", 1,0,  CONTENTS_CLUSTERPORTAL },	// for bots
	{"donotenter",  1,  0,  CONTENTS_DONOTENTER },		// for bots

	{"fog",			1,	0,	CONTENTS_FOG},			// carves surfaces entering
	{"sky",			0,	SURF_SKY,		0 },		// emit light from an environment map
	{"lightfilter",	0,	SURF_LIGHTFILTER, 0 },		// filter light going through it
	{"alphashadow",	0,	SURF_ALPHASHADOW, 0 },		// test light on a per-pixel basis
	{"hint",		0,	SURF_HINT,		0 },		// use as a primary splitter

	// server attributes
	{"slick",		0,	SURF_SLICK,		0 },
	{"noimpact",	0,	SURF_NOIMPACT,	0 },		// don't make impact explosions or marks
	{"nomarks",		0,	SURF_NOMARKS,	0 },		// don't make impact marks, but still explode
	{"ladder",		0,	SURF_LADDER,	0 },
	{"nodamage",	0,	SURF_NODAMAGE,	0 },
	{"metalsteps",	0,	SURF_METALSTEPS,0 },
	{"flesh",		0,	SURF_FLESH,		0 },
	{"nosteps",		0,	SURF_NOSTEPS,	0 },

	// drawsurf attributes
	{"nodraw",		0,	SURF_NODRAW,	0 },	// don't generate a drawsurface (or a lightmap)
	{"pointlight",	0,	SURF_POINTLIGHT, 0 },	// sample lighting at vertexes
	{"nolightmap",	0,	SURF_NOLIGHTMAP,0 },	// don't generate a lightmap
	{"nodlight",	0,	SURF_NODLIGHT, 0 },		// don't ever add dynamic lights
	{"dust",		0,	SURF_DUST, 0}			// leave a dust trail when walking on this surface
};


/*
===============
ParseSurfaceParm

surfaceparm <name>
===============
*/
static void ParseSurfaceParm( const char **text ) {
	char	*token;
	int		numInfoParms = ARRAY_LEN( infoParms );
	int		i;

	token = COM_ParseExt( text, qfalse );
	for ( i = 0 ; i < numInfoParms ; i++ ) {
		if ( !Q_stricmp( token, infoParms[i].name ) ) {
			shader.surfaceFlags |= infoParms[i].surfaceFlags;
			shader.contentFlags |= infoParms[i].contents;
#if 0
			if ( infoParms[i].clearSolid ) {
				si->contents &= ~CONTENTS_SOLID;
			}
#endif
			break;
		}
	}
}


typedef enum {
	res_invalid = -1,
	res_false = 0,
	res_true = 1
} resultType;

typedef enum {
	brIF,
	brELIF,
	brELSE
} branchType;

typedef enum {
	maskOR,
	maskAND
} resultMask;


static void derefVariable( const char *name, char *buf, int size )
{
	if ( !Q_stricmp( name, "vid_width" ) ) {
		Com_sprintf( buf, size, "%i", glConfig.vidWidth );
		return;
	}
	if ( !Q_stricmp( name, "vid_height" ) ) {
		Com_sprintf( buf, size, "%i", glConfig.vidHeight );
		return;
	}
	ri.Cvar_VariableStringBuffer( name, buf, size );
}


/*
===============
ParseCondition

if ( $cvar|<integer value> [<condition> $cvar|<integer value> [ [ || .. ] && .. ] ] )
{ shader stage }
[ else
{ shader stage } ]
===============
*/
static qboolean ParseCondition( const char **text, resultType *res )
{
	char lval_str[ MAX_CVAR_VALUE_STRING ];
	char rval_str[ MAX_CVAR_VALUE_STRING ];
	tokenType_t lval_type;
	tokenType_t rval_type;
	const char *token;
	tokenType_t op;
	resultMask	rm;
	qboolean	str;
	int r, r0;

	r = 0;			// resulting value
	rm = maskOR;	// default mask

	for ( ;; )
	{
		rval_str[0] = '\0';
		rval_type = TK_GENEGIC;

		// expect l-value at least
		token = COM_ParseComplex( text, qfalse );
		if ( token[0] == '\0' ) {
			ri.Printf( PRINT_WARNING, "WARNING: expecting lvalue for condition in shader %s\n", shader.name );
			return qfalse;
		}
	
		Q_strncpyz( lval_str, token, sizeof( lval_str ) );
		lval_type = com_tokentype;

		// get operator
		token = COM_ParseComplex( text, qfalse );
		if ( com_tokentype >= TK_EQ && com_tokentype <= TK_LTE )
		{
			op = com_tokentype;

			// expect r-value
			token = COM_ParseComplex( text, qfalse );
			if ( token[0] == '\0' ) {
				ri.Printf( PRINT_WARNING, "WARNING: expecting rvalue for condition in shader %s\n", shader.name );
				return qfalse;
			}

			Q_strncpyz( rval_str, token, sizeof( rval_str ) );
			rval_type = com_tokentype;

			// read next token, expect '||', '&&' or ')', allow newlines
			/*token =*/ COM_ParseComplex( text, qtrue );
		} 
		else if ( com_tokentype == TK_SCOPE_CLOSE || com_tokentype == TK_OR || com_tokentype == TK_AND ) 
		{
			// no r-value, assume 'not zero' comparison
			op = TK_NEQ;
		}
		else 
		{
			ri.Printf( PRINT_WARNING, "WARNING: unexpected operator '%s' for comparison in shader %s\n", token, shader.name );
			return qfalse;
		}
		
		str = qfalse;

		if ( lval_type == TK_QUOTED ) {
			str = qtrue;
		} else {
			// dereference l-value
			if ( lval_str[0] == '$' ) {
				derefVariable( lval_str + 1, lval_str, sizeof( lval_str ) );
			}
		}

		if ( rval_type == TK_QUOTED ) {
			str = qtrue;
		} else {
			// dereference r-value
			if ( rval_str[0] == '$' ) {
				derefVariable( rval_str + 1, rval_str, sizeof( rval_str ) );
			}
		}

		// evaluate expression
		if ( str ) {
			// string comparison
			switch ( op ) {
				case TK_EQ:  r0 = strcmp( lval_str, rval_str ) == 0; break;
				case TK_NEQ: r0 = strcmp( lval_str, rval_str ) != 0; break;
				case TK_GT:  r0 = strcmp( lval_str, rval_str ) >  0; break;
				case TK_GTE: r0 = strcmp( lval_str, rval_str ) >= 0; break;
				case TK_LT:  r0 = strcmp( lval_str, rval_str ) <  0; break;
				case TK_LTE: r0 = strcmp( lval_str, rval_str ) <= 0; break;
				default:     r0 = 0; break;
			}
		} else {
			// integer comparison
			int lval = atoi( lval_str );
			int rval = atoi( rval_str );
			switch ( op ) {
				case TK_EQ:  r0 = ( lval == rval ); break;
				case TK_NEQ: r0 = ( lval != rval ); break;
				case TK_GT:  r0 = ( lval >  rval ); break;
				case TK_GTE: r0 = ( lval >= rval ); break;
				case TK_LT:  r0 = ( lval <  rval ); break;
				case TK_LTE: r0 = ( lval <= rval ); break;
				default:     r0 = 0; break;
			}
		}

		if ( rm == maskOR )
			r |= r0;
		else
			r &= r0;
			
		if ( com_tokentype == TK_OR ) {
			rm = maskOR;
			continue;
		}

		if ( com_tokentype == TK_AND ) {
			rm = maskAND;
			continue;
		}

		if ( com_tokentype != TK_SCOPE_CLOSE ) {
			ri.Printf( PRINT_WARNING, "WARNING: expecting ')' in shader %s\n", shader.name );
			return qfalse;
		}

		break;
	}

	if ( res )
		*res = r ? res_true : res_false;
	
	return qtrue;
}


/*
=================
ParseShader

The current text pointer is at the explicit text definition of the
shader.  Parse it into the global shader variable.  Later functions
will optimize it.
=================
*/
static qboolean ParseShader( const char **text )
{
	resultType res;
	branchType branch;
	const char *token;
	int s;

	s = 0;

	s_extendedShader = (*text >= s_extensionOffset);

	token = COM_ParseExt( text, qtrue );
	if ( token[0] != '{' )
	{
		ri.Printf( PRINT_WARNING, "WARNING: expecting '{', found '%s' instead in shader '%s'\n", token, shader.name );
		return qfalse;
	}

	res = res_invalid;

	while ( 1 )
	{
		//token = COM_ParseExt( text, qtrue );
		token = COM_ParseComplex( text, qtrue );
		if ( !token[0] )
		{
			ri.Printf( PRINT_WARNING, "WARNING: no concluding '}' in shader %s\n", shader.name );
			return qfalse;
		}
		// end of shader definition
		if ( token[0] == '}' )
		{
			break;
		}
		// stage definition
		else if ( token[0] == '{' )
		{
			if ( s >= MAX_SHADER_STAGES ) {
				ri.Printf( PRINT_WARNING, "WARNING: too many stages in shader %s (max is %i)\n", shader.name, MAX_SHADER_STAGES );
				return qfalse;
			}

			if ( !ParseStage( &stages[s], text ) )
			{
        stages[s].active = qfalse;
			} else {
  			stages[s].active = qtrue;
			}
			s++;

			continue;
		}
		// skip stuff that only the QuakeEdRadient needs
		else if ( !Q_stricmpn( token, "qer", 3 ) ) {
			SkipRestOfLine( text );
			continue;
		}
		// sun parms
		else if ( !Q_stricmp( token, "q3map_sun" ) || !Q_stricmp( token, "q3map_sunExt" ) || !Q_stricmp( token, "q3gl2_sun" ) ) {
			float	a, b;
			qboolean isGL2Sun = qfalse;

			if (!Q_stricmp( token, "q3gl2_sun" ) && r_sunShadows->integer )
			{
				isGL2Sun = qtrue;
				tr.sunShadows = qtrue;
			}

			token = COM_ParseExt( text, qfalse );
			tr.sunLight[0] = Q_atof( token );
			token = COM_ParseExt( text, qfalse );
			tr.sunLight[1] = Q_atof( token );
			token = COM_ParseExt( text, qfalse );
			tr.sunLight[2] = Q_atof( token );
			
			VectorNormalize( tr.sunLight );

			token = COM_ParseExt( text, qfalse );
			a = Q_atof( token );
			VectorScale( tr.sunLight, a, tr.sunLight);

			token = COM_ParseExt( text, qfalse );
			a = Q_atof( token );
			a = a / 180 * M_PI;

			token = COM_ParseExt( text, qfalse );
			b = Q_atof( token );
			b = b / 180 * M_PI;

			tr.sunDirection[0] = cos( a ) * cos( b );
			tr.sunDirection[1] = sin( a ) * cos( b );
			tr.sunDirection[2] = sin( b );

			if (isGL2Sun)
			{
				token = COM_ParseExt( text, qfalse );
				tr.sunShadowScale = Q_atof(token);

				// parse twice, since older shaders may include mapLightScale before sunShadowScale
				token = COM_ParseExt( text, qfalse );
				if (token[0])
					tr.sunShadowScale = Q_atof(token);
			}

			SkipRestOfLine( text );
			continue;
		}
		// tonemap parms
		else if ( !Q_stricmp( token, "q3gl2_tonemap" ) ) {
			token = COM_ParseExt( text, qfalse );
			tr.toneMinAvgMaxLevel[0] = Q_atof( token );
			token = COM_ParseExt( text, qfalse );
			tr.toneMinAvgMaxLevel[1] = Q_atof( token );
			token = COM_ParseExt( text, qfalse );
			tr.toneMinAvgMaxLevel[2] = Q_atof( token );

			token = COM_ParseExt( text, qfalse );
			tr.autoExposureMinMax[0] = Q_atof( token );
			token = COM_ParseExt( text, qfalse );
			tr.autoExposureMinMax[1] = Q_atof( token );

			SkipRestOfLine( text );
			continue;
		}
		else if ( !Q_stricmp( token, "deformVertexes" ) ) {
			ParseDeform( text );
			continue;
		}
		else if ( !Q_stricmp( token, "tesssize" ) ) {
			SkipRestOfLine( text );
			continue;
		}
		else if ( !Q_stricmp( token, "clampTime" ) ) {
			token = COM_ParseExt( text, qfalse );
			if ( token[0] ) {
				shader.clampTime = Q_atof( token );
			}
		}
		// skip stuff that only the q3map needs
		else if ( !Q_stricmpn( token, "q3map", 5 ) ) {
			SkipRestOfLine( text );
			continue;
		}
		// skip stuff that only q3map or the server needs
		else if ( !Q_stricmp( token, "surfaceParm" ) ) {
			ParseSurfaceParm( text );
			continue;
		}
		// no mip maps
		else if ( !Q_stricmp( token, "nomipmaps" ) )
		{
			shader.noMipMaps = qtrue;
			shader.noPicMip = qtrue;
			continue;
		}
		// no picmip adjustment
		else if ( !Q_stricmp( token, "nopicmip" ) )
		{
			shader.noPicMip = qtrue;
			continue;
		}
		// polygonOffset
		else if ( !Q_stricmp( token, "polygonOffset" ) )
		{
			shader.polygonOffset = qtrue;
			continue;
		}
		// entityMergable, allowing sprite surfaces from multiple entities
		// to be merged into one batch.  This is a savings for smoke
		// puffs and blood, but can't be used for anything where the
		// shader calcs (not the surface function) reference the entity color or scroll
		else if ( !Q_stricmp( token, "entityMergable" ) )
		{
			shader.entityMergable = qtrue;
			continue;
		}
		// fogParms
		else if ( !Q_stricmp( token, "fogParms" ) ) 
		{
			if ( !ParseVector( text, 3, shader.fogParms.color ) ) {
				return qfalse;
			}

			if ( r_greyscale->integer )
			{
				float luminance;

				luminance = LUMA( shader.fogParms.color[0], shader.fogParms.color[1], shader.fogParms.color[2] );
				VectorSet( shader.fogParms.color, luminance, luminance, luminance );
			}
			else if ( r_greyscale->value )
			{
				float luminance;

				luminance = LUMA( shader.fogParms.color[0], shader.fogParms.color[1], shader.fogParms.color[2] );
				shader.fogParms.color[0] = LERP( shader.fogParms.color[0], luminance, r_greyscale->value );
				shader.fogParms.color[1] = LERP( shader.fogParms.color[1], luminance, r_greyscale->value );
				shader.fogParms.color[2] = LERP( shader.fogParms.color[2], luminance, r_greyscale->value );
			}

			token = COM_ParseExt( text, qfalse );
			if ( !token[0] )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing parm for 'fogParms' keyword in shader '%s'\n", shader.name );
				continue;
			}
			shader.fogParms.depthForOpaque = Q_atof( token );

			// skip any old gradient directions
			SkipRestOfLine( text );
			continue;
		}
		// portal
		else if ( !Q_stricmp( token, "portal" ) )
		{
			shader.sort = SS_PORTAL;
			shader.isPortal = qtrue;
			continue;
		}
		// skyparms <cloudheight> <outerbox> <innerbox>
		else if ( !Q_stricmp( token, "skyparms" ) )
		{
			ParseSkyParms( text );
			continue;
		}
		// light <value> determines flaring in q3map, not needed here
		else if ( !Q_stricmp(token, "light") )
		{
			COM_ParseExt( text, qfalse );
			continue;
		}
		// cull <face>
		else if ( !Q_stricmp( token, "cull") )
		{
			token = COM_ParseExt( text, qfalse );
			if ( token[0] == 0 )
			{
				ri.Printf( PRINT_WARNING, "WARNING: missing cull parms in shader '%s'\n", shader.name );
				continue;
			}

			if ( !Q_stricmp( token, "none" ) || !Q_stricmp( token, "twosided" ) || !Q_stricmp( token, "disable" ) )
			{
				shader.cullType = CT_TWO_SIDED;
			}
			else if ( !Q_stricmp( token, "back" ) || !Q_stricmp( token, "backside" ) || !Q_stricmp( token, "backsided" ) )
			{
				shader.cullType = CT_BACK_SIDED;
			}
			else
			{
				ri.Printf( PRINT_WARNING, "WARNING: invalid cull parm '%s' in shader '%s'\n", token, shader.name );
			}
			continue;
		}
    else if ( !Q_stricmp( token, "novlcollapse" ) )
		{
			// new in quakelive
			shader.noVertexLightingCollapse = qtrue;
			continue;
		}
    else if ( !Q_stricmp( token, "nocompress" ) )   {
      shader.allowCompress = qfalse;
      continue;
    }
		// sort
		else if ( !Q_stricmp( token, "sort" ) )
		{
			ParseSort( text );
			continue;
		}
    else if (!Q_stricmp( token, "translucent" ) )
		{
			shader.contentFlags |= CONTENTS_TRANSLUCENT;
			continue;
		}
		else if (!Q_stricmp( token, "twosided" ) )
		{
			shader.cullType = CT_TWO_SIDED;
			continue;
		}
		// conditional stage definition
		else if ( ( !Q_stricmp( token, "if" ) || !Q_stricmp( token, "else" ) || !Q_stricmp( token, "elif" ) ) && s_extendedShader )
		{
			if ( Q_stricmp( token, "if" ) == 0 ) {
				branch = brIF;
			} else {
				if ( res == res_invalid  ) {
					// we don't have any previous 'if' statements
					ri.Printf( PRINT_WARNING, "WARNING: unexpected '%s' in '%s'\n", token, shader.name );
					return qfalse;
				}
				if ( Q_stricmp( token, "else" ) == 0 )
					branch = brELSE;
				else
					branch = brELIF;
			}

			if ( branch != brELSE ) { // we can set/update result
				token = COM_ParseComplex( text, qfalse );
				if ( com_tokentype != TK_SCOPE_OPEN ) {
					ri.Printf( PRINT_WARNING, "WARNING: expecting '(' in '%s'\n", shader.name );
					return qfalse;
				}
				if ( !ParseCondition( text, (branch == brIF || res == res_true) ? &res : NULL ) ) {
					ri.Printf( PRINT_WARNING, "WARNING: error parsing condition in '%s'\n", shader.name );
					return qfalse;
				}
			}

			if ( res == res_false )	{
				// skip next stage or keyword until newline
				token = COM_ParseExt( text, qtrue );
				if ( token[0] == '{' )
					SkipBracedSection( text, 1 );
				else
					SkipRestOfLine( text );
			} else {
				// parse next tokens as usual
			}

			if ( branch == brELSE )
				res = res_invalid; // finalize branch
			else
				res ^= 1; // or toggle for possible "elif" / "else" statements

			continue;
		}
    // ydnar: implicit default mapping to eliminate redundant/incorrect explicit shader stages
		else if ( !Q_stricmpn( token, "implicit", 8 ) ) {
      if ( s >= MAX_SHADER_STAGES ) {
				ri.Printf( PRINT_WARNING, "WARNING: too many stages in shader %s (max is %i)\n", shader.name, MAX_SHADER_STAGES );
				return qfalse;
			}

			// set implicit mapping state
			if ( !Q_stricmp( token, "implicitBlend" ) ) {
				stages[s].stateBits &= GLS_DEPTHMASK_TRUE | GLS_SRCBLEND_SRC_ALPHA | GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA;
				shader.cullType = CT_TWO_SIDED;
			} else if ( !Q_stricmp( token, "implicitMask" ) )     {
				stages[s].stateBits &= GLS_DEPTHMASK_TRUE | GLS_ATEST_GE_80;
				shader.cullType = CT_TWO_SIDED;
			} else    // "implicitMap"
			{
				stages[s].stateBits &= GLS_DEPTHMASK_TRUE;
				shader.cullType = CT_FRONT_SIDED;
			}
      stages[s].active = qtrue;
			s++;

      // get image
      token = COM_ParseExt( text, qfalse );
      if ( token[ 0 ] != '\0' && token[ 0 ] != '-' ) {
        const char	*stageText = va("\nmap %s\n}", token);
        if ( !ParseStage( &stages[s], &stageText ) )
        {
          stages[s].active = qfalse;
          continue;
        }
      } else
      {
        const char	*stageText = va("\nmap %s.tga\n}", shader.name);
        if ( !ParseStage( &stages[s], &stageText ) )
        {
          stages[s].active = qfalse;
          continue;
        }
      }
      stages[s].active = qtrue;

			continue;
		}
		else
		{
			ri.Printf( PRINT_WARNING, "WARNING: unknown general shader parameter '%s' in '%s'\n", token, shader.name );
			return qfalse;
		}
	}

	//
	// ignore shaders that don't have any stages, unless it is a sky or fog
	//
	if ( s == 0 && !shader.isSky && !(shader.contentFlags & CONTENTS_FOG ) ) {
		return qfalse;
	}

	shader.explicitlyDefined = qtrue;

	return qtrue;
}

/*
========================================================================================

SHADER OPTIMIZATION AND FOGGING

========================================================================================
*/

/*
===================
ComputeStageIteratorFunc

See if we can use on of the simple fastpath stage functions,
otherwise set to the generic stage function
===================
*/
static void ComputeStageIteratorFunc( void )
{
	shader.optimalStageIteratorFunc = RB_StageIteratorGeneric;

	//
	// see if this should go into the sky path
	//
	if ( shader.isSky )
	{
		shader.optimalStageIteratorFunc = RB_StageIteratorSky;
		return;
	}
}

/*
===================
ComputeVertexAttribs

Check which vertex attributes we only need, so we
don't need to submit/copy all of them.
===================
*/
static void ComputeVertexAttribs(void)
{
	int i, stage;

	// dlights always need ATTR_NORMAL
	shader.vertexAttribs = ATTR_POSITION | ATTR_NORMAL;

	// portals always need normals, for SurfIsOffscreen()
	if (shader.isPortal)
	{
		shader.vertexAttribs |= ATTR_NORMAL;
	}

	if (shader.defaultShader)
	{
		shader.vertexAttribs |= ATTR_TEXCOORD;
		return;
	}

	if(shader.numDeforms)
	{
		for ( i = 0; i < shader.numDeforms; i++)
		{
			deformStage_t  *ds = &shader.deforms[i];

			switch (ds->deformation)
			{
				case DEFORM_BULGE:
					shader.vertexAttribs |= ATTR_NORMAL | ATTR_TEXCOORD;
					break;

				case DEFORM_AUTOSPRITE:
					shader.vertexAttribs |= ATTR_NORMAL | ATTR_COLOR;
					break;

				case DEFORM_WAVE:
				case DEFORM_NORMALS:
				case DEFORM_TEXT0:
				case DEFORM_TEXT1:
				case DEFORM_TEXT2:
				case DEFORM_TEXT3:
				case DEFORM_TEXT4:
				case DEFORM_TEXT5:
				case DEFORM_TEXT6:
				case DEFORM_TEXT7:
					shader.vertexAttribs |= ATTR_NORMAL;
					break;

				default:
				case DEFORM_NONE:
				case DEFORM_MOVE:
				case DEFORM_PROJECTION_SHADOW:
				case DEFORM_AUTOSPRITE2:
					break;
			}
		}
	}

	for ( stage = 0; stage < MAX_SHADER_STAGES; stage++ )
	{
		shaderStage_t *pStage = &stages[stage];

		if ( !pStage->active ) 
		{
			continue;
		}

		if (pStage->glslShaderGroup == tr.lightallShader)
		{
			shader.vertexAttribs |= ATTR_NORMAL;

			if ((pStage->glslShaderIndex & LIGHTDEF_LIGHTTYPE_MASK) && !(r_normalMapping->integer == 0 && r_specularMapping->integer == 0))
			{
				shader.vertexAttribs |= ATTR_TANGENT;
			}

			switch (pStage->glslShaderIndex & LIGHTDEF_LIGHTTYPE_MASK)
			{
				case LIGHTDEF_USE_LIGHTMAP:
				case LIGHTDEF_USE_LIGHT_VERTEX:
					shader.vertexAttribs |= ATTR_LIGHTDIRECTION;
					break;
				default:
					break;
			}
		}

		for (i = 0; i < NUM_TEXTURE_BUNDLES; i++)
		{
			if ( pStage->bundle[i].image[0] == 0 )
			{
				continue;
			}

			switch(pStage->bundle[i].tcGen)
			{
				case TCGEN_TEXTURE:
					shader.vertexAttribs |= ATTR_TEXCOORD;
					break;
				case TCGEN_LIGHTMAP:
					shader.vertexAttribs |= ATTR_LIGHTCOORD;
					break;
				case TCGEN_ENVIRONMENT_MAPPED:
					shader.vertexAttribs |= ATTR_NORMAL;
					break;

				default:
					break;
			}
		}

		switch(pStage->rgbGen)
		{
			case CGEN_EXACT_VERTEX:
			case CGEN_VERTEX:
			case CGEN_EXACT_VERTEX_LIT:
			case CGEN_VERTEX_LIT:
			case CGEN_ONE_MINUS_VERTEX:
				shader.vertexAttribs |= ATTR_COLOR;
				break;

			case CGEN_LIGHTING_DIFFUSE:
				shader.vertexAttribs |= ATTR_NORMAL;
				break;

			default:
				break;
		}

		switch(pStage->alphaGen)
		{
			case AGEN_LIGHTING_SPECULAR:
				shader.vertexAttribs |= ATTR_NORMAL;
				break;

			case AGEN_VERTEX:
			case AGEN_ONE_MINUS_VERTEX:
				shader.vertexAttribs |= ATTR_COLOR;
				break;

			default:
				break;
		}
	}
}


static void CollapseStagesToLightall(shaderStage_t *diffuse, 
	shaderStage_t *normal, shaderStage_t *specular, shaderStage_t *lightmap, 
	qboolean useLightVector, qboolean useLightVertex, qboolean parallax, qboolean tcgen)
{
	int defs = 0;

	//ri.Printf(PRINT_ALL, "shader %s has diffuse %s", shader.name, diffuse->bundle[0].image[0]->imgName);

	// reuse diffuse, mark others inactive
	diffuse->type = ST_GLSL;

	if (lightmap)
	{
		//ri.Printf(PRINT_ALL, ", lightmap");
		diffuse->bundle[TB_LIGHTMAP] = lightmap->bundle[0];
		defs |= LIGHTDEF_USE_LIGHTMAP;
	}
	else if (useLightVector)
	{
		defs |= LIGHTDEF_USE_LIGHT_VECTOR;
	}
	else if (useLightVertex)
	{
		defs |= LIGHTDEF_USE_LIGHT_VERTEX;
	}

	if (r_deluxeMapping->integer && tr.worldDeluxeMapping && lightmap && shader.lightmapIndex >= 0)
	{
		//ri.Printf(PRINT_ALL, ", deluxemap");
		diffuse->bundle[TB_DELUXEMAP] = lightmap->bundle[0];
		diffuse->bundle[TB_DELUXEMAP].image[0] = tr.deluxemaps[shader.lightmapIndex];
	}

	if (r_normalMapping->integer)
	{
		image_t *diffuseImg;
		if (normal)
		{
			//ri.Printf(PRINT_ALL, ", normalmap %s", normal->bundle[0].image[0]->imgName);
			diffuse->bundle[TB_NORMALMAP] = normal->bundle[0];
			if (parallax && r_parallaxMapping->integer)
				defs |= LIGHTDEF_USE_PARALLAXMAP;

			VectorCopy4(normal->normalScale, diffuse->normalScale);
		}
		else if ((lightmap || useLightVector || useLightVertex) && (diffuseImg = diffuse->bundle[TB_DIFFUSEMAP].image[0]) != NULL)
		{
			char normalName[MAX_QPATH];
			image_t *normalImg = NULL;
			imgFlags_t normalFlags = (diffuseImg->flags & ~IMGFLAG_GENNORMALMAP) | IMGFLAG_NOLIGHTSCALE;

			// try a normalheight image first
			COM_StripExtension(diffuseImg->imgName, normalName, MAX_QPATH);
			Q_strcat(normalName, MAX_QPATH, "_nh");

#ifdef USE_LAZY_LOAD
      if(!mapShaders && r_lazyLoad->integer == 2) {
        int len;
        byte *pic;
        R_LoadImage(normalName, &pic, &len, &len, &len, &len, qtrue);
        normalImg = NULL;
      } else 
#endif
      {
        normalImg = R_FindImageFile(normalName, IMGTYPE_NORMALHEIGHT, normalFlags);
      }

			if (normalImg)
			{
				parallax = qtrue;
			}
			else
			{
				// try a normal image ("_n" suffix)
				normalName[strlen(normalName) - 1] = '\0';
#ifdef USE_LAZY_LOAD
        if(!mapShaders && r_lazyLoad->integer == 2) {
          byte *pic;
          int len;
          R_LoadImage(normalName, &pic, &len, &len, &len, &len, qtrue);
          normalImg = NULL;
        } else 
#endif
        {
          normalImg = R_FindImageFile(normalName, IMGTYPE_NORMAL, normalFlags);
        }
			}

			if (normalImg)
			{
				diffuse->bundle[TB_NORMALMAP] = diffuse->bundle[0];
				diffuse->bundle[TB_NORMALMAP].numImageAnimations = 0;
				diffuse->bundle[TB_NORMALMAP].image[0] = normalImg;

				if (parallax && r_parallaxMapping->integer)
					defs |= LIGHTDEF_USE_PARALLAXMAP;

				VectorSet4(diffuse->normalScale, r_baseNormalX->value, r_baseNormalY->value, 1.0f, r_baseParallax->value);
			}
		}
	}

	if (r_specularMapping->integer)
	{
		image_t *diffuseImg;
		if (specular)
		{
			//ri.Printf(PRINT_ALL, ", specularmap %s", specular->bundle[0].image[0]->imgName);
			diffuse->bundle[TB_SPECULARMAP] = specular->bundle[0];
			VectorCopy4(specular->specularScale, diffuse->specularScale);
		}
		else if ((lightmap || useLightVector || useLightVertex) && (diffuseImg = diffuse->bundle[TB_DIFFUSEMAP].image[0]) != NULL)
		{
			char specularName[MAX_QPATH];
			image_t *specularImg = NULL;
			imgFlags_t specularFlags = (diffuseImg->flags & ~IMGFLAG_GENNORMALMAP) | IMGFLAG_NOLIGHTSCALE;

			COM_StripExtension(diffuseImg->imgName, specularName, MAX_QPATH);
			Q_strcat(specularName, MAX_QPATH, "_s");

#ifdef USE_LAZY_LOAD
      if(!mapShaders && r_lazyLoad->integer == 2) {
        byte *pic;
        int len;
        R_LoadImage(specularName, &pic, &len, &len, &len, &len, qtrue);
        specularImg = NULL;
      } else 
#endif
      {
        specularImg = R_FindImageFile(specularName, IMGTYPE_COLORALPHA, specularFlags);
      }

			if (specularImg)
			{
				diffuse->bundle[TB_SPECULARMAP] = diffuse->bundle[0];
				diffuse->bundle[TB_SPECULARMAP].numImageAnimations = 0;
				diffuse->bundle[TB_SPECULARMAP].image[0] = specularImg;

				VectorSet4(diffuse->specularScale, 1.0f, 1.0f, 1.0f, 1.0f);
			}
		}
	}

	if (tcgen || diffuse->bundle[0].numTexMods)
	{
		defs |= LIGHTDEF_USE_TCGEN_AND_TCMOD;
	}

	//ri.Printf(PRINT_ALL, ".\n");

	diffuse->glslShaderGroup = tr.lightallShader;
	diffuse->glslShaderIndex = defs;
}


static int CollapseStagesToGLSL(void)
{
	int i, j, numStages;
	qboolean skip = qfalse;

	// skip shaders with deforms
	if (shader.numDeforms != 0)
	{
		skip = qtrue;
	}

	if (!skip)
	{
		// if 2+ stages and first stage is lightmap, switch them
		// this makes it easier for the later bits to process
		if (stages[0].active && stages[0].bundle[0].tcGen == TCGEN_LIGHTMAP && stages[1].active)
		{
			int blendBits = stages[1].stateBits & ( GLS_DSTBLEND_BITS | GLS_SRCBLEND_BITS );

			if (blendBits == (GLS_DSTBLEND_SRC_COLOR | GLS_SRCBLEND_ZERO)
				|| blendBits == (GLS_DSTBLEND_ZERO | GLS_SRCBLEND_DST_COLOR))
			{
				int stateBits0 = stages[0].stateBits;
				int stateBits1 = stages[1].stateBits;
				shaderStage_t swapStage;

				swapStage = stages[0];
				stages[0] = stages[1];
				stages[1] = swapStage;

				stages[0].stateBits = stateBits0;
				stages[1].stateBits = stateBits1;
			}
		}
	}

	if (!skip)
	{
		// scan for shaders that aren't supported
		for (i = 0; i < MAX_SHADER_STAGES; i++)
		{
			shaderStage_t *pStage = &stages[i];

			if (!pStage->active) {
        continue;
      }

			//if (pStage->adjustColorsForFog)
			//{
			//	skip = qtrue;
			//	break;
			//}

			if (pStage->bundle[0].tcGen == TCGEN_LIGHTMAP)
			{
				int blendBits = pStage->stateBits & ( GLS_DSTBLEND_BITS | GLS_SRCBLEND_BITS );
				
				if (blendBits != (GLS_DSTBLEND_SRC_COLOR | GLS_SRCBLEND_ZERO)
					&& blendBits != (GLS_DSTBLEND_ZERO | GLS_SRCBLEND_DST_COLOR))
				{
					skip = qtrue;
					break;
				}
			}

			switch(pStage->bundle[0].tcGen)
			{
				case TCGEN_TEXTURE:
				case TCGEN_LIGHTMAP:
				case TCGEN_ENVIRONMENT_MAPPED:
				case TCGEN_VECTOR:
					break;
				default:
					skip = qtrue;
					break;
			}

			switch(pStage->alphaGen)
			{
				case AGEN_LIGHTING_SPECULAR:
				case AGEN_PORTAL:
					skip = qtrue;
					break;
				default:
					break;
			}
		}
	}

	if (!skip)
	{
		qboolean usedLightmap = qfalse;

		for (i = 0; i < MAX_SHADER_STAGES; i++)
		{
			shaderStage_t *pStage = &stages[i];
			shaderStage_t *diffuse, *normal, *specular, *lightmap;
			qboolean parallax, tcgen, diffuselit, vertexlit;

			if (!pStage->active)
				continue;

			// skip normal and specular maps
			if (pStage->type != ST_COLORMAP)
				continue;

			// skip lightmaps
			if (pStage->bundle[0].tcGen == TCGEN_LIGHTMAP)
				continue;

			diffuse  = pStage;
			normal   = NULL;
			parallax = qfalse;
			specular = NULL;
			lightmap = NULL;

			// we have a diffuse map, find matching normal, specular, and lightmap
			for (j = i + 1; j < MAX_SHADER_STAGES; j++)
			{
				shaderStage_t *pStage2 = &stages[j];

				if (!pStage2->active)
					continue;

				switch(pStage2->type)
				{
					case ST_NORMALMAP:
						if (!normal)
						{
							normal = pStage2;
						}
						break;

					case ST_NORMALPARALLAXMAP:
						if (!normal)
						{
							normal = pStage2;
							parallax = qtrue;
						}
						break;

					case ST_SPECULARMAP:
						if (!specular)
						{
							specular = pStage2;
						}
						break;

					case ST_COLORMAP:
						if (pStage2->bundle[0].tcGen == TCGEN_LIGHTMAP)
						{
							int blendBits = pStage->stateBits & ( GLS_DSTBLEND_BITS | GLS_SRCBLEND_BITS );

							// Only add lightmap to blendfunc filter stage if it's the first time lightmap is used
							// otherwise it will cause the shader to be darkened by the lightmap multiple times.
							if (!usedLightmap || (blendBits != (GLS_DSTBLEND_SRC_COLOR | GLS_SRCBLEND_ZERO)
								&& blendBits != (GLS_DSTBLEND_ZERO | GLS_SRCBLEND_DST_COLOR)))
							{
								lightmap = pStage2;
								usedLightmap = qtrue;
							}
						}
						break;

					default:
						break;
				}
			}

			tcgen = qfalse;
			if (diffuse->bundle[0].tcGen == TCGEN_ENVIRONMENT_MAPPED
			    || diffuse->bundle[0].tcGen == TCGEN_LIGHTMAP
			    || diffuse->bundle[0].tcGen == TCGEN_VECTOR)
			{
				tcgen = qtrue;
			}

			diffuselit = qfalse;
			if (diffuse->rgbGen == CGEN_LIGHTING_DIFFUSE)
			{
				diffuselit = qtrue;
			}

			vertexlit = qfalse;
			if (diffuse->rgbGen == CGEN_VERTEX_LIT || diffuse->rgbGen == CGEN_EXACT_VERTEX_LIT)
			{
				vertexlit = qtrue;
			}

			CollapseStagesToLightall(diffuse, normal, specular, lightmap, diffuselit, vertexlit, parallax, tcgen);
		}

		// deactivate lightmap stages
		for (i = 0; i < MAX_SHADER_STAGES; i++)
		{
			shaderStage_t *pStage = &stages[i];

			if (!pStage->active)
				continue;

			if (pStage->bundle[0].tcGen == TCGEN_LIGHTMAP)
			{
				pStage->active = qfalse;
			}
		}
	}

	// deactivate normal and specular stages
	for (i = 0; i < MAX_SHADER_STAGES; i++)
	{
		shaderStage_t *pStage = &stages[i];

		if (!pStage->active)
			continue;

		if (pStage->type == ST_NORMALMAP)
		{
			pStage->active = qfalse;
		}

		if (pStage->type == ST_NORMALPARALLAXMAP)
		{
			pStage->active = qfalse;
		}

		if (pStage->type == ST_SPECULARMAP)
		{
			pStage->active = qfalse;
		}			
	}

	// remove inactive stages
	numStages = 0;
	for (i = 0; i < MAX_SHADER_STAGES; i++)
	{
		if (!stages[i].active)
			continue;

		if (i == numStages)
		{
			numStages++;
			continue;
		}

		stages[numStages] = stages[i];
		stages[i].active = qfalse;
		numStages++;
	}

	// convert any remaining lightmap stages to a lighting pass with a white texture
	// only do this with r_sunlightMode non-zero, as it's only for correct shadows.
	if (r_sunlightMode->integer && shader.numDeforms == 0)
	{
		for (i = 0; i < MAX_SHADER_STAGES; i++)
		{
			shaderStage_t *pStage = &stages[i];

			if (!pStage->active)
				continue;

			if (pStage->adjustColorsForFog)
				continue;

			if (pStage->bundle[TB_DIFFUSEMAP].tcGen == TCGEN_LIGHTMAP)
			{
				pStage->glslShaderGroup = tr.lightallShader;
				pStage->glslShaderIndex = LIGHTDEF_USE_LIGHTMAP;
				pStage->bundle[TB_LIGHTMAP] = pStage->bundle[TB_DIFFUSEMAP];
				pStage->bundle[TB_DIFFUSEMAP].image[0] = tr.whiteImage;
				pStage->bundle[TB_DIFFUSEMAP].isLightmap = qfalse;
				pStage->bundle[TB_DIFFUSEMAP].tcGen = TCGEN_TEXTURE;
			}
		}
	}

	// convert any remaining lightingdiffuse stages to a lighting pass
	if (shader.numDeforms == 0)
	{
		for (i = 0; i < MAX_SHADER_STAGES; i++)
		{
			shaderStage_t *pStage = &stages[i];

			if (!pStage->active)
				continue;

			if (pStage->adjustColorsForFog)
				continue;

			if (pStage->rgbGen == CGEN_LIGHTING_DIFFUSE)
			{
				pStage->glslShaderGroup = tr.lightallShader;
				pStage->glslShaderIndex = LIGHTDEF_USE_LIGHT_VECTOR;

				if (pStage->bundle[0].tcGen != TCGEN_TEXTURE || pStage->bundle[0].numTexMods != 0)
					pStage->glslShaderIndex |= LIGHTDEF_USE_TCGEN_AND_TCMOD;
			}
		}
	}

	return numStages;
}

/*
=============

FixRenderCommandList
https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=493
Arnout: this is a nasty issue. Shaders can be registered after drawsurfaces are generated
but before the frame is rendered. This will, for the duration of one frame, cause drawsurfaces
to be rendered with bad shaders. To fix this, need to go through all render commands and fix
sortedIndex.
==============
*/
static void FixRenderCommandList( int newShader ) {
	renderCommandList_t	*cmdList = &backEndData->commands;

	if( cmdList ) {
		const void *curCmd = cmdList->cmds;

		while ( 1 ) {
			curCmd = PADP(curCmd, sizeof(void *));

			switch ( *(const int *)curCmd ) {
			case RC_SET_COLOR:
				{
				const setColorCommand_t *sc_cmd = (const setColorCommand_t *)curCmd;
				curCmd = (const void *)(sc_cmd + 1);
				break;
				}
			case RC_STRETCH_PIC:
				{
				const stretchPicCommand_t *sp_cmd = (const stretchPicCommand_t *)curCmd;
				curCmd = (const void *)(sp_cmd + 1);
				break;
				}
			case RC_DRAW_SURFS:
				{
				int i;
				drawSurf_t	*drawSurf;
				shader_t	*sh;
				int			fogNum;
				int			entityNum;
				int			dlightMap;
				int         pshadowMap;
				int			sortedIndex;
				const drawSurfsCommand_t *ds_cmd =  (const drawSurfsCommand_t *)curCmd;

				for( i = 0, drawSurf = ds_cmd->drawSurfs; i < ds_cmd->numDrawSurfs; i++, drawSurf++ ) {
					R_DecomposeSort( drawSurf->sort, &entityNum, &sh, &fogNum, &dlightMap, &pshadowMap );
                    sortedIndex = (( drawSurf->sort >> QSORT_SHADERNUM_SHIFT ) & (MAX_SHADERS-1));
					if( sortedIndex >= newShader ) {
						sortedIndex = sh->sortedIndex;
						drawSurf->sort = (sortedIndex << QSORT_SHADERNUM_SHIFT) | (entityNum << QSORT_REFENTITYNUM_SHIFT) | ( fogNum << QSORT_FOGNUM_SHIFT ) | ( (int)pshadowMap << QSORT_PSHADOW_SHIFT) | (int)dlightMap;
					}
				}
				curCmd = (const void *)(ds_cmd + 1);
				break;
				}
			case RC_DRAW_BUFFER:
				{
				const drawBufferCommand_t *db_cmd = (const drawBufferCommand_t *)curCmd;
				curCmd = (const void *)(db_cmd + 1);
				break;
				}
			case RC_SWAP_BUFFERS:
				{
				const swapBuffersCommand_t *sb_cmd = (const swapBuffersCommand_t *)curCmd;
				curCmd = (const void *)(sb_cmd + 1);
				break;
				}
			case RC_END_OF_LIST:
			default:
				return;
			}
		}
	}
}

/*
==============
SortNewShader

Positions the most recently created shader in the tr.sortedShaders[]
array so that the shader->sort key is sorted relative to the other
shaders.

Sets shader->sortedIndex
==============
*/
static void SortNewShader( void ) {
	int		i;
	float	sort;
	shader_t	*newShader;

	newShader = tr.shaders[ tr.numShaders - 1 ];
	sort = newShader->sort;

	for ( i = tr.numShaders - 2 ; i >= 0 ; i-- ) {
		if ( tr.sortedShaders[ i ]->sort <= sort ) {
			break;
		}
		tr.sortedShaders[i+1] = tr.sortedShaders[i];
		tr.sortedShaders[i+1]->sortedIndex++;
	}

	// Arnout: fix rendercommandlist
	// https://zerowing.idsoftware.com/bugzilla/show_bug.cgi?id=493
	FixRenderCommandList( i+1 );

	newShader->sortedIndex = i+1;
	tr.sortedShaders[i+1] = newShader;
}


/*
====================
GeneratePermanentShader
====================
*/
static shader_t *GeneratePermanentShader( void ) {
	shader_t	*newShader;
	int			i, b;
	int			size, hash;

	if ( tr.numShaders >= MAX_SHADERS ) {
		ri.Printf( PRINT_DEVELOPER, "WARNING: GeneratePermanentShader - MAX_SHADERS hit\n");
		return tr.defaultShader;
	}

	newShader = ri.Hunk_Alloc( sizeof( shader_t ), h_low );

	*newShader = shader;

	if ( shader.sort <= SS_OPAQUE ) {
		newShader->fogPass = FP_EQUAL;
	} else if ( shader.contentFlags & CONTENTS_FOG ) {
		newShader->fogPass = FP_LE;
	}

	tr.shaders[ tr.numShaders ] = newShader;
	newShader->index = tr.numShaders;
	
	tr.sortedShaders[ tr.numShaders ] = newShader;
	newShader->sortedIndex = tr.numShaders;

	tr.numShaders++;

	for ( i = 0 ; i < newShader->numUnfoggedPasses ; i++ ) {
		if ( !stages[i].active ) {
			break;
		}
		newShader->stages[i] = ri.Hunk_Alloc( sizeof( stages[i] ), h_low );
		*newShader->stages[i] = stages[i];

		for ( b = 0 ; b < NUM_TEXTURE_BUNDLES ; b++ ) {
			size = newShader->stages[i]->bundle[b].numTexMods * sizeof( texModInfo_t );
			if ( size ) {
				newShader->stages[i]->bundle[b].texMods = ri.Hunk_Alloc( size, h_low );
				Com_Memcpy( newShader->stages[i]->bundle[b].texMods, stages[i].bundle[b].texMods, size );
			}
		}
	}

	SortNewShader();

	hash = generateHashValue(newShader->name, FILE_HASH_SIZE);
	newShader->next = hashTable[hash];
	hashTable[hash] = newShader;

	return newShader;
}


/*
====================
FindLightingStages

Find proper stage for dlight pass
====================
*/
#define GLS_BLEND_BITS (GLS_SRCBLEND_BITS | GLS_DSTBLEND_BITS)
static void FindLightingStages( void )
{
	int i;
	shader.lightingStage = -1;

	if ( shader.isSky || ( shader.surfaceFlags & (SURF_NODLIGHT | SURF_SKY) ) || shader.sort > SS_OPAQUE )
		return;

	for ( i = 0; i < shader.numUnfoggedPasses; i++ ) {
		if ( !stages[i].bundle[0].isLightmap ) {
			if ( stages[i].bundle[0].tcGen != TCGEN_TEXTURE )
				continue;
			if ( (stages[i].stateBits & GLS_BLEND_BITS) == (GLS_SRCBLEND_ONE | GLS_DSTBLEND_ONE) )
				continue;
			if ( stages[i].rgbGen == CGEN_IDENTITY && (stages[i].stateBits & GLS_BLEND_BITS) == (GLS_SRCBLEND_DST_COLOR | GLS_DSTBLEND_ZERO) ) {
				if ( shader.lightingStage >= 0 ) {
					continue;
				}
			}
			shader.lightingStage = i;
		}
	}
}


/*
=================
VertexLightingCollapse

If vertex lighting is enabled, only render a single
pass, trying to guess which is the correct one to best approximate
what it is supposed to look like.
=================
*/
static void VertexLightingCollapse( void ) {
	int		stage;
	shaderStage_t	*bestStage;
	int		bestImageRank;
	int		rank;

	// if we aren't opaque, just use the first pass
	if ( shader.sort == SS_OPAQUE ) {

		// pick the best texture for the single pass
		bestStage = &stages[0];
		bestImageRank = -999999;

		for ( stage = 0; stage < MAX_SHADER_STAGES; stage++ ) {
			shaderStage_t *pStage = &stages[stage];

			if ( !pStage->active ) {
				break;
			}
			rank = 0;

			if ( pStage->bundle[0].isLightmap ) {
				rank -= 100;
			}
			if ( pStage->bundle[0].tcGen != TCGEN_TEXTURE ) {
				rank -= 5;
			}
			if ( pStage->bundle[0].numTexMods ) {
				rank -= 5;
			}
			if ( pStage->rgbGen != CGEN_IDENTITY && pStage->rgbGen != CGEN_IDENTITY_LIGHTING ) {
				rank -= 3;
			}

			if ( rank > bestImageRank  ) {
				bestImageRank = rank;
				bestStage = pStage;
			}
		}

		stages[0].bundle[0] = bestStage->bundle[0];
		stages[0].stateBits &= ~( GLS_DSTBLEND_BITS | GLS_SRCBLEND_BITS );
		stages[0].stateBits |= GLS_DEPTHMASK_TRUE;
		if ( shader.lightmapIndex == LIGHTMAP_NONE ) {
			stages[0].rgbGen = CGEN_LIGHTING_DIFFUSE;
		} else {
			stages[0].rgbGen = CGEN_EXACT_VERTEX;
		}
		stages[0].alphaGen = AGEN_SKIP;
	} else {
		// don't use a lightmap (tesla coils)
		if ( stages[0].bundle[0].isLightmap ) {
			stages[0] = stages[1];
		}

		// if we were in a cross-fade cgen, hack it to normal
		if ( stages[0].rgbGen == CGEN_ONE_MINUS_ENTITY || stages[1].rgbGen == CGEN_ONE_MINUS_ENTITY ) {
			stages[0].rgbGen = CGEN_IDENTITY_LIGHTING;
		}
		if ( ( stages[0].rgbGen == CGEN_WAVEFORM && stages[0].rgbWave.func == GF_SAWTOOTH )
			&& ( stages[1].rgbGen == CGEN_WAVEFORM && stages[1].rgbWave.func == GF_INVERSE_SAWTOOTH ) ) {
			stages[0].rgbGen = CGEN_IDENTITY_LIGHTING;
		}
		if ( ( stages[0].rgbGen == CGEN_WAVEFORM && stages[0].rgbWave.func == GF_INVERSE_SAWTOOTH )
			&& ( stages[1].rgbGen == CGEN_WAVEFORM && stages[1].rgbWave.func == GF_SAWTOOTH ) ) {
			stages[0].rgbGen = CGEN_IDENTITY_LIGHTING;
		}
	}

	for ( stage = 1; stage < MAX_SHADER_STAGES; stage++ ) {
		shaderStage_t *pStage = &stages[stage];

		if ( !pStage->active ) {
			break;
		}

		Com_Memset( pStage, 0, sizeof( *pStage ) );
	}
}


/*
===============
InitShader
===============
*/
static void InitShader( const char *name, int lightmapIndex ) {
	int i;

	// clear the global shader
	Com_Memset( &shader, 0, sizeof( shader ) );
	Com_Memset( &stages, 0, sizeof( stages ) );

	Q_strncpyz( shader.name, name, sizeof( shader.name ) );
  shader.lastTimeUsed = tr.lastRegistrationTime;
	shader.lightmapIndex = lightmapIndex;

	// we need to know original (unmodified) lightmap index
	// because shader search functions expects this
	// otherwise they will fail and cause massive duplication
	shader.lightmapSearchIndex = shader.lightmapIndex;

	for ( i = 0 ; i < MAX_SHADER_STAGES ; i++ ) {
		stages[i].bundle[0].texMods = texMods[i];

		// default normal/specular
		VectorSet4(stages[i].normalScale, 0.0f, 0.0f, 0.0f, 0.0f);
		if (r_pbr->integer)
		{
			stages[i].specularScale[0] = r_baseGloss->value;
		}
		else
		{
			stages[i].specularScale[0] =
			stages[i].specularScale[1] =
			stages[i].specularScale[2] = r_baseSpecular->value;
			stages[i].specularScale[3] = r_baseGloss->value;
		}
	}
}

/*
=========================
FinishShader

Returns a freshly allocated shader with all the needed info
from the current global working shader
=========================
*/
static shader_t *FinishShader( void ) {
	int stage;
	qboolean		hasLightmapStage;
	qboolean		vertexLightmap;

  ri.Cvar_Set("r_loadingShader", "");

	hasLightmapStage = qfalse;
	vertexLightmap = qfalse;

	//
	// set sky stuff appropriate
	//
	if ( shader.isSky ) {
		shader.sort = SS_ENVIRONMENT;
	}

	//
	// set polygon offset
	//
	if ( shader.polygonOffset && shader.sort == SS_BAD ) {
		shader.sort = SS_DECAL;
	}

	//
	// set appropriate stage information
	//
	for ( stage = 0; stage < MAX_SHADER_STAGES; ) {
		shaderStage_t *pStage = &stages[stage];

		if ( !pStage->active ) {
			break;
		}

		// check for a missing texture
		if ( !pStage->bundle[0].image[0] ) {
			ri.Printf( PRINT_DEVELOPER, "Shader %s has a stage with no image\n", shader.name );
			pStage->active = qfalse;
			stage++;
			continue;
		}

		//
		// ditch this stage if it's detail and detail textures are disabled
		//
		if ( pStage->isDetail && !r_detailTextures->integer )
		{
			int index;
			
			for(index = stage + 1; index < MAX_SHADER_STAGES; index++)
			{
				if(!stages[index].active)
					break;
			}
			
			if(index < MAX_SHADER_STAGES)
				memmove(pStage, pStage + 1, sizeof(*pStage) * (index - stage));
			else
			{
				if(stage + 1 < MAX_SHADER_STAGES)
					memmove(pStage, pStage + 1, sizeof(*pStage) * (index - stage - 1));
				
				Com_Memset(&stages[index - 1], 0, sizeof(*stages));
			}
			
			continue;
		}

		//
		// default texture coordinate generation
		//
		if ( pStage->bundle[0].isLightmap ) {
			if ( pStage->bundle[0].tcGen == TCGEN_BAD ) {
				pStage->bundle[0].tcGen = TCGEN_LIGHTMAP;
			}
			hasLightmapStage = qtrue;
		} else {
			if ( pStage->bundle[0].tcGen == TCGEN_BAD ) {
				pStage->bundle[0].tcGen = TCGEN_TEXTURE;
			}
		}

		// not a true lightmap but we want to leave existing
		// behaviour in place and not print out a warning
		//if (pStage->rgbGen == CGEN_VERTEX) {
		//  vertexLightmap = qtrue;
		//}

		//
		// determine sort order and fog color adjustment
		//
		if ( ( pStage->stateBits & ( GLS_SRCBLEND_BITS | GLS_DSTBLEND_BITS ) ) &&
			 ( stages[0].stateBits & ( GLS_SRCBLEND_BITS | GLS_DSTBLEND_BITS ) ) ) {
			int blendSrcBits = pStage->stateBits & GLS_SRCBLEND_BITS;
			int blendDstBits = pStage->stateBits & GLS_DSTBLEND_BITS;

			// fog color adjustment only works for blend modes that have a contribution
			// that aproaches 0 as the modulate values aproach 0 --
			// GL_ONE, GL_ONE
			// GL_ZERO, GL_ONE_MINUS_SRC_COLOR
			// GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA

			// modulate, additive
			if ( ( ( blendSrcBits == GLS_SRCBLEND_ONE ) && ( blendDstBits == GLS_DSTBLEND_ONE ) ) ||
				( ( blendSrcBits == GLS_SRCBLEND_ZERO ) && ( blendDstBits == GLS_DSTBLEND_ONE_MINUS_SRC_COLOR ) ) ) {
				pStage->adjustColorsForFog = ACFF_MODULATE_RGB;
			}
			// strict blend
			else if ( ( blendSrcBits == GLS_SRCBLEND_SRC_ALPHA ) && ( blendDstBits == GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA ) )
			{
				pStage->adjustColorsForFog = ACFF_MODULATE_ALPHA;
			}
			// premultiplied alpha
			else if ( ( blendSrcBits == GLS_SRCBLEND_ONE ) && ( blendDstBits == GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA ) )
			{
				pStage->adjustColorsForFog = ACFF_MODULATE_RGBA;
			} else {
				// we can't adjust this one correctly, so it won't be exactly correct in fog
			}

			// don't screw with sort order if this is a portal or environment
			if ( shader.sort == SS_BAD ) {
				// see through item, like a grill or grate
				if ( pStage->stateBits & GLS_DEPTHMASK_TRUE ) {
					shader.sort = SS_SEE_THROUGH;
				} else {
					shader.sort = SS_BLEND0;
				}
			}
		}
		
		stage++;
	}

	// there are times when you will need to manually apply a sort to
	// opaque alpha tested shaders that have later blend passes
	if ( shader.sort == SS_BAD ) {
		shader.sort = SS_OPAQUE;
	}

	//
	// if we are in r_vertexLight mode, never use a lightmap texture
	//
	if ( stage > 1 && ( (r_vertexLight->integer && tr.vertexLightingAllowed) || glConfig.hardwareType == GLHW_PERMEDIA2 ) && !shader.noVertexLightingCollapse ) {
		VertexLightingCollapse();
		hasLightmapStage = qfalse;
	}

	//
	// look for multitexture potential
	//
	stage = CollapseStagesToGLSL();

	if ( shader.lightmapIndex >= 0 && !hasLightmapStage ) {
		if (vertexLightmap) {
			ri.Printf( PRINT_DEVELOPER, "WARNING: shader '%s' has VERTEX forced lightmap!\n", shader.name );
		} else {
			ri.Printf( PRINT_DEVELOPER, "WARNING: shader '%s' has lightmap but no lightmap stage!\n", shader.name );
			shader.lightmapIndex = LIGHTMAP_NONE;
		}
	}


	//
	// compute number of passes
	//
	shader.numUnfoggedPasses = stage;

	FindLightingStages();

	// fogonly shaders don't have any normal passes
	if (stage == 0 && !shader.isSky)
		shader.sort = SS_FOG;

	// determine which stage iterator function is appropriate
	ComputeStageIteratorFunc();

	// determine which vertex attributes this shader needs
	ComputeVertexAttribs();

	return GeneratePermanentShader();
}

//========================================================================================

/*
====================
FindShaderInShaderText

Scans the combined text description of all the shader files for
the given shader name.

return NULL if not found

If found, it will return a valid shader
=====================
*/
static const char *FindShaderInShaderText( const char *shadername ) {

	const char *token, *p;

	int i, hash;

	hash = generateHashValue(shadername, MAX_SHADERTEXT_HASH);

	if(shaderTextHashTable[hash])
	{
		for (i = 0; shaderTextHashTable[hash][i]; i++)
		{
			p = shaderTextHashTable[hash][i];
			token = COM_ParseExt(&p, qtrue);
			if(!Q_stricmp(token, shadername))
				return p;
		}
	}

	return NULL;
}


/*
==================
R_FindShaderByName

Will always return a valid shader, but it might be the
default shader if the real one can't be found.
==================
*/
shader_t *R_FindShaderByNameInternal( const char *name, qboolean isDefault ) {
	char		strippedName[MAX_QPATH];
	int			hash;
	shader_t	*sh;

	if ( (name==NULL) || (name[0] == 0) ) {
		return tr.defaultShader;
	}

	COM_StripExtension(name, strippedName, sizeof(strippedName));

	hash = generateHashValue(strippedName, FILE_HASH_SIZE);

	//
	// see if the shader is already loaded
	//
	for (sh=hashTable[hash]; sh; sh=sh->next) {
		// NOTE: if there was no shader or image available with the name strippedName
		// then a default shader is created with lightmapIndex == LIGHTMAP_NONE, so we
		// have to check all default shaders otherwise for every call to R_FindShader
		// with that same strippedName a new default shader is created.
		if (Q_stricmp(sh->name, strippedName) == 0 && sh->defaultShader == isDefault) {
			// match found
			return sh;
		}
	}

	return tr.defaultShader;
}

shader_t *R_FindShaderByName( const char *name ) {
  return R_FindShaderByNameInternal(name, qfalse);
}

#ifdef USE_LAZY_LOAD
shader_t *R_FindDefaultShaderByName( const char *name ) {
  return R_FindShaderByNameInternal(name, qtrue);
}
#endif

/*
===============
R_FindShader

Will always return a valid shader, but it might be the
default shader if the real one can't be found.

In the interest of not requiring an explicit shader text entry to
be defined for every single image used in the game, three default
shader behaviors can be auto-created for any image:

If lightmapIndex == LIGHTMAP_NONE, then the image will have
dynamic diffuse lighting applied to it, as appropriate for most
entity skin surfaces.

If lightmapIndex == LIGHTMAP_2D, then the image will be used
for 2D rendering unless an explicit shader is found

If lightmapIndex == LIGHTMAP_BY_VERTEX, then the image will use
the vertex rgba modulate values, as appropriate for misc_model
pre-lit surfaces.

Other lightmapIndex values will have a lightmap stage created
and src*dest blending applied with the texture, as appropriate for
most world construction surfaces.

===============
*/
shader_t *R_FindShader( const char *name, int lightmapIndex, qboolean mipRawImage ) {
	char		strippedName[MAX_QPATH];
	unsigned long hash;
	const char	*shaderText;
	image_t		*image = NULL;
	shader_t	*sh;

	if ( !name || name[0] == '\0' ) {
		return tr.defaultShader;
	}

	// use (fullbright) vertex lighting if the bsp file doesn't have
	// lightmaps
	if ( lightmapIndex >= 0 && lightmapIndex >= tr.numLightmaps ) {
		lightmapIndex = LIGHTMAP_BY_VERTEX;
	} else if ( lightmapIndex < LIGHTMAP_2D ) {
		// negative lightmap indexes cause stray pointers (think tr.lightmaps[lightmapIndex])
		ri.Printf( PRINT_WARNING, "WARNING: shader '%s' has invalid lightmap index of %d\n", name, lightmapIndex  );
		lightmapIndex = LIGHTMAP_BY_VERTEX;
	}

	COM_StripExtension(name, strippedName, sizeof(strippedName));

	hash = generateHashValue(strippedName, FILE_HASH_SIZE);

	//
	// see if the shader is already loaded
	//
	for (sh = hashTable[hash]; sh; sh = sh->next) {
		// NOTE: if there was no shader or image available with the name strippedName
		// then a default shader is created with lightmapIndex == LIGHTMAP_NONE, so we
		// have to check all default shaders otherwise for every call to R_FindShader
		// with that same strippedName a new default shader is created.
    if ( (sh->lightmapSearchIndex == lightmapIndex || sh->defaultShader)
      &&	!Q_stricmp(sh->name, strippedName)
      &&  !mapShaders && sh->lastTimeUsed >= tr.lastRegistrationTime ) {
			// match found
			return sh;
		}
	}

  ri.Cvar_Set( "r_loadingShader", va("%12i;%s", lightmapIndex, name) );

	InitShader( strippedName, lightmapIndex );

	if ( r_ext_compressed_textures->integer == 2 ) {
		// if the shader hasn't specifically asked for it, don't allow compression
		shader.allowCompress = qfalse;
	} else {
		shader.allowCompress = qtrue;
	}

	//
	// attempt to define shader from an explicit parameter file
	//
	shaderText = FindShaderInShaderText( strippedName );
	if ( shaderText ) {
		// enable this when building a pak file to get a global list
		// of all explicit shaders
		if ( r_printShaders->integer ) {
			ri.Printf( PRINT_ALL, "*SHADER* %s\n", name );
		}

    if(!strcmp(name, "console")
      || !strcmp(name, "white")
      || Q_stristr(name, "bigchars")) {
      mapShaders = qtrue;
    }

		if ( !ParseShader( &shaderText ) ) {
			// had errors, so use default shader
			shader.defaultShader = qtrue;
		}
		sh = FinishShader();

    if(!strcmp(name, "console")
      || !strcmp(name, "white")
      || Q_stristr(name, "bigchars")) {
      mapShaders = qfalse;
    }

		return sh;
	}

	//
	// if not defined in the in-memory shader descriptions,
	// look for a single supported image file
	//
	{
		imgFlags_t flags;

		flags = IMGFLAG_NONE;

		if (mipRawImage)
		{
			flags |= IMGFLAG_MIPMAP | IMGFLAG_PICMIP;

			if (r_genNormalMaps->integer)
				flags |= IMGFLAG_GENNORMALMAP;
		}
		else
		{
			flags |= IMGFLAG_CLAMPTOEDGE;
		}

		if ( !shader.allowCompress )
			flags |= IMGFLAG_NO_COMPRESSION;

#ifdef USE_LAZY_LOAD
    if(!mapShaders && r_lazyLoad->integer == 2) {
      byte *pic = NULL;
      int len = 0;
      R_LoadImage( name, &pic, &len, &len, &len, &len, qtrue );
      image = NULL;
    } else 
#endif
    {
		  image = R_FindImageFile( name, IMGTYPE_COLORALPHA, flags );
    }

		if ( !image ) {
			ri.Printf( PRINT_DEVELOPER, "Couldn't find image file for shader %s\n", name );
      image = tr.defaultImage;
			//shader.defaultShader = qtrue;
			//return FinishShader();
		} else {
      shader.defaultShader = qfalse;
		}
	}

	//
	// create the default shading commands
	//
	if ( shader.lightmapIndex == LIGHTMAP_NONE ) {
		// dynamic colors at vertexes
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_LIGHTING_DIFFUSE;
		stages[0].stateBits = GLS_DEFAULT;
	} else if ( shader.lightmapIndex == LIGHTMAP_BY_VERTEX ) {
		// explicit colors at vertexes
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_EXACT_VERTEX;
		stages[0].alphaGen = AGEN_SKIP;
		stages[0].stateBits = GLS_DEFAULT;
	} else if ( shader.lightmapIndex == LIGHTMAP_2D ) {
		// GUI elements
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_VERTEX;
		stages[0].alphaGen = AGEN_VERTEX;
		stages[0].stateBits = GLS_DEPTHTEST_DISABLE |
			  GLS_SRCBLEND_SRC_ALPHA |
			  GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA;
	} else if ( shader.lightmapIndex == LIGHTMAP_WHITEIMAGE ) {
		// fullbright level
		stages[0].bundle[0].image[0] = tr.whiteImage;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_IDENTITY_LIGHTING;
		stages[0].stateBits = GLS_DEFAULT;

		stages[1].bundle[0].image[0] = image;
		stages[1].active = qtrue;
		stages[1].rgbGen = CGEN_IDENTITY;
		stages[1].stateBits |= GLS_SRCBLEND_DST_COLOR | GLS_DSTBLEND_ZERO;
	} else {
		// two pass lightmap
		stages[0].bundle[0].image[0] = tr.lightmaps[shader.lightmapIndex];
		stages[0].bundle[0].isLightmap = qtrue;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_IDENTITY;	// lightmaps are scaled on creation
													// for identitylight
		stages[0].stateBits = GLS_DEFAULT;

		stages[1].bundle[0].image[0] = image;
		stages[1].active = qtrue;
		stages[1].rgbGen = CGEN_IDENTITY;
		stages[1].stateBits |= GLS_SRCBLEND_DST_COLOR | GLS_DSTBLEND_ZERO;
	}

	return FinishShader();
}


qhandle_t RE_RegisterShaderFromImage(const char *name, int lightmapIndex, image_t *image, qboolean mipRawImage) {
	unsigned long hash;
	shader_t	*sh;

	hash = generateHashValue(name, FILE_HASH_SIZE);

	// probably not necessary since this function
	// only gets called from tr_font.c with lightmapIndex == LIGHTMAP_2D
	// but better safe than sorry.
	if ( lightmapIndex >= tr.numLightmaps ) {
		lightmapIndex = LIGHTMAP_WHITEIMAGE;
	}

	//
	// see if the shader is already loaded
	//
	for (sh=hashTable[hash]; sh; sh=sh->next) {
		// NOTE: if there was no shader or image available with the name strippedName
		// then a default shader is created with lightmapIndex == LIGHTMAP_NONE, so we
		// have to check all default shaders otherwise for every call to R_FindShader
		// with that same strippedName a new default shader is created.
		if ( (sh->lightmapSearchIndex == lightmapIndex || sh->defaultShader) && !Q_stricmp(sh->name, name)) {
			// match found
			return sh->index;
		}
	}

	InitShader( name, lightmapIndex );

	//
	// create the default shading commands
	//
	if ( shader.lightmapIndex == LIGHTMAP_NONE ) {
		// dynamic colors at vertexes
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_LIGHTING_DIFFUSE;
		stages[0].stateBits = GLS_DEFAULT;
	} else if ( shader.lightmapIndex == LIGHTMAP_BY_VERTEX ) {
		// explicit colors at vertexes
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_EXACT_VERTEX;
		stages[0].alphaGen = AGEN_SKIP;
		stages[0].stateBits = GLS_DEFAULT;
	} else if ( shader.lightmapIndex == LIGHTMAP_2D ) {
		// GUI elements
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_VERTEX;
		stages[0].alphaGen = AGEN_VERTEX;
		stages[0].stateBits = GLS_DEPTHTEST_DISABLE |
			  GLS_SRCBLEND_SRC_ALPHA |
			  GLS_DSTBLEND_ONE_MINUS_SRC_ALPHA;
	} else if ( shader.lightmapIndex == LIGHTMAP_WHITEIMAGE ) {
		// fullbright level
		stages[0].bundle[0].image[0] = tr.whiteImage;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_IDENTITY_LIGHTING;
		stages[0].stateBits = GLS_DEFAULT;

		stages[1].bundle[0].image[0] = image;
		stages[1].active = qtrue;
		stages[1].rgbGen = CGEN_IDENTITY;
		stages[1].stateBits |= GLS_SRCBLEND_DST_COLOR | GLS_DSTBLEND_ZERO;
	} else {
		// two pass lightmap
		stages[0].bundle[0].image[0] = tr.lightmaps[shader.lightmapIndex];
		stages[0].bundle[0].isLightmap = qtrue;
		stages[0].active = qtrue;
		stages[0].rgbGen = CGEN_IDENTITY;	// lightmaps are scaled on creation
													// for identitylight
		stages[0].stateBits = GLS_DEFAULT;

		stages[1].bundle[0].image[0] = image;
		stages[1].active = qtrue;
		stages[1].rgbGen = CGEN_IDENTITY;
		stages[1].stateBits |= GLS_SRCBLEND_DST_COLOR | GLS_DSTBLEND_ZERO;
	}

	sh = FinishShader();
  return sh->index; 
}


/* 
====================
RE_RegisterShaderLightMap

This is the exported shader entry point for the rest of the system
It will always return an index that will be valid.

This should really only be used for explicit shaders, because there is no
way to ask for different implicit lighting modes (vertex, lightmap, etc)
====================
*/
qhandle_t RE_RegisterShaderLightMap( const char *name, int lightmapIndex ) {
	shader_t	*sh;

	if ( strlen( name ) >= MAX_QPATH ) {
		ri.Printf( PRINT_ALL, "Shader name exceeds MAX_QPATH\n" );
		return 0;
	}

  if(lightmapIndex == LIGHTMAP_2D) {
    sh = R_FindShader( name, lightmapIndex, qfalse );
  } else {
	sh = R_FindShader( name, lightmapIndex, qtrue );
  }

	// we want to return 0 if the shader failed to
	// load for some reason, but R_FindShader should
	// still keep a name allocated for it, so if
	// something calls RE_RegisterShader again with
	// the same name, we don't try looking for it again
	if ( sh->defaultShader ) {
	//	return 0;
	}

	return sh->index;
}


/* 
====================
RE_RegisterShader

This is the exported shader entry point for the rest of the system
It will always return an index that will be valid.

This should really only be used for explicit shaders, because there is no
way to ask for different implicit lighting modes (vertex, lightmap, etc)
====================
*/
qhandle_t RE_RegisterShader( const char *name ) {
	shader_t	*sh;

	if ( !name ) {
		ri.Printf( PRINT_ALL, "NULL shader\n" );
		return 0;
	}

	if ( strlen( name ) >= MAX_QPATH ) {
		ri.Printf( PRINT_ALL, "Shader name exceeds MAX_QPATH\n" );
		return 0;
	}

	sh = R_FindShader( name, LIGHTMAP_2D, qtrue );

	// we want to return 0 if the shader failed to
	// load for some reason, but R_FindShader should
	// still keep a name allocated for it, so if
	// something calls RE_RegisterShader again with
	// the same name, we don't try looking for it again
	if ( sh->defaultShader ) {
	//	return 0;
	}

	return sh->index;
}


/*
====================
RE_RegisterShaderNoMip

For menu graphics that should never be picmiped
====================
*/
qhandle_t RE_RegisterShaderNoMip( const char *name ) {
	shader_t	*sh;

	if ( strlen( name ) >= MAX_QPATH ) {
		ri.Printf( PRINT_ALL, "Shader name exceeds MAX_QPATH\n" );
		return 0;
	}

	sh = R_FindShader( name, LIGHTMAP_2D, qfalse );

	// we want to return 0 if the shader failed to
	// load for some reason, but R_FindShader should
	// still keep a name allocated for it, so if
	// something calls RE_RegisterShader again with
	// the same name, we don't try looking for it again
	if ( sh->defaultShader ) {
	//	return 0;
	}

	return sh->index;
}

/*
====================
R_GetShaderByHandle

When a handle is passed in by another module, this range checks
it and returns a valid (possibly default) shader_t to be used internally.
====================
*/
shader_t *R_GetShaderByHandle( qhandle_t hShader ) {
	if ( hShader < 0 ) {
	  ri.Printf( PRINT_WARNING, "R_GetShaderByHandle: out of range hShader '%d'\n", hShader );
		return tr.defaultShader;
	}
	if ( hShader >= tr.numShaders ) {
		ri.Printf( PRINT_WARNING, "R_GetShaderByHandle: out of range hShader '%d'\n", hShader );
		return tr.defaultShader;
	}
	return tr.shaders[hShader];
}

/*
===============
R_ShaderList_f

Dump information on all valid shaders to the console
A second parameter will cause it to print in sorted order
===============
*/
void	R_ShaderList_f (void) {
	int			i;
	int			count;
	const shader_t *sh;

	ri.Printf (PRINT_ALL, "-----------------------\n");

	count = 0;
	for ( i = 0 ; i < tr.numShaders ; i++ ) {
		if ( ri.Cmd_Argc() > 1 ) {
			sh = tr.sortedShaders[i];
		} else {
			sh = tr.shaders[i];
		}

		ri.Printf( PRINT_ALL, "%i ", sh->numUnfoggedPasses );

		if ( sh->lightmapIndex >= 0 ) {
			ri.Printf (PRINT_ALL, "L ");
		} else {
			ri.Printf (PRINT_ALL, "  ");
		}
		if ( sh->explicitlyDefined ) {
			ri.Printf( PRINT_ALL, "E " );
		} else {
			ri.Printf( PRINT_ALL, "  " );
		}

		if ( sh->optimalStageIteratorFunc == RB_StageIteratorGeneric ) {
			ri.Printf( PRINT_ALL, "gen " );
		} else if ( sh->optimalStageIteratorFunc == RB_StageIteratorSky ) {
			ri.Printf( PRINT_ALL, "sky " );
		} else {
			ri.Printf( PRINT_ALL, "    " );
		}

		if ( sh->defaultShader ) {
			ri.Printf (PRINT_ALL,  ": %s (DEFAULTED)\n", sh->name);
		} else {
			ri.Printf (PRINT_ALL,  ": %s\n", sh->name);
		}
		count++;
	}
	ri.Printf (PRINT_ALL, "%i total shaders\n", count);
	ri.Printf (PRINT_ALL, "------------------\n");
}


#define	MAX_SHADER_FILES 16384

static int loadShaderBuffers( char **shaderFiles, const int numShaderFiles, char **buffers )
{
	char filename[MAX_QPATH+8];
	char shaderName[MAX_QPATH];
	const char *p, *token;
	long summand, sum = 0;
	int shaderLine;
	int i;
	const char *shaderStart;
	qboolean denyErrors;

	// load and parse shader files
	for ( i = 0; i < numShaderFiles; i++ )
	{
		Com_sprintf( filename, sizeof( filename ), "scripts/%s", shaderFiles[i] );
		//ri.Printf( PRINT_DEVELOPER, "...loading '%s'\n", filename );
		summand = ri.FS_ReadFile( filename, (void **)&buffers[i] );

		if ( !buffers[i] )
			ri.Error( ERR_DROP, "Couldn't load %s", filename );
		
		// comment some buggy shaders from pak0
		if ( summand == 35910 && strcmp( shaderFiles[i], "sky.shader" ) == 0 )
		{
			if ( memcmp( buffers[i] + 0x3D3E, "\tcloudparms ", 12 ) == 0 )
			{
				memcpy( buffers[i] + 0x27D7, "/*", 2 );
				memcpy( buffers[i] + 0x2A93, "*/", 2 );

				memcpy( buffers[i] + 0x3CA9, "/*", 2 );
				memcpy( buffers[i] + 0x3FC2, "*/", 2 );
			}
		}
		else if ( summand == 116073 && strcmp( shaderFiles[i], "sfx.shader" ) == 0 )
		{
			if ( memcmp( buffers[i] + 93457, "textures/sfx/xfinalfog\r\n", 24 ) == 0 )
			{
				memcpy( buffers[i] + 93457, "/*", 2 );
				memcpy( buffers[i] + 93663, "*/", 2 );
			}
		}

		p = buffers[i];
		COM_BeginParseSession( filename );
		
		shaderStart = NULL;
		denyErrors = qfalse;

		while ( 1 )
		{
			token = COM_ParseExt( &p, qtrue );
			
			if ( !*token )
				break;

			Q_strncpyz( shaderName, token, sizeof( shaderName ) );
			shaderLine = COM_GetCurrentParseLine();

			token = COM_ParseExt( &p, qtrue );
			if ( token[0] != '{' || token[1] != '\0' )
			{
				ri.Printf( PRINT_DEVELOPER, "File %s: shader \"%s\" " \
					"on line %d missing opening brace", filename, shaderName, shaderLine );
				if ( token[0] )
					ri.Printf( PRINT_DEVELOPER, " (found \"%s\" on line %d)\n", token, COM_GetCurrentParseLine() );
				else
					ri.Printf( PRINT_DEVELOPER, "\n" );

				if ( denyErrors || !p )
				{
					ri.Printf( PRINT_WARNING, "Ignoring entire file '%s' due to error.\n", filename );
					ri.FS_FreeFile( buffers[i] );
					buffers[i] = NULL;
					break;
				}

				SkipRestOfLine( &p );
				shaderStart = p;
				continue;
			}

			if ( !SkipBracedSection( &p, 1 ) )
			{
				ri.Printf(PRINT_WARNING, "WARNING: Ignoring shader file %s. Shader \"%s\" " \
					"on line %d missing closing brace.\n", filename, shaderName, shaderLine );
				ri.FS_FreeFile( buffers[i] );
				buffers[i] = NULL;
				break;
			}

			denyErrors = qtrue;
		}

		if ( buffers[ i ] ) {
			if ( shaderStart ) {
				summand -= (shaderStart - buffers[i]);
				if ( summand >= 0 ) {
					memmove( buffers[i], shaderStart, summand + 1 );
				}
			}
			//sum += summand;
			sum += COM_Compress( buffers[ i ] );
		}
	}

	return sum;
}


/*
====================
ScanAndLoadShaderFiles

Finds and loads all .shader files, combining them into
a single large text block that can be scanned for shader names
=====================
*/
static void ScanAndLoadShaderFiles( void )
{
	char **shaderFiles, **mtrFiles;
	char *buffers[MAX_SHADER_FILES];
	char *xbuffers[MAX_SHADER_FILES];
	int numShaderFiles, numMtrFiles;
	int i;
	char *token, *hashMem, *textEnd;
	const char *p, *oldp;
	int shaderTextHashTableSizes[MAX_SHADERTEXT_HASH], hash, size;

  mapShaders = qfalse;
	long sum = 0;

	// scan for legacy shader files
	shaderFiles = ri.FS_ListFiles( "scripts", ".shader", &numShaderFiles );
	mtrFiles = ri.FS_ListFiles( "scripts", ".mtr", &numMtrFiles );

	if ( (!shaderFiles || !numShaderFiles) && (!mtrFiles || !numMtrFiles) ) {
		ri.Printf( PRINT_WARNING, "WARNING: no shader files found\n" );
		return;
	}

	if ( numShaderFiles > MAX_SHADER_FILES ) {
		numShaderFiles = MAX_SHADER_FILES;
	}
	if ( numMtrFiles > MAX_SHADER_FILES ) {
		numMtrFiles = MAX_SHADER_FILES;
	}

	sum = 0;
	sum += loadShaderBuffers( mtrFiles, numMtrFiles, xbuffers );
	sum += loadShaderBuffers( shaderFiles, numShaderFiles, buffers );

	// build single large buffer
	s_shaderText = ri.Hunk_Alloc( sum + numMtrFiles*2 + numShaderFiles*2 + 1, h_low );
	s_shaderText[ 0 ] = s_shaderText[ sum + numMtrFiles*2 + numShaderFiles*2 ] = '\0';

	textEnd = s_shaderText;

	// free in reverse order, so the temp files are all dumped
	// legacy shaders
	for ( i = numShaderFiles - 1; i >= 0 ; i-- ) {
		if ( buffers[ i ] ) {
			textEnd = Q_stradd( textEnd, buffers[ i ] );
			textEnd = Q_stradd( textEnd, "\n" );
			ri.FS_FreeFile( buffers[ i ] );
		}
	}

	// if shader text >= s_extensionOffset then it is an extended shader
	// normal shaders will never encounter that
	s_extensionOffset = textEnd;

	// extended shaders
	for ( i = numMtrFiles - 1; i >= 0 ; i-- ) {
		if ( xbuffers[ i ] ) {
			textEnd = Q_stradd( textEnd, xbuffers[ i ] );
			textEnd = Q_stradd( textEnd, "\n" );
			ri.FS_FreeFile( xbuffers[ i ] );
		}
	}

	// free up memory
	if ( mtrFiles )
		ri.FS_FreeFileList( mtrFiles );
	if ( shaderFiles )
		ri.FS_FreeFileList( shaderFiles );

	//COM_Compress( s_shaderText );
	Com_Memset( shaderTextHashTableSizes, 0, sizeof( shaderTextHashTableSizes ) );
	size = 0;

	p = s_shaderText;
	// look for shader names
	while ( 1 ) {
		token = COM_ParseExt( &p, qtrue );
		if ( token[0] == 0 ) {
			break;
		}
		hash = generateHashValue(token, MAX_SHADERTEXT_HASH);
		shaderTextHashTableSizes[hash]++;
		size++;
		SkipBracedSection(&p, 0);
	}

	size += MAX_SHADERTEXT_HASH;

	hashMem = ri.Hunk_Alloc( size * sizeof(char *), h_low );

	for (i = 0; i < MAX_SHADERTEXT_HASH; i++) {
		shaderTextHashTable[i] = (char **) hashMem;
		hashMem = ((char *) hashMem) + ((shaderTextHashTableSizes[i] + 1) * sizeof(char *));
	}

	p = s_shaderText;
	// look for shader names
	while ( 1 ) {
		oldp = p;
		token = COM_ParseExt( &p, qtrue );
		if ( token[0] == 0 ) {
			break;
		}

		hash = generateHashValue(token, MAX_SHADERTEXT_HASH);
		shaderTextHashTable[hash][--shaderTextHashTableSizes[hash]] = (char*)oldp;

		SkipBracedSection(&p, 0);
	}
}


/*
====================
CreateInternalShaders
====================
*/
static void CreateInternalShaders( void ) {
	tr.numShaders = 0;

	// init the default shader
	InitShader( "<default>", LIGHTMAP_NONE );
	stages[0].bundle[0].image[0] = tr.defaultImage;
	stages[0].active = qtrue;
	stages[0].stateBits = GLS_DEFAULT;
	tr.defaultShader = FinishShader();

	// shadow shader is just a marker
	Q_strncpyz( shader.name, "<stencil shadow>", sizeof( shader.name ) );
	shader.sort = SS_STENCIL_SHADOW;
	tr.shadowShader = FinishShader();
}


qhandle_t RE_CreateShaderFromImageBytes(const char* name, byte *pic, int width, int height) {
  shader_t	*sh;
  image_t *image;
  image = R_CreateImage(name, pic, width, height, IMGTYPE_NORMAL, IMGFLAG_NONE, 0 );
  InitShader( name, LIGHTMAP_NONE );
  stages[0].bundle[0].image[0] = image;
  stages[0].active = qtrue;
  stages[0].stateBits = GLS_DEFAULT;
  sh = FinishShader();
  return sh->index;
}



/*
====================
CreateExternalShaders
====================
*/
static void CreateExternalShaders( void ) {
	tr.projectionShadowShader = R_FindShader( "projectionShadow", LIGHTMAP_NONE, qtrue );
	tr.flareShader = R_FindShader( "flareShader", LIGHTMAP_NONE, qtrue );

	// Hack to make fogging work correctly on flares. Fog colors are calculated
	// in tr_flare.c already.
	if(!tr.flareShader->defaultShader)
	{
		int index;
		
		for(index = 0; index < tr.flareShader->numUnfoggedPasses; index++)
		{
			tr.flareShader->stages[index]->adjustColorsForFog = ACFF_NONE;
			tr.flareShader->stages[index]->stateBits |= GLS_DEPTHTEST_DISABLE;
		}
	}

	tr.sunShader = R_FindShader( "sun", LIGHTMAP_NONE, qtrue );

	tr.sunFlareShader = R_FindShader( "gfx/2d/sunflare", LIGHTMAP_NONE, qtrue);

	// HACK: if sunflare is missing, make one using the flare image or dlight image
	if (tr.sunFlareShader->defaultShader)
	{
		image_t *image;

		if (!tr.flareShader->defaultShader && tr.flareShader->stages[0] && tr.flareShader->stages[0]->bundle[0].image[0])
			image = tr.flareShader->stages[0]->bundle[0].image[0];
		else
			image = tr.dlightImage;

		InitShader( "gfx/2d/sunflare", LIGHTMAP_NONE );
		stages[0].bundle[0].image[0] = image;
		stages[0].active = qtrue;
		stages[0].stateBits = GLS_DEFAULT;
		tr.sunFlareShader = FinishShader();
	}

}


#ifdef USE_LAZY_LOAD
void RE_UpdateShader(char *shaderName, int lightmapIndex) {
  mapShaders = qtrue;

  R_RemapShaderInternal(shaderName, shaderName, "0", lightmapIndex );
  
  mapShaders = qfalse;
}
#endif


#ifdef USE_LAZY_MEMORY
void RE_ReloadShaders( qboolean createNew ) {
  int i;
  tr.lastRegistrationTime = ri.Milliseconds();

  R_IssuePendingRenderCommands();
  
  GLSL_InitGPUShaders();

  // remove lightmaps
  if(!createNew) {
    // Gets reassigned on subsequent loads
    for(i=0;i<tr.numLightmaps;i++) {
      image_t *img = tr.lightmaps[i];
      if(img->texnum)
        qglDeleteTextures( 1, &img->texnum );
      Com_Memset(img, 0, sizeof( *img ));
    }
    tr.lightmaps = NULL;
    tr.numLightmaps = 0;
  }

  GL_BindNullTextures();

  ScanAndLoadShaderFiles();
}
#endif


/*
==================
R_InitShaders
==================
*/
void R_InitShaders( void ) {
	ri.Printf( PRINT_ALL, "Initializing Shaders\n" );

	Com_Memset(hashTable, 0, sizeof(hashTable));

	CreateInternalShaders();

	ScanAndLoadShaderFiles();

	CreateExternalShaders();
}
