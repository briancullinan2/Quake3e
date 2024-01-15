
gfx/misc/snow
{
	cull none
	entitymergable
	//nofog
	//nomipmaps
	nopicmip
	sort decal
	{
		clampmap gfx/misc/snowflake.tga
		blendfunc blend
		//alphafunc GE128
		rgbgen vertex
	}
}

gfx/misc/raindrop
{
	cull none
	nomipmaps
	nopicmip
	{
		map gfx/misc/raindrop.tga
		blendfunc blend
		alphagen vertex
	}
}
