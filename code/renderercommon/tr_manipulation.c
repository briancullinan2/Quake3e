
#include "../qcommon/q_shared.h"
#include "../renderercommon/tr_public.h"


#ifdef USE_AUTO_TERRAIN


/*
   GetShaderIndexForPoint() - ydnar
   for shader-indexed surfaces (terrain), find a matching index from the indexmap
 */

byte GetShaderIndexForPoint( terrain_t *s_worldData, const vec3_t eMinmax[2], const vec3_t point, const float s, const float t ){
	/* early out if no indexmap */
if(!s_worldData->terrainImage) {
	return 0;
}

	/* this code is really broken */
#if 0
	/* legacy precision fudges for terrain */
	Vector3 mins, maxs;
	for ( int i = 0; i < 3; i++ )
	{
		mins[ i ] = floor( eMinmax.mins[ i ] + 0.1 );
		maxs[ i ] = floor( eMinmax.maxs[ i ] + 0.1 );
	}
	const Vector3 size = maxs - mins;

	/* find st (fixme: support more than just z-axis projection) */
	const float s = std::clamp( floor( point[ 0 ] + 0.1f - mins[ 0 ] ) / size[ 0 ], 0.0, 1.0 );
	const float t = std::clamp( floor( maxs[ 1 ] - point[ 1 ] + 0.1f ) / size[ 1 ], 0.0, 1.0 );

	/* make xy */
	const int x = ( im->w - 1 ) * s;
	const int y = ( im->h - 1 ) * t;
#else
	/* get size */
	vec3_t size;
	VectorSubtract(eMinmax[1], eMinmax[0], size);

	/* calc st */
	const float s2 = ( point[ 0 ] - eMinmax[0][ 0 ] ) / size[ 0 ];
	const float t2 = ( eMinmax[1][ 1 ] - point[ 1 ] ) / size[ 1 ];

	/* calc xy */
	int x = s2 * s_worldData->terrainWidth;
	if(x < 0)
		x = 0;
	if(x > s_worldData->terrainWidth - 1 )
		x = s_worldData->terrainWidth - 1;


	int y = t2 * s_worldData->terrainHeight;
	if(y < 0)
		y = 0;
	if(y > s_worldData->terrainHeight - 1 )
		y = s_worldData->terrainHeight - 1;
#endif

	/* return index */
	//Com_Printf("found: %i\n", s_worldData->terrainImage[ y * s_worldData->terrainWidth * 4 + x * 4 ]);
	if(s_worldData->terrainFlip) {
		return s_worldData->terrainImage[ (s_worldData->terrainHeight - y) * s_worldData->terrainWidth * 4 + x * 4 ];
	} else {
		return s_worldData->terrainImage[ y * s_worldData->terrainWidth * 4 + x * 4 ];
	}
}

/*
   GetIndexedShader() - ydnar
   for a given set of indexes and an indexmap, get a shader and set the vertex alpha in-place
   this combines a couple different functions from terrain.c
 */

const char *GetIndexedShader( terrain_t *s_worldData, int numPoints, byte *shaderIndexes ){
	/* early out if bad data */
	if ( s_worldData->terrainImage == NULL || numPoints <= 0 || shaderIndexes == NULL ) {
		return  "default";
	}

	/* determine min/max index */
	byte minShaderIndex = 255;
	byte maxShaderIndex = 0;
	for ( int i = 0; i < numPoints; i++ )
	{
		minShaderIndex = MIN( minShaderIndex, shaderIndexes[ i ] );
		maxShaderIndex = MAX( maxShaderIndex, shaderIndexes[ i ] );
	}

	/* set alpha inline */
	for ( int i = 0; i < numPoints; i++ )
	{
		/* straight rip from terrain.c */
		if ( shaderIndexes[ i ] < maxShaderIndex ) {
			shaderIndexes[ i ] = 0;
		}
		else{
			shaderIndexes[ i ] = 255;
		}
	}

	/* get the shader */
	const char *si = ( minShaderIndex == maxShaderIndex )?
	                            va( "textures/%s_%i", s_worldData->terrainMaster, maxShaderIndex ):
	                            va( "textures/%s_%ito%i", s_worldData->terrainMaster, minShaderIndex, maxShaderIndex );
	/* return the shader */
	return si;
}

