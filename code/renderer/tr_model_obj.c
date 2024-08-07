
#include "tr_local.h"

#define LL(x) x = LittleLong(x)

typedef enum
{
  EXPECT_KEY,
  EXPECT_SURFNAME,
  EXPECT_SHADER,
} parserState_t;

static void R_LoadModelMaterials(model_t *mod, const char *name)
{
  union
  {
    char *u;
    void *v;
  } buf;
  int i, keyI;
  char key[MAX_QPATH];
  qboolean keyEnd = qfalse;
  skin_t skin;
  int filesize;
  skinSurface_t parseSurfaces[MAX_SKIN_SURFACES];
  objHeader_t *obj = (objHeader_t *)mod->modelData;
  parserState_t keyState = EXPECT_KEY;

  memset(key, 0, sizeof(key));
  memset(&skin, 0, sizeof(skin));
  memset(parseSurfaces, 0, sizeof(parseSurfaces));

  filesize = ri.FS_ReadFile(va("%s.mat", name), (void **)&buf.v);
  if (!buf.u)
  {
    filesize = ri.FS_ReadFile(va("%s.mtl", name), (void **)&buf.v);
  }
  if (!buf.u)
  {
    return;
  }

  // TODO: step through every character and parse filename replacements
  for (i = 0; i < filesize; i++)
  {
    if (buf.u[i] == '\0')
    {
      break;
    }

    if (buf.u[i] == ' ' || buf.u[i] == '\n' || buf.u[i] == '\r' || buf.u[i] == '{' || buf.u[i] == '}' || buf.u[i] == '\t')
    {
      keyEnd = qtrue;
    }

    if (keyI == MAX_QPATH - 1)
    {
      keyEnd = qtrue;
    }

    if (!keyEnd)
    {
      if (keyI == 0 && buf.u[i] == '#')
      {
        // continue;??
      }
      else
      {
        key[keyI++] = buf.u[i];
        key[keyI] = '\0';
      }
    }

    if (keyEnd)
    {
      if (key[0] != '\0')
      {
        if (keyState == EXPECT_SURFNAME)
        {
          Q_strncpy(parseSurfaces[skin.numSurfaces].name, key, MAX_QPATH);
          keyState = EXPECT_KEY;
        }

        if (keyState == EXPECT_SHADER)
        {
          parseSurfaces[skin.numSurfaces].shader = R_FindShader(key, LIGHTMAP_NONE, qfalse);
          Com_Printf("Replacing texture %s -> %s\n", parseSurfaces[skin.numSurfaces].name, key);
          skin.numSurfaces++;

          keyState = EXPECT_KEY;
        }

        if (!Q_stricmp(key, "newmtl") || !Q_stricmp(key, "material"))
        {
          keyState = EXPECT_SURFNAME;
        }
        else if (!Q_stricmp(key, "map_Kd") || !Q_stricmp(key, "texture"))
        {
          keyState = EXPECT_SHADER;
        }
        else
        {
          keyState = EXPECT_KEY;
        }
      }
      keyI = 0;
      keyEnd = qfalse;
      key[keyI] = '\0';
    }
  }

  ri.FS_FreeFile(buf.v);

  // TODO: create single surface skins for every replacement
  obj->materials = (skin_t *)ri.Hunk_Alloc(sizeof(skin_t) + sizeof(skinSurface_t) * skin.numSurfaces, h_low);
  obj->materials->numSurfaces = skin.numSurfaces;
  obj->materials->surfaces = (skinSurface_t *)(obj->materials + 1);
  if (skin.numSurfaces)
  {
    memcpy(obj->materials->surfaces, parseSurfaces, sizeof(skinSurface_t) * skin.numSurfaces);
  }
}

/**
 * @brief Parses a line of an Object file, counting primitive accordingly.
 */
