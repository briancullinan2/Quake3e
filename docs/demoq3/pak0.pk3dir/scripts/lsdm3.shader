//textures/lsdm3/light_90
//{
//	q3map_lightimage textures/lsdm3/light.tga
//	q3map_surfacelight 90
//	{
//		map textures/lsdm3/light.tga
//	}
//	{
//		map textures/effects/tinfx2.tga
//		blendfunc add
//		rgbGen identity
//		tcGen environment 
//	}
//	{
//		map $lightmap 
//		blendfunc gl_dst_color gl_one_minus_dst_alpha
//		rgbGen identity
//	}
//}

textures/lsdm3/trim_light_blue
{
	qer_editorimage textures/lsdm3/wsupprt1_12_blue.tga
 	surfaceparm nomarks
      q3map_lightmapsamplesize 8
	q3map_surfacelight 100
	q3map_lightimage textures/lsdm3/wsupprt1_12.blend.blue.tga

	{
		map $lightmap
		rgbGen identity
	}
	{
		map textures/lsdm3/wsupprt1_12_blue.tga
		blendFunc GL_DST_COLOR GL_ZERO
		rgbGen identity
	}
	{
		map textures/lsdm3/wsupprt1_12.blend.blue.tga
//		rgbGen wave sin 0.5 0.5 1 1
		blendfunc GL_ONE GL_ONE
	}
}

textures/lsdm3/ceil_blue_100
{
	qer_editorimage textures/lsdm3/ceil1_30.tga
	surfaceparm nomarks
      q3map_lightmapsamplesize 8
	q3map_surfacelight 120

	{
		map $lightmap
		rgbGen identity
	}
	{
		map textures/lsdm3/ceil1_30.tga
		blendFunc GL_DST_COLOR GL_ZERO
		rgbGen identity
	}
	{
		map textures/lsdm3/ceil1_30.blend.tga
		blendfunc GL_ONE GL_ONE
	}
}

textures/lsdm3/nunukc_glass
{
	qer_editorimage textures/lsdm3/nunukc.tga
	{
		map textures/lsdm3/doomfx1.tga
		tcGen environment
		rgbGen identity
	}
	{
		map textures/lsdm3/nunukc.tga
		blendFunc GL_ONE GL_SRC_ALPHA
		rgbGen identity
	}
	{
		map $lightmap
		blendFunc GL_DST_COLOR GL_ZERO
		rgbGen identity
	}
}

//textures/lsdm3/reflective_concrete
//{
//	qer_editorimage textures/lsdm3/nunukc_reflection.tga
//	{
//		map textures/common/mirror1.tga
//		blendfunc GL_ONE GL_ONE_MINUS_SRC_ALPHA
//		depthWrite
//	}
//	{
//		map textures/lsdm3/nunukc_reflection.tga
//		blendFunc GL_ONE GL_SRC_ALPHA
//		rgbGen identity
//	}
//	{
//		map $lightmap
//		blendFunc GL_DST_COLOR GL_ZERO
//		rgbGen identity
//	}
//}

//
// cardigan Skybox - Cardigan.digitalarena.com
//

textures/lsdm3/nebula1_blue_lightning
{
	qer_editorimage textures/cardigan_skies1/sparse_blue_nebula.tga
	surfaceparm noimpact
	surfaceparm nolightmap
	surfaceparm nomarks
      q3map_lightmapsamplesize 8
//	q3map_sun 0.682353 0.807843 1 160 90 90
      q3map_sun 0.473207 0.709162 1.000000 1 32 90
	skyParms env/cardigan/purewhitej 1200 -
	{
		map textures/lsdm3/circlegradlightningblur2.tga
		blendfunc add
		rgbGen wave noise 0 1 0 10 
		tcMod scale 0.32 0.32
		tcMod rotate 20
	}
	{
		map textures/lsdm3/sparse_blue_nebula.tga
		blendfunc filter
		tcMod scroll -0.08 0
	}
}

textures/lsdm3/nebula1_blue_stars
{
	qer_editorimage textures/lsdm3/sparse_blue_nebula.tga
	surfaceparm noimpact
	surfaceparm nolightmap
	surfaceparm nomarks
	q3map_sun 0.682353 0.807843 1 110 180 80
	skyParms env/cardigan/purewhitej 1200 -
	{
		map textures/lsdm3/starfield2.tga
		blendfunc add
		rgbGen identity
		tcMod scroll -0.05 0
		tcMod scale 3 3
	}
	{
		map textures/lsdm3/sparse_blue_nebula.tga
		blendfunc filter
		tcMod scroll -0.08 0
	}
}

//
// cardigan lasercorona - Cardigan.digitalarena.com
//