#endif


#define GL_BYTE					0x1400
#define GL_UNSIGNED_BYTE			0x1401
#define GL_SHORT				0x1402
#define GL_UNSIGNED_SHORT			0x1403
#define GL_RGB					0x1907
#define GL_RGBA					0x1908
#define GL_LUMINANCE				0x1909
#define GL_LUMINANCE_ALPHA			0x190A
#define GL_UNSIGNED_SHORT_5_6_5           0x8363
#define GL_UNSIGNED_SHORT_4_4_4_4           0x8033

/*
==================
R_ConvertTextureFormat

Convert RGBA unsigned byte to specified format and type
==================
*/
#define ROW_PADDING( width, bpp, alignment ) PAD( (width) * (bpp), (alignment) ) - (width) * (bpp)
void R_ConvertTextureFormat( const byte *in, int width, int height, int format, int type, byte *out )
{
	int x, y, rowPadding;
	int unpackAlign = 4; // matches GL_UNPACK_ALIGNMENT default

	if ( format == GL_RGB && type == GL_UNSIGNED_BYTE )
	{
		rowPadding = ROW_PADDING( width, 3, unpackAlign );

		for ( y = 0; y < height; y++ )
		{
			for ( x = 0; x < width; x++ )
			{
				*out++ = *in++;
				*out++ = *in++;
				*out++ = *in++;
				in++;
			}

			out += rowPadding;
		}
	}
	else if ( format == GL_LUMINANCE && type == GL_UNSIGNED_BYTE )
	{
		rowPadding = ROW_PADDING( width, 1, unpackAlign );

		for ( y = 0; y < height; y++ )
		{
			for ( x = 0; x < width; x++ )
			{
				*out++ = *in++; // red
				in += 3;
			}

			out += rowPadding;
		}
	}
	else if ( format == GL_LUMINANCE_ALPHA && type == GL_UNSIGNED_BYTE )
	{
		rowPadding = ROW_PADDING( width, 2, unpackAlign );

		for ( y = 0; y < height; y++ )
		{
			for ( x = 0; x < width; x++ )
			{
				*out++ = *in++; // red
				in += 2;
				*out++ = *in++; // alpha
			}

			out += rowPadding;
		}
	}
	else if ( format == GL_RGB && type == GL_UNSIGNED_SHORT_5_6_5 )
	{
		rowPadding = ROW_PADDING( width, 2, unpackAlign );

		for ( y = 0; y < height; y++ )
		{
			for ( x = 0; x < width; x++, in += 4, out += 2 )
			{
				*((unsigned short*)out) = ( (unsigned short)( in[0] >> 3 ) << 11 )
					    | ( (unsigned short)( in[1] >> 2 ) << 5 )
					    | ( (unsigned short)( in[2] >> 3 ) << 0 );
			}

			out += rowPadding;
		}
	}
	else if ( format == GL_RGBA && type == GL_UNSIGNED_SHORT_4_4_4_4 )
	{
		rowPadding = ROW_PADDING( width, 2, unpackAlign );

		for ( y = 0; y < height; y++ )
		{
			for ( x = 0; x < width; x++, in += 4, out += 2 )
			{
				*((unsigned short*)out) = ( (unsigned short)( in[0] >> 4 ) << 12 )
					    | ( (unsigned short)( in[1] >> 4 ) << 8 )
					    | ( (unsigned short)( in[2] >> 4 ) << 4 )
					    | ( (unsigned short)( in[3] >> 4 ) << 0 );
			}

			out += rowPadding;
		}
	}
	else
	{
		ri.Error( ERR_DROP, "Unable to convert RGBA image to OpenGL format 0x%X and type 0x%X", format, type );
	}
}


//==================== PALETTES ========================
#define FILE_HASH_SIZE		1024

typedef struct palette_s {
	char		*imgName;
	struct palette_s *next;
	int  a;
	int  r;
	int  g;
	int  b;
	struct image_s *image;
} palette_t;


static	palette_t*		paletteTable[FILE_HASH_SIZE];