static void R_CountObjPrimitive(model_t *mod, objHeader_t *obj, const char *line)
{

  if (!Q_strncmp(line, "g ", 2))
  { // group

    obj->num_groups++;
  }
  else if (!Q_strncmp(line, "v ", 2))
  { // vertex

    obj->num_points++;
  }
  else if (!Q_strncmp(line, "vt ", 3))
  { // texcoord

    obj->num_texcoords++;
  }
  else if (!Q_strncmp(line, "vn ", 3))
  { // normal

    obj->num_normals++;
  }
  else if (!Q_strncmp(line, "f ", 2))
  { // face

    int32_t num_verts = 0;

    const char *c = line + 2;
    while (*c)
    {
      uint16_t indices[3];
      int32_t n;

      if (sscanf(c, "%hu/%hu/%hu%n", &indices[0], &indices[1], &indices[2], &n) != 3)
      {
        Com_Error(ERR_DROP, "Malformed face for %s: %s\n", mod->name, line);
      }

      num_verts++;
      c += n;
    }

    // iterate the face, converting polygons into triangles

    if (num_verts < 3)
    {
      Com_Error(ERR_DROP, "Malformed face for %s: %s\n", mod->name, line);
    }

    obj->num_verts += num_verts;
    obj->num_tris += num_verts - 2;
  }

  // else we just ignore it
}

/**
 * @brief Parses the file and counts the number of primitives used; this is to make loading much easier to deal with.
 */
static void R_CountObjPrimitives(model_t *mod, objHeader_t *obj, const void *buffer)
{
  char line[MAX_STRING_CHARS];
  char *l = line;
  const char *c = buffer;

  memset(line, 0, sizeof(line));

  while (qtrue)
  {
    switch (*c)
    {

    case '\r':
    case '\n':
    case '\0':
      // l = g_strstrip(line);
      R_CountObjPrimitive(mod, obj, line);

      if (*c == '\0')
      {
        goto done;
      }

      memset(line, 0, sizeof(line));
      l = line;

      c++;
      break;

    default:
      *l++ = *c++;
      break;
    }
  }

done:
  if (obj->num_groups == 0)
    obj->num_groups = 1;

  Com_Printf("%s: %u tris in %u groups\n", mod->name, obj->num_tris, obj->num_groups);
}

static int currentGroup = 0;
static int currentPoint = 0;
static int currentVertex = 0;
static int currentTexcoord = 0;
static int currentNormal = 0;
static int currentTri = 0;

/**
 * @brief Parses a line of an Object file, allocating primitives accordingly.
 */