textures/lsdm3/lasercorona
{
	qer_editorimage textures/lsdm3/flare1.tga
	surfaceparm nonsolid
	surfaceparm trans
	cull disable
	deformVertexes autosprite
	{
		clampmap textures/lsdm3/flare1.tga
		blendfunc add
		rgbGen wave noise 0.5 1 0 15 
		tcMod rotate 4
		tcMod stretch sin 0.8 0.3 0 1 
	}
}

//
// cardigan laser - Cardigan.digitalarena.com
//

textures/lsdm3/tail_laser
{
	qer_editorimage textures/lsdm3/tail_laser.tga
	surfaceparm nonsolid
	surfaceparm trans
	cull disable
	deformVertexes autosprite2
	{
		map textures/lsdm3/tail_laser.tga
		blendfunc add
		rgbGen wave noise 0.5 1 0 15 
	}
}

//
// cardigan laser - Cardigan.digitalarena.com
//

textures/lsdm3/tail_laser2
{
	qer_editorimage textures/lsdm3/tail_laser2.tga
	surfaceparm nonsolid
	surfaceparm trans
	cull disable
	deformVertexes autosprite2
	{
		map textures/lsdm3/tail_laser2.tga
		blendfunc blend
//		rgbGen wave noise 0.5 1 0 15 
	}
}

textures/lsdm3/xblueflare2
{
cull disable
surfaceparm trans
surfaceparm nolightmap
    deformVertexes autoSprite2
{
map textures/lsdm3/xblueflare2.tga
blendfunc add
rgbgen identity
}
}

textures/lsdm3/xblueflare2_wavesin
{
qer_editorimage textures/lsdm3/xblueflare2.tga
cull disable
surfaceparm trans
surfaceparm nolightmap
deformVertexes autoSprite2
{
map textures/lsdm3/xblueflare2.tga
blendfunc add
rgbgen identity
rgbGen wave sin 0.5 0.5 0 1
}
}

//**********************************************************************//
//									//
//	stratosphere.shader for Q3Radiant				//
//	by Sock - 23rd November 2000					//
//									//
//**********************************************************************//

textures/lsdm3/strat_skybox
{
	qer_editorimage textures/common/skybox.tga
	surfaceparm noimpact
	surfaceparm nolightmap
	q3map_globaltexture
	q3map_lightsubdivide 256
	q3map_surfacelight 50
	surfaceparm sky
	q3map_sun 0.941 0.984 1.00 100 270 75
	skyparms textures/lsdm3/stratosphere - -
}

//textures/lsdm3/nunuk-bluedark
//     {
//     qer_editorimage textures/lsdm3/nunuk-bluedark.tga
//     q3map_lightmapsamplesize 8
//     }

//textures/lsdm3/nunukc
//    {
//     qer_editorimage textures/lsdm3/nunukc.tga
//     q3map_lightmapsamplesize 8
//     }

textures/lsdm3/glass
{
	qer_editorimage textures/lsdm3/chrome_metal.tga
	surfaceparm nolightmap
	surfaceparm trans
	cull disable
{
	map textures/lsdm3/chrome_metal.tga
	blendfunc add
	rgbGen identity
	tcGen environment 
}
}

textures/lsdm3/blue_fluid
{
	qer_editorimage textures/lsdm3/blue_fluid.tga
	q3map_lightimage textures/lsdm3/blue_fluid.tga
	q3map_surfacelight 700
	{
		map textures/lsdm3/bubbles.tga
		blendfunc add
		tcMod scroll 0 0.3
		tcMod scale 2 2
	}
//	{
//		map textures/lsdm3/pulse.tga
//		blendfunc add
//		tcMod scroll 0 1
//		tcMod scale 1.5 1.5
//	}
	{
		map textures/lsdm3/blue_fluid.tga
		blendfunc add
		tcMod scale 0.8 0.8
	}
	{
		map textures/lsdm3/chrome_metal.tga
		blendfunc add
		rgbGen identity
		tcGen environment 
	}
	{
		map $lightmap 
		blendfunc gl_dst_color gl_one_minus_dst_alpha
		rgbGen identity
	}
}

textures/lsdm3/jumppad
{
	qer_editorimage textures/lsdm3/blue_telep.tga
	q3map_lightimage textures/lsdm3/blue_telep.tga
	q3map_surfacelight 200
//	cull disable
	surfaceparm nomarks
	surfaceparm trans
	sort additive

	{
		clampmap textures/lsdm3/blue_telep.tga
		blendFunc add
		tcmod rotate 327
		rgbGen identity
	}
	{
		clampmap textures/lsdm3/blue_telep.tga
		blendFunc add
		tcmod rotate -160
		rgbGen identity
	}
	{
		map $lightmap
		rgbGen identity
		blendFunc GL_DST_COLOR GL_ZERO
		depthFunc equal
	}
}