void R_ClearPalettes( void ) {
	Com_Memset(paletteTable, 0, sizeof(paletteTable));
}

#define generateHashValue(fname) Com_GenerateHashValue((fname),FILE_HASH_SIZE)

void R_AddPalette(const char *name, int a, int r, int g, int b) {
	int hash;
	palette_t *palette;
	char normalName[MAX_OSPATH];
	const char *s;
	if(!name) {
		return;
	}
	if((s = Q_stristr(name, ".pk3dir/"))) {
		name = s + 8;
	}
	COM_StripExtension(name, normalName, MAX_OSPATH);
	hash = generateHashValue(normalName);
	//Com_Printf("palette: %s %i %i %i\n", name, r, g, b);
	int namelen = strlen(normalName);
	for (palette=paletteTable[hash]; palette; palette=palette->next) {
		if ( !Q_stricmp( normalName, palette->imgName ) ) {
			return; // found
		}
	}

	palette = ri.Hunk_Alloc( sizeof( *palette ) + namelen + 1, h_low );
	palette->imgName = (char *)( palette + 1 );
	strcpy( palette->imgName, normalName );
	palette->a = a;
	palette->r = r;
	palette->g = g;
	palette->b = b;
	palette->next = paletteTable[hash];
	paletteTable[hash] = palette;
}


Q_EXPORT byte *R_FindPalette(const char *name) {
	palette_t *palette;
	long	hash;
	char normalName[MAX_OSPATH];
	COM_StripExtension(name, normalName, MAX_OSPATH);
	hash = generateHashValue(normalName);
	for (palette=paletteTable[hash]; palette; palette=palette->next) {
		if ( palette->imgName[0] && !Q_stricmp( normalName, palette->imgName ) ) {
			//if(!palette->image) {
				static byte	data[16][16][4];
				for(int x = 0; x < 16; x++) {
					for(int y = 0; y < 16; y++) {
						//if(r_seeThroughWalls->integer) {
						//	data[x][y][3] = palette->a * 0.5;
						//} else {
							data[x][y][3] = palette->a;
						//}
						data[x][y][2] = palette->b;
						data[x][y][1] = palette->g;
						data[x][y][0] = palette->r;
					}
				}
				//palette->image = R_CreateImage2(
				//	va("*pal%i-%i-%i-%i", palette->r, palette->g, palette->b, palette->a), 
				//	(byte *)data, 16, 16, GL_RGBA8, IMGTYPE_COLORALPHA, 0, IMGFLAG_NONE, GL_RGBA8);
				return &data[0][0][0];
			//}
		}
	}
	return NULL;
}


byte *R_RaddtoRGBA(byte *pic, byte *pic2, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan, *alpha;
	int i;
	for ( i = 0, img = grey, scan = pic, alpha = pic2; i < width * height; i++, alpha += 4, img += 4, scan += 1 ) {
		img[0] = alpha[0] + scan[0];
		img[1] = alpha[1] + scan[1];
		img[2] = alpha[2] + scan[2];
		img[3] = alpha[3];
		if(img[0] > 255) img[0] = 255;
		if(img[1] > 255) img[1] = 255;
		if(img[2] > 255) img[2] = 255;
	}

	return grey;
}


// because i'm going to need a drink after this one
byte *R_RtoRGBA(byte *pic, byte *pic2, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

//if ( tr.mapLoading && r_mapGreyScale->value > 0 ) {
	byte *img, *scan, *alpha;
	int i;
	for ( i = 0, img = grey, scan = pic, alpha = pic2; i < width * height; i++, alpha += 4, img += 4, scan += 1 ) {
		img[0] = scan[0];
		img[1] = scan[0];
		img[2] = scan[0];
		img[3] = alpha[3];
	}
//}
	return grey;
}


byte *R_RGBAtoR(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 1);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 1, scan += 4 ) {
		byte luma = LUMA( scan[0], scan[1], scan[2] );
		img[0] = luma;
		img[1] = luma;
		img[2] = luma;
	}

	return grey;
}

/*
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns HSL in the set [0, 1].
 */
