models/mapobjects/atlantis/water04
{
	deformVertexes wave 100 sin 0 1 0 1.5
	cull none
	entityMergable		// allow all the sprites to be merged together
	{
		map models/mapobjects/atlantis/water04.tga
		blendFunc GL_SRC_ALPHA GL_ONE_MINUS_SRC_ALPHA
		tcmod scroll 0 -3.5
		rgbGen		vertex
		alphaGen	vertex
	}
}
