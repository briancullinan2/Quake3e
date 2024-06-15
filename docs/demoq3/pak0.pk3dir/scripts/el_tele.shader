models/mapobjects/el_tele/el_tele
{
    q3map_surfacelight 1000
    surfaceparm nomarks
     
    {
        map models/mapobjects/el_tele/el_tele.tga
    }
    {
        map $lightmap
        blendfunc filter
    }
    {
        map models/mapobjects/el_tele/el_tele_blend.tga
        blendfunc add
       rgbGen wave sin 0.5 0.5 0 1
    }
}
 models/mapobjects/el_tele/beam
{
       surfaceparm noimpact
    surfaceparm nolightmap
    surfaceparm nonsolid
    cull none
    q3map_lightimage models/mapobjects/el_tele/beam.tga
    q3map_surfacelight 800
    {
      map models/mapobjects/el_tele/beam.tga
        blendfunc add
        rgbGen wave sin 0 1 0 1
        tcMod scroll 0 1
       }
    {
        map models/mapobjects/el_tele/beam_fx2.tga
        blendfunc add
       rgbGen wave sin 0 1 0 1
    }
       {
      map models/mapobjects/el_tele/beam_fx.tga
        blendfunc add
        rgbGen wave sin 0 1 0 1
        tcMod scroll 0 2
       }
}