HSL rgb2hsl(float r, float g, float b) {
  
  HSL result;
  
  r /= 255;
  g /= 255;
  b /= 255;
  
  float max = MAX(MAX(r,g),b);
  float min = MIN(MIN(r,g),b);
  
  result.h = result.s = result.l = (max + min) / 2;

  if (max == min) {
    result.h = result.s = 0; // achromatic
  }
  else {
    float d = max - min;
    result.s = (result.l > 0.5) ? d / (2 - max - min) : d / (max + min);
    
    if (max == r) {
      result.h = (g - b) / d + (g < b ? 6 : 0);
    }
    else if (max == g) {
      result.h = (b - r) / d + 2;
    }
    else if (max == b) {
      result.h = (r - g) / d + 4;
    }
    
    result.h /= 6;
  }

  return result;
  
}

////////////////////////////////////////////////////////////////////////

/*
 * Converts an HUE to r, g or b.
 * returns float in the set [0, 1].
 */
float hue2rgb(float p, float q, float t) {

  if (t < 0) 
    t += 1;
  if (t > 1) 
    t -= 1;
  if (t < 1./6) 
    return p + (q - p) * 6 * t;
  if (t < 1./2) 
    return q;
  if (t < 2./3)   
    return p + (q - p) * (2./3 - t) * 6;
    
  return p;
  
}

////////////////////////////////////////////////////////////////////////

/*
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns RGB in the set [0, 255].
 */
RGB hsl2rgb(float h, float s, float l) {

  RGB result;
  
  if(0 == s) {
    result.r = result.g = result.b = l; // achromatic
  }
  else {
    float q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    float p = 2 * l - q;
    result.r = hue2rgb(p, q, h + 1./3) * 255;
    result.g = hue2rgb(p, q, h) * 255;
    result.b = hue2rgb(p, q, h - 1./3) * 255;
  }

  return result;

}

byte *R_Rainbow2(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.h = fmodf((float)i/width + (float)i/height, 1.0f);
		//hsl.l = ((float)i)/width/height * 2;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}

byte *R_LumShift(float lumShift, byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.l += lumShift;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}

byte *R_SatShift(float satShift, byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.s += satShift;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}

byte *R_HueShift(float hueShift, byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.h += hueShift;
		//hsl.l = 1.0f - hsl.l;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}

byte *R_Rainbow(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.h = ((float)i)/width/height * 2;
		//hsl.l = 1.0f - hsl.l;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}


byte *R_InvertColors4(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.h = hsl.h + 0.5f;
		hsl.s = 1.0f - hsl.s;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}

byte *R_InvertColors3(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.h = hsl.h + 0.5f;
		hsl.l = 1.0f - hsl.l;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}


byte *R_InvertColors2(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		HSL hsl = rgb2hsl(scan[0], scan[1], scan[2]);
		hsl.h += 0.5f;
		RGB rgb = hsl2rgb(hsl.h, hsl.s, hsl.l);
		img[0] = rgb.r;
		img[1] = rgb.g;
		img[2] = rgb.b;
		img[3] = scan[3];
	}

	return grey;
}

byte *R_InvertColors(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
			img[0] = 0xFF ^ scan[0];
			img[1] = 0xFF ^ scan[1];
			img[2] = 0xFF ^ scan[2];
			img[3] = scan[3];
	}

	return grey;
}

byte *R_Berserk(byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

//if ( tr.mapLoading && r_mapGreyScale->value > 0 ) {
	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		float luma = LUMA( scan[0], scan[1], scan[2] );
		img[0] = LERP( scan[0], luma, 1.0f );
		img[1] = LERP( scan[1], luma, 1.0f ) * 0.1f;
		img[2] = LERP( scan[2], luma, 1.0f ) * 0.1f;
		img[3] = scan[3];
	}
//}
	return grey;
}

byte *R_GreyScale(float greyscale, byte *pic, int width, int height) {
	byte *grey = ri.Malloc(width * height * 4);

//if ( tr.mapLoading && r_mapGreyScale->value > 0 ) {
	byte *img, *scan;
	int i;
	for ( i = 0, img = grey, scan = pic; i < width * height; i++, img += 4, scan += 4 ) {
		float luma = LUMA( scan[0], scan[1], scan[2] );
		img[0] = LERP( scan[0], luma, greyscale );
		img[1] = LERP( scan[1], luma, greyscale );
		img[2] = LERP( scan[2], luma, greyscale );
		img[3] = scan[3];
	}
//}
	return grey;
}