static void R_LoadObjPrimitive(model_t *mod, objHeader_t *obj, const char *line)
{

  if (!Q_strncmp(line, "g ", 2))
  { // group
    obj->groups[currentGroup].surfaceType = SF_OBJ;
    obj->groups[currentGroup].numVertices = currentVertex - obj->groups[currentGroup].firstVertex;
    obj->groups[currentGroup].numIndexes = currentTri - obj->groups[currentGroup].firstTri;

    if (obj->groups[currentGroup].name[0] != '\0')
    {
      currentGroup++;
    }
    obj->groups[currentGroup].surfaceType = SF_OBJ;
    Q_strncpy(obj->groups[currentGroup].name, (char *)line + strlen("g "), MAX_QPATH);
    obj->groups[currentGroup].firstVertex = currentVertex;
    obj->groups[currentGroup].firstTri = currentTri;
    obj->groups[currentGroup].verts = &obj->verts[currentVertex];
    obj->groups[currentGroup].tris = &obj->tris[currentTri];
  }
  else if (!Q_strncmp(line, "usemtl ", strlen("usemtl ")))
  { // material

    Q_strncpy(obj->groups[currentGroup].material, (char *)line + strlen("usemtl "), MAX_QPATH);
  }
  else if (!Q_strncmp(line, "v ", 2))
  { // vertex

    vec3_t v;

    if (sscanf(line + 2, "%f %f %f", &v[0], &v[2], &v[1]) != 3)
    {
      Com_Error(ERR_DROP, "Malformed vertex for %s: %s\n", mod->name, line);
    }

    AddPointToBounds(v, obj->mins, obj->maxs);

    memcpy(&obj->points[currentPoint], v, sizeof(v));
    currentPoint++;
  }
  else if (!Q_strncmp(line, "vt ", 3))
  { // texcoord

    vec2_t vt;

    if (sscanf(line + 3, "%f %f", &vt[0], &vt[1]) != 2)
    {
      Com_Error(ERR_DROP, "Malformed texcoord for %s: %s\n", mod->name, line);
    }

    vt[1] = -vt[1];

    memcpy(&obj->texcoords[currentTexcoord], vt, sizeof(vt));
    currentTexcoord++;
  }
  else if (!Q_strncmp(line, "vn ", 3))
  { // normal

    vec3_t vn;

    if (sscanf(line + 3, "%f %f %f", &vn[0], &vn[2], &vn[1]) != 3)
    {
      Com_Error(ERR_DROP, "Malformed normal for %s: %s\n", mod->name, line);
    }

    VectorNormalize(vn);

    memcpy(&obj->normals[currentNormal], vn, sizeof(vn));
    currentNormal++;
  }
  else if (!Q_strncmp(line, "f ", 2))
  { // face
    int startVertex = currentVertex;
    const char *c = line + 2;
    while (*c)
    {
      uint16_t indices[3];
      int32_t n;

      if (sscanf(c, "%hu/%hu/%hu%n", &indices[0], &indices[1], &indices[2], &n) != 3)
      {
        Com_Error(ERR_DROP, "Malformed face for %s: %s\n", mod->name, line);
      }

      obj->verts[currentVertex].point = obj->points[indices[0] - 1];
      obj->verts[currentVertex].texcoords = obj->texcoords[indices[1] - 1];
      obj->verts[currentVertex].normal = obj->normals[indices[2] - 1];
      obj->verts[currentVertex].indices[0] = indices[0];
      obj->verts[currentVertex].indices[1] = indices[1];
      obj->verts[currentVertex].indices[2] = indices[2];
      obj->verts[currentVertex].position = currentVertex;
      currentVertex++;
      c += n;
    }

    // iterate the face, converting polygons into triangles

    const size_t len = currentVertex - startVertex;

    if (len < 3)
    {
      Com_Error(ERR_DROP, "Malformed face for %s: %s\n", mod->name, line);
    }

    for (size_t i = 1; i < len - 1; i++)
    {
      obj->tris[currentTri][0] = obj->verts[startVertex].position;
      obj->tris[currentTri][1] = obj->verts[startVertex + i].position;
      obj->tris[currentTri][2] = obj->verts[startVertex + i + 1].position;
      currentTri++;
    }
  }

  // else we just ignore it
}

/**
 * @brief Parses the Object primitives from the ASCII text in `buffer`.
 */
static void R_LoadObjPrimitives(model_t *mod, objHeader_t *obj, const void *buffer)
{
  char line[MAX_STRING_CHARS];
  char *l = line;
  const char *c = buffer;

  memset(line, 0, sizeof(line));
  currentGroup = 0;
  currentPoint = 0;
  currentTexcoord = 0;
  currentNormal = 0;
  currentVertex = 0;
  currentTri = 0;

  while (qtrue)
  {
    switch (*c)
    {

    case '\r':
    case '\n':
    case '\0':
      // l = g_strstrip(line);
      R_LoadObjPrimitive(mod, obj, line);

      if (*c == '\0')
      {
        goto done;
      }

      memset(line, 0, sizeof(line));
      l = line;

      c++;
      break;

    default:
      *l++ = *c++;
      break;
    }
  }

done:;
  obj->groups[currentGroup].numVertices = currentVertex - obj->groups[currentGroup].firstVertex;
  obj->groups[currentGroup].numIndexes = currentTri - obj->groups[currentGroup].firstTri;
}

