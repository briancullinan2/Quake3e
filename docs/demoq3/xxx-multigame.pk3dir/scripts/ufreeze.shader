models/powerups/instant/sight
{
	{
		map textures/effects/envmapyel.tga
		blendfunc GL_ONE GL_ZERO
		tcGen environment
		rgbGen const ( 1.0 0.9 0.8 )
	}
}

icons/sight
{
	nopicmip
	{
		map icons/sight.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	}
}

invisibility
{
	nopicmip

	{
		map gfx/effects/invismap2.tga
		blendfunc GL_ONE GL_ONE
		tcMod turb 0 0.15 0 0.25
		tcGen environment
		rgbgen entity
	}
}

invisibility_firing
{
	nopicmip
	deformvertexes wave 100 sin 0.5 0 0 0

	{
		map gfx/effects/invismap3.tga
		blendfunc GL_ONE GL_ONE
		tcMod scroll 0 0.9
		tcGen environment
		rgbgen entity
	}
}

spectatorcrosshair
{
	nopicmip
	{
		map gfx/2d/speccrosshair.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbgen vertex
	}
}

grappleFlare
{
	nopicmip
	cull none

	{
		clampmap gfx/misc/grappleflare.jpg
		blendfunc GL_ONE GL_ONE
                tcmod rotate 673
	}
}

quad_nocull
{
	nopicmip
	cull none

	{
		map textures/effects/quadmap2.tga
		blendfunc GL_ONE GL_ONE
		tcGen environment
                tcmod rotate 197
                tcmod scroll 1 .1
		rgbgen entity
	}
}

freezeShader
{
	nopicmip
	deformvertexes wave 100 sin 0.5 0 0 0
	{
		map textures/effects/envmap.tga
		blendfunc gl_one gl_one
		rgbgen const ( 0.15 0.15 0.15 )
		tcgen environment
	}
	{
		map gfx/ice/icechunks.tga
		blendfunc gl_one gl_one
    rgbgen const ( 0.20 0.20 0.20 )
		tcmod scale 8 8
	}
}

freezeShader_a
{
	nopicmip
	deformvertexes wave 100 sin 3 0 0 0

	{
		map textures/effects/envmap.tga
		blendfunc gl_one gl_one
		rgbgen entity
		tcgen environment
	}
}

freezeShader_b
{
	nopicmip
	deformvertexes wave 100 sin 3 0 0 0

	{
		map gfx/ice/icechunks.tga
		blendfunc gl_one gl_one
		rgbGen entity
		tcmod scale 4 4
	}
}

freezeShader2
{
	nopicmip

	{
		map textures/effects/envmap.tga
		blendfunc gl_one gl_one
		rgbgen const ( 0.20 0.20 0.20 )
		tcgen environment
	}

	{
		map gfx/ice/icechunks.tga
		blendfunc gl_one gl_one
		rgbgen const ( 0.15 0.15 0.15 )
		tcmod scale 4 4
	}
}

freezeShader2_nocull
{
	nopicmip
	cull none

	{
		map textures/effects/envmap.tga
		blendfunc gl_one gl_one
		rgbgen const ( 0.20 0.20 0.20 )
		tcgen environment
	}

	{
		map gfx/ice/icechunks.tga
		blendfunc gl_one gl_one
		rgbgen const ( 0.15 0.15 0.15 )
		tcmod scale 4 4
	}
}

bbox
{
	nopicmip

	{
		map gfx/misc/bbox.tga
		blendFunc GL_ONE GL_ONE
		rgbGen vertex
	}
}

bbox_nocull
{
	nopicmip
	cull none

	{
		map gfx/misc/bbox.tga
		blendFunc GL_ONE GL_ONE
		rgbGen vertex
	}
}

snowflake
{
	nopicmip
	sort nearest

	{
		clampmap gfx/misc/raildisc_mono2.tga 
		blendFunc GL_ONE GL_ONE
		rgbGen vertex
	}
}

rain
{
	nopicmip
	cull none
	sort nearest

	{
		map gfx/misc/raindrop.tga
		blendFunc GL_ONE GL_ONE
		rgbGen vertex
	}
}

freezeMarkShader
{
	nopicmip
	polygonoffset
	{
		clampmap gfx/damage/freeze_stain.tga
		blendfunc gl_src_alpha gl_one_minus_src_alpha
		rgbgen identitylighting
		alphagen vertex
	}
}

gfx/2d/fixed_crosshair
{
	nopicmip
	{
		map gfx/2d/crosshair.tga          
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA                
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshairb
{
	nopicmip
	{
		map gfx/2d/crosshairb.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshairc
{
	nopicmip
	{
		map gfx/2d/crosshairc.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshaird
{
	nopicmip
	{
		map gfx/2d/crosshaird.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshaire
{
	nopicmip
	{
		map gfx/2d/crosshaire.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshairf
{
	nopicmip
	{
		map gfx/2d/crosshairf.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshairg
{
	nopicmip
	{
		map gfx/2d/crosshairg.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshairh
{
	nopicmip
	{
		map gfx/2d/crosshairh.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/2d/fixed_crosshairi
{
	nopicmip
	{
		map gfx/2d/crosshairi.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}

}
gfx/2d/fixed_crosshairj
{
	nopicmip
	{
		map gfx/2d/crosshairj.tga       
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}
gfx/2d/fixed_crosshairk
{
	nopicmip
	{
		map gfx/2d/crosshairk.tga       
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
	        rgbGen vertex
	}
}

gfx/3d/crosshair
{
	nopicmip
	{
		map gfx/2d/crosshair.tga          
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA                
        	rgbGen entity
	}
}

gfx/3d/crosshairb
{
	nopicmip
	{
		map gfx/2d/crosshairb.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshairc
{
	nopicmip
	{
		map gfx/2d/crosshairc.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshaird
{
	nopicmip
	{
		map gfx/2d/crosshaird.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshaire
{
	nopicmip
	{
		map gfx/2d/crosshaire.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshairf
{
	nopicmip
	{
		map gfx/2d/crosshairf.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshairg
{
	nopicmip
	{
		map gfx/2d/crosshairg.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshairh
{
	nopicmip
	{
		map gfx/2d/crosshairh.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}

gfx/3d/crosshairi
{
	nopicmip
	{
		map gfx/2d/crosshairi.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}

}
gfx/3d/crosshairj
{
	nopicmip
	{
		map gfx/2d/crosshairj.tga       
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}
gfx/3d/crosshairk
{
	nopicmip
	{
		map gfx/2d/crosshairk.tga       
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		rgbGen entity
	}
}