// ========================== canny ======================



// Use short int instead `unsigned char' so that we can
// store negative values.

#define MAX_BRIGHTNESS 255
#define FLT_MAX 3.402823466e+38

// if normalize is true, map pixels to range 0..MAX_BRIGHTNESS
void convolution(const pixel_t *in, pixel_t *out, const float *kernel,
                 const int nx, const int ny, const int kn,
                 const qboolean normalize)
{
    assert(kn % 2 == 1);
    assert(nx > kn && ny > kn);
    const int khalf = kn / 2;
    float min = FLT_MAX, max = -FLT_MAX;

    if (normalize)
        for (int m = khalf; m < nx - khalf; m++)
            for (int n = khalf; n < ny - khalf; n++) {
                float pixel = 0.0;
                size_t c = 0;
                for (int j = -khalf; j <= khalf; j++)
                    for (int i = -khalf; i <= khalf; i++) {
                        pixel += in[(n - j) * nx + m - i] * kernel[c];
                        c++;
                    }
                if (pixel < min)
                    min = pixel;
                if (pixel > max)
                    max = pixel;
                }

    for (int m = khalf; m < nx - khalf; m++)
        for (int n = khalf; n < ny - khalf; n++) {
            float pixel = 0.0;
            size_t c = 0;
            for (int j = -khalf; j <= khalf; j++)
                for (int i = -khalf; i <= khalf; i++) {
                    pixel += in[(n - j) * nx + m - i] * kernel[c];
                    c++;
                }

            if (normalize)
                pixel = MAX_BRIGHTNESS * (pixel - min) / (max - min);
            out[n * nx + m] = (pixel_t)pixel;
        }
}

/*
 * gaussianFilter:
 * http://www.songho.ca/dsp/cannyedge/cannyedge.html
 * determine size of kernel (odd #)
 * 0.0 <= sigma < 0.5 : 3
 * 0.5 <= sigma < 1.0 : 5
 * 1.0 <= sigma < 1.5 : 7
 * 1.5 <= sigma < 2.0 : 9
 * 2.0 <= sigma < 2.5 : 11
 * 2.5 <= sigma < 3.0 : 13 ...
 * kernelSize = 2 * int(2*sigma) + 3;
 */
void gaussian_filter(const pixel_t *in, pixel_t *out,
                     const int nx, const int ny, const float sigma)
{
    const int n = 2 * (int)(2 * sigma) + 3;
    const float mean = (float)floor(n / 2.0);
    float (*kernel); // variable length array
		kernel = ri.Malloc(n * n * sizeof(float));

    //fprintf(stderr, "gaussian_filter: kernel size %d, sigma=%g\n",
    //        n, sigma);
    size_t c = 0;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++) {
            kernel[c] = exp(-0.5 * (pow((i - mean) / sigma, 2.0) +
                                    pow((j - mean) / sigma, 2.0)))
                        / (2 * M_PI * sigma * sigma);
            c++;
        }

    convolution(in, out, kernel, nx, ny, n, qtrue);
		ri.Free(kernel);
}

/*
 * Links:
 * http://en.wikipedia.org/wiki/Canny_edge_detector
 * http://www.tomgibara.com/computer-vision/CannyEdgeDetector.java
 * http://fourier.eng.hmc.edu/e161/lectures/canny/node1.html
 * http://www.songho.ca/dsp/cannyedge/cannyedge.html
 *
 * Note: T1 and T2 are lower and upper thresholds.
 */