qboolean R_LoadOBJ(model_t *mod, void *buffer, int filesize, const char *mod_name)
{
  void *offset;
  static objHeader_t obj;
  char strippedName[MAX_QPATH];
  COM_StripExtension(mod_name, strippedName, MAX_QPATH);

  mod->type = MOD_OBJ;
  // until we know all the counts and can alloc, set the header to local subroutine context
  mod->modelData = &obj;

  R_LoadModelMaterials(mod, strippedName);

  if (!obj.materials)
  {
    return qfalse; // duck out early like stupid trenchbroom
  }

  ClearBounds(obj.mins, obj.maxs);

  Q_strncpy(mod->name, (char *)mod_name, MAX_QPATH);

  R_CountObjPrimitives(mod, &obj, buffer);

  // TODO: Malloc and copy to modelData
  int sizeAlloc = sizeof(objHeader_t) + sizeof(objVertex_t) * obj.num_verts + sizeof(objGroup_t) * obj.num_groups + sizeof(vec3_t) * obj.num_points + sizeof(vec3_t) * obj.num_normals + sizeof(vec2_t) * obj.num_texcoords + sizeof(triangle_t) * obj.num_tris;
  mod->modelData = ri.Hunk_Alloc(sizeAlloc, h_low);

  memset(mod->modelData, 0, sizeAlloc);
  *(objHeader_t *)mod->modelData = obj;

  offset = (objGroup_t *)(((objHeader_t *)mod->modelData) + 1);
  (*(objHeader_t *)mod->modelData).groups = offset;
  offset += sizeof(objGroup_t) * obj.num_groups;
  (*(objHeader_t *)mod->modelData).points = offset;
  offset += sizeof(vec3_t) * obj.num_points;
  (*(objHeader_t *)mod->modelData).normals = offset;
  offset += sizeof(vec3_t) * obj.num_normals;
  (*(objHeader_t *)mod->modelData).texcoords = offset;
  offset += sizeof(vec2_t) * obj.num_texcoords;
  (*(objHeader_t *)mod->modelData).tris = offset;
  offset += sizeof(triangle_t) * obj.num_tris;
  (*(objHeader_t *)mod->modelData).verts = offset;

  R_LoadObjPrimitives(mod, mod->modelData, buffer);

  // R_LoadObjGroups(mod, obj);

  // R_LoadObjTangents(mod, obj);

  // R_LoadMeshConfigs(mod);

  // R_LoadObjVertexArrays(mod, obj);
  return qtrue;
}