pixel_t *canny_edge_detection(const pixel_t *in,
															const int nx,
															const int ny,
                              pixel_t *out,
                              const int tmin, const int tmax,
                              const float sigma)
{

    pixel_t *G = calloc(nx * ny * sizeof(pixel_t), 1);
    pixel_t *after_Gx = calloc(nx * ny * sizeof(pixel_t), 1);
    pixel_t *after_Gy = calloc(nx * ny * sizeof(pixel_t), 1);
    pixel_t *nms = calloc(nx * ny * sizeof(pixel_t), 1);
    //pixel_t *out = malloc(bmp_ih->bmp_bytesz * sizeof(pixel_t));

    if (G == NULL || after_Gx == NULL || after_Gy == NULL ||
        nms == NULL || out == NULL) {
        fprintf(stderr, "canny_edge_detection:"
                " Failed memory allocation(s).\n");
        exit(1);
    }

    gaussian_filter(in, out, nx, ny, sigma);

    const float Gx[] = {-1, 0, 1,
                        -2, 0, 2,
                        -1, 0, 1};

    convolution(out, after_Gx, Gx, nx, ny, 3, qfalse);

    const float Gy[] = { 1, 2, 1,
                         0, 0, 0,
                        -1,-2,-1};

    convolution(out, after_Gy, Gy, nx, ny, 3, qfalse);

    for (int i = 1; i < nx - 1; i++)
        for (int j = 1; j < ny - 1; j++) {
            const int c = i + nx * j;
            // G[c] = abs(after_Gx[c]) + abs(after_Gy[c]);
            G[c] = (pixel_t)hypot(after_Gx[c], after_Gy[c]);
        }

    // Non-maximum suppression, straightforward implementation.
    for (int i = 1; i < nx - 1; i++)
        for (int j = 1; j < ny - 1; j++) {
            const int c = i + nx * j;
            const int nn = c - nx;
            const int ss = c + nx;
            const int ww = c + 1;
            const int ee = c - 1;
            const int nw = nn + 1;
            const int ne = nn - 1;
            const int sw = ss + 1;
            const int se = ss - 1;

            const float dir = (float)(fmod(atan2(after_Gy[c],
                                                 after_Gx[c]) + M_PI,
                                           M_PI) / M_PI) * 8;

            if (((dir <= 1 || dir > 7) && G[c] > G[ee] &&
                 G[c] > G[ww]) || // 0 deg
                ((dir > 1 && dir <= 3) && G[c] > G[nw] &&
                 G[c] > G[se]) || // 45 deg
                ((dir > 3 && dir <= 5) && G[c] > G[nn] &&
                 G[c] > G[ss]) || // 90 deg
                ((dir > 5 && dir <= 7) && G[c] > G[ne] &&
                 G[c] > G[sw]))   // 135 deg
                nms[c] = G[c];
            else
                nms[c] = 0;
        }

    // Reuse array
    // used as a stack. nx*ny/2 elements should be enough.
    int *edges = (int*) after_Gy;
    memset(out, 0, sizeof(pixel_t) * nx * ny);
    memset(edges, 0, sizeof(pixel_t) * nx * ny);

    // Tracing edges with hysteresis . Non-recursive implementation.
    size_t c = 1;
    for (int j = 1; j < ny - 1; j++)
        for (int i = 1; i < nx - 1; i++) {
            if (nms[c] >= tmax && out[c] == 0) { // trace edges
                out[c] = MAX_BRIGHTNESS;
                int nedges = 1;
                edges[0] = c;

                do {
                    nedges--;
                    const int t = edges[nedges];

                    int nbs[8]; // neighbours
                    nbs[0] = t - nx;     // nn
                    nbs[1] = t + nx;     // ss
                    nbs[2] = t + 1;      // ww
                    nbs[3] = t - 1;      // ee
                    nbs[4] = nbs[0] + 1; // nw
                    nbs[5] = nbs[0] - 1; // ne
                    nbs[6] = nbs[1] + 1; // sw
                    nbs[7] = nbs[1] - 1; // se

                    for (int k = 0; k < 8; k++)
                        if (nms[nbs[k]] >= tmin && out[nbs[k]] == 0) {
                            out[nbs[k]] = MAX_BRIGHTNESS;
                            edges[nedges] = nbs[k];
                            nedges++;
                        }
                } while (nedges > 0);
            }
            c++;
        }

    free(after_Gx);
    free(after_Gy);
    free(G);
    free(nms);

    return out;
}