/*
=================
R_AddMD3Surfaces
=================
*/
void R_AddOBJSurfaces(trRefEntity_t *ent)
{
  vec3_t bounds[2];
  int i;
  objHeader_t *header = NULL;
  shader_t *shader = NULL;
  // int				cull;
  // int				fogNum;
  qboolean personalModel;
#ifdef USE_PMLIGHT
  dlight_t *dl;
  int n;
  dlight_t *dlights[ARRAY_LEN(backEndData->dlights)];
  int numDlights;
#endif

  // don't add third_person objects if not in a portal
  personalModel = (ent->e.renderfx & RF_THIRD_PERSON) && (tr.viewParms.portalView == PV_NONE);

  if (ent->e.renderfx & RF_WRAP_FRAMES)
  {
    ent->e.frame %= tr.currentModel->md3[0]->numFrames;
    ent->e.oldframe %= tr.currentModel->md3[0]->numFrames;
  }

  //
  // compute LOD
  //
  // lod = R_ComputeLOD( ent );

  header = tr.currentModel->modelData;

  //
  // cull the entire model if merged bounding box of both frames
  // is outside the view frustum.
  //

  // TODO:
  // cull = R_CullModel( header, ent, bounds );
  // if ( cull == CULL_OUT ) {
  //	return;
  //}

#if 0
	//
	// set up lighting now that we know we aren't culled
	//
	if ( !personalModel || r_shadows->integer > 1 ) {
		R_SetupEntityLighting( &tr.refdef, ent );
	}

#ifdef USE_PMLIGHT
	numDlights = 0;
	if ( r_dlightMode->integer >= 2 && ( !personalModel || tr.viewParms.portalView != PV_NONE ) ) {
		R_TransformDlights( tr.viewParms.num_dlights, tr.viewParms.dlights, &tr.or );
		for ( n = 0; n < tr.viewParms.num_dlights; n++ ) {
			dl = &tr.viewParms.dlights[ n ];
			if ( !R_LightCullBounds( dl, bounds[0], bounds[1] ) ) 
				dlights[ numDlights++ ] = dl;
		}
	}
#endif

#endif

  //
  // see if we are in a fog volume
  //
  // TODO:
  // fogNum = R_ComputeFogNum( header, ent );

  //
  // draw all surfaces
  //
  for (i = 0; i < header->num_groups; i++)
  {

    if (header->groups[i].numVertices == 0)
    {
      continue;
    }

    if (ent->e.customShader)
    {
      shader = R_GetShaderByHandle(ent->e.customShader);
    }
    else if (ent->e.customSkin > 0 && ent->e.customSkin < tr.numSkins)
    {
      const skin_t *skin;
      int j;

      skin = R_GetSkinByHandle(ent->e.customSkin);

      // match the surface name to something in the skin file
      shader = tr.defaultShader;
      for (j = 0; j < skin->numSurfaces; j++)
      {
        // the names have both been lowercased
        if (!strcmp(skin->surfaces[j].name, header->groups[i].skin->name))
        {
          shader = skin->surfaces[j].shader;
          break;
        }
      }
      if (shader == tr.defaultShader)
      {
        ri.Printf(PRINT_DEVELOPER, "WARNING: no shader for surface %s in skin %s\n", header->groups[i].skin->name, skin->name);
      }
      else if (shader->defaultShader)
      {
        ri.Printf(PRINT_DEVELOPER, "WARNING: shader %s in skin %s not found\n", header->groups[i].name, skin->name);
      }
    }
    else if (!header->groups[i].skin || header->groups[i].skin->shader <= 0)
    {
      shader = tr.defaultShader;
    }
    else
    {
      shader = header->groups[i].skin->shader;
    }

    // don't add third_person objects if not viewing through a portal
    if (!personalModel)
    {
      header->groups[i].surfaceType = SF_OBJ;
      // TODO: goddamnit
      //R_AddDrawSurf(&header->groups[i], shader, 0 /*fogNum*/, 0);
    }
  }
}

/*
=============
RB_SurfaceMesh
=============
*/
void RB_OBJSurface(objGroup_t *surface)
{
  int j;
  float backlerp;
  int Bob, Doug;
  int numVerts;
  float *outXyz;
  vec4_t *outNormal;
  objVertex_t *newVerts;
  int vertNum;

return;

#if 0
  VBO_Flush();

  RB_CheckOverflow(surface->numVertices, surface->numVertices / 3);

  tess.surfType = SF_OBJ;

  if (backEnd.currentEntity->e.oldframe == backEnd.currentEntity->e.frame)
  {
    backlerp = 0;
  }
  else
  {
    backlerp = backEnd.currentEntity->e.backlerp;
  }

  newVerts = surface->verts;

  outXyz = tess.xyz[tess.numVertexes];
  outNormal = &tess.normal[tess.numVertexes];
  for (vertNum = 0; vertNum < surface->numVertices; vertNum++)
  {
    VectorCopy(newVerts->point, outXyz);
    outNormal[vertNum][0] = newVerts->normal[0];
    outNormal[vertNum][1] = newVerts->normal[1];
    outNormal[vertNum][2] = newVerts->normal[2];
    // outNormal[0] = newVerts->normal[3];
    newVerts++;
    outXyz += 4;
    outNormal += 4;
  }

  Bob = tess.numIndexes;
  Doug = tess.numVertexes;
  for (j = 0; j < surface->numIndexes; j++)
  {
    tess.indexes[Bob + j] = Doug + surface->tris[j][1];
  }
  tess.numIndexes += surface->numIndexes;

  numVerts = surface->numVertices;
  for (j = 0; j < numVerts; j++)
  {
    tess.texCoords[0][Doug + j][0] = surface->verts[j].texcoords[0];
    tess.texCoords[0][Doug + j][1] = surface->verts[j].texcoords[1];
    // FIXME: fill in lightmapST for completeness?
  }

  tess.numVertexes += surface->numVertices;
#endif
}
