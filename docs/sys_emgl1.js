
var out = console.log.bind(console);
var err = console.error.bind(console);

var ENVIRONMENT_IS_NODE = false;

var warnOnce = (text) => {
  warnOnce.shown ||= {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
    err(text);
  }
};

var _glAlphaFunc = (func, ref) => {
  switch(func) {
    case 0x200: // GL_NEVER
    case 0x201: // GL_LESS
    case 0x202: // GL_EQUAL
    case 0x203: // GL_LEQUAL
    case 0x204: // GL_GREATER
    case 0x205: // GL_NOTEQUAL
    case 0x206: // GL_GEQUAL
    case 0x207: // GL_ALWAYS
      GLEmulation.alphaTestRef = ref;
      if (GLEmulation.alphaTestFunc != func) {
        GLEmulation.alphaTestFunc = func;
        GLImmediate.currentRenderer = null; // alpha test mode is part of the FFP shader state, we must re-lookup the renderer to use.
      }
      break;
    default: // invalid value provided
      break;
  }
};

function _glBindBufferARB() { }

var webgl_enable_ANGLE_instanced_arrays = (ctx) => {
  // Extension available in WebGL 1 from Firefox 26 and Google Chrome 30 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('ANGLE_instanced_arrays');
  if (ext) {
    ctx['vertexAttribDivisor'] = (index, divisor) => ext['vertexAttribDivisorANGLE'](index, divisor);
    ctx['drawArraysInstanced'] = (mode, first, count, primcount) => ext['drawArraysInstancedANGLE'](mode, first, count, primcount);
    ctx['drawElementsInstanced'] = (mode, count, type, indices, primcount) => ext['drawElementsInstancedANGLE'](mode, count, type, indices, primcount);
    return 1;
  }
};

var webgl_enable_OES_vertex_array_object = (ctx) => {
  // Extension available in WebGL 1 from Firefox 25 and WebKit 536.28/desktop Safari 6.0.3 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('OES_vertex_array_object');
  if (ext) {
    ctx['createVertexArray'] = () => ext['createVertexArrayOES']();
    ctx['deleteVertexArray'] = (vao) => ext['deleteVertexArrayOES'](vao);
    ctx['bindVertexArray'] = (vao) => ext['bindVertexArrayOES'](vao);
    ctx['isVertexArray'] = (vao) => ext['isVertexArrayOES'](vao);
    return 1;
  }
};

var webgl_enable_WEBGL_draw_buffers = (ctx) => {
  // Extension available in WebGL 1 from Firefox 28 onwards. Core feature in WebGL 2.
  var ext = ctx.getExtension('WEBGL_draw_buffers');
  if (ext) {
    ctx['drawBuffers'] = (n, bufs) => ext['drawBuffersWEBGL'](n, bufs);
    return 1;
  }
};

var webgl_enable_WEBGL_multi_draw = (ctx) => {
  // Closure is expected to be allowed to minify the '.multiDrawWebgl' property, so not accessing it quoted.
  return !!(ctx.multiDrawWebgl = ctx.getExtension('WEBGL_multi_draw'));
};

var getEmscriptenSupportedExtensions = (ctx) => {
  // Restrict the list of advertised extensions to those that we actually
  // support.
  var supportedExtensions = [
    // WebGL 1 extensions
    'ANGLE_instanced_arrays',
    'EXT_blend_minmax',
    'EXT_disjoint_timer_query',
    'EXT_frag_depth',
    'EXT_shader_texture_lod',
    'EXT_sRGB',
    'OES_element_index_uint',
    'OES_fbo_render_mipmap',
    'OES_standard_derivatives',
    'OES_texture_float',
    'OES_texture_half_float',
    'OES_texture_half_float_linear',
    'OES_vertex_array_object',
    'WEBGL_color_buffer_float',
    'WEBGL_depth_texture',
    'WEBGL_draw_buffers',
    // WebGL 1 and WebGL 2 extensions
    'EXT_color_buffer_half_float',
    'EXT_depth_clamp',
    'EXT_float_blend',
    'EXT_texture_compression_bptc',
    'EXT_texture_compression_rgtc',
    'EXT_texture_filter_anisotropic',
    'KHR_parallel_shader_compile',
    'OES_texture_float_linear',
    'WEBGL_blend_func_extended',
    'WEBGL_compressed_texture_astc',
    'WEBGL_compressed_texture_etc',
    'WEBGL_compressed_texture_etc1',
    'WEBGL_compressed_texture_s3tc',
    'WEBGL_compressed_texture_s3tc_srgb',
    'WEBGL_debug_renderer_info',
    'WEBGL_debug_shaders',
    'WEBGL_lose_context',
    'WEBGL_multi_draw',
  ];
  // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
  return (ctx.getSupportedExtensions() || []).filter(ext => supportedExtensions.includes(ext));
};


var GL = {
counter:1,
buffers:[],
programs:[],
framebuffers:[],
renderbuffers:[],
textures:[],
shaders:[],
vaos:[],
contexts:[],
offscreenCanvases:{
},
queries:[],
byteSizeByTypeRoot:5120,
byteSizeByType:[1,1,2,2,4,4,4,2,3,4,8],
stringCache:{
},
unpackAlignment:4,
unpackRowLength:0,
recordError:(errorCode) => {
    if (!GL.lastError) {
      GL.lastError = errorCode;
    }
  },
getNewId:(table) => {
    var ret = GL.counter++;
    for (var i = table.length; i < ret; i++) {
      table[i] = null;
    }
    return ret;
  },
genObject:(n, buffers, createFunction, objectTable
    ) => {
    for (var i = 0; i < n; i++) {
      var buffer = GLctx[createFunction]();
      var id = buffer && GL.getNewId(objectTable);
      if (buffer) {
        buffer.name = id;
        objectTable[id] = buffer;
      } else {
        GL.recordError(0x502 /* GL_INVALID_OPERATION */);
      }
      HEAP32[(((buffers)+(i*4))>>2)] = id;
    }
  },
MAX_TEMP_BUFFER_SIZE:2097152,
numTempVertexBuffersPerSize:64,
log2ceilLookup:(i) => 32 - Math.clz32(i === 0 ? 0 : i - 1),
generateTempBuffers:(quads, context) => {
    var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
    context.tempVertexBufferCounters1 = [];
    context.tempVertexBufferCounters2 = [];
    context.tempVertexBufferCounters1.length = context.tempVertexBufferCounters2.length = largestIndex+1;
    context.tempVertexBuffers1 = [];
    context.tempVertexBuffers2 = [];
    context.tempVertexBuffers1.length = context.tempVertexBuffers2.length = largestIndex+1;
    context.tempIndexBuffers = [];
    context.tempIndexBuffers.length = largestIndex+1;
    for (var i = 0; i <= largestIndex; ++i) {
      context.tempIndexBuffers[i] = null; // Created on-demand
      context.tempVertexBufferCounters1[i] = context.tempVertexBufferCounters2[i] = 0;
      var ringbufferLength = GL.numTempVertexBuffersPerSize;
      context.tempVertexBuffers1[i] = [];
      context.tempVertexBuffers2[i] = [];
      var ringbuffer1 = context.tempVertexBuffers1[i];
      var ringbuffer2 = context.tempVertexBuffers2[i];
      ringbuffer1.length = ringbuffer2.length = ringbufferLength;
      for (var j = 0; j < ringbufferLength; ++j) {
        ringbuffer1[j] = ringbuffer2[j] = null; // Created on-demand
      }
    }

    if (quads) {
      // GL_QUAD indexes can be precalculated
      context.tempQuadIndexBuffer = GLctx.createBuffer();
      context.GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, context.tempQuadIndexBuffer);
      var numIndexes = GL.MAX_TEMP_BUFFER_SIZE >> 1;
      var quadIndexes = new Uint16Array(numIndexes);
      var i = 0, v = 0;
      while (1) {
        quadIndexes[i++] = v;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v+1;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v+2;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v+2;
        if (i >= numIndexes) break;
        quadIndexes[i++] = v+3;
        if (i >= numIndexes) break;
        v += 4;
      }
      context.GLctx.bufferData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, quadIndexes, 0x88E4 /*GL_STATIC_DRAW*/);
      context.GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, null);
    }
  },
getTempVertexBuffer:(sizeBytes) => {
    var idx = GL.log2ceilLookup(sizeBytes);
    var ringbuffer = GL.currentContext.tempVertexBuffers1[idx];
    var nextFreeBufferIndex = GL.currentContext.tempVertexBufferCounters1[idx];
    GL.currentContext.tempVertexBufferCounters1[idx] = (GL.currentContext.tempVertexBufferCounters1[idx]+1) & (GL.numTempVertexBuffersPerSize-1);
    var vbo = ringbuffer[nextFreeBufferIndex];
    if (vbo) {
      return vbo;
    }
    var prevVBO = GLctx.getParameter(0x8894 /*GL_ARRAY_BUFFER_BINDING*/);
    ringbuffer[nextFreeBufferIndex] = GLctx.createBuffer();
    GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, ringbuffer[nextFreeBufferIndex]);
    GLctx.bufferData(0x8892 /*GL_ARRAY_BUFFER*/, 1 << idx, 0x88E8 /*GL_DYNAMIC_DRAW*/);
    GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, prevVBO);
    return ringbuffer[nextFreeBufferIndex];
  },
getTempIndexBuffer:(sizeBytes) => {
    var idx = GL.log2ceilLookup(sizeBytes);
    var ibo = GL.currentContext.tempIndexBuffers[idx];
    if (ibo) {
      return ibo;
    }
    var prevIBO = GLctx.getParameter(0x8895 /*ELEMENT_ARRAY_BUFFER_BINDING*/);
    GL.currentContext.tempIndexBuffers[idx] = GLctx.createBuffer();
    GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, GL.currentContext.tempIndexBuffers[idx]);
    GLctx.bufferData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, 1 << idx, 0x88E8 /*GL_DYNAMIC_DRAW*/);
    GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, prevIBO);
    return GL.currentContext.tempIndexBuffers[idx];
  },
newRenderingFrameStarted:() => {
    if (!GL.currentContext) {
      return;
    }
    var vb = GL.currentContext.tempVertexBuffers1;
    GL.currentContext.tempVertexBuffers1 = GL.currentContext.tempVertexBuffers2;
    GL.currentContext.tempVertexBuffers2 = vb;
    vb = GL.currentContext.tempVertexBufferCounters1;
    GL.currentContext.tempVertexBufferCounters1 = GL.currentContext.tempVertexBufferCounters2;
    GL.currentContext.tempVertexBufferCounters2 = vb;
    var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
    for (var i = 0; i <= largestIndex; ++i) {
      GL.currentContext.tempVertexBufferCounters1[i] = 0;
    }
  },
getSource:(shader, count, string, length) => {
    var source = '';
    for (var i = 0; i < count; ++i) {
      var len = length ? HEAPU32[(((length)+(i*4))>>2)] : undefined;
      source += UTF8ToString(HEAPU32[(((string)+(i*4))>>2)], len);
    }
    // Let's see if we need to enable the standard derivatives extension
    var type = GLctx.getShaderParameter(GL.shaders[shader], 0x8B4F /* GL_SHADER_TYPE */);
    if (type == 0x8B30 /* GL_FRAGMENT_SHADER */) {
      if (GLEmulation.findToken(source, "dFdx") ||
          GLEmulation.findToken(source, "dFdy") ||
          GLEmulation.findToken(source, "fwidth")) {
        source = "#extension GL_OES_standard_derivatives : enable\n" + source;
        var extension = GLctx.getExtension("OES_standard_derivatives");
      }
    }
    return source;
  },
createContext:(/** @type {HTMLCanvasElement} */ canvas, webGLContextAttributes) => {

    // BUG: Workaround Safari WebGL issue: After successfully acquiring WebGL
    // context on a canvas, calling .getContext() will always return that
    // context independent of which 'webgl' or 'webgl2'
    // context version was passed. See:
    //   https://bugs.webkit.org/show_bug.cgi?id=222758
    // and:
    //   https://github.com/emscripten-core/emscripten/issues/13295.
    // TODO: Once the bug is fixed and shipped in Safari, adjust the Safari
    // version field in above check.
    if (!canvas.getContextSafariWebGL2Fixed) {
      canvas.getContextSafariWebGL2Fixed = canvas.getContext;
      /** @type {function(this:HTMLCanvasElement, string, (Object|null)=): (Object|null)} */
      function fixedGetContext(ver, attrs) {
        var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
        return ((ver == 'webgl') == (gl instanceof WebGLRenderingContext)) ? gl : null;
      }
      canvas.getContext = fixedGetContext;
    }

    var ctx =
      (canvas.getContext("webgl", webGLContextAttributes)
        // https://caniuse.com/#feat=webgl
        );

    if (!ctx) return 0;

    var handle = GL.registerContext(ctx, webGLContextAttributes);

    return handle;
  },
registerContext:(ctx, webGLContextAttributes) => {
    // without pthreads a context is just an integer ID
    var handle = GL.getNewId(GL.contexts);

    var context = {
      handle,
      attributes: webGLContextAttributes,
      version: webGLContextAttributes.majorVersion,
      GLctx: ctx
    };

    // Store the created context object so that we can access the context
    // given a canvas without having to pass the parameters again.
    if (ctx.canvas) ctx.canvas.GLctxObject = context;
    GL.contexts[handle] = context;
    if (typeof webGLContextAttributes.enableExtensionsByDefault == 'undefined' || webGLContextAttributes.enableExtensionsByDefault) {
      GL.initExtensions(context);
    }

    return handle;
  },
makeContextCurrent:(contextHandle) => {

    // Active Emscripten GL layer context object.
    GL.currentContext = GL.contexts[contextHandle];
    // Active WebGL context object.
    Module.ctx = GLctx = GL.currentContext?.GLctx;
    GLImmediate.setupFuncs();
    GLImmediate.init();
    return !(contextHandle && !GLctx);
  },
getContext:(contextHandle) => {
    return GL.contexts[contextHandle];
  },
deleteContext:(contextHandle) => {
    if (GL.currentContext === GL.contexts[contextHandle]) {
      GL.currentContext = null;
    }
    if (typeof JSEvents == 'object') {
      // Release all JS event handlers on the DOM element that the GL context is
      // associated with since the context is now deleted.
      JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);
    }
    // Make sure the canvas object no longer refers to the context object so
    // there are no GC surprises.
    if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) {
      GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
    }
    GL.contexts[contextHandle] = null;
  },
initExtensions:(context) => {
    // If this function is called without a specific context object, init the
    // extensions of the currently active context.
    context ||= GL.currentContext;

    if (context.initExtensionsDone) return;
    context.initExtensionsDone = true;

    var GLctx = context.GLctx;

    // Detect the presence of a few extensions manually, ction GL interop
    // layer itself will need to know if they exist.
    context.compressionExt = GLctx.getExtension('WEBGL_compressed_texture_s3tc');
    context.anisotropicExt = GLctx.getExtension('EXT_texture_filter_anisotropic');

    // Extensions that are only available in WebGL 1 (the calls will be no-ops
    // if called on a WebGL 2 context active)
    webgl_enable_ANGLE_instanced_arrays(GLctx);
    webgl_enable_OES_vertex_array_object(GLctx);
    webgl_enable_WEBGL_draw_buffers(GLctx);

    {
      GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query");
    }

    webgl_enable_WEBGL_multi_draw(GLctx);

    getEmscriptenSupportedExtensions(GLctx).forEach((ext) => {
      // WEBGL_lose_context, WEBGL_debug_renderer_info and WEBGL_debug_shaders
      // are not enabled by default.
      if (!ext.includes('lose_context') && !ext.includes('debug')) {
        // Call .getExtension() to enable that extension permanently.
        GLctx.getExtension(ext);
      }
    });
  },
};
var _glBindFramebuffer = (target, framebuffer) => {

  GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);

};

var _glBindRenderbuffer = (target, renderbuffer) => {
  GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
};

var _glBindTexture = (target, texture) => {
  GLctx.bindTexture(target, GL.textures[texture]);
};

var _glBlendFunc = (x0, x1) => GLctx.blendFunc(x0, x1);

function _glBlitFramebuffer() { }

function _glBufferDataARB() { }

var _glCheckFramebufferStatus = (x0) => GLctx.checkFramebufferStatus(x0);

var _glClear = (x0) => GLctx.clear(x0);

var _glClearColor = (x0, x1, x2, x3) => GLctx.clearColor(x0, x1, x2, x3);

var _glClearDepth = (x0) => GLctx.clearDepth(x0);

var _glColor4f = (r, g, b, a) => {
  r = Math.max(Math.min(r, 1), 0);
  g = Math.max(Math.min(g, 1), 0);
  b = Math.max(Math.min(b, 1), 0);
  a = Math.max(Math.min(a, 1), 0);

  // TODO: make ub the default, not f, save a few mathops
  if (GLImmediate.mode >= 0) {
    var start = GLImmediate.vertexCounter << 2;
    GLImmediate.vertexDataU8[start + 0] = r * 255;
    GLImmediate.vertexDataU8[start + 1] = g * 255;
    GLImmediate.vertexDataU8[start + 2] = b * 255;
    GLImmediate.vertexDataU8[start + 3] = a * 255;
    GLImmediate.vertexCounter++;
    GLImmediate.addRendererComponent(GLImmediate.COLOR, 4, GLctx.UNSIGNED_BYTE);
  } else {
    GLImmediate.clientColor[0] = r;
    GLImmediate.clientColor[1] = g;
    GLImmediate.clientColor[2] = b;
    GLImmediate.clientColor[3] = a;
  }
};

var _glColorMask = (red, green, blue, alpha) => {
  GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
};

var _glColorPointer = (size, type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.COLOR, size, type, stride, pointer);
};

var _glCullFace = (x0) => GLctx.cullFace(x0);

function _glDeleteBuffersARB() { }

var _glDeleteFramebuffers = (n, framebuffers) => {
  for (var i = 0; i < n; ++i) {
    var id = HEAP32[(((framebuffers)+(i*4))>>2)];
    var framebuffer = GL.framebuffers[id];
    if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
    GLctx.deleteFramebuffer(framebuffer);
    framebuffer.name = 0;
    GL.framebuffers[id] = null;
  }
};

var _glDeleteRenderbuffers = (n, renderbuffers) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((renderbuffers)+(i*4))>>2)];
    var renderbuffer = GL.renderbuffers[id];
    if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
    GLctx.deleteRenderbuffer(renderbuffer);
    renderbuffer.name = 0;
    GL.renderbuffers[id] = null;
  }
};

var _glDeleteTextures = (n, textures) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((textures)+(i*4))>>2)];
    var texture = GL.textures[id];
    // GL spec: "glDeleteTextures silently ignores 0s and names that do not
    // correspond to existing textures".
    if (!texture) continue;
    GLctx.deleteTexture(texture);
    texture.name = 0;
    GL.textures[id] = null;
  }
};

var _glDepthFunc = (x0) => GLctx.depthFunc(x0);

var _glDepthMask = (flag) => {
  GLctx.depthMask(!!flag);
};

var _glDepthRange = (x0, x1) => GLctx.depthRange(x0, x1);

var _glDisable = (x0) => GLctx.disable(x0);

var _glDisableClientState = (cap) => {
  var attrib = GLEmulation.getAttributeFromCapability(cap);
  if (attrib === null) {
    err(`WARNING: unhandled clientstate: ${cap}`);
    return;
  }
  if (GLImmediate.enabledClientAttributes[attrib]) {
    GLImmediate.enabledClientAttributes[attrib] = false;
    GLImmediate.totalEnabledClientAttributes--;
    GLImmediate.currentRenderer = null; // Will need to change current renderer, since the set of active vertex pointers changed.
    if (GLEmulation.currentVao) delete GLEmulation.currentVao.enabledClientStates[cap];
    GLImmediate.modifiedClientAttributes = true;
  }
};

var _glDrawArrays = (mode, first, count) => {
  if (GLImmediate.totalEnabledClientAttributes == 0 && mode <= 6) {
    GLctx.drawArrays(mode, first, count);
    return;
  }
  GLImmediate.prepareClientAttributes(count, false);
  GLImmediate.mode = mode;
  if (!GLctx.currentArrayBufferBinding) {
    GLImmediate.vertexData = HEAPF32.subarray((((GLImmediate.vertexPointer)>>2)), ((GLImmediate.vertexPointer + (first+count)*GLImmediate.stride)>>2)); // XXX assuming float
    GLImmediate.firstVertex = first;
    GLImmediate.lastVertex = first + count;
  }
  GLImmediate.flush(null, first);
  GLImmediate.mode = -1;
};



function assert(condition, text) {
  if (!condition) {
    throw new Error('Assertion failed' + (text ? ': ' + text : ''));
  }
}



var _glDrawElements = (mode, count, type, indices, start, end) => {
  if (GLImmediate.totalEnabledClientAttributes == 0 && mode <= 6 && GLctx.currentElementArrayBufferBinding) {
    GLctx.drawElements(mode, count, type, indices);
    return;
  }
  if (!GLctx.currentElementArrayBufferBinding) {
    //assert(type == GLctx.UNSIGNED_SHORT); // We can only emulate buffers of this kind, for now
    if(type != GLctx.UNSIGNED_SHORT) {
      return;
    }
  }
  out("DrawElements doesn't actually prepareClientAttributes properly.");
  GLImmediate.prepareClientAttributes(count, false);
  GLImmediate.mode = mode;
  if (!GLctx.currentArrayBufferBinding) {
    GLImmediate.firstVertex = end ? start : HEAP8.length; // if we don't know the start, set an invalid value and we will calculate it later from the indices
    GLImmediate.lastVertex = end ? end + 1 : 0;
    start = GLImmediate.vertexPointer;
    // TODO(sbc): Combine these two subarray calls back into a single one if
    // we ever fix https://github.com/emscripten-core/emscripten/issues/21250.
    if (end) {
      end = GLImmediate.vertexPointer + (end +1 ) * GLImmediate.stride;
      GLImmediate.vertexData = HEAPF32.subarray(((start)>>2), ((end)>>2));
    } else {
      GLImmediate.vertexData = HEAPF32.subarray(((start)>>2));
    }
  }
  GLImmediate.flush(count, 0, indices);
  GLImmediate.mode = -1;
};

var _glEnable = (x0) => GLctx.enable(x0);

var _glEnableClientState = (cap) => {
  var attrib = GLEmulation.getAttributeFromCapability(cap);
  if (attrib === null) {
    err(`WARNING: unhandled clientstate: ${cap}`);
    return;
  }
  if (!GLImmediate.enabledClientAttributes[attrib]) {
    GLImmediate.enabledClientAttributes[attrib] = true;
    GLImmediate.totalEnabledClientAttributes++;
    GLImmediate.currentRenderer = null; // Will need to change current renderer, since the set of active vertex pointers changed.
    if (GLEmulation.currentVao) GLEmulation.currentVao.enabledClientStates[cap] = 1;
    GLImmediate.modifiedClientAttributes = true;
  }
};

var _glFinish = () => GLctx.finish();

var _glFramebufferRenderbuffer = (target, attachment, renderbuffertarget, renderbuffer) => {
  GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
                                     GL.renderbuffers[renderbuffer]);
};

var _glFramebufferTexture2D = (target, attachment, textarget, texture, level) => {
  GLctx.framebufferTexture2D(target, attachment, textarget,
                                  GL.textures[texture], level);
};

function _glGenBuffersARB() { }

var _glGenFramebuffers = (n, ids) => {
  GL.genObject(n, ids, 'createFramebuffer', GL.framebuffers
    );
};

var _glGenRenderbuffers = (n, renderbuffers) => {
  GL.genObject(n, renderbuffers, 'createRenderbuffer', GL.renderbuffers
    );
};

var _glGenTextures = (n, textures) => {
  GL.genObject(n, textures, 'createTexture', GL.textures
    );
};

var readI53FromI64 = (ptr) => {
  return HEAPU32[((ptr)>>2)] + HEAP32[(((ptr)+(4))>>2)] * 4294967296;
};

var readI53FromU64 = (ptr) => {
  return HEAPU32[((ptr)>>2)] + HEAPU32[(((ptr)+(4))>>2)] * 4294967296;
};
var writeI53ToI64 = (ptr, num) => {
  HEAPU32[((ptr)>>2)] = num;
  var lower = HEAPU32[((ptr)>>2)];
  HEAPU32[(((ptr)+(4))>>2)] = (num - lower)/4294967296;
  var deserialized = (num >= 0) ? readI53FromU64(ptr) : readI53FromI64(ptr);
  var offset = ((ptr)>>2);
  if (deserialized != num) warnOnce(`writeI53ToI64() out of range: serialized JS Number ${num} to Wasm heap as bytes lo=${ptrToString(HEAPU32[offset])}, hi=${ptrToString(HEAPU32[offset+1])}, which deserializes back to ${deserialized} instead!`);
};

var emscriptenWebGLGet = (name_, p, type) => {
  // Guard against user passing a null pointer.
  // Note that GLES2 spec does not say anything about how passing a null
  // pointer should be treated.  Testing on desktop core GL 3, the application
  // crashes on glGetIntegerv to a null pointer, but better to report an error
  // instead of doing anything random.
  if (!p) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  var ret = undefined;
  switch (name_) { // Handle a few trivial GLES values
    case 0x8DFA: // GL_SHADER_COMPILER
      ret = 1;
      break;
    case 0x8DF8: // GL_SHADER_BINARY_FORMATS
      if (type != 0 && type != 1) {
        GL.recordError(0x500); // GL_INVALID_ENUM
      }
      // Do not write anything to the out pointer, since no binary formats are
      // supported.
      return;
    case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
      ret = 0;
      break;
    case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
      // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete
      // since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be
      // queried for length), so implement it ourselves to allow C++ GLES2
      // code get the length.
      var formats = GLctx.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
      ret = formats ? formats.length : 0;
      break;

  }

  if (ret === undefined) {
    var result = GLctx.getParameter(name_);
    switch (typeof result) {
      case "number":
        ret = result;
        break;
      case "boolean":
        ret = result ? 1 : 0;
        break;
      case "string":
        GL.recordError(0x500); // GL_INVALID_ENUM
        return;
      case "object":
        if (result === null) {
          // null is a valid result for some (e.g., which buffer is bound -
          // perhaps nothing is bound), but otherwise can mean an invalid
          // name_, which we need to report as an error
          switch (name_) {
            case 0x8894: // ARRAY_BUFFER_BINDING
            case 0x8B8D: // CURRENT_PROGRAM
            case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
            case 0x8CA6: // FRAMEBUFFER_BINDING or DRAW_FRAMEBUFFER_BINDING
            case 0x8CA7: // RENDERBUFFER_BINDING
            case 0x8069: // TEXTURE_BINDING_2D
            case 0x85B5: // WebGL 2 GL_VERTEX_ARRAY_BINDING, or WebGL 1 extension OES_vertex_array_object GL_VERTEX_ARRAY_BINDING_OES
            case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
              ret = 0;
              break;
            }
            default: {
              GL.recordError(0x500); // GL_INVALID_ENUM
              return;
            }
          }
        } else if (result instanceof Float32Array ||
                   result instanceof Uint32Array ||
                   result instanceof Int32Array ||
                   result instanceof Array) {
          for (var i = 0; i < result.length; ++i) {
            switch (type) {
              case 0: HEAP32[(((p)+(i*4))>>2)] = result[i]; break;
              case 2: HEAPF32[(((p)+(i*4))>>2)] = result[i]; break;
              case 4: HEAP8[(p)+(i)] = result[i] ? 1 : 0; break;
            }
          }
          return;
        } else {
          try {
            ret = result.name | 0;
          } catch(e) {
            GL.recordError(0x500); // GL_INVALID_ENUM
            err(`GL_INVALID_ENUM in glGet${type}v: Unknown object returned from WebGL getParameter(${name_})! (error: ${e})`);
            return;
          }
        }
        break;
      default:
        GL.recordError(0x500); // GL_INVALID_ENUM
        err(`GL_INVALID_ENUM in glGet${type}v: Native code calling glGet${type}v(${name_}) and it returns ${result} of type ${typeof(result)}!`);
        return;
    }
  }

  switch (type) {
    case 1: writeI53ToI64(p, ret); break;
    case 0: HEAP32[((p)>>2)] = ret; break;
    case 2:   HEAPF32[((p)>>2)] = ret; break;
    case 4: HEAP8[p] = ret ? 1 : 0; break;
  }
};

var _glGetBooleanv = (name_, p) => emscriptenWebGLGet(name_, p, 4);

var _glGetError = () => {
  var error = GLctx.getError() || GL.lastError;
  GL.lastError = 0/*GL_NO_ERROR*/;
  return error;
};

var _glGetFramebufferAttachmentParameteriv = (target, attachment, pname, params) => {
  var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
  if (result instanceof WebGLRenderbuffer ||
      result instanceof WebGLTexture) {
    result = result.name | 0;
  }
  HEAP32[((params)>>2)] = result;
};


var _glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);

function _glGetInternalformativ() { }

var _glGetRenderbufferParameteriv = (target, pname, params) => {
  if (!params) {
    // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
    // if params == null, issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  HEAP32[((params)>>2)] = GLctx.getRenderbufferParameter(target, pname);
};



var lengthBytesUTF8 = (str) => {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var c = str.charCodeAt(i); // possibly a lead surrogate
    if (c <= 0x7F) {
      len++;
    } else if (c <= 0x7FF) {
      len += 2;
    } else if (c >= 0xD800 && c <= 0xDFFF) {
      len += 4; ++i;
    } else {
      len += 3;
    }
  }
  return len;
};



var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
  assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
  // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
  // undefined and false each don't write out any bytes.
  if (!(maxBytesToWrite > 0))
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
    // and https://www.ietf.org/rfc/rfc2279.txt
    // and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      heap[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++] = 0xC0 | (u >> 6);
      heap[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++] = 0xE0 | (u >> 12);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u > 0x10FFFF) warnOnce('Invalid Unicode code point ' + ptrToString(u) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
      heap[outIdx++] = 0xF0 | (u >> 18);
      heap[outIdx++] = 0x80 | ((u >> 12) & 63);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx] = 0;
  return outIdx - startIdx;
};

var webglGetExtensions = function $webglGetExtensions() {
  var exts = getEmscriptenSupportedExtensions(GLctx);
  exts = exts.concat(exts.map((e) => "GL_" + e));
  return exts;
};

var _glGetString = (name_) => {
  var ret = GL.stringCache[name_];
  if (!ret) {
    switch (name_) {
      case 0x1F03 /* GL_EXTENSIONS */:
        ret = stringToAddress(webglGetExtensions().join(' '));
        break;
      case 0x1F00 /* GL_VENDOR */:
      case 0x1F01 /* GL_RENDERER */:
      case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
      case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
        var s = GLctx.getParameter(name_);
        if (!s) {
          GL.recordError(0x500/*GL_INVALID_ENUM*/);
        }
        ret = s ? stringToAddress(s) : 0;
        break;

      case 0x1F02 /* GL_VERSION */:
        var glVersion = GLctx.getParameter(0x1F02 /*GL_VERSION*/);
        // return GLES version string corresponding to the version of the WebGL context
        {
          glVersion = `OpenGL ES 2.0 (${glVersion})`;
        }
        ret = stringToAddress(glVersion);
        break;
      case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
        var glslVersion = GLctx.getParameter(0x8B8C /*GL_SHADING_LANGUAGE_VERSION*/);
        // extract the version number 'N.M' from the string 'WebGL GLSL ES N.M ...'
        var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
        var ver_num = glslVersion.match(ver_re);
        if (ver_num !== null) {
          if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + '0'; // ensure minor version has 2 digits
          glslVersion = `OpenGL ES GLSL ES ${ver_num[1]} (${glslVersion})`;
        }
        ret = stringToAddress(glslVersion);
        break;
      default:
        GL.recordError(0x500/*GL_INVALID_ENUM*/);
        // fall through
    }
    GL.stringCache[name_] = ret;
  }
  return ret;
};

var _glIsFramebuffer = (framebuffer) => {
  var fb = GL.framebuffers[framebuffer];
  if (!fb) return 0;
  return GLctx.isFramebuffer(fb);
};

var _glLineWidth = (x0) => GLctx.lineWidth(x0);


var _emscripten_set_main_loop_timing = (mode, value) => {
  Browser.mainLoop.timingMode = mode;
  Browser.mainLoop.timingValue = value;

  if (!Browser.mainLoop.func) {
    err('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
    return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
  }

  if (!Browser.mainLoop.running) {
    
    Browser.mainLoop.running = true;
  }
  if (mode == 0) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
      var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now())|0;
      setTimeout(Browser.mainLoop.runner, timeUntilNextTick); // doing this each time means that on exception, we stop
    };
    Browser.mainLoop.method = 'timeout';
  } else if (mode == 1) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
      Browser.requestAnimationFrame(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'rAF';
  } else if (mode == 2) {
    if (typeof Browser.setImmediate == 'undefined') {
      if (typeof setImmediate == 'undefined') {
        // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
        var setImmediates = [];
        var emscriptenMainLoopMessageId = 'setimmediate';
        /** @param {Event} event */
        var Browser_setImmediate_messageHandler = (event) => {
          // When called in current thread or Worker, the main loop ID is structured slightly different to accommodate for --proxy-to-worker runtime listening to Worker events,
          // so check for both cases.
          if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
            event.stopPropagation();
            setImmediates.shift()();
          }
        };
        addEventListener("message", Browser_setImmediate_messageHandler, true);
        Browser.setImmediate = /** @type{function(function(): ?, ...?): number} */(function Browser_emulated_setImmediate(func) {
          setImmediates.push(func);
          if (ENVIRONMENT_IS_WORKER) {
            Module['setImmediates'] ??= [];
            Module['setImmediates'].push(func);
            postMessage({target: emscriptenMainLoopMessageId}); // In --proxy-to-worker, route the message via proxyClient.js
          } else postMessage(emscriptenMainLoopMessageId, "*"); // On the main thread, can just send the message to itself.
        });
      } else {
        Browser.setImmediate = setImmediate;
      }
    }
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
      Browser.setImmediate(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = 'immediate';
  }
  return 0;
};

var _emscripten_get_now;
  // Modern environment where performance.now() is supported:
  // N.B. a shorter form "_emscripten_get_now = performance.now;" is
  // unfortunately not allowed even in current browsers (e.g. FF Nightly 75).
  _emscripten_get_now = () => performance.now();
;


/**
 * @param {number=} arg
 * @param {boolean=} noSetTiming
 */
var setMainLoop = (browserIterationFunc, fps, simulateInfiniteLoop, arg, noSetTiming) => {
  assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');
  Browser.mainLoop.func = browserIterationFunc;
  Browser.mainLoop.arg = arg;

  // Closure compiler bug(?): Closure does not see that the assignment
  //   var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop
  // is a value copy of a number (even with the JSDoc @type annotation)
  // but optimizeis the code as if the assignment was a reference assignment,
  // which results in Browser.mainLoop.pause() not working. Hence use a
  // workaround to make Closure believe this is a value copy that should occur:
  // (TODO: Minimize this down to a small test case and report - was unable
  // to reproduce in a small written test case)
  /** @type{number} */
  var thisMainLoopId = (() => Browser.mainLoop.currentlyRunningMainloop)();
  function checkIsRunning() {
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) {
      
      return false;
    }
    return true;
  }

  // We create the loop runner here but it is not actually running until
  // _emscripten_set_main_loop_timing is called (which might happen a
  // later time).  This member signifies that the current runner has not
  // yet been started so that we can call runtimeKeepalivePush when it
  // gets it timing set for the first time.
  Browser.mainLoop.running = false;
  Browser.mainLoop.runner = function Browser_mainLoop_runner() {
    if (ABORT) return;
    if (Browser.mainLoop.queue.length > 0) {
      var start = Date.now();
      var blocker = Browser.mainLoop.queue.shift();
      blocker.func(blocker.arg);
      if (Browser.mainLoop.remainingBlockers) {
        var remaining = Browser.mainLoop.remainingBlockers;
        var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
        if (blocker.counted) {
          Browser.mainLoop.remainingBlockers = next;
        } else {
          // not counted, but move the progress along a tiny bit
          next = next + 0.5; // do not steal all the next one's progress
          Browser.mainLoop.remainingBlockers = (8*remaining + next)/9;
        }
      }
      Browser.mainLoop.updateStatus();

      // catches pause/resume main loop from blocker execution
      if (!checkIsRunning()) return;

      setTimeout(Browser.mainLoop.runner, 0);
      return;
    }

    // catch pauses from non-main loop sources
    if (!checkIsRunning()) return;

    // Implement very basic swap interval control
    Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
    if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
      // Not the scheduled time to render this frame - skip.
      Browser.mainLoop.scheduler();
      return;
    } else if (Browser.mainLoop.timingMode == 0) {
      Browser.mainLoop.tickStartTime = _emscripten_get_now();
    }

    // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
    // VBO double-buffering and reduce GPU stalls.
    GL.newRenderingFrameStarted();

    if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
      warnOnce('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
      Browser.mainLoop.method = ''; // just warn once per call to set main loop
    }

    Browser.mainLoop.runIter(browserIterationFunc);

    checkStackCookie();

    // catch pauses from the main loop itself
    if (!checkIsRunning()) return;

    // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
    // to queue the newest produced audio samples.
    // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
    //       do not need to be hardcoded into this function, but can be more generic.
    if (typeof SDL == 'object') SDL.audio?.queueNewAudioData?.();

    Browser.mainLoop.scheduler();
  }

  if (!noSetTiming) {
    if (fps && fps > 0) {
      _emscripten_set_main_loop_timing(0, 1000.0 / fps);
    } else {
      // Do rAF by rendering each frame (no decimating)
      _emscripten_set_main_loop_timing(1, 1);
    }

    Browser.mainLoop.scheduler();
  }

  if (simulateInfiniteLoop) {
    throw 'unwind';
  }
};

var handleException = (e) => {
  // Certain exception types we do not treat as errors since they are used for
  // internal control flow.
  // 1. ExitStatus, which is thrown by exit()
  // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
  //    that wish to return to JS event loop.
  if (e instanceof ExitStatus || e == 'unwind') {
    return EXITSTATUS;
  }
  checkStackCookie();
  if (e instanceof WebAssembly.RuntimeError) {
    if (_emscripten_stack_get_current() <= 0) {
      err('Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)');
    }
  }
  quit_(1, e);
};



var runtimeKeepaliveCounter = 0;
var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
var maybeExit = () => {
  if (!keepRuntimeAlive()) {
    try {
      _exit(EXITSTATUS);
    } catch (e) {
      handleException(e);
    }
  }
};
var callUserCallback = (func) => {
  if (ABORT) {
    err('user callback triggered after runtime exited or application aborted.  Ignoring.');
    return;
  }
  try {
    func();
    maybeExit();
  } catch (e) {
    handleException(e);
  }
};

/** @param {number=} timeout */
var safeSetTimeout = (func, timeout) => {
  
  return setTimeout(() => {
    
    callUserCallback(func);
  }, timeout);
};




var Browser = {
mainLoop:{
running:false,
scheduler:null,
method:"",
currentlyRunningMainloop:0,
func:null,
arg:0,
timingMode:0,
timingValue:0,
currentFrameNumber:0,
queue:[],
pause() {
      Browser.mainLoop.scheduler = null;
      // Incrementing this signals the previous main loop that it's now become old, and it must return.
      Browser.mainLoop.currentlyRunningMainloop++;
    },
resume() {
      Browser.mainLoop.currentlyRunningMainloop++;
      var timingMode = Browser.mainLoop.timingMode;
      var timingValue = Browser.mainLoop.timingValue;
      var func = Browser.mainLoop.func;
      Browser.mainLoop.func = null;
      // do not set timing and call scheduler, we will do it on the next lines
      setMainLoop(func, 0, false, Browser.mainLoop.arg, true);
      _emscripten_set_main_loop_timing(timingMode, timingValue);
      Browser.mainLoop.scheduler();
    },
updateStatus() {
      if (Module['setStatus']) {
        var message = Module['statusMessage'] || 'Please wait...';
        var remaining = Browser.mainLoop.remainingBlockers;
        var expected = Browser.mainLoop.expectedBlockers;
        if (remaining) {
          if (remaining < expected) {
            Module['setStatus'](`{message} ({expected - remaining}/{expected})`);
          } else {
            Module['setStatus'](message);
          }
        } else {
          Module['setStatus']('');
        }
      }
    },
runIter(func) {
      if (ABORT) return;
      if (Module['preMainLoop']) {
        var preRet = Module['preMainLoop']();
        if (preRet === false) {
          return; // |return false| skips a frame
        }
      }
      callUserCallback(func);
      Module['postMainLoop']?.();
    },
},
isFullscreen:false,
pointerLock:false,
moduleContextCreatedCallbacks:[],
workers:[],
init() {
    if (Browser.initted) return;
    Browser.initted = true;

    // Support for plugins that can process preloaded files. You can add more of these to
    // your app by creating and appending to preloadPlugins.
    //
    // Each plugin is asked if it can handle a file based on the file's name. If it can,
    // it is given the file's raw data. When it is done, it calls a callback with the file's
    // (possibly modified) data. For example, a plugin might decompress a file, or it
    // might create some side data structure for use later (like an Image element, etc.).

    var imagePlugin = {};
    imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
      return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
    };
    imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
      var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
      if (b.size !== byteArray.length) { // Safari bug #118630
        // Safari's Blob can only take an ArrayBuffer
        b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
      }
      var url = URL.createObjectURL(b);
      assert(typeof url == 'string', 'createObjectURL must return a url as a string');
      var img = new Image();
      img.onload = () => {
        assert(img.complete, `Image ${name} could not be decoded`);
        var canvas = /** @type {!HTMLCanvasElement} */ (document.createElement('canvas'));
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        preloadedImages[name] = canvas;
        URL.revokeObjectURL(url);
        onload?.(byteArray);
      };
      img.onerror = (event) => {
        err(`Image ${url} could not be decoded`);
        onerror?.();
      };
      img.src = url;
    };
    preloadPlugins.push(imagePlugin);

    var audioPlugin = {};
    audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
      return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
    };
    audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
      var done = false;
      function finish(audio) {
        if (done) return;
        done = true;
        preloadedAudios[name] = audio;
        onload?.(byteArray);
      }
      function fail() {
        if (done) return;
        done = true;
        preloadedAudios[name] = new Audio(); // empty shim
        onerror?.();
      }
      var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
      var url = URL.createObjectURL(b); // XXX we never revoke this!
      assert(typeof url == 'string', 'createObjectURL must return a url as a string');
      var audio = new Audio();
      audio.addEventListener('canplaythrough', () => finish(audio), false); // use addEventListener due to chromium bug 124926
      audio.onerror = function audio_onerror(event) {
        if (done) return;
        err(`warning: browser could not fully decode audio ${name}, trying slower base64 approach`);
        function encode64(data) {
          var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
          var PAD = '=';
          var ret = '';
          var leftchar = 0;
          var leftbits = 0;
          for (var i = 0; i < data.length; i++) {
            leftchar = (leftchar << 8) | data[i];
            leftbits += 8;
            while (leftbits >= 6) {
              var curr = (leftchar >> (leftbits-6)) & 0x3f;
              leftbits -= 6;
              ret += BASE[curr];
            }
          }
          if (leftbits == 2) {
            ret += BASE[(leftchar&3) << 4];
            ret += PAD + PAD;
          } else if (leftbits == 4) {
            ret += BASE[(leftchar&0xf) << 2];
            ret += PAD;
          }
          return ret;
        }
        audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
        finish(audio); // we don't wait for confirmation this worked - but it's worth trying
      };
      audio.src = url;
      // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
      safeSetTimeout(() => {
        finish(audio); // try to use it even though it is not necessarily ready to play
      }, 10000);
    };
    preloadPlugins.push(audioPlugin);

    // Canvas event setup

    function pointerLockChange() {
      Browser.pointerLock = document['pointerLockElement'] === Module['canvas'] ||
                            document['mozPointerLockElement'] === Module['canvas'] ||
                            document['webkitPointerLockElement'] === Module['canvas'] ||
                            document['msPointerLockElement'] === Module['canvas'];
    }
    var canvas = Module['canvas'];
    if (canvas) {
      // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
      // Module['forcedAspectRatio'] = 4 / 3;

      canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                  canvas['mozRequestPointerLock'] ||
                                  canvas['webkitRequestPointerLock'] ||
                                  canvas['msRequestPointerLock'] ||
                                  (() => {});
      canvas.exitPointerLock = document['exitPointerLock'] ||
                               document['mozExitPointerLock'] ||
                               document['webkitExitPointerLock'] ||
                               document['msExitPointerLock'] ||
                               (() => {}); // no-op if function does not exist
      canvas.exitPointerLock = canvas.exitPointerLock.bind(document);

      document.addEventListener('pointerlockchange', pointerLockChange, false);
      document.addEventListener('mozpointerlockchange', pointerLockChange, false);
      document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
      document.addEventListener('mspointerlockchange', pointerLockChange, false);

      if (Module['elementPointerLock']) {
        canvas.addEventListener("click", (ev) => {
          if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
            Module['canvas'].requestPointerLock();
            ev.preventDefault();
          }
        }, false);
      }
    }
  },
createContext(/** @type {HTMLCanvasElement} */ canvas, useWebGL, setInModule, webGLContextAttributes) {
    if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.

    var ctx;
    var contextHandle;
    if (useWebGL) {
      // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
      var contextAttributes = {
        antialias: false,
        alpha: false,
        majorVersion: 1,
      };

      if (webGLContextAttributes) {
        for (var attribute in webGLContextAttributes) {
          contextAttributes[attribute] = webGLContextAttributes[attribute];
        }
      }

      // This check of existence of GL is here to satisfy Closure compiler, which yells if variable GL is referenced below but GL object is not
      // actually compiled in because application is not doing any GL operations. TODO: Ideally if GL is not being used, this function
      // Browser.createContext() should not even be emitted.
      if (typeof GL != 'undefined') {
        contextHandle = GL.createContext(canvas, contextAttributes);
        if (contextHandle) {
          ctx = GL.getContext(contextHandle).GLctx;
        }
      }
    } else {
      ctx = canvas.getContext('2d');
    }

    if (!ctx) return null;

    if (setInModule) {
      if (!useWebGL) assert(typeof GLctx == 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
      Module.ctx = ctx;
      if (useWebGL) GL.makeContextCurrent(contextHandle);
      Module.useWebGL = useWebGL;
      Browser.moduleContextCreatedCallbacks.forEach((callback) => callback());
      Browser.init();
    }
    return ctx;
  },
destroyContext(canvas, useWebGL, setInModule) {},
fullscreenHandlersInstalled:false,
lockPointer:undefined,
resizeCanvas:undefined,
requestFullscreen(lockPointer, resizeCanvas) {
    Browser.lockPointer = lockPointer;
    Browser.resizeCanvas = resizeCanvas;
    if (typeof Browser.lockPointer == 'undefined') Browser.lockPointer = true;
    if (typeof Browser.resizeCanvas == 'undefined') Browser.resizeCanvas = false;

    var canvas = Module['canvas'];
    function fullscreenChange() {
      Browser.isFullscreen = false;
      var canvasContainer = canvas.parentNode;
      if ((document['fullscreenElement'] || document['mozFullScreenElement'] ||
           document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
           document['webkitCurrentFullScreenElement']) === canvasContainer) {
        canvas.exitFullscreen = Browser.exitFullscreen;
        if (Browser.lockPointer) canvas.requestPointerLock();
        Browser.isFullscreen = true;
        if (Browser.resizeCanvas) {
          Browser.setFullscreenCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      } else {
        // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
        canvasContainer.parentNode.removeChild(canvasContainer);

        if (Browser.resizeCanvas) {
          Browser.setWindowedCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      }
      Module['onFullScreen']?.(Browser.isFullscreen);
      Module['onFullscreen']?.(Browser.isFullscreen);
    }

    if (!Browser.fullscreenHandlersInstalled) {
      Browser.fullscreenHandlersInstalled = true;
      document.addEventListener('fullscreenchange', fullscreenChange, false);
      document.addEventListener('mozfullscreenchange', fullscreenChange, false);
      document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
      document.addEventListener('MSFullscreenChange', fullscreenChange, false);
    }

    // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
    var canvasContainer = document.createElement("div");
    canvas.parentNode.insertBefore(canvasContainer, canvas);
    canvasContainer.appendChild(canvas);

    // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
    canvasContainer.requestFullscreen = canvasContainer['requestFullscreen'] ||
                                        canvasContainer['mozRequestFullScreen'] ||
                                        canvasContainer['msRequestFullscreen'] ||
                                       (canvasContainer['webkitRequestFullscreen'] ? () => canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']) : null) ||
                                       (canvasContainer['webkitRequestFullScreen'] ? () => canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) : null);

    canvasContainer.requestFullscreen();
  },
requestFullScreen() {
    abort('Module.requestFullScreen has been replaced by Module.requestFullscreen (without a capital S)');
  },
exitFullscreen() {
    // This is workaround for chrome. Trying to exit from fullscreen
    // not in fullscreen state will cause "TypeError: Document not active"
    // in chrome. See https://github.com/emscripten-core/emscripten/pull/8236
    if (!Browser.isFullscreen) {
      return false;
    }

    var CFS = document['exitFullscreen'] ||
              document['cancelFullScreen'] ||
              document['mozCancelFullScreen'] ||
              document['msExitFullscreen'] ||
              document['webkitCancelFullScreen'] ||
        (() => {});
    CFS.apply(document, []);
    return true;
  },
nextRAF:0,
fakeRequestAnimationFrame(func) {
    // try to keep 60fps between calls to here
    var now = Date.now();
    if (Browser.nextRAF === 0) {
      Browser.nextRAF = now + 1000/60;
    } else {
      while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
        Browser.nextRAF += 1000/60;
      }
    }
    var delay = Math.max(Browser.nextRAF - now, 0);
    setTimeout(func, delay);
  },
requestAnimationFrame(func) {
    if (typeof requestAnimationFrame == 'function') {
      requestAnimationFrame(func);
      return;
    }
    var RAF = Browser.fakeRequestAnimationFrame;
    RAF(func);
  },
safeSetTimeout(func, timeout) {
    // Legacy function, this is used by the SDL2 port so we need to keep it
    // around at least until that is updated.
    // See https://github.com/libsdl-org/SDL/pull/6304
    return safeSetTimeout(func, timeout);
  },
safeRequestAnimationFrame(func) {
    
    return Browser.requestAnimationFrame(() => {
      
      callUserCallback(func);
    });
  },
getMimetype(name) {
    return {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'bmp': 'image/bmp',
      'ogg': 'audio/ogg',
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg'
    }[name.substr(name.lastIndexOf('.')+1)];
  },
getUserMedia(func) {
    window.getUserMedia ||= navigator['getUserMedia'] ||
                            navigator['mozGetUserMedia'];
    window.getUserMedia(func);
  },
getMovementX(event) {
    return event['movementX'] ||
           event['mozMovementX'] ||
           event['webkitMovementX'] ||
           0;
  },
getMovementY(event) {
    return event['movementY'] ||
           event['mozMovementY'] ||
           event['webkitMovementY'] ||
           0;
  },
getMouseWheelDelta(event) {
    var delta = 0;
    switch (event.type) {
      case 'DOMMouseScroll':
        // 3 lines make up a step
        delta = event.detail / 3;
        break;
      case 'mousewheel':
        // 120 units make up a step
        delta = event.wheelDelta / 120;
        break;
      case 'wheel':
        delta = event.deltaY
        switch (event.deltaMode) {
          case 0:
            // DOM_DELTA_PIXEL: 100 pixels make up a step
            delta /= 100;
            break;
          case 1:
            // DOM_DELTA_LINE: 3 lines make up a step
            delta /= 3;
            break;
          case 2:
            // DOM_DELTA_PAGE: A page makes up 80 steps
            delta *= 80;
            break;
          default:
            throw 'unrecognized mouse wheel delta mode: ' + event.deltaMode;
        }
        break;
      default:
        throw 'unrecognized mouse wheel event: ' + event.type;
    }
    return delta;
  },
mouseX:0,
mouseY:0,
mouseMovementX:0,
mouseMovementY:0,
touches:{
},
lastTouches:{
},
calculateMouseCoords(pageX, pageY) {
    // Calculate the movement based on the changes
    // in the coordinates.
    var rect = Module["canvas"].getBoundingClientRect();
    var cw = Module["canvas"].width;
    var ch = Module["canvas"].height;

    // Neither .scrollX or .pageXOffset are defined in a spec, but
    // we prefer .scrollX because it is currently in a spec draft.
    // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
    var scrollX = ((typeof window.scrollX != 'undefined') ? window.scrollX : window.pageXOffset);
    var scrollY = ((typeof window.scrollY != 'undefined') ? window.scrollY : window.pageYOffset);
    // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
    // and we have no viable fallback.
    assert((typeof scrollX != 'undefined') && (typeof scrollY != 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
    var adjustedX = pageX - (scrollX + rect.left);
    var adjustedY = pageY - (scrollY + rect.top);

    // the canvas might be CSS-scaled compared to its backbuffer;
    // SDL-using content will want mouse coordinates in terms
    // of backbuffer units.
    adjustedX = adjustedX * (cw / rect.width);
    adjustedY = adjustedY * (ch / rect.height);

    return { x: adjustedX, y: adjustedY };
  },
setMouseCoords(pageX, pageY) {
    const {x, y} = Browser.calculateMouseCoords(pageX, pageY);
    Browser.mouseMovementX = x - Browser.mouseX;
    Browser.mouseMovementY = y - Browser.mouseY;
    Browser.mouseX = x;
    Browser.mouseY = y;
  },
calculateMouseEvent(event) { // event should be mousemove, mousedown or mouseup
    if (Browser.pointerLock) {
      // When the pointer is locked, calculate the coordinates
      // based on the movement of the mouse.
      // Workaround for Firefox bug 764498
      if (event.type != 'mousemove' &&
          ('mozMovementX' in event)) {
        Browser.mouseMovementX = Browser.mouseMovementY = 0;
      } else {
        Browser.mouseMovementX = Browser.getMovementX(event);
        Browser.mouseMovementY = Browser.getMovementY(event);
      }

      // add the mouse delta to the current absolute mouse position
      Browser.mouseX += Browser.mouseMovementX;
      Browser.mouseY += Browser.mouseMovementY;
    } else {
      if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
        var touch = event.touch;
        if (touch === undefined) {
          return; // the "touch" property is only defined in SDL

        }
        var coords = Browser.calculateMouseCoords(touch.pageX, touch.pageY);

        if (event.type === 'touchstart') {
          Browser.lastTouches[touch.identifier] = coords;
          Browser.touches[touch.identifier] = coords;
        } else if (event.type === 'touchend' || event.type === 'touchmove') {
          var last = Browser.touches[touch.identifier];
          last ||= coords;
          Browser.lastTouches[touch.identifier] = last;
          Browser.touches[touch.identifier] = coords;
        }
        return;
      }

      Browser.setMouseCoords(event.pageX, event.pageY);
    }
  },
resizeListeners:[],
updateResizeListeners() {
    var canvas = Module['canvas'];
    Browser.resizeListeners.forEach((listener) => listener(canvas.width, canvas.height));
  },
setCanvasSize(width, height, noUpdates) {
    var canvas = Module['canvas'];
    Browser.updateCanvasDimensions(canvas, width, height);
    if (!noUpdates) Browser.updateResizeListeners();
  },
windowedWidth:0,
windowedHeight:0,
setFullscreenCanvasSize() {
    // check if SDL is available
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[((SDL.screen)>>2)];
      flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
      HEAP32[((SDL.screen)>>2)] = flags;
    }
    Browser.updateCanvasDimensions(Module['canvas']);
    Browser.updateResizeListeners();
  },
setWindowedCanvasSize() {
    // check if SDL is available
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[((SDL.screen)>>2)];
      flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
      HEAP32[((SDL.screen)>>2)] = flags;
    }
    Browser.updateCanvasDimensions(Module['canvas']);
    Browser.updateResizeListeners();
  },
updateCanvasDimensions(canvas, wNative, hNative) {
    if (wNative && hNative) {
      canvas.widthNative = wNative;
      canvas.heightNative = hNative;
    } else {
      wNative = canvas.widthNative;
      hNative = canvas.heightNative;
    }
    var w = wNative;
    var h = hNative;
    if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
      if (w/h < Module['forcedAspectRatio']) {
        w = Math.round(h * Module['forcedAspectRatio']);
      } else {
        h = Math.round(w / Module['forcedAspectRatio']);
      }
    }
    if (((document['fullscreenElement'] || document['mozFullScreenElement'] ||
         document['msFullscreenElement'] || document['webkitFullscreenElement'] ||
         document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
       var factor = Math.min(screen.width / w, screen.height / h);
       w = Math.round(w * factor);
       h = Math.round(h * factor);
    }
    if (Browser.resizeCanvas) {
      if (canvas.width  != w) canvas.width  = w;
      if (canvas.height != h) canvas.height = h;
      if (typeof canvas.style != 'undefined') {
        canvas.style.removeProperty( "width");
        canvas.style.removeProperty("height");
      }
    } else {
      if (canvas.width  != wNative) canvas.width  = wNative;
      if (canvas.height != hNative) canvas.height = hNative;
      if (typeof canvas.style != 'undefined') {
        if (w != wNative || h != hNative) {
          canvas.style.setProperty( "width", w + "px", "important");
          canvas.style.setProperty("height", h + "px", "important");
        } else {
          canvas.style.removeProperty( "width");
          canvas.style.removeProperty("height");
        }
      }
    }
  },
};





var _glIsEnabled = (x0) => GLctx.isEnabled(x0);




var _glCreateShader = (shaderType) => {
  var id = GL.getNewId(GL.shaders);
  GL.shaders[id] = GLctx.createShader(shaderType);

  return id;
};

var _glShaderSource = (shader, count, string, length) => {
  var source = GL.getSource(shader, count, string, length);

  GLctx.shaderSource(GL.shaders[shader], source);
};

var _glCompileShader = (shader) => {
  GLctx.compileShader(GL.shaders[shader]);
};

var _glAttachShader = (program, shader) => {
  GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
};

var _glDetachShader = (program, shader) => {
  GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
};

var _glUseProgram = (program) => {
  program = GL.programs[program];
  GLctx.useProgram(program);
  // Record the currently active program so that we can access the uniform
  // mapping table of that program.
  GLctx.currentProgram = program;
};

var _glDeleteProgram = (id) => {
  if (!id) return;
  var program = GL.programs[id];
  if (!program) {
    // glDeleteProgram actually signals an error when deleting a nonexisting
    // object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteProgram(program);
  program.name = 0;
  GL.programs[id] = null;
};


var _glBindAttribLocation = (program, index, name) => {
  GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
};

var _glLinkProgram = (program) => {
  program = GL.programs[program];
  GLctx.linkProgram(program);
  // Invalidate earlier computed uniform->ID mappings, those have now become stale
  program.uniformLocsById = 0; // Mark as null-like so that glGetUniformLocation() knows to populate this again.
  program.uniformSizeAndIdsByName = {};

};

var _glBindBuffer = (target, buffer) => {
  if (target == 0x8892 /*GL_ARRAY_BUFFER*/) {
    GLctx.currentArrayBufferBinding = buffer;
    GLImmediate.lastArrayBuffer = buffer;
  } else if (target == 0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/) {
    GLctx.currentElementArrayBufferBinding = buffer;
  }

  GLctx.bindBuffer(target, GL.buffers[buffer]);
};


var _glGetFloatv = (name_, p) => emscriptenWebGLGet(name_, p, 2);

var _glHint = (x0, x1) => GLctx.hint(x0, x1);

var _glEnableVertexAttribArray = (index) => {
  GLctx.enableVertexAttribArray(index);
};

var _glDisableVertexAttribArray = (index) => {
  GLctx.disableVertexAttribArray(index);
};

var _glVertexAttribPointer = (index, size, type, normalized, stride, ptr) => {
  GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
};

var _glActiveTexture = (x0) => GLctx.activeTexture(x0);



var GLEmulation = {
fogStart:0,
fogEnd:1,
fogDensity:1,
fogColor:null,
fogMode:2048,
fogEnabled:false,
MAX_CLIP_PLANES:6,
clipPlaneEnabled:[false,false,false,false,false,false],
clipPlaneEquation:[],
lightingEnabled:false,
lightModelAmbient:null,
lightModelLocalViewer:false,
lightModelTwoSide:false,
materialAmbient:null,
materialDiffuse:null,
materialSpecular:null,
materialShininess:null,
materialEmission:null,
MAX_LIGHTS:8,
lightEnabled:[false,false,false,false,false,false,false,false],
lightAmbient:[],
lightDiffuse:[],
lightSpecular:[],
lightPosition:[],
alphaTestEnabled:false,
alphaTestFunc:519,
alphaTestRef:0,
pointSize:1,
vaos:[],
currentVao:null,
enabledVertexAttribArrays:{
},
hasRunInit:false,
findToken(source, token) {
    function isIdentChar(ch) {
      if (ch >= 48 && ch <= 57) // 0-9
        return true;
      if (ch >= 65 && ch <= 90) // A-Z
        return true;
      if (ch >= 97 && ch <= 122) // a-z
        return true;
      return false;
    }
    var i = -1;
    do {
      i = source.indexOf(token, i + 1);
      if (i < 0) {
        break;
      }
      if (i > 0 && isIdentChar(source[i - 1])) {
        continue;
      }
      i += token.length;
      if (i < source.length - 1 && isIdentChar(source[i + 1])) {
        continue;
      }
      return true;
    } while (true);
    return false;
  },
init() {
    // Do not activate immediate/emulation code (e.g. replace glDrawElements)
    // when in FULL_ES2 mode.  We do not need full emulation, we instead
    // emulate client-side arrays etc. in FULL_ES2 code in a straightforward
    // manner, and avoid not having a bound buffer be ambiguous between es2
    // emulation code and legacy gl emulation code.

    if (GLEmulation.hasRunInit) {
      return;
    }
    GLEmulation.hasRunInit = true;

    GLEmulation.fogColor = new Float32Array(4);

    for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
      GLEmulation.clipPlaneEquation[clipPlaneId] = new Float32Array(4);
    }

    // set defaults for GL_LIGHTING
    GLEmulation.lightModelAmbient = new Float32Array([0.2, 0.2, 0.2, 1.0]);
    GLEmulation.materialAmbient = new Float32Array([0.2, 0.2, 0.2, 1.0]);
    GLEmulation.materialDiffuse = new Float32Array([0.8, 0.8, 0.8, 1.0]);
    GLEmulation.materialSpecular = new Float32Array([0.0, 0.0, 0.0, 1.0]);
    GLEmulation.materialShininess = new Float32Array([0.0]);
    GLEmulation.materialEmission = new Float32Array([0.0, 0.0, 0.0, 1.0]);

    for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
      GLEmulation.lightAmbient[lightId] = new Float32Array([0.0, 0.0, 0.0, 1.0]);
      GLEmulation.lightDiffuse[lightId] = lightId ? new Float32Array([0.0, 0.0, 0.0, 1.0]) : new Float32Array([1.0, 1.0, 1.0, 1.0]);
      GLEmulation.lightSpecular[lightId] = lightId ? new Float32Array([0.0, 0.0, 0.0, 1.0]) : new Float32Array([1.0, 1.0, 1.0, 1.0]);
      GLEmulation.lightPosition[lightId] = new Float32Array([0.0, 0.0, 1.0, 0.0]);
    }

    // Add some emulation workarounds
    err('WARNING: using emscripten GL emulation. This is a collection of limited workarounds, do not expect it to work.');
    err('WARNING: using emscripten GL emulation unsafe opts. If weirdness happens, try -sGL_UNSAFE_OPTS=0');

    // XXX some of the capabilities we don't support may lead to incorrect rendering, if we do not emulate them in shaders
    var validCapabilities = {
      0xB44: 1, // GL_CULL_FACE
      0xBE2: 1, // GL_BLEND
      0xBD0: 1, // GL_DITHER,
      0xB90: 1, // GL_STENCIL_TEST
      0xB71: 1, // GL_DEPTH_TEST
      0xC11: 1, // GL_SCISSOR_TEST
      0x8037: 1, // GL_POLYGON_OFFSET_FILL
      0x809E: 1, // GL_SAMPLE_ALPHA_TO_COVERAGE
      0x80A0: 1  // GL_SAMPLE_COVERAGE
    };

    var glEnable = _glEnable;
    _glEnable = _emscripten_glEnable = (cap) => {
      // Clean up the renderer on any change to the rendering state. The optimization of
      // skipping renderer setup is aimed at the case of multiple glDraw* right after each other
      GLImmediate.lastRenderer?.cleanup();
      if (cap == 0xB60 /* GL_FOG */) {
        if (GLEmulation.fogEnabled != true) {
          GLImmediate.currentRenderer = null; // Fog parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.fogEnabled = true;
        }
        return;
      } else if ((cap >= 0x3000) && (cap < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
        var clipPlaneId = cap - 0x3000;
        if (GLEmulation.clipPlaneEnabled[clipPlaneId] != true) {
          GLImmediate.currentRenderer = null; // clip plane parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.clipPlaneEnabled[clipPlaneId] = true;
        }
        return;
      } else if ((cap >= 0x4000) && (cap < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
        var lightId = cap - 0x4000;
        if (GLEmulation.lightEnabled[lightId] != true) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightEnabled[lightId] = true;
        }
        return;
      } else if (cap == 0xB50 /* GL_LIGHTING */) {
        if (GLEmulation.lightingEnabled != true) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightingEnabled = true;
        }
        return;
      } else if (cap == 0xBC0 /* GL_ALPHA_TEST */) {
        if (GLEmulation.alphaTestEnabled != true) {
          GLImmediate.currentRenderer = null; // alpha testing is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.alphaTestEnabled = true;
        }
        return;
      } else if (cap == 0xDE1 /* GL_TEXTURE_2D */) {
        // XXX not according to spec, and not in desktop GL, but works in some GLES1.x apparently, so support
        // it by forwarding to glEnableClientState
        /* Actually, let's not, for now. (This sounds exceedingly broken)
         * This is in gl_ps_workaround2.c.
        _glEnableClientState(cap);
        */
        return;
      } else if (!(cap in validCapabilities)) {
        return;
      }
      glEnable(cap);
    };

    var glDisable = _glDisable;
    _glDisable = _emscripten_glDisable = (cap) => {
      GLImmediate.lastRenderer?.cleanup();
      if (cap == 0xB60 /* GL_FOG */) {
        if (GLEmulation.fogEnabled != false) {
          GLImmediate.currentRenderer = null; // Fog parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.fogEnabled = false;
        }
        return;
      } else if ((cap >= 0x3000) && (cap < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
        var clipPlaneId = cap - 0x3000;
        if (GLEmulation.clipPlaneEnabled[clipPlaneId] != false) {
          GLImmediate.currentRenderer = null; // clip plane parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.clipPlaneEnabled[clipPlaneId] = false;
        }
        return;
      } else if ((cap >= 0x4000) && (cap < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
        var lightId = cap - 0x4000;
        if (GLEmulation.lightEnabled[lightId] != false) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightEnabled[lightId] = false;
        }
        return;
      } else if (cap == 0xB50 /* GL_LIGHTING */) {
        if (GLEmulation.lightingEnabled != false) {
          GLImmediate.currentRenderer = null; // light parameter is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.lightingEnabled = false;
        }
        return;
      } else if (cap == 0xBC0 /* GL_ALPHA_TEST */) {
        if (GLEmulation.alphaTestEnabled != false) {
          GLImmediate.currentRenderer = null; // alpha testing is part of the FFP shader state, we must re-lookup the renderer to use.
          GLEmulation.alphaTestEnabled = false;
        }
        return;
      } else if (cap == 0xDE1 /* GL_TEXTURE_2D */) {
        // XXX not according to spec, and not in desktop GL, but works in some GLES1.x apparently, so support
        // it by forwarding to glDisableClientState
        /* Actually, let's not, for now. (This sounds exceedingly broken)
         * This is in gl_ps_workaround2.c.
        _glDisableClientState(cap);
        */
        return;
      } else if (!(cap in validCapabilities)) {
        return;
      }
      glDisable(cap);
    };

    _glIsEnabled = _emscripten_glIsEnabled = (cap) => {
      if (cap == 0xB60 /* GL_FOG */) {
        return GLEmulation.fogEnabled ? 1 : 0;
      } else if ((cap >= 0x3000) && (cap < 0x3006)  /* GL_CLIP_PLANE0 to GL_CLIP_PLANE5 */) {
        var clipPlaneId = cap - 0x3000;
        return GLEmulation.clipPlaneEnabled[clipPlaneId] ? 1 : 0;
      } else if ((cap >= 0x4000) && (cap < 0x4008)  /* GL_LIGHT0 to GL_LIGHT7 */) {
        var lightId = cap - 0x4000;
        return GLEmulation.lightEnabled[lightId] ? 1 : 0;
      } else if (cap == 0xB50 /* GL_LIGHTING */) {
        return GLEmulation.lightingEnabled ? 1 : 0;
      } else if (cap == 0xBC0 /* GL_ALPHA_TEST */) {
        return GLEmulation.alphaTestEnabled ? 1 : 0;
      } else if (!(cap in validCapabilities)) {
        return 0;
      }
      return GLctx.isEnabled(cap);
    };

    var glGetBooleanv = _glGetBooleanv;
    _glGetBooleanv = _emscripten_glGetBooleanv = (pname, p) => {
      var attrib = GLEmulation.getAttributeFromCapability(pname);
      if (attrib !== null) {
        
        var result = GLImmediate.enabledClientAttributes[attrib];
        HEAP8[p] = result === true ? 1 : 0;
        return;
      }
      glGetBooleanv(pname, p);
    };

    var glGetIntegerv = _glGetIntegerv;
    _glGetIntegerv = _emscripten_glGetIntegerv = (pname, params) => {
      
      switch (pname) {
        case 0x84E2: pname = GLctx.MAX_TEXTURE_IMAGE_UNITS /* fake it */; break; // GL_MAX_TEXTURE_UNITS
        case 0x8B4A: { // GL_MAX_VERTEX_UNIFORM_COMPONENTS_ARB
          var result = GLctx.getParameter(GLctx.MAX_VERTEX_UNIFORM_VECTORS);
          HEAP32[((params)>>2)] = result*4; // GLES gives num of 4-element vectors, GL wants individual components, so multiply
          return;
        }
        case 0x8B49: { // GL_MAX_FRAGMENT_UNIFORM_COMPONENTS_ARB
          var result = GLctx.getParameter(GLctx.MAX_FRAGMENT_UNIFORM_VECTORS);
          HEAP32[((params)>>2)] = result*4; // GLES gives num of 4-element vectors, GL wants individual components, so multiply
          return;
        }
        case 0x8B4B: { // GL_MAX_VARYING_FLOATS_ARB
          var result = GLctx.getParameter(GLctx.MAX_VARYING_VECTORS);
          HEAP32[((params)>>2)] = result*4; // GLES gives num of 4-element vectors, GL wants individual components, so multiply
          return;
        }
        case 0x8871: pname = GLctx.MAX_COMBINED_TEXTURE_IMAGE_UNITS /* close enough */; break; // GL_MAX_TEXTURE_COORDS
        case 0x807A: { // GL_VERTEX_ARRAY_SIZE
          var attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX];
          HEAP32[((params)>>2)] = attribute ? attribute.size : 0;
          return;
        }
        case 0x807B: { // GL_VERTEX_ARRAY_TYPE
          var attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX];
          HEAP32[((params)>>2)] = attribute ? attribute.type : 0;
          return;
        }
        case 0x807C: { // GL_VERTEX_ARRAY_STRIDE
          var attribute = GLImmediate.clientAttributes[GLImmediate.VERTEX];
          HEAP32[((params)>>2)] = attribute ? attribute.stride : 0;
          return;
        }
        case 0x8081: { // GL_COLOR_ARRAY_SIZE
          var attribute = GLImmediate.clientAttributes[GLImmediate.COLOR];
          HEAP32[((params)>>2)] = attribute ? attribute.size : 0;
          return;
        }
        case 0x8082: { // GL_COLOR_ARRAY_TYPE
          var attribute = GLImmediate.clientAttributes[GLImmediate.COLOR];
          HEAP32[((params)>>2)] = attribute ? attribute.type : 0;
          return;
        }
        case 0x8083: { // GL_COLOR_ARRAY_STRIDE
          var attribute = GLImmediate.clientAttributes[GLImmediate.COLOR];
          HEAP32[((params)>>2)] = attribute ? attribute.stride : 0;
          return;
        }
        case 0x8088: { // GL_TEXTURE_COORD_ARRAY_SIZE
          var attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture];
          HEAP32[((params)>>2)] = attribute ? attribute.size : 0;
          return;
        }
        case 0x8089: { // GL_TEXTURE_COORD_ARRAY_TYPE
          var attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture];
          HEAP32[((params)>>2)] = attribute ? attribute.type : 0;
          return;
        }
        case 0x808A: { // GL_TEXTURE_COORD_ARRAY_STRIDE
          var attribute = GLImmediate.clientAttributes[GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture];
          HEAP32[((params)>>2)] = attribute ? attribute.stride : 0;
          return;
        }
        case 0x0D32: { // GL_MAX_CLIP_PLANES
          HEAP32[((params)>>2)] = GLEmulation.MAX_CLIP_PLANES; // all implementations need to support atleast 6
          return;
        }
        case 0x0BA0: { // GL_MATRIX_MODE
          HEAP32[((params)>>2)] = GLImmediate.currentMatrix + 0x1700;
          return;
        }
        case 0x0BC1: { // GL_ALPHA_TEST_FUNC
          HEAP32[((params)>>2)] = GLEmulation.alphaTestFunc;
          return;
        }
      }
      glGetIntegerv(pname, params);
    };

    var glGetString = _glGetString;
    _glGetString = _emscripten_glGetString = (name_) => {
      if (GL.stringCache[name_]) return GL.stringCache[name_];
      switch (name_) {
        case 0x1F03 /* GL_EXTENSIONS */: // Add various extensions that we can support
          var ret = stringToAddress(getEmscriptenSupportedExtensions(GLctx).join(' ') +
                 ' GL_EXT_texture_env_combine GL_ARB_texture_env_crossbar GL_ATI_texture_env_combine3 GL_NV_texture_env_combine4 GL_EXT_texture_env_dot3 GL_ARB_multitexture GL_ARB_vertex_buffer_object GL_EXT_framebuffer_object GL_ARB_vertex_program GL_ARB_fragment_program GL_ARB_shading_language_100 GL_ARB_shader_objects GL_ARB_vertex_shader GL_ARB_fragment_shader GL_ARB_texture_cube_map GL_EXT_draw_range_elements' +
                 (GL.currentContext.compressionExt ? ' GL_ARB_texture_compression GL_EXT_texture_compression_s3tc' : '') +
                 (GL.currentContext.anisotropicExt ? ' GL_EXT_texture_filter_anisotropic' : '')
          );
          return GL.stringCache[name_] = ret;
      }
      return glGetString(name_);
    };

    // Do some automatic rewriting to work around GLSL differences. Note that this must be done in
    // tandem with the rest of the program, by itself it cannot suffice.
    // Note that we need to remember shader types for this rewriting, saving sources makes it easier to debug.
    GL.shaderInfos = {};
    var glCreateShader = _glCreateShader;
    _glCreateShader = _emscripten_glCreateShader = (shaderType) => {
      var id = glCreateShader(shaderType);
      GL.shaderInfos[id] = {
        type: shaderType,
        ftransform: false
      };
      return id;
    };

    function ensurePrecision(source) {
      if (!/precision +(low|medium|high)p +float *;/.test(source)) {
        source = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' + source;
      }
      return source;
    }

    var glShaderSource = _glShaderSource;
    _glShaderSource = _emscripten_glShaderSource = (shader, count, string, length) => {
      
      
      var source = GL.getSource(shader, count, string, length);
      // XXX We add attributes and uniforms to shaders. The program can ask for the # of them, and see the
      // ones we generated, potentially confusing it? Perhaps we should hide them.
      if (GL.shaderInfos[shader].type == GLctx.VERTEX_SHADER) {
        // Replace ftransform() with explicit project/modelview transforms, and add position and matrix info.
        var has_pm = source.search(/u_projection/) >= 0;
        var has_mm = source.search(/u_modelView/) >= 0;
        var has_pv = source.search(/a_position/) >= 0;
        var need_pm = 0, need_mm = 0, need_pv = 0;
        var old = source;
        source = source.replace(/ftransform\(\)/g, '(u_projection * u_modelView * a_position)');
        if (old != source) need_pm = need_mm = need_pv = 1;
        old = source;
        source = source.replace(/gl_ProjectionMatrix/g, 'u_projection');
        if (old != source) need_pm = 1;
        old = source;
        source = source.replace(/gl_ModelViewMatrixTranspose\[2\]/g, 'vec4(u_modelView[0][2], u_modelView[1][2], u_modelView[2][2], u_modelView[3][2])'); // XXX extremely inefficient
        if (old != source) need_mm = 1;
        old = source;
        source = source.replace(/gl_ModelViewMatrix/g, 'u_modelView');
        if (old != source) need_mm = 1;
        old = source;
        source = source.replace(/gl_Vertex/g, 'a_position');
        if (old != source) need_pv = 1;
        old = source;
        source = source.replace(/gl_ModelViewProjectionMatrix/g, '(u_projection * u_modelView)');
        if (old != source) need_pm = need_mm = 1;
        if (need_pv && !has_pv) source = 'attribute vec4 a_position; \n' + source;
        if (need_mm && !has_mm) source = 'uniform mat4 u_modelView; \n' + source;
        if (need_pm && !has_pm) source = 'uniform mat4 u_projection; \n' + source;
        GL.shaderInfos[shader].ftransform = need_pm || need_mm || need_pv; // we will need to provide the fixed function stuff as attributes and uniforms
        for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          // XXX To handle both regular texture mapping and cube mapping, we use vec4 for tex coordinates.
          old = source;
          var need_vtc = source.search(`v_texCoord${i}`) == -1;
          source = source.replace(new RegExp(`gl_TexCoord\\[${i}\\]`, 'g'), `v_texCoord${i}`)
                         .replace(new RegExp(`gl_MultiTexCoord${i}`, 'g'), `a_texCoord${i}`);
          if (source != old) {
            source = `attribute vec4 a_texCoord${i}; \n${source}`;
            if (need_vtc) {
              source = `varying vec4 v_texCoord${i};   \n${source}`;
            }
          }

          old = source;
          source = source.replace(new RegExp(`gl_TextureMatrix\\[${i}\\]`, 'g'), `u_textureMatrix${i}`);
          if (source != old) {
            source = `uniform mat4 u_textureMatrix${i}; \n${source}`;
          }
        }
        if (source.includes('gl_FrontColor')) {
          source = 'varying vec4 v_color; \n' +
                   source.replace(/gl_FrontColor/g, 'v_color');
        }
        if (source.includes('gl_Color')) {
          source = 'attribute vec4 a_color; \n' +
                   source.replace(/gl_Color/g, 'a_color');
        }
        if (source.includes('gl_Normal')) {
          source = 'attribute vec3 a_normal; \n' +
                   source.replace(/gl_Normal/g, 'a_normal');
        }
        // fog
        if (source.includes('gl_FogFragCoord')) {
          source = 'varying float v_fogFragCoord;   \n' +
                   source.replace(/gl_FogFragCoord/g, 'v_fogFragCoord');
        }
      } else { // Fragment shader
        for (i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          old = source;
          source = source.replace(new RegExp(`gl_TexCoord\\[${i}\\]`, 'g'), `v_texCoord${i}`);
          if (source != old) {
            source = 'varying vec4 v_texCoord' + i + ';   \n' + source;
          }
        }
        if (source.includes('gl_Color')) {
          source = 'varying vec4 v_color; \n' + source.replace(/gl_Color/g, 'v_color');
        }
        if (source.includes('gl_Fog.color')) {
          source = 'uniform vec4 u_fogColor;   \n' +
                   source.replace(/gl_Fog.color/g, 'u_fogColor');
        }
        if (source.includes('gl_Fog.end')) {
          source = 'uniform float u_fogEnd;   \n' +
                   source.replace(/gl_Fog.end/g, 'u_fogEnd');
        }
        if (source.includes('gl_Fog.scale')) {
          source = 'uniform float u_fogScale;   \n' +
                   source.replace(/gl_Fog.scale/g, 'u_fogScale');
        }
        if (source.includes('gl_Fog.density')) {
          source = 'uniform float u_fogDensity;   \n' +
                   source.replace(/gl_Fog.density/g, 'u_fogDensity');
        }
        if (source.includes('gl_FogFragCoord')) {
          source = 'varying float v_fogFragCoord;   \n' +
                   source.replace(/gl_FogFragCoord/g, 'v_fogFragCoord');
        }
        source = ensurePrecision(source);
      }
      GLctx.shaderSource(GL.shaders[shader], source);
    };

    var glCompileShader = _glCompileShader;
    _glCompileShader = _emscripten_glCompileShader = (shader) => {
      GLctx.compileShader(GL.shaders[shader]);
    };

    GL.programShaders = {};
    var glAttachShader = _glAttachShader;
    _glAttachShader = _emscripten_glAttachShader = (program, shader) => {
      GL.programShaders[program] ||= [];
      GL.programShaders[program].push(shader);
      glAttachShader(program, shader);
    };

    var glDetachShader = _glDetachShader;
    _glDetachShader = _emscripten_glDetachShader = (program, shader) => {
      var programShader = GL.programShaders[program];
      if (!programShader) {
        err(`WARNING: _glDetachShader received invalid program: ${program}`);
        return;
      }
      var index = programShader.indexOf(shader);
      programShader.splice(index, 1);
      glDetachShader(program, shader);
    };

    var glUseProgram = _glUseProgram;
    _glUseProgram = _emscripten_glUseProgram = (program) => {
      if (GL.currProgram != program) {
        GLImmediate.currentRenderer = null; // This changes the FFP emulation shader program, need to recompute that.
        GL.currProgram = program;
        GLImmediate.fixedFunctionProgram = 0;
        glUseProgram(program);
      }
    }

    var glDeleteProgram = _glDeleteProgram;
    _glDeleteProgram = _emscripten_glDeleteProgram = (program) => {
      glDeleteProgram(program);
      if (program == GL.currProgram) {
        GLImmediate.currentRenderer = null; // This changes the FFP emulation shader program, need to recompute that.
        GL.currProgram = 0;
      }
    };

    // If attribute 0 was not bound, bind it to 0 for WebGL performance reasons. Track if 0 is free for that.
    var zeroUsedPrograms = {};
    var glBindAttribLocation = _glBindAttribLocation;
    _glBindAttribLocation = _emscripten_glBindAttribLocation = (program, index, name) => {
      if (index == 0) zeroUsedPrograms[program] = true;
      glBindAttribLocation(program, index, name);
    };

    var glLinkProgram = _glLinkProgram;
    _glLinkProgram = _emscripten_glLinkProgram = (program) => {
      if (!(program in zeroUsedPrograms)) {
        GLctx.bindAttribLocation(GL.programs[program], 0, 'a_position');
      }
      glLinkProgram(program);
    };

    var glBindBuffer = _glBindBuffer;
    _glBindBuffer = _emscripten_glBindBuffer = (target, buffer) => {
      glBindBuffer(target, buffer);
      if (target == GLctx.ARRAY_BUFFER) {
        if (GLEmulation.currentVao) {
          assert(GLEmulation.currentVao.arrayBuffer == buffer || GLEmulation.currentVao.arrayBuffer == 0 || buffer == 0, 'TODO: support for multiple array buffers in vao');
          GLEmulation.currentVao.arrayBuffer = buffer;
        }
      } else if (target == GLctx.ELEMENT_ARRAY_BUFFER) {
        if (GLEmulation.currentVao) GLEmulation.currentVao.elementArrayBuffer = buffer;
      }
    };

    var glGetFloatv = _glGetFloatv;
    _glGetFloatv = _emscripten_glGetFloatv = (pname, params) => {
      
      if (pname == 0xBA6) { // GL_MODELVIEW_MATRIX
        HEAPF32.set(GLImmediate.matrix[0/*m*/], ((params)>>2));
      } else if (pname == 0xBA7) { // GL_PROJECTION_MATRIX
        HEAPF32.set(GLImmediate.matrix[1/*p*/], ((params)>>2));
      } else if (pname == 0xBA8) { // GL_TEXTURE_MATRIX
        HEAPF32.set(GLImmediate.matrix[2/*t*/ + GLImmediate.clientActiveTexture], ((params)>>2));
      } else if (pname == 0xB66) { // GL_FOG_COLOR
        HEAPF32.set(GLEmulation.fogColor, ((params)>>2));
      } else if (pname == 0xB63) { // GL_FOG_START
        HEAPF32[((params)>>2)] = GLEmulation.fogStart;
      } else if (pname == 0xB64) { // GL_FOG_END
        HEAPF32[((params)>>2)] = GLEmulation.fogEnd;
      } else if (pname == 0xB62) { // GL_FOG_DENSITY
        HEAPF32[((params)>>2)] = GLEmulation.fogDensity;
      } else if (pname == 0xB65) { // GL_FOG_MODE
        HEAPF32[((params)>>2)] = GLEmulation.fogMode;
      } else if (pname == 0xB53) { // GL_LIGHT_MODEL_AMBIENT
        HEAPF32[((params)>>2)] = GLEmulation.lightModelAmbient[0];
        HEAPF32[(((params)+(4))>>2)] = GLEmulation.lightModelAmbient[1];
        HEAPF32[(((params)+(8))>>2)] = GLEmulation.lightModelAmbient[2];
        HEAPF32[(((params)+(12))>>2)] = GLEmulation.lightModelAmbient[3];
      } else if (pname == 0xBC2) { // GL_ALPHA_TEST_REF
        HEAPF32[((params)>>2)] = GLEmulation.alphaTestRef;
      } else {
        glGetFloatv(pname, params);
      }
    };

    var glHint = _glHint;
    _glHint = _emscripten_glHint = (target, mode) => {
      if (target == 0x84EF) { // GL_TEXTURE_COMPRESSION_HINT
        return;
      }
      glHint(target, mode);
    };

    var glEnableVertexAttribArray = _glEnableVertexAttribArray;
    _glEnableVertexAttribArray = _emscripten_glEnableVertexAttribArray = (index) => {
      glEnableVertexAttribArray(index);
      GLEmulation.enabledVertexAttribArrays[index] = 1;
      if (GLEmulation.currentVao) GLEmulation.currentVao.enabledVertexAttribArrays[index] = 1;
    };

    var glDisableVertexAttribArray = _glDisableVertexAttribArray;
    _glDisableVertexAttribArray = _emscripten_glDisableVertexAttribArray = (index) => {
      glDisableVertexAttribArray(index);
      delete GLEmulation.enabledVertexAttribArrays[index];
      if (GLEmulation.currentVao) delete GLEmulation.currentVao.enabledVertexAttribArrays[index];
    };

    var glVertexAttribPointer = _glVertexAttribPointer;
    _glVertexAttribPointer = _emscripten_glVertexAttribPointer = (index, size, type, normalized, stride, pointer) => {
      glVertexAttribPointer(index, size, type, normalized, stride, pointer);
      if (GLEmulation.currentVao) { // TODO: avoid object creation here? likely not hot though
        GLEmulation.currentVao.vertexAttribPointers[index] = [index, size, type, normalized, stride, pointer];
      }
    };
  },
getAttributeFromCapability(cap) {
    var attrib = null;
    switch (cap) {
      case 0xDE1: // GL_TEXTURE_2D - XXX not according to spec, and not in desktop GL, but works in some GLES1.x apparently, so support it
        abort("GL_TEXTURE_2D is not a spec-defined capability for gl{Enable,Disable}ClientState.");
        // Fall through:
      case 0x8078: // GL_TEXTURE_COORD_ARRAY
        attrib = GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture; break;
      case 0x8074: // GL_VERTEX_ARRAY
        attrib = GLImmediate.VERTEX; break;
      case 0x8075: // GL_NORMAL_ARRAY
        attrib = GLImmediate.NORMAL; break;
      case 0x8076: // GL_COLOR_ARRAY
        attrib = GLImmediate.COLOR; break;
    }
    return attrib;
  },
};
var GLImmediate = {
MapTreeLib:null,
spawnMapTreeLib:() => {
    /**
     * A naive implementation of a map backed by an array, and accessed by
     * naive iteration along the array. (hashmap with only one bucket)
     * @constructor
     */
    function CNaiveListMap() {
      var list = [];

      this.insert = function CNaiveListMap_insert(key, val) {
        if (this.contains(key|0)) return false;
        list.push([key, val]);
        return true;
      };

      var __contains_i;
      this.contains = function CNaiveListMap_contains(key) {
        for (__contains_i = 0; __contains_i < list.length; ++__contains_i) {
          if (list[__contains_i][0] === key) return true;
        }
        return false;
      };

      var __get_i;
      this.get = function CNaiveListMap_get(key) {
        for (__get_i = 0; __get_i < list.length; ++__get_i) {
          if (list[__get_i][0] === key) return list[__get_i][1];
        }
        return undefined;
      };
    };

    /**
     * A tree of map nodes.
     * Uses `KeyView`s to allow descending the tree without garbage.
     * Example: {
     *   // Create our map object.
     *   var map = new ObjTreeMap();
     *
     *   // Grab the static keyView for the map.
     *   var keyView = map.GetStaticKeyView();
     *
     *   // Let's make a map for:
     *   // root: <undefined>
     *   //   1: <undefined>
     *   //     2: <undefined>
     *   //       5: "Three, sir!"
     *   //       3: "Three!"
     *
     *   // Note how we can chain together `Reset` and `Next` to
     *   // easily descend based on multiple key fragments.
     *   keyView.Reset().Next(1).Next(2).Next(5).Set("Three, sir!");
     *   keyView.Reset().Next(1).Next(2).Next(3).Set("Three!");
     * }
     * @constructor
     */
    function CMapTree() {
      /** @constructor */
      function CNLNode() {
        var map = new CNaiveListMap();

        this.child = function CNLNode_child(keyFrag) {
          if (!map.contains(keyFrag|0)) {
            map.insert(keyFrag|0, new CNLNode());
          }
          return map.get(keyFrag|0);
        };

        this.value = undefined;
        this.get = function CNLNode_get() {
          return this.value;
        };

        this.set = function CNLNode_set(val) {
          this.value = val;
        };
      }

      /** @constructor */
      function CKeyView(root) {
        var cur;

        this.reset = function CKeyView_reset() {
          cur = root;
          return this;
        };
        this.reset();

        this.next = function CKeyView_next(keyFrag) {
          cur = cur.child(keyFrag);
          return this;
        };

        this.get = function CKeyView_get() {
          return cur.get();
        };

        this.set = function CKeyView_set(val) {
          cur.set(val);
        };
      };

      var root;
      var staticKeyView;

      this.createKeyView = function CNLNode_createKeyView() {
        return new CKeyView(root);
      }

      this.clear = function CNLNode_clear() {
        root = new CNLNode();
        staticKeyView = this.createKeyView();
      };
      this.clear();

      this.getStaticKeyView = function CNLNode_getStaticKeyView() {
        staticKeyView.reset();
        return staticKeyView;
      };
    };

    // Exports:
    return {
      create: () => new CMapTree(),
    };
  },
TexEnvJIT:null,
spawnTexEnvJIT:() => {
    // GL defs:
    var GL_TEXTURE0 = 0x84C0;
    var GL_TEXTURE_1D = 0xDE0;
    var GL_TEXTURE_2D = 0xDE1;
    var GL_TEXTURE_3D = 0x806f;
    var GL_TEXTURE_CUBE_MAP = 0x8513;
    var GL_TEXTURE_ENV = 0x2300;
    var GL_TEXTURE_ENV_MODE = 0x2200;
    var GL_TEXTURE_ENV_COLOR = 0x2201;
    var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;
    var GL_TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516;
    var GL_TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517;
    var GL_TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518;
    var GL_TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519;
    var GL_TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A;

    var GL_SRC0_RGB = 0x8580;
    var GL_SRC1_RGB = 0x8581;
    var GL_SRC2_RGB = 0x8582;

    var GL_SRC0_ALPHA = 0x8588;
    var GL_SRC1_ALPHA = 0x8589;
    var GL_SRC2_ALPHA = 0x858A;

    var GL_OPERAND0_RGB = 0x8590;
    var GL_OPERAND1_RGB = 0x8591;
    var GL_OPERAND2_RGB = 0x8592;

    var GL_OPERAND0_ALPHA = 0x8598;
    var GL_OPERAND1_ALPHA = 0x8599;
    var GL_OPERAND2_ALPHA = 0x859A;

    var GL_COMBINE_RGB = 0x8571;
    var GL_COMBINE_ALPHA = 0x8572;

    var GL_RGB_SCALE = 0x8573;
    var GL_ALPHA_SCALE = 0xD1C;

    // env.mode
    var GL_ADD      = 0x104;
    var GL_BLEND    = 0xBE2;
    var GL_REPLACE  = 0x1E01;
    var GL_MODULATE = 0x2100;
    var GL_DECAL    = 0x2101;
    var GL_COMBINE  = 0x8570;

    // env.color/alphaCombiner
    //var GL_ADD         = 0x104;
    //var GL_REPLACE     = 0x1E01;
    //var GL_MODULATE    = 0x2100;
    var GL_SUBTRACT    = 0x84E7;
    var GL_INTERPOLATE = 0x8575;

    // env.color/alphaSrc
    var GL_TEXTURE       = 0x1702;
    var GL_CONSTANT      = 0x8576;
    var GL_PRIMARY_COLOR = 0x8577;
    var GL_PREVIOUS      = 0x8578;

    // env.color/alphaOp
    var GL_SRC_COLOR           = 0x300;
    var GL_ONE_MINUS_SRC_COLOR = 0x301;
    var GL_SRC_ALPHA           = 0x302;
    var GL_ONE_MINUS_SRC_ALPHA = 0x303;

    var GL_RGB  = 0x1907;
    var GL_RGBA = 0x1908;

    // Our defs:
    var TEXENVJIT_NAMESPACE_PREFIX = "tej_";
    // Not actually constant, as they can be changed between JIT passes:
    var TEX_UNIT_UNIFORM_PREFIX = "uTexUnit";
    var TEX_COORD_VARYING_PREFIX = "vTexCoord";
    var PRIM_COLOR_VARYING = "vPrimColor";
    var TEX_MATRIX_UNIFORM_PREFIX = "uTexMatrix";

    // Static vars:
    var s_texUnits = null; //[];
    var s_activeTexture = 0;

    var s_requiredTexUnitsForPass = [];

    // Static funcs:
    function abort(info) {
      assert(false, "[TexEnvJIT] ABORT: " + info);
    }

    function abort_noSupport(info) {
      abort("No support: " + info);
    }

    function abort_sanity(info) {
      abort("Sanity failure: " + info);
    }

    function genTexUnitSampleExpr(texUnitID) {
      var texUnit = s_texUnits[texUnitID];
      var texType = texUnit.getTexType();

      var func = null;
      switch (texType) {
        case GL_TEXTURE_1D:
          func = "texture2D";
          break;
        case GL_TEXTURE_2D:
          func = "texture2D";
          break;
        case GL_TEXTURE_3D:
          return abort_noSupport("No support for 3D textures.");
        case GL_TEXTURE_CUBE_MAP:
          func = "textureCube";
          break;
        default:
          return abort_sanity(`Unknown texType: ${ptrToString(texType)}`);
      }

      var texCoordExpr = TEX_COORD_VARYING_PREFIX + texUnitID;
      if (TEX_MATRIX_UNIFORM_PREFIX != null) {
        texCoordExpr = `(${TEX_MATRIX_UNIFORM_PREFIX}${texUnitID} * ${texCoordExpr})`;
      }
      return `${func}(${TEX_UNIT_UNIFORM_PREFIX}${texUnitID}, ${texCoordExpr}.xy)`;
    }

    function getTypeFromCombineOp(op) {
      switch (op) {
        case GL_SRC_COLOR:
        case GL_ONE_MINUS_SRC_COLOR:
          return "vec3";
        case GL_SRC_ALPHA:
        case GL_ONE_MINUS_SRC_ALPHA:
          return "float";
      }

      return abort_noSupport("Unsupported combiner op: " + ptrToString(op));
    }

    function getCurTexUnit() {
      return s_texUnits[s_activeTexture];
    }

    function genCombinerSourceExpr(texUnitID, constantExpr, previousVar,
                                   src, op)
    {
      var srcExpr = null;
      switch (src) {
        case GL_TEXTURE:
          srcExpr = genTexUnitSampleExpr(texUnitID);
          break;
        case GL_CONSTANT:
          srcExpr = constantExpr;
          break;
        case GL_PRIMARY_COLOR:
          srcExpr = PRIM_COLOR_VARYING;
          break;
        case GL_PREVIOUS:
          srcExpr = previousVar;
          break;
        default:
            return abort_noSupport("Unsupported combiner src: " + ptrToString(src));
      }

      var expr = null;
      switch (op) {
        case GL_SRC_COLOR:
          expr = srcExpr + ".rgb";
          break;
        case GL_ONE_MINUS_SRC_COLOR:
          expr = "(vec3(1.0) - " + srcExpr + ".rgb)";
          break;
        case GL_SRC_ALPHA:
          expr = srcExpr + ".a";
          break;
        case GL_ONE_MINUS_SRC_ALPHA:
          expr = "(1.0 - " + srcExpr + ".a)";
          break;
        default:
          return abort_noSupport("Unsupported combiner op: " + ptrToString(op));
      }

      return expr;
    }

    function valToFloatLiteral(val) {
      if (val == Math.round(val)) return val + '.0';
      return val;
    }

    // Classes:
    /** @constructor */
    function CTexEnv() {
      this.mode = GL_MODULATE;
      this.colorCombiner = GL_MODULATE;
      this.alphaCombiner = GL_MODULATE;
      this.colorScale = 1;
      this.alphaScale = 1;
      this.envColor = [0, 0, 0, 0];

      this.colorSrc = [
        GL_TEXTURE,
        GL_PREVIOUS,
        GL_CONSTANT
      ];
      this.alphaSrc = [
        GL_TEXTURE,
        GL_PREVIOUS,
        GL_CONSTANT
      ];
      this.colorOp = [
        GL_SRC_COLOR,
        GL_SRC_COLOR,
        GL_SRC_ALPHA
      ];
      this.alphaOp = [
        GL_SRC_ALPHA,
        GL_SRC_ALPHA,
        GL_SRC_ALPHA
      ];

      // Map GLenums to small values to efficiently pack the enums to bits for tighter access.
      this.traverseKey = {
        // mode
        0x1E01 /* GL_REPLACE */: 0,
        0x2100 /* GL_MODULATE */: 1,
        0x104 /* GL_ADD */: 2,
        0xBE2 /* GL_BLEND */: 3,
        0x2101 /* GL_DECAL */: 4,
        0x8570 /* GL_COMBINE */: 5,

        // additional color and alpha combiners
        0x84E7 /* GL_SUBTRACT */: 3,
        0x8575 /* GL_INTERPOLATE */: 4,

        // color and alpha src
        0x1702 /* GL_TEXTURE */: 0,
        0x8576 /* GL_CONSTANT */: 1,
        0x8577 /* GL_PRIMARY_COLOR */: 2,
        0x8578 /* GL_PREVIOUS */: 3,

        // color and alpha op
        0x300 /* GL_SRC_COLOR */: 0,
        0x301 /* GL_ONE_MINUS_SRC_COLOR */: 1,
        0x302 /* GL_SRC_ALPHA */: 2,
        0x303 /* GL_ONE_MINUS_SRC_ALPHA */: 3
      };

      // The tuple (key0,key1,key2) uniquely identifies the state of the variables in CTexEnv.
      // -1 on key0 denotes 'the whole cached key is dirty'
      this.key0 = -1;
      this.key1 = 0;
      this.key2 = 0;

      this.computeKey0 = function() {
        var k = this.traverseKey;
        var key = k[this.mode] * 1638400; // 6 distinct values.
        key += k[this.colorCombiner] * 327680; // 5 distinct values.
        key += k[this.alphaCombiner] * 65536; // 5 distinct values.
        // The above three fields have 6*5*5=150 distinct values -> 8 bits.
        key += (this.colorScale-1) * 16384; // 10 bits used.
        key += (this.alphaScale-1) * 4096; // 12 bits used.
        key += k[this.colorSrc[0]] * 1024; // 14
        key += k[this.colorSrc[1]] * 256; // 16
        key += k[this.colorSrc[2]] * 64; // 18
        key += k[this.alphaSrc[0]] * 16; // 20
        key += k[this.alphaSrc[1]] * 4; // 22
        key += k[this.alphaSrc[2]]; // 24 bits used total.
        return key;
      }
      this.computeKey1 = function() {
        var k = this.traverseKey;
        var key = k[this.colorOp[0]] * 4096;
        key += k[this.colorOp[1]] * 1024;
        key += k[this.colorOp[2]] * 256;
        key += k[this.alphaOp[0]] * 16;
        key += k[this.alphaOp[1]] * 4;
        key += k[this.alphaOp[2]];
        return key;
      }
      // TODO: remove this. The color should not be part of the key!
      this.computeKey2 = function() {
        return this.envColor[0] * 16777216 + this.envColor[1] * 65536 + this.envColor[2] * 256 + 1 + this.envColor[3];
      }
      this.recomputeKey = function() {
        this.key0 = this.computeKey0();
        this.key1 = this.computeKey1();
        this.key2 = this.computeKey2();
      }
      this.invalidateKey = function() {
        this.key0 = -1; // The key of this texture unit must be recomputed when rendering the next time.
        GLImmediate.currentRenderer = null; // The currently used renderer must be re-evaluated at next render.
      }
    }

    /** @constructor */
    function CTexUnit() {
      this.env = new CTexEnv();
      this.enabled_tex1D   = false;
      this.enabled_tex2D   = false;
      this.enabled_tex3D   = false;
      this.enabled_texCube = false;
      this.texTypesEnabled = 0; // A bitfield combination of the four flags above, used for fast access to operations.

      this.traverseState = function CTexUnit_traverseState(keyView) {
        if (this.texTypesEnabled) {
          if (this.env.key0 == -1) {
            this.env.recomputeKey();
          }
          keyView.next(this.texTypesEnabled | (this.env.key0 << 4));
          keyView.next(this.env.key1);
          keyView.next(this.env.key2);
        } else {
          // For correctness, must traverse a zero value, theoretically a subsequent integer key could collide with this value otherwise.
          keyView.next(0);
        }
      };
    };

    // Class impls:
    CTexUnit.prototype.enabled = function CTexUnit_enabled() {
      return this.texTypesEnabled;
    }

    CTexUnit.prototype.genPassLines = function CTexUnit_genPassLines(passOutputVar, passInputVar, texUnitID) {
      if (!this.enabled()) {
        return ["vec4 " + passOutputVar + " = " + passInputVar + ";"];
      }
      var lines = this.env.genPassLines(passOutputVar, passInputVar, texUnitID).join('\n');

      var texLoadLines = '';
      var texLoadRegex = /(texture.*?\(.*?\))/g;
      var loadCounter = 0;
      var load;

      // As an optimization, merge duplicate identical texture loads to one var.
      while (load = texLoadRegex.exec(lines)) {
        var texLoadExpr = load[1];
        var secondOccurrence = lines.slice(load.index+1).indexOf(texLoadExpr);
        if (secondOccurrence != -1) { // And also has a second occurrence of same load expression..
          // Create new var to store the common load.
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texLoadVar = prefix + 'texload' + loadCounter++;
          var texLoadLine = 'vec4 ' + texLoadVar + ' = ' + texLoadExpr + ';\n';
          texLoadLines += texLoadLine + '\n'; // Store the generated texture load statements in a temp string to not confuse regex search in progress.
          lines = lines.split(texLoadExpr).join(texLoadVar);
          // Reset regex search, since we modified the string.
          texLoadRegex = /(texture.*\(.*\))/g;
        }
      }
      return [texLoadLines + lines];
    }

    CTexUnit.prototype.getTexType = function CTexUnit_getTexType() {
      if (this.enabled_texCube) {
        return GL_TEXTURE_CUBE_MAP;
      } else if (this.enabled_tex3D) {
        return GL_TEXTURE_3D;
      } else if (this.enabled_tex2D) {
        return GL_TEXTURE_2D;
      } else if (this.enabled_tex1D) {
        return GL_TEXTURE_1D;
      }
      return 0;
    }

    CTexEnv.prototype.genPassLines = function CTexEnv_genPassLines(passOutputVar, passInputVar, texUnitID) {
      switch (this.mode) {
        case GL_REPLACE: {
          /* RGB:
           * Cv = Cs
           * Av = Ap // Note how this is different, and that we'll
           *            need to track the bound texture internalFormat
           *            to get this right.
           *
           * RGBA:
           * Cv = Cs
           * Av = As
           */
          return [
            "vec4 " + passOutputVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
          ];
        }
        case GL_ADD: {
          /* RGBA:
           * Cv = Cp + Cs
           * Av = ApAs
           */
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texVar = prefix + "tex";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";

          return [
            "vec4 " + texVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
            "vec3 " + colorVar + " = " + passInputVar + ".rgb + " + texVar + ".rgb;",
            "float " + alphaVar + " = " + passInputVar + ".a * " + texVar + ".a;",
            "vec4 " + passOutputVar + " = vec4(" + colorVar + ", " + alphaVar + ");",
          ];
        }
        case GL_MODULATE: {
          /* RGBA:
           * Cv = CpCs
           * Av = ApAs
           */
          var line = [
            "vec4 " + passOutputVar,
            " = ",
              passInputVar,
              " * ",
              genTexUnitSampleExpr(texUnitID),
            ";",
          ];
          return [line.join("")];
        }
        case GL_DECAL: {
          /* RGBA:
           * Cv = Cp(1 - As) + CsAs
           * Av = Ap
           */
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texVar = prefix + "tex";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";

          return [
            "vec4 " + texVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
            [
              "vec3 " + colorVar + " = ",
                passInputVar + ".rgb * (1.0 - " + texVar + ".a)",
                  " + ",
                texVar + ".rgb * " + texVar + ".a",
              ";"
            ].join(""),
            "float " + alphaVar + " = " + passInputVar + ".a;",
            "vec4 " + passOutputVar + " = vec4(" + colorVar + ", " + alphaVar + ");",
          ];
        }
        case GL_BLEND: {
          /* RGBA:
           * Cv = Cp(1 - Cs) + CcCs
           * Av = As
           */
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var texVar = prefix + "tex";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";

          return [
            "vec4 " + texVar + " = " + genTexUnitSampleExpr(texUnitID) + ";",
            [
              "vec3 " + colorVar + " = ",
                passInputVar + ".rgb * (1.0 - " + texVar + ".rgb)",
                  " + ",
                PRIM_COLOR_VARYING + ".rgb * " + texVar + ".rgb",
              ";"
            ].join(""),
            "float " + alphaVar + " = " + texVar + ".a;",
            "vec4 " + passOutputVar + " = vec4(" + colorVar + ", " + alphaVar + ");",
          ];
        }
        case GL_COMBINE: {
          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + texUnitID + "_";
          var colorVar = prefix + "color";
          var alphaVar = prefix + "alpha";
          var colorLines = this.genCombinerLines(true, colorVar,
                                                 passInputVar, texUnitID,
                                                 this.colorCombiner, this.colorSrc, this.colorOp);
          var alphaLines = this.genCombinerLines(false, alphaVar,
                                                 passInputVar, texUnitID,
                                                 this.alphaCombiner, this.alphaSrc, this.alphaOp);

          // Generate scale, but avoid generating an identity op that multiplies by one.
          var scaledColor = (this.colorScale == 1) ? colorVar : (colorVar + " * " + valToFloatLiteral(this.colorScale));
          var scaledAlpha = (this.alphaScale == 1) ? alphaVar : (alphaVar + " * " + valToFloatLiteral(this.alphaScale));

          var line = [
            "vec4 " + passOutputVar,
            " = ",
              "vec4(",
                  scaledColor,
                  ", ",
                  scaledAlpha,
              ")",
            ";",
          ].join("");
          return [].concat(colorLines, alphaLines, [line]);
        }
      }

      return abort_noSupport("Unsupported TexEnv mode: " + ptrToString(this.mode));
    }

    CTexEnv.prototype.genCombinerLines = function CTexEnv_getCombinerLines(isColor, outputVar,
                                                                           passInputVar, texUnitID,
                                                                           combiner, srcArr, opArr)
    {
      var argsNeeded = null;
      switch (combiner) {
        case GL_REPLACE:
          argsNeeded = 1;
          break;

        case GL_MODULATE:
        case GL_ADD:
        case GL_SUBTRACT:
          argsNeeded = 2;
          break;

        case GL_INTERPOLATE:
          argsNeeded = 3;
          break;

        default:
          return abort_noSupport("Unsupported combiner: " + ptrToString(combiner));
      }

      var constantExpr = [
        "vec4(",
          valToFloatLiteral(this.envColor[0]),
          ", ",
          valToFloatLiteral(this.envColor[1]),
          ", ",
          valToFloatLiteral(this.envColor[2]),
          ", ",
          valToFloatLiteral(this.envColor[3]),
        ")",
      ].join("");
      var src0Expr = (argsNeeded >= 1) ? genCombinerSourceExpr(texUnitID, constantExpr, passInputVar, srcArr[0], opArr[0])
                                       : null;
      var src1Expr = (argsNeeded >= 2) ? genCombinerSourceExpr(texUnitID, constantExpr, passInputVar, srcArr[1], opArr[1])
                                       : null;
      var src2Expr = (argsNeeded >= 3) ? genCombinerSourceExpr(texUnitID, constantExpr, passInputVar, srcArr[2], opArr[2])
                                       : null;

      var outputType = isColor ? "vec3" : "float";
      var lines = null;
      switch (combiner) {
        case GL_REPLACE: {
          lines = [`${outputType} ${outputVar} = ${src0Expr};`]
          break;
        }
        case GL_MODULATE: {
          lines = [`${outputType} ${outputVar} = ${src0Expr} * ${src1Expr};`];
          break;
        }
        case GL_ADD: {
          lines = [`${outputType} ${outputVar} = ${src0Expr} + ${src1Expr};`]
          break;
        }
        case GL_SUBTRACT: {
          lines = [`${outputType} ${outputVar} = ${src0Expr} - ${src1Expr};`]
          break;
        }
        case GL_INTERPOLATE: {
          var prefix = `${TEXENVJIT_NAMESPACE_PREFIX}env${texUnitID}_`;
          var arg2Var = `${prefix}colorSrc2`;
          var arg2Type = getTypeFromCombineOp(this.colorOp[2]);

          lines = [
            `${arg2Type} ${arg2Var} = ${src2Expr};`,
            `${outputType} ${outputVar} = ${src0Expr} * ${arg2Var} + ${src1Expr} * (1.0 - ${arg2Var});`,
          ];
          break;
        }

        default:
          return abort_sanity("Unmatched TexEnv.colorCombiner?");
      }

      return lines;
    }

    return {
      // Exports:
      init: (gl, specifiedMaxTextureImageUnits) => {
        var maxTexUnits = 0;
        if (specifiedMaxTextureImageUnits) {
          maxTexUnits = specifiedMaxTextureImageUnits;
        } else if (gl) {
          maxTexUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        }
        assert(maxTexUnits > 0);
        s_texUnits = [];
        for (var i = 0; i < maxTexUnits; i++) {
          s_texUnits.push(new CTexUnit());
        }
      },

      setGLSLVars: (uTexUnitPrefix, vTexCoordPrefix, vPrimColor, uTexMatrixPrefix) => {
        TEX_UNIT_UNIFORM_PREFIX   = uTexUnitPrefix;
        TEX_COORD_VARYING_PREFIX  = vTexCoordPrefix;
        PRIM_COLOR_VARYING        = vPrimColor;
        TEX_MATRIX_UNIFORM_PREFIX = uTexMatrixPrefix;
      },

      genAllPassLines: (resultDest, indentSize = 0) => {
        s_requiredTexUnitsForPass.length = 0; // Clear the list.
        var lines = [];
        var lastPassVar = PRIM_COLOR_VARYING;
        for (var i = 0; i < s_texUnits.length; i++) {
          if (!s_texUnits[i].enabled()) continue;

          s_requiredTexUnitsForPass.push(i);

          var prefix = TEXENVJIT_NAMESPACE_PREFIX + 'env' + i + "_";
          var passOutputVar = prefix + "result";

          var newLines = s_texUnits[i].genPassLines(passOutputVar, lastPassVar, i);
          lines = lines.concat(newLines, [""]);

          lastPassVar = passOutputVar;
        }
        lines.push(resultDest + " = " + lastPassVar + ";");

        var indent = "";
        for (var i = 0; i < indentSize; i++) indent += " ";

        var output = indent + lines.join("\n" + indent);

        return output;
      },

      getUsedTexUnitList: () => s_requiredTexUnitsForPass,

      getActiveTexture: () => s_activeTexture,

      traverseState: (keyView) => {
        for (var i = 0; i < s_texUnits.length; i++) {
          s_texUnits[i].traverseState(keyView);
        }
      },

      getTexUnitType: (texUnitID) => {
        assert(texUnitID >= 0 &&
               texUnitID < s_texUnits.length);
        return s_texUnits[texUnitID].getTexType();
      },

      // Hooks:
      hook_activeTexture: (texture) => {
        s_activeTexture = texture - GL_TEXTURE0;
        // Check if the current matrix mode is GL_TEXTURE.
        if (GLImmediate.currentMatrix >= 2) {
          // Switch to the corresponding texture matrix stack.
          GLImmediate.currentMatrix = 2 + s_activeTexture;
        }
      },

      hook_enable: (cap) => {
        var cur = getCurTexUnit();
        switch (cap) {
          case GL_TEXTURE_1D:
            if (!cur.enabled_tex1D) {
              GLImmediate.currentRenderer = null; // Renderer state changed, and must be recreated or looked up again.
              cur.enabled_tex1D = true;
              cur.texTypesEnabled |= 1;
            }
            break;
          case GL_TEXTURE_2D:
            if (!cur.enabled_tex2D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex2D = true;
              cur.texTypesEnabled |= 2;
            }
            break;
          case GL_TEXTURE_3D:
            if (!cur.enabled_tex3D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex3D = true;
              cur.texTypesEnabled |= 4;
            }
            break;
          case GL_TEXTURE_CUBE_MAP:
            if (!cur.enabled_texCube) {
              GLImmediate.currentRenderer = null;
              cur.enabled_texCube = true;
              cur.texTypesEnabled |= 8;
            }
            break;
        }
      },

      hook_disable: (cap) => {
        var cur = getCurTexUnit();
        switch (cap) {
          case GL_TEXTURE_1D:
            if (cur.enabled_tex1D) {
              GLImmediate.currentRenderer = null; // Renderer state changed, and must be recreated or looked up again.
              cur.enabled_tex1D = false;
              cur.texTypesEnabled &= ~1;
            }
            break;
          case GL_TEXTURE_2D:
            if (cur.enabled_tex2D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex2D = false;
              cur.texTypesEnabled &= ~2;
            }
            break;
          case GL_TEXTURE_3D:
            if (cur.enabled_tex3D) {
              GLImmediate.currentRenderer = null;
              cur.enabled_tex3D = false;
              cur.texTypesEnabled &= ~4;
            }
            break;
          case GL_TEXTURE_CUBE_MAP:
            if (cur.enabled_texCube) {
              GLImmediate.currentRenderer = null;
              cur.enabled_texCube = false;
              cur.texTypesEnabled &= ~8;
            }
            break;
        }
      },

      hook_texEnvf(target, pname, param) {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_RGB_SCALE:
            if (env.colorScale != param) {
              env.invalidateKey(); // We changed FFP emulation renderer state.
              env.colorScale = param;
            }
            break;
          case GL_ALPHA_SCALE:
            if (env.alphaScale != param) {
              env.invalidateKey();
              env.alphaScale = param;
            }
            break;

          default:
            err('WARNING: Unhandled `pname` in call to `glTexEnvf`.');
        }
      },

      hook_texEnvi(target, pname, param) {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_MODE:
            if (env.mode != param) {
              env.invalidateKey(); // We changed FFP emulation renderer state.
              env.mode = param;
            }
            break;

          case GL_COMBINE_RGB:
            if (env.colorCombiner != param) {
              env.invalidateKey();
              env.colorCombiner = param;
            }
            break;
          case GL_COMBINE_ALPHA:
            if (env.alphaCombiner != param) {
              env.invalidateKey();
              env.alphaCombiner = param;
            }
            break;

          case GL_SRC0_RGB:
            if (env.colorSrc[0] != param) {
              env.invalidateKey();
              env.colorSrc[0] = param;
            }
            break;
          case GL_SRC1_RGB:
            if (env.colorSrc[1] != param) {
              env.invalidateKey();
              env.colorSrc[1] = param;
            }
            break;
          case GL_SRC2_RGB:
            if (env.colorSrc[2] != param) {
              env.invalidateKey();
              env.colorSrc[2] = param;
            }
            break;

          case GL_SRC0_ALPHA:
            if (env.alphaSrc[0] != param) {
              env.invalidateKey();
              env.alphaSrc[0] = param;
            }
            break;
          case GL_SRC1_ALPHA:
            if (env.alphaSrc[1] != param) {
              env.invalidateKey();
              env.alphaSrc[1] = param;
            }
            break;
          case GL_SRC2_ALPHA:
            if (env.alphaSrc[2] != param) {
              env.invalidateKey();
              env.alphaSrc[2] = param;
            }
            break;

          case GL_OPERAND0_RGB:
            if (env.colorOp[0] != param) {
              env.invalidateKey();
              env.colorOp[0] = param;
            }
            break;
          case GL_OPERAND1_RGB:
            if (env.colorOp[1] != param) {
              env.invalidateKey();
              env.colorOp[1] = param;
            }
            break;
          case GL_OPERAND2_RGB:
            if (env.colorOp[2] != param) {
              env.invalidateKey();
              env.colorOp[2] = param;
            }
            break;

          case GL_OPERAND0_ALPHA:
            if (env.alphaOp[0] != param) {
              env.invalidateKey();
              env.alphaOp[0] = param;
            }
            break;
          case GL_OPERAND1_ALPHA:
            if (env.alphaOp[1] != param) {
              env.invalidateKey();
              env.alphaOp[1] = param;
            }
            break;
          case GL_OPERAND2_ALPHA:
            if (env.alphaOp[2] != param) {
              env.invalidateKey();
              env.alphaOp[2] = param;
            }
            break;

          case GL_RGB_SCALE:
            if (env.colorScale != param) {
              env.invalidateKey();
              env.colorScale = param;
            }
            break;
          case GL_ALPHA_SCALE:
            if (env.alphaScale != param) {
              env.invalidateKey();
              env.alphaScale = param;
            }
            break;

          default:
            err('WARNING: Unhandled `pname` in call to `glTexEnvi`.');
        }
      },

      hook_texEnvfv(target, pname, params) {
        if (target != GL_TEXTURE_ENV) return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_COLOR: {
            for (var i = 0; i < 4; i++) {
              var param = HEAPF32[(((params)+(i*4))>>2)];
              if (env.envColor[i] != param) {
                env.invalidateKey(); // We changed FFP emulation renderer state.
                env.envColor[i] = param;
              }
            }
            break
          }
          default:
            err('WARNING: Unhandled `pname` in call to `glTexEnvfv`.');
        }
      },

      hook_getTexEnviv(target, pname, param) {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_MODE:
            HEAP32[((param)>>2)] = env.mode;
            return;

          case GL_TEXTURE_ENV_COLOR:
            HEAP32[((param)>>2)] = Math.max(Math.min(env.envColor[0]*255, 255, -255));
            HEAP32[(((param)+(1))>>2)] = Math.max(Math.min(env.envColor[1]*255, 255, -255));
            HEAP32[(((param)+(2))>>2)] = Math.max(Math.min(env.envColor[2]*255, 255, -255));
            HEAP32[(((param)+(3))>>2)] = Math.max(Math.min(env.envColor[3]*255, 255, -255));
            return;

          case GL_COMBINE_RGB:
            HEAP32[((param)>>2)] = env.colorCombiner;
            return;

          case GL_COMBINE_ALPHA:
            HEAP32[((param)>>2)] = env.alphaCombiner;
            return;

          case GL_SRC0_RGB:
            HEAP32[((param)>>2)] = env.colorSrc[0];
            return;

          case GL_SRC1_RGB:
            HEAP32[((param)>>2)] = env.colorSrc[1];
            return;

          case GL_SRC2_RGB:
            HEAP32[((param)>>2)] = env.colorSrc[2];
            return;

          case GL_SRC0_ALPHA:
            HEAP32[((param)>>2)] = env.alphaSrc[0];
            return;

          case GL_SRC1_ALPHA:
            HEAP32[((param)>>2)] = env.alphaSrc[1];
            return;

          case GL_SRC2_ALPHA:
            HEAP32[((param)>>2)] = env.alphaSrc[2];
            return;

          case GL_OPERAND0_RGB:
            HEAP32[((param)>>2)] = env.colorOp[0];
            return;

          case GL_OPERAND1_RGB:
            HEAP32[((param)>>2)] = env.colorOp[1];
            return;

          case GL_OPERAND2_RGB:
            HEAP32[((param)>>2)] = env.colorOp[2];
            return;

          case GL_OPERAND0_ALPHA:
            HEAP32[((param)>>2)] = env.alphaOp[0];
            return;

          case GL_OPERAND1_ALPHA:
            HEAP32[((param)>>2)] = env.alphaOp[1];
            return;

          case GL_OPERAND2_ALPHA:
            HEAP32[((param)>>2)] = env.alphaOp[2];
            return;

          case GL_RGB_SCALE:
            HEAP32[((param)>>2)] = env.colorScale;
            return;

          case GL_ALPHA_SCALE:
            HEAP32[((param)>>2)] = env.alphaScale;
            return;

          default:
            err('WARNING: Unhandled `pname` in call to `glGetTexEnvi`.');
        }
      },

      hook_getTexEnvfv: (target, pname, param) => {
        if (target != GL_TEXTURE_ENV)
          return;

        var env = getCurTexUnit().env;
        switch (pname) {
          case GL_TEXTURE_ENV_COLOR:
            HEAPF32[((param)>>2)] = env.envColor[0];
            HEAPF32[(((param)+(4))>>2)] = env.envColor[1];
            HEAPF32[(((param)+(8))>>2)] = env.envColor[2];
            HEAPF32[(((param)+(12))>>2)] = env.envColor[3];
            return;
        }
      }
    };
  },
vertexData:null,
vertexDataU8:null,
tempData:null,
indexData:null,
vertexCounter:0,
mode:-1,
rendererCache:null,
rendererComponents:[],
rendererComponentPointer:0,
lastRenderer:null,
lastArrayBuffer:null,
lastProgram:null,
lastStride:-1,
matrix:[],
matrixStack:[],
currentMatrix:0,
tempMatrix:null,
matricesModified:false,
useTextureMatrix:false,
VERTEX:0,
NORMAL:1,
COLOR:2,
TEXTURE0:3,
NUM_ATTRIBUTES:-1,
MAX_TEXTURES:-1,
totalEnabledClientAttributes:0,
enabledClientAttributes:[0,0],
clientAttributes:[],
liveClientAttributes:[],
currentRenderer:null,
modifiedClientAttributes:false,
clientActiveTexture:0,
clientColor:null,
usedTexUnitList:[],
fixedFunctionProgram:null,
setClientAttribute(name, size, type, stride, pointer) {
    var attrib = GLImmediate.clientAttributes[name];
    if (!attrib) {
      for (var i = 0; i <= name; i++) { // keep flat
        GLImmediate.clientAttributes[i] ||= {
          name,
          size,
          type,
          stride,
          pointer,
          offset: 0
        };
      }
    } else {
      attrib.name = name;
      attrib.size = size;
      attrib.type = type;
      attrib.stride = stride;
      attrib.pointer = pointer;
      attrib.offset = 0;
    }
    GLImmediate.modifiedClientAttributes = true;
  },
addRendererComponent(name, size, type) {
    if (!GLImmediate.rendererComponents[name]) {
      GLImmediate.rendererComponents[name] = 1;
      if (GLImmediate.enabledClientAttributes[name]) {
        out("Warning: glTexCoord used after EnableClientState for TEXTURE_COORD_ARRAY for TEXTURE0. Disabling TEXTURE_COORD_ARRAY...");
      }
      GLImmediate.enabledClientAttributes[name] = true;
      GLImmediate.setClientAttribute(name, size, type, 0, GLImmediate.rendererComponentPointer);
      GLImmediate.rendererComponentPointer += size * GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
    } else {
      GLImmediate.rendererComponents[name]++;
    }
  },
disableBeginEndClientAttributes() {
    for (var i = 0; i < GLImmediate.NUM_ATTRIBUTES; i++) {
      if (GLImmediate.rendererComponents[i]) GLImmediate.enabledClientAttributes[i] = false;
    }
  },
getRenderer() {
    // If no FFP state has changed that would have forced to re-evaluate which FFP emulation shader to use,
    // we have the currently used renderer in cache, and can immediately return that.
    if (GLImmediate.currentRenderer) {
      return GLImmediate.currentRenderer;
    }
    // return a renderer object given the liveClientAttributes
    // we maintain a cache of renderers, optimized to not generate garbage
    var attributes = GLImmediate.liveClientAttributes;
    var cacheMap = GLImmediate.rendererCache;
    var keyView = cacheMap.getStaticKeyView().reset();

    // By attrib state:
    var enabledAttributesKey = 0;
    for (var i = 0; i < attributes.length; i++) {
      enabledAttributesKey |= 1 << attributes[i].name;
    }

    // To prevent using more than 31 bits add another level to the maptree
    // and reset the enabledAttributesKey for the next glemulation state bits
    keyView.next(enabledAttributesKey);
    enabledAttributesKey = 0;

    // By fog state:
    var fogParam = 0;
    if (GLEmulation.fogEnabled) {
      switch (GLEmulation.fogMode) {
        case 0x801: // GL_EXP2
          fogParam = 1;
          break;
        case 0x2601: // GL_LINEAR
          fogParam = 2;
          break;
        default: // default to GL_EXP
          fogParam = 3;
          break;
      }
    }
    enabledAttributesKey = (enabledAttributesKey << 2) | fogParam;

    // By clip plane mode
    for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
      enabledAttributesKey = (enabledAttributesKey << 1) | GLEmulation.clipPlaneEnabled[clipPlaneId];
    }

    // By lighting mode and enabled lights
    enabledAttributesKey = (enabledAttributesKey << 1) | GLEmulation.lightingEnabled;
    for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
      enabledAttributesKey = (enabledAttributesKey << 1) | (GLEmulation.lightingEnabled ? GLEmulation.lightEnabled[lightId] : 0);
    }

    // By alpha testing mode
    enabledAttributesKey = (enabledAttributesKey << 3) | (GLEmulation.alphaTestEnabled ? (GLEmulation.alphaTestFunc - 0x200) : 0x7);

    // By drawing mode:
    enabledAttributesKey = (enabledAttributesKey << 1) | (GLImmediate.mode == GLctx.POINTS ? 1 : 0);

    keyView.next(enabledAttributesKey);

    // By cur program:
    keyView.next(GL.currProgram);
    if (!GL.currProgram) {
      GLImmediate.TexEnvJIT.traverseState(keyView);
    }

    // If we don't already have it, create it.
    var renderer = keyView.get();
    if (!renderer) {
      renderer = GLImmediate.createRenderer();
      GLImmediate.currentRenderer = renderer;
      keyView.set(renderer);
      return renderer;
    }
    GLImmediate.currentRenderer = renderer; // Cache the currently used renderer, so later lookups without state changes can get this fast.
    return renderer;
  },
createRenderer(renderer) {
    var useCurrProgram = !!GL.currProgram;
    var hasTextures = false;
    for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
      var texAttribName = GLImmediate.TEXTURE0 + i;
      if (!GLImmediate.enabledClientAttributes[texAttribName])
        continue;

      if (!useCurrProgram) {
        if (GLImmediate.TexEnvJIT.getTexUnitType(i) == 0) {
           warnOnce("GL_TEXTURE" + i + " coords are supplied, but that texture unit is disabled in the fixed-function pipeline.");
        }
      }

      hasTextures = true;
    }

    /** @constructor */
    function Renderer() {
      this.init = function() {
        // For fixed-function shader generation.
        var uTexUnitPrefix = 'u_texUnit';
        var aTexCoordPrefix = 'a_texCoord';
        var vTexCoordPrefix = 'v_texCoord';
        var vPrimColor = 'v_color';
        var uTexMatrixPrefix = GLImmediate.useTextureMatrix ? 'u_textureMatrix' : null;

        if (useCurrProgram) {
          if (GL.shaderInfos[GL.programShaders[GL.currProgram][0]].type == GLctx.VERTEX_SHADER) {
            this.vertexShader = GL.shaders[GL.programShaders[GL.currProgram][0]];
            this.fragmentShader = GL.shaders[GL.programShaders[GL.currProgram][1]];
          } else {
            this.vertexShader = GL.shaders[GL.programShaders[GL.currProgram][1]];
            this.fragmentShader = GL.shaders[GL.programShaders[GL.currProgram][0]];
          }
          this.program = GL.programs[GL.currProgram];
          this.usedTexUnitList = [];
        } else {
          // IMPORTANT NOTE: If you parameterize the shader source based on any runtime values
          // in order to create the least expensive shader possible based on the features being
          // used, you should also update the code in the beginning of getRenderer to make sure
          // that you cache the renderer based on the said parameters.
          if (GLEmulation.fogEnabled) {
            switch (GLEmulation.fogMode) {
              case 0x801: // GL_EXP2
                // fog = exp(-(gl_Fog.density * gl_FogFragCoord)^2)
                var fogFormula = '  float fog = exp(-u_fogDensity * u_fogDensity * ecDistance * ecDistance); \n';
                break;
              case 0x2601: // GL_LINEAR
                // fog = (gl_Fog.end - gl_FogFragCoord) * gl_fog.scale
                var fogFormula = '  float fog = (u_fogEnd - ecDistance) * u_fogScale; \n';
                break;
              default: // default to GL_EXP
                // fog = exp(-gl_Fog.density * gl_FogFragCoord)
                var fogFormula = '  float fog = exp(-u_fogDensity * ecDistance); \n';
                break;
            }
          }

          GLImmediate.TexEnvJIT.setGLSLVars(uTexUnitPrefix, vTexCoordPrefix, vPrimColor, uTexMatrixPrefix);
          var fsTexEnvPass = GLImmediate.TexEnvJIT.genAllPassLines('gl_FragColor', 2);

          var texUnitAttribList = '';
          var texUnitVaryingList = '';
          var texUnitUniformList = '';
          var vsTexCoordInits = '';
          this.usedTexUnitList = GLImmediate.TexEnvJIT.getUsedTexUnitList();
          for (var i = 0; i < this.usedTexUnitList.length; i++) {
            var texUnit = this.usedTexUnitList[i];
            texUnitAttribList += 'attribute vec4 ' + aTexCoordPrefix + texUnit + ';\n';
            texUnitVaryingList += 'varying vec4 ' + vTexCoordPrefix + texUnit + ';\n';
            texUnitUniformList += 'uniform sampler2D ' + uTexUnitPrefix + texUnit + ';\n';
            vsTexCoordInits += '  ' + vTexCoordPrefix + texUnit + ' = ' + aTexCoordPrefix + texUnit + ';\n';

            if (GLImmediate.useTextureMatrix) {
              texUnitUniformList += 'uniform mat4 ' + uTexMatrixPrefix + texUnit + ';\n';
            }
          }

          var vsFogVaryingInit = null;
          if (GLEmulation.fogEnabled) {
            vsFogVaryingInit = '  v_fogFragCoord = abs(ecPosition.z);\n';
          }

          var vsPointSizeDefs = null;
          var vsPointSizeInit = null;
          if (GLImmediate.mode == GLctx.POINTS) {
            vsPointSizeDefs = 'uniform float u_pointSize;\n';
            vsPointSizeInit = '  gl_PointSize = u_pointSize;\n';
          }

          var vsClipPlaneDefs = '';
          var vsClipPlaneInit = '';
          var fsClipPlaneDefs = '';
          var fsClipPlanePass = '';
          for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
            if (GLEmulation.clipPlaneEnabled[clipPlaneId]) {
              vsClipPlaneDefs += 'uniform vec4 u_clipPlaneEquation' + clipPlaneId + ';';
              vsClipPlaneDefs += 'varying float v_clipDistance' + clipPlaneId + ';';
              vsClipPlaneInit += '  v_clipDistance' + clipPlaneId + ' = dot(ecPosition, u_clipPlaneEquation' + clipPlaneId + ');';
              fsClipPlaneDefs += 'varying float v_clipDistance' + clipPlaneId + ';';
              fsClipPlanePass += '  if (v_clipDistance' + clipPlaneId + ' < 0.0) discard;';
            }
          }

          var vsLightingDefs = '';
          var vsLightingPass = '';
          if (GLEmulation.lightingEnabled) {
            vsLightingDefs += 'attribute vec3 a_normal;';
            vsLightingDefs += 'uniform mat3 u_normalMatrix;';
            vsLightingDefs += 'uniform vec4 u_lightModelAmbient;';
            vsLightingDefs += 'uniform vec4 u_materialAmbient;';
            vsLightingDefs += 'uniform vec4 u_materialDiffuse;';
            vsLightingDefs += 'uniform vec4 u_materialSpecular;';
            vsLightingDefs += 'uniform float u_materialShininess;';
            vsLightingDefs += 'uniform vec4 u_materialEmission;';

            vsLightingPass += '  vec3 ecNormal = normalize(u_normalMatrix * a_normal);';
            vsLightingPass += '  v_color.w = u_materialDiffuse.w;';
            vsLightingPass += '  v_color.xyz = u_materialEmission.xyz;';
            vsLightingPass += '  v_color.xyz += u_lightModelAmbient.xyz * u_materialAmbient.xyz;';

            for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
              if (GLEmulation.lightEnabled[lightId]) {
                vsLightingDefs += 'uniform vec4 u_lightAmbient' + lightId + ';';
                vsLightingDefs += 'uniform vec4 u_lightDiffuse' + lightId + ';';
                vsLightingDefs += 'uniform vec4 u_lightSpecular' + lightId + ';';
                vsLightingDefs += 'uniform vec4 u_lightPosition' + lightId + ';';

                vsLightingPass += '  {';
                vsLightingPass += '    vec3 lightDirection = normalize(u_lightPosition' + lightId + ').xyz;';
                vsLightingPass += '    vec3 halfVector = normalize(lightDirection + vec3(0,0,1));';
                vsLightingPass += '    vec3 ambient = u_lightAmbient' + lightId + '.xyz * u_materialAmbient.xyz;';
                vsLightingPass += '    float diffuseI = max(dot(ecNormal, lightDirection), 0.0);';
                vsLightingPass += '    float specularI = max(dot(ecNormal, halfVector), 0.0);';
                vsLightingPass += '    vec3 diffuse = diffuseI * u_lightDiffuse' + lightId + '.xyz * u_materialDiffuse.xyz;';
                vsLightingPass += '    specularI = (diffuseI > 0.0 && specularI > 0.0) ? exp(u_materialShininess * log(specularI)) : 0.0;';
                vsLightingPass += '    vec3 specular = specularI * u_lightSpecular' + lightId + '.xyz * u_materialSpecular.xyz;';
                vsLightingPass += '    v_color.xyz += ambient + diffuse + specular;';
                vsLightingPass += '  }';
              }
            }
            vsLightingPass += '  v_color = clamp(v_color, 0.0, 1.0);';
          }

          var vsSource = [
            'attribute vec4 a_position;',
            'attribute vec4 a_color;',
            'varying vec4 v_color;',
            texUnitAttribList,
            texUnitVaryingList,
            (GLEmulation.fogEnabled ? 'varying float v_fogFragCoord;' : null),
            'uniform mat4 u_modelView;',
            'uniform mat4 u_projection;',
            vsPointSizeDefs,
            vsClipPlaneDefs,
            vsLightingDefs,
            'void main()',
            '{',
            '  vec4 ecPosition = u_modelView * a_position;', // eye-coordinate position
            '  gl_Position = u_projection * ecPosition;',
            '  v_color = a_color;',
            vsTexCoordInits,
            vsFogVaryingInit,
            vsPointSizeInit,
            vsClipPlaneInit,
            vsLightingPass,
            '}',
            ''
          ].join('\n').replace(/\n\n+/g, '\n');

          this.vertexShader = GLctx.createShader(GLctx.VERTEX_SHADER);
          GLctx.shaderSource(this.vertexShader, vsSource);
          GLctx.compileShader(this.vertexShader);

          var fogHeaderIfNeeded = null;
          if (GLEmulation.fogEnabled) {
            fogHeaderIfNeeded = [
              '',
              'varying float v_fogFragCoord; ',
              'uniform vec4 u_fogColor;      ',
              'uniform float u_fogEnd;       ',
              'uniform float u_fogScale;     ',
              'uniform float u_fogDensity;   ',
              'float ffog(in float ecDistance) { ',
              fogFormula,
              '  fog = clamp(fog, 0.0, 1.0); ',
              '  return fog;                 ',
              '}',
              '',
            ].join("\n");
          }

          var fogPass = null;
          if (GLEmulation.fogEnabled) {
            fogPass = 'gl_FragColor = vec4(mix(u_fogColor.rgb, gl_FragColor.rgb, ffog(v_fogFragCoord)), gl_FragColor.a);\n';
          }

          var fsAlphaTestDefs = '';
          var fsAlphaTestPass = '';
          if (GLEmulation.alphaTestEnabled) {
            fsAlphaTestDefs = 'uniform float u_alphaTestRef;';
            switch (GLEmulation.alphaTestFunc) {
              case 0x200: // GL_NEVER
                fsAlphaTestPass = 'discard;';
                break;
              case 0x201: // GL_LESS
                fsAlphaTestPass = 'if (!(gl_FragColor.a < u_alphaTestRef)) { discard; }';
                break;
              case 0x202: // GL_EQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a == u_alphaTestRef)) { discard; }';
                break;
              case 0x203: // GL_LEQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a <= u_alphaTestRef)) { discard; }';
                break;
              case 0x204: // GL_GREATER
                fsAlphaTestPass = 'if (!(gl_FragColor.a > u_alphaTestRef)) { discard; }';
                break;
              case 0x205: // GL_NOTEQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a != u_alphaTestRef)) { discard; }';
                break;
              case 0x206: // GL_GEQUAL
                fsAlphaTestPass = 'if (!(gl_FragColor.a >= u_alphaTestRef)) { discard; }';
                break;
              case 0x207: // GL_ALWAYS
                fsAlphaTestPass = '';
                break;
            }
          }

          var fsSource = [
            'precision mediump float;',
            texUnitVaryingList,
            texUnitUniformList,
            'varying vec4 v_color;',
            fogHeaderIfNeeded,
            fsClipPlaneDefs,
            fsAlphaTestDefs,
            'void main()',
            '{',
            fsClipPlanePass,
            fsTexEnvPass,
            fogPass,
            fsAlphaTestPass,
            '}',
            ''
          ].join("\n").replace(/\n\n+/g, '\n');

          this.fragmentShader = GLctx.createShader(GLctx.FRAGMENT_SHADER);
          GLctx.shaderSource(this.fragmentShader, fsSource);
          GLctx.compileShader(this.fragmentShader);

          this.program = GLctx.createProgram();
          GLctx.attachShader(this.program, this.vertexShader);
          GLctx.attachShader(this.program, this.fragmentShader);

          // As optimization, bind all attributes to prespecified locations, so that the FFP emulation
          // code can submit attributes to any generated FFP shader without having to examine each shader in turn.
          // These prespecified locations are only assumed if GL_FFP_ONLY is specified, since user could also create their
          // own shaders that didn't have attributes in the same locations.
          GLctx.bindAttribLocation(this.program, GLImmediate.VERTEX, 'a_position');
          GLctx.bindAttribLocation(this.program, GLImmediate.COLOR, 'a_color');
          GLctx.bindAttribLocation(this.program, GLImmediate.NORMAL, 'a_normal');
          var maxVertexAttribs = GLctx.getParameter(GLctx.MAX_VERTEX_ATTRIBS);
          for (var i = 0; i < GLImmediate.MAX_TEXTURES && GLImmediate.TEXTURE0 + i < maxVertexAttribs; i++) {
            GLctx.bindAttribLocation(this.program, GLImmediate.TEXTURE0 + i, 'a_texCoord'+i);
            GLctx.bindAttribLocation(this.program, GLImmediate.TEXTURE0 + i, aTexCoordPrefix+i);
          }
          GLctx.linkProgram(this.program);
        }

        // Stores an array that remembers which matrix uniforms are up-to-date in this FFP renderer, so they don't need to be resubmitted
        // each time we render with this program.
        this.textureMatrixVersion = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];

        this.positionLocation = GLctx.getAttribLocation(this.program, 'a_position');

        this.texCoordLocations = [];

        for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          if (!GLImmediate.enabledClientAttributes[GLImmediate.TEXTURE0 + i]) {
            this.texCoordLocations[i] = -1;
            continue;
          }

          if (useCurrProgram) {
            this.texCoordLocations[i] = GLctx.getAttribLocation(this.program, `a_texCoord${i}`);
          } else {
            this.texCoordLocations[i] = GLctx.getAttribLocation(this.program, aTexCoordPrefix + i);
          }
        }
        this.colorLocation = GLctx.getAttribLocation(this.program, 'a_color');
        if (!useCurrProgram) {
          // Temporarily switch to the program so we can set our sampler uniforms early.
          var prevBoundProg = GLctx.getParameter(GLctx.CURRENT_PROGRAM);
          GLctx.useProgram(this.program);
          {
            for (var i = 0; i < this.usedTexUnitList.length; i++) {
              var texUnitID = this.usedTexUnitList[i];
              var texSamplerLoc = GLctx.getUniformLocation(this.program, uTexUnitPrefix + texUnitID);
              GLctx.uniform1i(texSamplerLoc, texUnitID);
            }
          }
          // The default color attribute value is not the same as the default for all other attribute streams (0,0,0,1) but (1,1,1,1),
          // so explicitly set it right at start.
          GLctx.vertexAttrib4fv(this.colorLocation, [1,1,1,1]);
          GLctx.useProgram(prevBoundProg);
        }

        this.textureMatrixLocations = [];
        for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
          this.textureMatrixLocations[i] = GLctx.getUniformLocation(this.program, `u_textureMatrix${i}`);
        }
        this.normalLocation = GLctx.getAttribLocation(this.program, 'a_normal');

        this.modelViewLocation = GLctx.getUniformLocation(this.program, 'u_modelView');
        this.projectionLocation = GLctx.getUniformLocation(this.program, 'u_projection');
        this.normalMatrixLocation = GLctx.getUniformLocation(this.program, 'u_normalMatrix');

        this.hasTextures = hasTextures;
        this.hasNormal = GLImmediate.enabledClientAttributes[GLImmediate.NORMAL] &&
                         GLImmediate.clientAttributes[GLImmediate.NORMAL].size > 0 &&
                         this.normalLocation >= 0;
        this.hasColor = (this.colorLocation === 0) || this.colorLocation > 0;

        this.floatType = GLctx.FLOAT; // minor optimization

        this.fogColorLocation = GLctx.getUniformLocation(this.program, 'u_fogColor');
        this.fogEndLocation = GLctx.getUniformLocation(this.program, 'u_fogEnd');
        this.fogScaleLocation = GLctx.getUniformLocation(this.program, 'u_fogScale');
        this.fogDensityLocation = GLctx.getUniformLocation(this.program, 'u_fogDensity');
        this.hasFog = !!(this.fogColorLocation || this.fogEndLocation ||
                         this.fogScaleLocation || this.fogDensityLocation);

        this.pointSizeLocation = GLctx.getUniformLocation(this.program, 'u_pointSize');

        this.hasClipPlane = false;
        this.clipPlaneEquationLocation = [];
        for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
          this.clipPlaneEquationLocation[clipPlaneId] = GLctx.getUniformLocation(this.program, `u_clipPlaneEquation${clipPlaneId}`);
          this.hasClipPlane = (this.hasClipPlane || this.clipPlaneEquationLocation[clipPlaneId]);
        }

        this.hasLighting = GLEmulation.lightingEnabled;
        this.lightModelAmbientLocation = GLctx.getUniformLocation(this.program, 'u_lightModelAmbient');
        this.materialAmbientLocation = GLctx.getUniformLocation(this.program, 'u_materialAmbient');
        this.materialDiffuseLocation = GLctx.getUniformLocation(this.program, 'u_materialDiffuse');
        this.materialSpecularLocation = GLctx.getUniformLocation(this.program, 'u_materialSpecular');
        this.materialShininessLocation = GLctx.getUniformLocation(this.program, 'u_materialShininess');
        this.materialEmissionLocation = GLctx.getUniformLocation(this.program, 'u_materialEmission');
        this.lightAmbientLocation = []
        this.lightDiffuseLocation = []
        this.lightSpecularLocation = []
        this.lightPositionLocation = []
        for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
          this.lightAmbientLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightAmbient${lightId}`);
          this.lightDiffuseLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightDiffuse${lightId}`);
          this.lightSpecularLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightSpecular${lightId}`);
          this.lightPositionLocation[lightId] = GLctx.getUniformLocation(this.program, `u_lightPosition${lightId}`);
        }

        this.hasAlphaTest = GLEmulation.alphaTestEnabled;
        this.alphaTestRefLocation = GLctx.getUniformLocation(this.program, 'u_alphaTestRef');

      };

      this.prepare = function() {
        // Calculate the array buffer
        var arrayBuffer;
        if (!GLctx.currentArrayBufferBinding) {
          var start = GLImmediate.firstVertex*GLImmediate.stride;
          var end = GLImmediate.lastVertex*GLImmediate.stride;
          assert(end <= GL.MAX_TEMP_BUFFER_SIZE, 'too much vertex data');
          arrayBuffer = GL.getTempVertexBuffer(end);
          // TODO: consider using the last buffer we bound, if it was larger. downside is larger buffer, but we might avoid rebinding and preparing
        } else {
          arrayBuffer = GLctx.currentArrayBufferBinding;
        }

        // If the array buffer is unchanged and the renderer as well, then we can avoid all the work here
        // XXX We use some heuristics here, and this may not work in all cases. Try disabling GL_UNSAFE_OPTS if you
        // have odd glitches
        var lastRenderer = GLImmediate.lastRenderer;
        var canSkip = this == lastRenderer &&
                      arrayBuffer == GLImmediate.lastArrayBuffer &&
                      (GL.currProgram || this.program) == GLImmediate.lastProgram &&
                      GLImmediate.stride == GLImmediate.lastStride &&
                      !GLImmediate.matricesModified;
        if (!canSkip && lastRenderer) lastRenderer.cleanup();
        if (!GLctx.currentArrayBufferBinding) {
          // Bind the array buffer and upload data after cleaning up the previous renderer

          if (arrayBuffer != GLImmediate.lastArrayBuffer) {
            GLctx.bindBuffer(GLctx.ARRAY_BUFFER, arrayBuffer);
            GLImmediate.lastArrayBuffer = arrayBuffer;
          }

          GLctx.bufferSubData(GLctx.ARRAY_BUFFER, start, GLImmediate.vertexData.subarray(start >> 2, end >> 2));
        }
        if (canSkip) return;
        GLImmediate.lastRenderer = this;
        GLImmediate.lastProgram = GL.currProgram || this.program;
        GLImmediate.lastStride = GLImmediate.stride;
        GLImmediate.matricesModified = false;

        if (!GL.currProgram) {
          if (GLImmediate.fixedFunctionProgram != this.program) {
            GLctx.useProgram(this.program);
            GLImmediate.fixedFunctionProgram = this.program;
          }
        }

        if (this.modelViewLocation && this.modelViewMatrixVersion != GLImmediate.matrixVersion[0/*m*/]) {
          this.modelViewMatrixVersion = GLImmediate.matrixVersion[0/*m*/];
          GLctx.uniformMatrix4fv(this.modelViewLocation, false, GLImmediate.matrix[0/*m*/]);

          // set normal matrix to the upper 3x3 of the inverse transposed current modelview matrix
          if (GLEmulation.lightEnabled) {
            var tmpMVinv = GLImmediate.matrixLib.mat4.create(GLImmediate.matrix[0]);
            GLImmediate.matrixLib.mat4.inverse(tmpMVinv);
            GLImmediate.matrixLib.mat4.transpose(tmpMVinv);
            GLctx.uniformMatrix3fv(this.normalMatrixLocation, false, GLImmediate.matrixLib.mat4.toMat3(tmpMVinv));
          }
        }
        if (this.projectionLocation && this.projectionMatrixVersion != GLImmediate.matrixVersion[1/*p*/]) {
          this.projectionMatrixVersion = GLImmediate.matrixVersion[1/*p*/];
          GLctx.uniformMatrix4fv(this.projectionLocation, false, GLImmediate.matrix[1/*p*/]);
        }

        var clientAttributes = GLImmediate.clientAttributes;
        var posAttr = clientAttributes[GLImmediate.VERTEX];

        GLctx.vertexAttribPointer(this.positionLocation, posAttr.size, posAttr.type, false, GLImmediate.stride, posAttr.offset);
        GLctx.enableVertexAttribArray(this.positionLocation);
        if (this.hasNormal) {
          var normalAttr = clientAttributes[GLImmediate.NORMAL];
          GLctx.vertexAttribPointer(this.normalLocation, normalAttr.size, normalAttr.type, true, GLImmediate.stride, normalAttr.offset);
          GLctx.enableVertexAttribArray(this.normalLocation);
        }
        if (this.hasTextures) {
          for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
            var attribLoc = this.texCoordLocations[i];
            if (attribLoc === undefined || attribLoc < 0) continue;
            var texAttr = clientAttributes[GLImmediate.TEXTURE0+i];

            if (texAttr.size) {
              GLctx.vertexAttribPointer(attribLoc, texAttr.size, texAttr.type, false, GLImmediate.stride, texAttr.offset);
              GLctx.enableVertexAttribArray(attribLoc);
            } else {
              // These two might be dangerous, but let's try them.
              GLctx.vertexAttrib4f(attribLoc, 0, 0, 0, 1);
              GLctx.disableVertexAttribArray(attribLoc);
            }
            var t = 2/*t*/+i;
            if (this.textureMatrixLocations[i] && this.textureMatrixVersion[t] != GLImmediate.matrixVersion[t]) { // XXX might we need this even without the condition we are currently in?
              this.textureMatrixVersion[t] = GLImmediate.matrixVersion[t];
              GLctx.uniformMatrix4fv(this.textureMatrixLocations[i], false, GLImmediate.matrix[t]);
            }
          }
        }
        if (GLImmediate.enabledClientAttributes[GLImmediate.COLOR]) {
          var colorAttr = clientAttributes[GLImmediate.COLOR];
          GLctx.vertexAttribPointer(this.colorLocation, colorAttr.size, colorAttr.type, true, GLImmediate.stride, colorAttr.offset);
          GLctx.enableVertexAttribArray(this.colorLocation);
        }
        else if (this.hasColor) {
          GLctx.disableVertexAttribArray(this.colorLocation);
          GLctx.vertexAttrib4fv(this.colorLocation, GLImmediate.clientColor);
        }
        if (this.hasFog) {
          if (this.fogColorLocation) GLctx.uniform4fv(this.fogColorLocation, GLEmulation.fogColor);
          if (this.fogEndLocation) GLctx.uniform1f(this.fogEndLocation, GLEmulation.fogEnd);
          if (this.fogScaleLocation) GLctx.uniform1f(this.fogScaleLocation, 1/(GLEmulation.fogEnd - GLEmulation.fogStart));
          if (this.fogDensityLocation) GLctx.uniform1f(this.fogDensityLocation, GLEmulation.fogDensity);
        }

        if (this.hasClipPlane) {
          for (var clipPlaneId = 0; clipPlaneId < GLEmulation.MAX_CLIP_PLANES; clipPlaneId++) {
            if (this.clipPlaneEquationLocation[clipPlaneId]) GLctx.uniform4fv(this.clipPlaneEquationLocation[clipPlaneId], GLEmulation.clipPlaneEquation[clipPlaneId]);
          }
        }

        if (this.hasLighting) {
          if (this.lightModelAmbientLocation) GLctx.uniform4fv(this.lightModelAmbientLocation, GLEmulation.lightModelAmbient);
          if (this.materialAmbientLocation) GLctx.uniform4fv(this.materialAmbientLocation, GLEmulation.materialAmbient);
          if (this.materialDiffuseLocation) GLctx.uniform4fv(this.materialDiffuseLocation, GLEmulation.materialDiffuse);
          if (this.materialSpecularLocation) GLctx.uniform4fv(this.materialSpecularLocation, GLEmulation.materialSpecular);
          if (this.materialShininessLocation) GLctx.uniform1f(this.materialShininessLocation, GLEmulation.materialShininess[0]);
          if (this.materialEmissionLocation) GLctx.uniform4fv(this.materialEmissionLocation, GLEmulation.materialEmission);
          for (var lightId = 0; lightId < GLEmulation.MAX_LIGHTS; lightId++) {
            if (this.lightAmbientLocation[lightId]) GLctx.uniform4fv(this.lightAmbientLocation[lightId], GLEmulation.lightAmbient[lightId]);
            if (this.lightDiffuseLocation[lightId]) GLctx.uniform4fv(this.lightDiffuseLocation[lightId], GLEmulation.lightDiffuse[lightId]);
            if (this.lightSpecularLocation[lightId]) GLctx.uniform4fv(this.lightSpecularLocation[lightId], GLEmulation.lightSpecular[lightId]);
            if (this.lightPositionLocation[lightId]) GLctx.uniform4fv(this.lightPositionLocation[lightId], GLEmulation.lightPosition[lightId]);
          }
        }

        if (this.hasAlphaTest) {
          if (this.alphaTestRefLocation) GLctx.uniform1f(this.alphaTestRefLocation, GLEmulation.alphaTestRef);
        }

        if (GLImmediate.mode == GLctx.POINTS) {
          if (this.pointSizeLocation) {
            GLctx.uniform1f(this.pointSizeLocation, GLEmulation.pointSize);
          }
        }
      };

      this.cleanup = function() {
        GLctx.disableVertexAttribArray(this.positionLocation);
        if (this.hasTextures) {
          for (var i = 0; i < GLImmediate.MAX_TEXTURES; i++) {
            if (GLImmediate.enabledClientAttributes[GLImmediate.TEXTURE0+i] && this.texCoordLocations[i] >= 0) {
              GLctx.disableVertexAttribArray(this.texCoordLocations[i]);
            }
          }
        }
        if (this.hasColor) {
          GLctx.disableVertexAttribArray(this.colorLocation);
        }
        if (this.hasNormal) {
          GLctx.disableVertexAttribArray(this.normalLocation);
        }
        if (!GL.currProgram) {
          GLctx.useProgram(null);
          GLImmediate.fixedFunctionProgram = 0;
        }
        if (!GLctx.currentArrayBufferBinding) {
          GLctx.bindBuffer(GLctx.ARRAY_BUFFER, null);
          GLImmediate.lastArrayBuffer = null;
        }

        GLImmediate.lastRenderer = null;
        GLImmediate.lastProgram = null;
        GLImmediate.matricesModified = true;
      }

      this.init();
    }
    return new Renderer();
  },
setupFuncs() {
    // TexEnv stuff needs to be prepared early, so do it here.
    // init() is too late for -O2, since it freezes the GL functions
    // by that point.
    GLImmediate.MapTreeLib = GLImmediate.spawnMapTreeLib();
    GLImmediate.spawnMapTreeLib = null;

    GLImmediate.TexEnvJIT = GLImmediate.spawnTexEnvJIT();
    GLImmediate.spawnTexEnvJIT = null;

    GLImmediate.setupHooks();
  },
setupHooks() {
    if (!GLEmulation.hasRunInit) {
      GLEmulation.init();
    }

    var glActiveTexture = _glActiveTexture;
    _glActiveTexture = _emscripten_glActiveTexture = (texture) => {
      GLImmediate.TexEnvJIT.hook_activeTexture(texture);
      glActiveTexture(texture);
    };

    var glEnable = _glEnable;
    _glEnable = _emscripten_glEnable = (cap) => {
      GLImmediate.TexEnvJIT.hook_enable(cap);
      glEnable(cap);
    };

    var glDisable = _glDisable;
    _glDisable = _emscripten_glDisable = (cap) => {
      GLImmediate.TexEnvJIT.hook_disable(cap);
      glDisable(cap);
    };

    var glTexEnvf = (typeof _glTexEnvf != 'undefined') ? _glTexEnvf : () => {};
    /** @suppress {checkTypes} */
    _glTexEnvf = _emscripten_glTexEnvf = (target, pname, param) => {
      GLImmediate.TexEnvJIT.hook_texEnvf(target, pname, param);
      // Don't call old func, since we are the implementor.
      //glTexEnvf(target, pname, param);
    };

    var glTexEnvi = (typeof _glTexEnvi != 'undefined') ? _glTexEnvi : () => {};
    /** @suppress {checkTypes} */
    _glTexEnvi = _emscripten_glTexEnvi = (target, pname, param) => {
      
      GLImmediate.TexEnvJIT.hook_texEnvi(target, pname, param);
      // Don't call old func, since we are the implementor.
      //glTexEnvi(target, pname, param);
    };

    var glTexEnvfv = (typeof _glTexEnvfv != 'undefined') ? _glTexEnvfv : () => {};
    /** @suppress {checkTypes} */
    _glTexEnvfv = _emscripten_glTexEnvfv = (target, pname, param) => {
      
      GLImmediate.TexEnvJIT.hook_texEnvfv(target, pname, param);
      // Don't call old func, since we are the implementor.
      //glTexEnvfv(target, pname, param);
    };

    _glGetTexEnviv = (target, pname, param) => {
      
      GLImmediate.TexEnvJIT.hook_getTexEnviv(target, pname, param);
    };

    _glGetTexEnvfv = (target, pname, param) => {
      
      GLImmediate.TexEnvJIT.hook_getTexEnvfv(target, pname, param);
    };

    var glGetIntegerv = _glGetIntegerv;
    _glGetIntegerv = _emscripten_glGetIntegerv = (pname, params) => {
      switch (pname) {
        case 0x8B8D: { // GL_CURRENT_PROGRAM
          // Just query directly so we're working with WebGL objects.
          var cur = GLctx.getParameter(GLctx.CURRENT_PROGRAM);
          if (cur == GLImmediate.fixedFunctionProgram) {
            // Pretend we're not using a program.
            HEAP32[((params)>>2)] = 0;
            return;
          }
          break;
        }
      }
      glGetIntegerv(pname, params);
    };
  },
initted:false,
init() {
    err('WARNING: using emscripten GL immediate mode emulation. This is very limited in what it supports');
    GLImmediate.initted = true;

    //if (!Module.useWebGL) return; // a 2D canvas may be currently used TODO: make sure we are actually called in that case

    // User can override the maximum number of texture units that we emulate. Using fewer texture units increases runtime performance
    // slightly, so it is advantageous to choose as small value as needed.
    // Limit to a maximum of 28 to not overflow the state bits used for renderer caching (31 bits = 3 attributes + 28 texture units).
    GLImmediate.MAX_TEXTURES = Math.min(Module['GL_MAX_TEXTURE_IMAGE_UNITS'] || GLctx.getParameter(GLctx.MAX_TEXTURE_IMAGE_UNITS), 28);

    GLImmediate.TexEnvJIT.init(GLctx, GLImmediate.MAX_TEXTURES);

    GLImmediate.NUM_ATTRIBUTES = 3 /*pos+normal+color attributes*/ + GLImmediate.MAX_TEXTURES;
    GLImmediate.clientAttributes = [];
    GLEmulation.enabledClientAttribIndices = [];
    for (var i = 0; i < GLImmediate.NUM_ATTRIBUTES; i++) {
      GLImmediate.clientAttributes.push({});
      GLEmulation.enabledClientAttribIndices.push(false);
    }

    // Initialize matrix library
    // When user sets a matrix, increment a 'version number' on the new data, and when rendering, submit
    // the matrices to the shader program only if they have an old version of the data.
    GLImmediate.matrix = [];
    GLImmediate.matrixStack = [];
    GLImmediate.matrixVersion = [];
    for (var i = 0; i < 2 + GLImmediate.MAX_TEXTURES; i++) { // Modelview, Projection, plus one matrix for each texture coordinate.
      GLImmediate.matrixStack.push([]);
      GLImmediate.matrixVersion.push(0);
      GLImmediate.matrix.push(GLImmediate.matrixLib.mat4.create());
      GLImmediate.matrixLib.mat4.identity(GLImmediate.matrix[i]);
    }

    // Renderer cache
    GLImmediate.rendererCache = GLImmediate.MapTreeLib.create();

    // Buffers for data
    GLImmediate.tempData = new Float32Array(GL.MAX_TEMP_BUFFER_SIZE >> 2);
    GLImmediate.indexData = new Uint16Array(GL.MAX_TEMP_BUFFER_SIZE >> 1);

    GLImmediate.vertexDataU8 = new Uint8Array(GLImmediate.tempData.buffer);

    GL.generateTempBuffers(true, GL.currentContext);

    GLImmediate.clientColor = new Float32Array([1, 1, 1, 1]);
  },
prepareClientAttributes(count, beginEnd) {
    // If no client attributes were modified since we were last called, do
    // nothing. Note that this does not work for glBegin/End, where we
    // generate renderer components dynamically and then disable them
    // ourselves, but it does help with glDrawElements/Arrays.
    if (!GLImmediate.modifiedClientAttributes) {
      GLImmediate.vertexCounter = (GLImmediate.stride * count) / 4; // XXX assuming float
      return;
    }
    GLImmediate.modifiedClientAttributes = false;

    // The role of prepareClientAttributes is to examine the set of
    // client-side vertex attribute buffers that user code has submitted, and
    // to prepare them to be uploaded to a VBO in GPU memory (since WebGL does
    // not support client-side rendering, i.e. rendering from vertex data in
    // CPU memory). User can submit vertex data generally in three different
    // configurations:
    // 1. Fully planar: all attributes are in their own separate
    //                  tightly-packed arrays in CPU memory.
    // 2. Fully interleaved: all attributes share a single array where data is
    //                       interleaved something like (pos,uv,normal),
    //                       (pos,uv,normal), ...
    // 3. Complex hybrid: Multiple separate arrays that either are sparsely
    //                    strided, and/or partially interleaves vertex
    //                    attributes.

    // For simplicity, we support the case (2) as the fast case. For (1) and
    // (3), we do a memory copy of the vertex data here to prepare a
    // relayouted buffer that is of the structure in case (2). The reason
    // for this is that it allows the emulation code to get away with using
    // just one VBO buffer for rendering, and not have to maintain multiple
    // ones. Therefore cases (1) and (3) will be very slow, and case (2) is
    // fast.

    // Detect which case we are in by using a quick heuristic by examining the
    // strides of the buffers. If all the buffers have identical stride, we
    // assume we have case (2), otherwise we have something more complex.
    var clientStartPointer = 0xFFFFFFFF;
    var bytes = 0; // Total number of bytes taken up by a single vertex.
    var minStride = 0xFFFFFFFF;
    var maxStride = 0;
    var attributes = GLImmediate.liveClientAttributes;
    attributes.length = 0;
    for (var i = 0; i < 3+GLImmediate.MAX_TEXTURES; i++) {
      if (GLImmediate.enabledClientAttributes[i]) {
        var attr = GLImmediate.clientAttributes[i];
        attributes.push(attr);
        clientStartPointer = Math.min(clientStartPointer, attr.pointer);
        attr.sizeBytes = attr.size * GL.byteSizeByType[attr.type - GL.byteSizeByTypeRoot];
        bytes += attr.sizeBytes;
        minStride = Math.min(minStride, attr.stride);
        maxStride = Math.max(maxStride, attr.stride);
      }
    }

    if ((minStride != maxStride || maxStride < bytes) && !beginEnd) {
      // We are in cases (1) or (3): slow path, shuffle the data around into a
      // single interleaved vertex buffer.
      // The immediate-mode glBegin()/glEnd() vertex submission gets
      // automatically generated in appropriate layout, so never need to come
      // down this path if that was used.
      GLImmediate.restrideBuffer ||= _malloc(GL.MAX_TEMP_BUFFER_SIZE);
      var start = GLImmediate.restrideBuffer;
      bytes = 0;
      // calculate restrided offsets and total size
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var size = attr.sizeBytes;
        if (size % 4 != 0) size += 4 - (size % 4); // align everything
        attr.offset = bytes;
        bytes += size;
      }
      // copy out the data (we need to know the stride for that, and define attr.pointer)
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var srcStride = Math.max(attr.sizeBytes, attr.stride);
        if ((srcStride & 3) == 0 && (attr.sizeBytes & 3) == 0) {
          var size4 = attr.sizeBytes>>2;
          var srcStride4 = Math.max(attr.sizeBytes, attr.stride)>>2;
          for (var j = 0; j < count; j++) {
            for (var k = 0; k < size4; k++) { // copy in chunks of 4 bytes, our alignment makes this possible
              HEAP32[((start + attr.offset + bytes*j)>>2) + k] = HEAP32[(attr.pointer>>2) + j*srcStride4 + k];
            }
          }
        } else {
          for (var j = 0; j < count; j++) {
            for (var k = 0; k < attr.sizeBytes; k++) { // source data was not aligned to multiples of 4, must copy byte by byte.
              HEAP8[start + attr.offset + bytes*j + k] = HEAP8[attr.pointer + j*srcStride + k];
            }
          }
        }
        attr.pointer = start + attr.offset;
      }
      GLImmediate.stride = bytes;
      GLImmediate.vertexPointer = start;
    } else {
      // case (2): fast path, all data is interleaved to a single vertex array so we can get away with a single VBO upload.
      if (GLctx.currentArrayBufferBinding) {
        GLImmediate.vertexPointer = 0;
      } else {
        GLImmediate.vertexPointer = clientStartPointer;
      }
      for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        attr.offset = attr.pointer - GLImmediate.vertexPointer; // Compute what will be the offset of this attribute in the VBO after we upload.
      }
      GLImmediate.stride = Math.max(maxStride, bytes);
    }
    if (!beginEnd) {
      GLImmediate.vertexCounter = (GLImmediate.stride * count) / 4; // XXX assuming float
    }
  },
flush(numProvidedIndexes, startIndex = 0, ptr = 0) {
    assert(numProvidedIndexes >= 0 || !numProvidedIndexes);
    var renderer = GLImmediate.getRenderer();

    // Generate index data in a format suitable for GLES 2.0/WebGL
    var numVertices = 4 * GLImmediate.vertexCounter / GLImmediate.stride;
    if (!numVertices) return;
    assert(numVertices % 1 == 0, "`numVertices` must be an integer.");
    var emulatedElementArrayBuffer = false;
    var numIndexes = 0;
    if (numProvidedIndexes) {
      numIndexes = numProvidedIndexes;
      if (!GLctx.currentArrayBufferBinding && GLImmediate.firstVertex > GLImmediate.lastVertex) {
        // Figure out the first and last vertex from the index data
        // If we are going to upload array buffer data, we need to find which range to
        // upload based on the indices. If they are in a buffer on the GPU, that is very
        // inconvenient! So if you do not have an array buffer, you should also not have
        // an element array buffer. But best is to use both buffers!
        assert(!GLctx.currentElementArrayBufferBinding);
        for (var i = 0; i < numProvidedIndexes; i++) {
          var currIndex = HEAPU16[(((ptr)+(i*2))>>1)];
          GLImmediate.firstVertex = Math.min(GLImmediate.firstVertex, currIndex);
          GLImmediate.lastVertex = Math.max(GLImmediate.lastVertex, currIndex+1);
        }
      }
      if (!GLctx.currentElementArrayBufferBinding) {
        // If no element array buffer is bound, then indices is a literal pointer to clientside data
        assert(numProvidedIndexes << 1 <= GL.MAX_TEMP_BUFFER_SIZE, 'too many immediate mode indexes (a)');
        var indexBuffer = GL.getTempIndexBuffer(numProvidedIndexes << 1);
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, indexBuffer);
        GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, HEAPU16.subarray((((ptr)>>1)), ((ptr + (numProvidedIndexes << 1))>>1)));
        ptr = 0;
        emulatedElementArrayBuffer = true;
      }
    } else if (GLImmediate.mode > 6) { // above GL_TRIANGLE_FAN are the non-GL ES modes
      if (GLImmediate.mode != 7) throw 'unsupported immediate mode ' + GLImmediate.mode; // GL_QUADS
      // GLImmediate.firstVertex is the first vertex we want. Quad indexes are
      // in the pattern 0 1 2, 0 2 3, 4 5 6, 4 6 7, so we need to look at
      // index firstVertex * 1.5 to see it.  Then since indexes are 2 bytes
      // each, that means 3
      assert(GLImmediate.firstVertex % 4 == 0);
      ptr = GLImmediate.firstVertex * 3;
      var numQuads = numVertices / 4;
      numIndexes = numQuads * 6; // 0 1 2, 0 2 3 pattern
      assert(ptr + (numIndexes << 1) <= GL.MAX_TEMP_BUFFER_SIZE, 'too many immediate mode indexes (b)');
      GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, GL.currentContext.tempQuadIndexBuffer);
      emulatedElementArrayBuffer = true;
      GLImmediate.mode = GLctx.TRIANGLES;
    }

    renderer.prepare();

    if (numIndexes) {
      GLctx.drawElements(GLImmediate.mode, numIndexes, GLctx.UNSIGNED_SHORT, ptr);
    } else {
      GLctx.drawArrays(GLImmediate.mode, startIndex, numVertices);
    }

    if (emulatedElementArrayBuffer) {
      GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, GL.buffers[GLctx.currentElementArrayBufferBinding] || null);
    }

  },
};
GLImmediate.matrixLib = (function() {

/**
* @fileoverview gl-matrix - High performance matrix and vector operations for WebGL
* @author Brandon Jones
* @version 1.2.4
*/

// Modified for emscripten:
// - Global scoping etc.
// - Disabled some non-closure-compatible javadoc comments.

/*
* Copyright (c) 2011 Brandon Jones
*
* This software is provided 'as-is', without any express or implied
* warranty. In no event will the authors be held liable for any damages
* arising from the use of this software.
*
* Permission is granted to anyone to use this software for any purpose,
* including commercial applications, and to alter it and redistribute it
* freely, subject to the following restrictions:
*
*    1. The origin of this software must not be misrepresented; you must not
*    claim that you wrote the original software. If you use this software
*    in a product, an acknowledgment in the product documentation would be
*    appreciated but is not required.
*
*    2. Altered source versions must be plainly marked as such, and must not
*    be misrepresented as being the original software.
*
*    3. This notice may not be removed or altered from any source
*    distribution.
*/


/**
* @class 3 Dimensional Vector
* @name vec3
*/
var vec3 = {};

/**
* @class 3x3 Matrix
* @name mat3
*/
var mat3 = {};

/**
* @class 4x4 Matrix
* @name mat4
*/
var mat4 = {};

/**
* @class Quaternion
* @name quat4
*/
var quat4 = {};

var MatrixArray = Float32Array;

/*
* vec3
*/

/**
* Creates a new instance of a vec3 using the default array type
* Any javascript array-like objects containing at least 3 numeric elements can serve as a vec3
*
* _param {vec3} [vec] vec3 containing values to initialize with
*
* _returns {vec3} New vec3
*/
vec3.create = function (vec) {
  var dest = new MatrixArray(3);

  if (vec) {
      dest[0] = vec[0];
      dest[1] = vec[1];
      dest[2] = vec[2];
  } else {
      dest[0] = dest[1] = dest[2] = 0;
  }

  return dest;
};

/**
* Copies the values of one vec3 to another
*
* _param {vec3} vec vec3 containing values to copy
* _param {vec3} dest vec3 receiving copied values
*
* _returns {vec3} dest
*/
vec3.set = function (vec, dest) {
  dest[0] = vec[0];
  dest[1] = vec[1];
  dest[2] = vec[2];

  return dest;
};

/**
* Performs a vector addition
*
* _param {vec3} vec First operand
* _param {vec3} vec2 Second operand
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.add = function (vec, vec2, dest) {
  if (!dest || vec === dest) {
      vec[0] += vec2[0];
      vec[1] += vec2[1];
      vec[2] += vec2[2];
      return vec;
  }

  dest[0] = vec[0] + vec2[0];
  dest[1] = vec[1] + vec2[1];
  dest[2] = vec[2] + vec2[2];
  return dest;
};

/**
* Performs a vector subtraction
*
* _param {vec3} vec First operand
* _param {vec3} vec2 Second operand
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.subtract = function (vec, vec2, dest) {
  if (!dest || vec === dest) {
      vec[0] -= vec2[0];
      vec[1] -= vec2[1];
      vec[2] -= vec2[2];
      return vec;
  }

  dest[0] = vec[0] - vec2[0];
  dest[1] = vec[1] - vec2[1];
  dest[2] = vec[2] - vec2[2];
  return dest;
};

/**
* Performs a vector multiplication
*
* _param {vec3} vec First operand
* _param {vec3} vec2 Second operand
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.multiply = function (vec, vec2, dest) {
  if (!dest || vec === dest) {
      vec[0] *= vec2[0];
      vec[1] *= vec2[1];
      vec[2] *= vec2[2];
      return vec;
  }

  dest[0] = vec[0] * vec2[0];
  dest[1] = vec[1] * vec2[1];
  dest[2] = vec[2] * vec2[2];
  return dest;
};

/**
* Negates the components of a vec3
*
* _param {vec3} vec vec3 to negate
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.negate = function (vec, dest) {
  if (!dest) { dest = vec; }

  dest[0] = -vec[0];
  dest[1] = -vec[1];
  dest[2] = -vec[2];
  return dest;
};

/**
* Multiplies the components of a vec3 by a scalar value
*
* _param {vec3} vec vec3 to scale
* _param {number} val Value to scale by
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.scale = function (vec, val, dest) {
  if (!dest || vec === dest) {
      vec[0] *= val;
      vec[1] *= val;
      vec[2] *= val;
      return vec;
  }

  dest[0] = vec[0] * val;
  dest[1] = vec[1] * val;
  dest[2] = vec[2] * val;
  return dest;
};

/**
* Generates a unit vector of the same direction as the provided vec3
* If vector length is 0, returns [0, 0, 0]
*
* _param {vec3} vec vec3 to normalize
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.normalize = function (vec, dest) {
  if (!dest) { dest = vec; }

  var x = vec[0], y = vec[1], z = vec[2],
      len = Math.sqrt(x * x + y * y + z * z);

  if (!len) {
      dest[0] = 0;
      dest[1] = 0;
      dest[2] = 0;
      return dest;
  } else if (len === 1) {
      dest[0] = x;
      dest[1] = y;
      dest[2] = z;
      return dest;
  }

  len = 1 / len;
  dest[0] = x * len;
  dest[1] = y * len;
  dest[2] = z * len;
  return dest;
};

/**
* Generates the cross product of two vec3s
*
* _param {vec3} vec First operand
* _param {vec3} vec2 Second operand
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.cross = function (vec, vec2, dest) {
  if (!dest) { dest = vec; }

  var x = vec[0], y = vec[1], z = vec[2],
      x2 = vec2[0], y2 = vec2[1], z2 = vec2[2];

  dest[0] = y * z2 - z * y2;
  dest[1] = z * x2 - x * z2;
  dest[2] = x * y2 - y * x2;
  return dest;
};

/**
* Calculates the length of a vec3
*
* _param {vec3} vec vec3 to calculate length of
*
* _returns {number} Length of vec
*/
vec3.length = function (vec) {
  var x = vec[0], y = vec[1], z = vec[2];
  return Math.sqrt(x * x + y * y + z * z);
};

/**
* Calculates the dot product of two vec3s
*
* _param {vec3} vec First operand
* _param {vec3} vec2 Second operand
*
* _returns {number} Dot product of vec and vec2
*/
vec3.dot = function (vec, vec2) {
  return vec[0] * vec2[0] + vec[1] * vec2[1] + vec[2] * vec2[2];
};

/**
* Generates a unit vector pointing from one vector to another
*
* _param {vec3} vec Origin vec3
* _param {vec3} vec2 vec3 to point to
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.direction = function (vec, vec2, dest) {
  if (!dest) { dest = vec; }

  var x = vec[0] - vec2[0],
      y = vec[1] - vec2[1],
      z = vec[2] - vec2[2],
      len = Math.sqrt(x * x + y * y + z * z);

  if (!len) {
      dest[0] = 0;
      dest[1] = 0;
      dest[2] = 0;
      return dest;
  }

  len = 1 / len;
  dest[0] = x * len;
  dest[1] = y * len;
  dest[2] = z * len;
  return dest;
};

/**
* Performs a linear interpolation between two vec3
*
* _param {vec3} vec First vector
* _param {vec3} vec2 Second vector
* _param {number} lerp Interpolation amount between the two inputs
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.lerp = function (vec, vec2, lerp, dest) {
  if (!dest) { dest = vec; }

  dest[0] = vec[0] + lerp * (vec2[0] - vec[0]);
  dest[1] = vec[1] + lerp * (vec2[1] - vec[1]);
  dest[2] = vec[2] + lerp * (vec2[2] - vec[2]);

  return dest;
};

/**
* Calculates the euclidean distance between two vec3
*
* Params:
* _param {vec3} vec First vector
* _param {vec3} vec2 Second vector
*
* _returns {number} Distance between vec and vec2
*/
vec3.dist = function (vec, vec2) {
  var x = vec2[0] - vec[0],
      y = vec2[1] - vec[1],
      z = vec2[2] - vec[2];

  return Math.sqrt(x*x + y*y + z*z);
};

/**
* Projects the specified vec3 from screen space into object space
* Based on the <a href="http://webcvs.freedesktop.org/mesa/Mesa/src/glu/mesa/project.c?revision=1.4&view=markup">Mesa gluUnProject implementation</a>
*
* _param {vec3} vec Screen-space vector to project
* _param {mat4} view View matrix
* _param {mat4} proj Projection matrix
* _param {vec4} viewport Viewport as given to gl.viewport [x, y, width, height]
* _param {vec3} [dest] vec3 receiving unprojected result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
vec3.unproject = function (vec, view, proj, viewport, dest) {
  if (!dest) { dest = vec; }

  var m = mat4.create();
  var v = new MatrixArray(4);

  v[0] = (vec[0] - viewport[0]) * 2.0 / viewport[2] - 1.0;
  v[1] = (vec[1] - viewport[1]) * 2.0 / viewport[3] - 1.0;
  v[2] = 2.0 * vec[2] - 1.0;
  v[3] = 1.0;

  mat4.multiply(proj, view, m);
  if(!mat4.inverse(m)) { return null; }

  mat4.multiplyVec4(m, v);
  if(v[3] === 0.0) { return null; }

  dest[0] = v[0] / v[3];
  dest[1] = v[1] / v[3];
  dest[2] = v[2] / v[3];

  return dest;
};

/**
* Returns a string representation of a vector
*
* _param {vec3} vec Vector to represent as a string
*
* _returns {string} String representation of vec
*/
vec3.str = function (vec) {
  return '[' + vec[0] + ', ' + vec[1] + ', ' + vec[2] + ']';
};

/*
* mat3
*/

/**
* Creates a new instance of a mat3 using the default array type
* Any javascript array-like object containing at least 9 numeric elements can serve as a mat3
*
* _param {mat3} [mat] mat3 containing values to initialize with
*
* _returns {mat3} New mat3
*
* @param {Object=} mat
*/
mat3.create = function (mat) {
  var dest = new MatrixArray(9);

  if (mat) {
      dest[0] = mat[0];
      dest[1] = mat[1];
      dest[2] = mat[2];
      dest[3] = mat[3];
      dest[4] = mat[4];
      dest[5] = mat[5];
      dest[6] = mat[6];
      dest[7] = mat[7];
      dest[8] = mat[8];
  }

  return dest;
};

/**
* Copies the values of one mat3 to another
*
* _param {mat3} mat mat3 containing values to copy
* _param {mat3} dest mat3 receiving copied values
*
* _returns {mat3} dest
*/
mat3.set = function (mat, dest) {
  dest[0] = mat[0];
  dest[1] = mat[1];
  dest[2] = mat[2];
  dest[3] = mat[3];
  dest[4] = mat[4];
  dest[5] = mat[5];
  dest[6] = mat[6];
  dest[7] = mat[7];
  dest[8] = mat[8];
  return dest;
};

/**
* Sets a mat3 to an identity matrix
*
* _param {mat3} dest mat3 to set
*
* _returns dest if specified, otherwise a new mat3
*/
mat3.identity = function (dest) {
  if (!dest) { dest = mat3.create(); }
  dest[0] = 1;
  dest[1] = 0;
  dest[2] = 0;
  dest[3] = 0;
  dest[4] = 1;
  dest[5] = 0;
  dest[6] = 0;
  dest[7] = 0;
  dest[8] = 1;
  return dest;
};

/**
* Transposes a mat3 (flips the values over the diagonal)
*
* Params:
* _param {mat3} mat mat3 to transpose
* _param {mat3} [dest] mat3 receiving transposed values. If not specified result is written to mat
*/
mat3.transpose = function (mat, dest) {
  // If we are transposing ourselves we can skip a few steps but have to cache some values
  if (!dest || mat === dest) {
      var a01 = mat[1], a02 = mat[2],
          a12 = mat[5];

      mat[1] = mat[3];
      mat[2] = mat[6];
      mat[3] = a01;
      mat[5] = mat[7];
      mat[6] = a02;
      mat[7] = a12;
      return mat;
  }

  dest[0] = mat[0];
  dest[1] = mat[3];
  dest[2] = mat[6];
  dest[3] = mat[1];
  dest[4] = mat[4];
  dest[5] = mat[7];
  dest[6] = mat[2];
  dest[7] = mat[5];
  dest[8] = mat[8];
  return dest;
};

/**
* Copies the elements of a mat3 into the upper 3x3 elements of a mat4
*
* _param {mat3} mat mat3 containing values to copy
* _param {mat4} [dest] mat4 receiving copied values
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
mat3.toMat4 = function (mat, dest) {
  if (!dest) { dest = mat4.create(); }

  dest[15] = 1;
  dest[14] = 0;
  dest[13] = 0;
  dest[12] = 0;

  dest[11] = 0;
  dest[10] = mat[8];
  dest[9] = mat[7];
  dest[8] = mat[6];

  dest[7] = 0;
  dest[6] = mat[5];
  dest[5] = mat[4];
  dest[4] = mat[3];

  dest[3] = 0;
  dest[2] = mat[2];
  dest[1] = mat[1];
  dest[0] = mat[0];

  return dest;
};

/**
* Returns a string representation of a mat3
*
* _param {mat3} mat mat3 to represent as a string
*
* _param {string} String representation of mat
*/
mat3.str = function (mat) {
  return '[' + mat[0] + ', ' + mat[1] + ', ' + mat[2] +
      ', ' + mat[3] + ', ' + mat[4] + ', ' + mat[5] +
      ', ' + mat[6] + ', ' + mat[7] + ', ' + mat[8] + ']';
};

/*
* mat4
*/

/**
* Creates a new instance of a mat4 using the default array type
* Any javascript array-like object containing at least 16 numeric elements can serve as a mat4
*
* _param {mat4} [mat] mat4 containing values to initialize with
*
* _returns {mat4} New mat4
*
* @param {Object=} mat
*/
mat4.create = function (mat) {
  var dest = new MatrixArray(16);

  if (mat) {
      dest[0] = mat[0];
      dest[1] = mat[1];
      dest[2] = mat[2];
      dest[3] = mat[3];
      dest[4] = mat[4];
      dest[5] = mat[5];
      dest[6] = mat[6];
      dest[7] = mat[7];
      dest[8] = mat[8];
      dest[9] = mat[9];
      dest[10] = mat[10];
      dest[11] = mat[11];
      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
  }

  return dest;
};

/**
* Copies the values of one mat4 to another
*
* _param {mat4} mat mat4 containing values to copy
* _param {mat4} dest mat4 receiving copied values
*
* _returns {mat4} dest
*/
mat4.set = function (mat, dest) {
  dest[0] = mat[0];
  dest[1] = mat[1];
  dest[2] = mat[2];
  dest[3] = mat[3];
  dest[4] = mat[4];
  dest[5] = mat[5];
  dest[6] = mat[6];
  dest[7] = mat[7];
  dest[8] = mat[8];
  dest[9] = mat[9];
  dest[10] = mat[10];
  dest[11] = mat[11];
  dest[12] = mat[12];
  dest[13] = mat[13];
  dest[14] = mat[14];
  dest[15] = mat[15];
  return dest;
};

/**
* Sets a mat4 to an identity matrix
*
* _param {mat4} dest mat4 to set
*
* _returns {mat4} dest
*/
mat4.identity = function (dest) {
  if (!dest) { dest = mat4.create(); }
  dest[0] = 1;
  dest[1] = 0;
  dest[2] = 0;
  dest[3] = 0;
  dest[4] = 0;
  dest[5] = 1;
  dest[6] = 0;
  dest[7] = 0;
  dest[8] = 0;
  dest[9] = 0;
  dest[10] = 1;
  dest[11] = 0;
  dest[12] = 0;
  dest[13] = 0;
  dest[14] = 0;
  dest[15] = 1;
  return dest;
};

/**
* Transposes a mat4 (flips the values over the diagonal)
*
* _param {mat4} mat mat4 to transpose
* _param {mat4} [dest] mat4 receiving transposed values. If not specified result is written to mat
*/
mat4.transpose = function (mat, dest) {
  // If we are transposing ourselves we can skip a few steps but have to cache some values
  if (!dest || mat === dest) {
      var a01 = mat[1], a02 = mat[2], a03 = mat[3],
          a12 = mat[6], a13 = mat[7],
          a23 = mat[11];

      mat[1] = mat[4];
      mat[2] = mat[8];
      mat[3] = mat[12];
      mat[4] = a01;
      mat[6] = mat[9];
      mat[7] = mat[13];
      mat[8] = a02;
      mat[9] = a12;
      mat[11] = mat[14];
      mat[12] = a03;
      mat[13] = a13;
      mat[14] = a23;
      return mat;
  }

  dest[0] = mat[0];
  dest[1] = mat[4];
  dest[2] = mat[8];
  dest[3] = mat[12];
  dest[4] = mat[1];
  dest[5] = mat[5];
  dest[6] = mat[9];
  dest[7] = mat[13];
  dest[8] = mat[2];
  dest[9] = mat[6];
  dest[10] = mat[10];
  dest[11] = mat[14];
  dest[12] = mat[3];
  dest[13] = mat[7];
  dest[14] = mat[11];
  dest[15] = mat[15];
  return dest;
};

/**
* Calculates the determinant of a mat4
*
* _param {mat4} mat mat4 to calculate determinant of
*
* _returns {number} determinant of mat
*/
mat4.determinant = function (mat) {
  // Cache the matrix values (makes for huge speed increases!)
  var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3],
      a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7],
      a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11],
      a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15];

  return (a30 * a21 * a12 * a03 - a20 * a31 * a12 * a03 - a30 * a11 * a22 * a03 + a10 * a31 * a22 * a03 +
          a20 * a11 * a32 * a03 - a10 * a21 * a32 * a03 - a30 * a21 * a02 * a13 + a20 * a31 * a02 * a13 +
          a30 * a01 * a22 * a13 - a00 * a31 * a22 * a13 - a20 * a01 * a32 * a13 + a00 * a21 * a32 * a13 +
          a30 * a11 * a02 * a23 - a10 * a31 * a02 * a23 - a30 * a01 * a12 * a23 + a00 * a31 * a12 * a23 +
          a10 * a01 * a32 * a23 - a00 * a11 * a32 * a23 - a20 * a11 * a02 * a33 + a10 * a21 * a02 * a33 +
          a20 * a01 * a12 * a33 - a00 * a21 * a12 * a33 - a10 * a01 * a22 * a33 + a00 * a11 * a22 * a33);
};

/**
* Calculates the inverse matrix of a mat4
*
* _param {mat4} mat mat4 to calculate inverse of
* _param {mat4} [dest] mat4 receiving inverse matrix. If not specified result is written to mat, null if matrix cannot be inverted
*
* @param {Object=} dest
*/
mat4.inverse = function (mat, dest) {
  if (!dest) { dest = mat; }

  // Cache the matrix values (makes for huge speed increases!)
  var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3],
      a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7],
      a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11],
      a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15],

      b00 = a00 * a11 - a01 * a10,
      b01 = a00 * a12 - a02 * a10,
      b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11,
      b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30,
      b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31,
      b10 = a21 * a33 - a23 * a31,
      b11 = a22 * a33 - a23 * a32,

      d = (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06),
      invDet;

      // Calculate the determinant
      if (!d) { return null; }
      invDet = 1 / d;

  dest[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
  dest[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet;
  dest[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
  dest[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet;
  dest[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet;
  dest[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
  dest[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet;
  dest[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
  dest[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
  dest[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet;
  dest[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
  dest[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet;
  dest[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet;
  dest[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
  dest[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet;
  dest[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

  return dest;
};

/**
* Copies the upper 3x3 elements of a mat4 into another mat4
*
* _param {mat4} mat mat4 containing values to copy
* _param {mat4} [dest] mat4 receiving copied values
*
* _returns {mat4} dest is specified, a new mat4 otherwise
*/
mat4.toRotationMat = function (mat, dest) {
  if (!dest) { dest = mat4.create(); }

  dest[0] = mat[0];
  dest[1] = mat[1];
  dest[2] = mat[2];
  dest[3] = mat[3];
  dest[4] = mat[4];
  dest[5] = mat[5];
  dest[6] = mat[6];
  dest[7] = mat[7];
  dest[8] = mat[8];
  dest[9] = mat[9];
  dest[10] = mat[10];
  dest[11] = mat[11];
  dest[12] = 0;
  dest[13] = 0;
  dest[14] = 0;
  dest[15] = 1;

  return dest;
};

/**
* Copies the upper 3x3 elements of a mat4 into a mat3
*
* _param {mat4} mat mat4 containing values to copy
* _param {mat3} [dest] mat3 receiving copied values
*
* _returns {mat3} dest is specified, a new mat3 otherwise
*/
mat4.toMat3 = function (mat, dest) {
  if (!dest) { dest = mat3.create(); }

  dest[0] = mat[0];
  dest[1] = mat[1];
  dest[2] = mat[2];
  dest[3] = mat[4];
  dest[4] = mat[5];
  dest[5] = mat[6];
  dest[6] = mat[8];
  dest[7] = mat[9];
  dest[8] = mat[10];

  return dest;
};

/**
* Calculates the inverse of the upper 3x3 elements of a mat4 and copies the result into a mat3
* The resulting matrix is useful for calculating transformed normals
*
* Params:
* _param {mat4} mat mat4 containing values to invert and copy
* _param {mat3} [dest] mat3 receiving values
*
* _returns {mat3} dest is specified, a new mat3 otherwise, null if the matrix cannot be inverted
*/
mat4.toInverseMat3 = function (mat, dest) {
  // Cache the matrix values (makes for huge speed increases!)
  var a00 = mat[0], a01 = mat[1], a02 = mat[2],
      a10 = mat[4], a11 = mat[5], a12 = mat[6],
      a20 = mat[8], a21 = mat[9], a22 = mat[10],

      b01 = a22 * a11 - a12 * a21,
      b11 = -a22 * a10 + a12 * a20,
      b21 = a21 * a10 - a11 * a20,

      d = a00 * b01 + a01 * b11 + a02 * b21,
      id;

  if (!d) { return null; }
  id = 1 / d;

  if (!dest) { dest = mat3.create(); }

  dest[0] = b01 * id;
  dest[1] = (-a22 * a01 + a02 * a21) * id;
  dest[2] = (a12 * a01 - a02 * a11) * id;
  dest[3] = b11 * id;
  dest[4] = (a22 * a00 - a02 * a20) * id;
  dest[5] = (-a12 * a00 + a02 * a10) * id;
  dest[6] = b21 * id;
  dest[7] = (-a21 * a00 + a01 * a20) * id;
  dest[8] = (a11 * a00 - a01 * a10) * id;

  return dest;
};

/**
* Performs a matrix multiplication
*
* _param {mat4} mat First operand
* _param {mat4} mat2 Second operand
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.multiply = function (mat, mat2, dest) {
  if (!dest) { dest = mat; }

  // Cache the matrix values (makes for huge speed increases!)
  var a00 = mat[0], a01 = mat[1], a02 = mat[2], a03 = mat[3],
      a10 = mat[4], a11 = mat[5], a12 = mat[6], a13 = mat[7],
      a20 = mat[8], a21 = mat[9], a22 = mat[10], a23 = mat[11],
      a30 = mat[12], a31 = mat[13], a32 = mat[14], a33 = mat[15],

      b00 = mat2[0], b01 = mat2[1], b02 = mat2[2], b03 = mat2[3],
      b10 = mat2[4], b11 = mat2[5], b12 = mat2[6], b13 = mat2[7],
      b20 = mat2[8], b21 = mat2[9], b22 = mat2[10], b23 = mat2[11],
      b30 = mat2[12], b31 = mat2[13], b32 = mat2[14], b33 = mat2[15];

  dest[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
  dest[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
  dest[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
  dest[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
  dest[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
  dest[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
  dest[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
  dest[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
  dest[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
  dest[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
  dest[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
  dest[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
  dest[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
  dest[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
  dest[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
  dest[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;

  return dest;
};

/**
* Transforms a vec3 with the given matrix
* 4th vector component is implicitly '1'
*
* _param {mat4} mat mat4 to transform the vector with
* _param {vec3} vec vec3 to transform
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns {vec3} dest if specified, vec otherwise
*/
mat4.multiplyVec3 = function (mat, vec, dest) {
  if (!dest) { dest = vec; }

  var x = vec[0], y = vec[1], z = vec[2];

  dest[0] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
  dest[1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
  dest[2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];

  return dest;
};

/**
* Transforms a vec4 with the given matrix
*
* _param {mat4} mat mat4 to transform the vector with
* _param {vec4} vec vec4 to transform
* _param {vec4} [dest] vec4 receiving operation result. If not specified result is written to vec
*
* _returns {vec4} dest if specified, vec otherwise
*
* @param {Object=} dest
*/
mat4.multiplyVec4 = function (mat, vec, dest) {
  if (!dest) { dest = vec; }

  var x = vec[0], y = vec[1], z = vec[2], w = vec[3];

  dest[0] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12] * w;
  dest[1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13] * w;
  dest[2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14] * w;
  dest[3] = mat[3] * x + mat[7] * y + mat[11] * z + mat[15] * w;

  return dest;
};

/**
* Translates a matrix by the given vector
*
* _param {mat4} mat mat4 to translate
* _param {vec3} vec vec3 specifying the translation
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.translate = function (mat, vec, dest) {
  var x = vec[0], y = vec[1], z = vec[2],
      a00, a01, a02, a03,
      a10, a11, a12, a13,
      a20, a21, a22, a23;

  if (!dest || mat === dest) {
      mat[12] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
      mat[13] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
      mat[14] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
      mat[15] = mat[3] * x + mat[7] * y + mat[11] * z + mat[15];
      return mat;
  }

  a00 = mat[0]; a01 = mat[1]; a02 = mat[2]; a03 = mat[3];
  a10 = mat[4]; a11 = mat[5]; a12 = mat[6]; a13 = mat[7];
  a20 = mat[8]; a21 = mat[9]; a22 = mat[10]; a23 = mat[11];

  dest[0] = a00; dest[1] = a01; dest[2] = a02; dest[3] = a03;
  dest[4] = a10; dest[5] = a11; dest[6] = a12; dest[7] = a13;
  dest[8] = a20; dest[9] = a21; dest[10] = a22; dest[11] = a23;

  dest[12] = a00 * x + a10 * y + a20 * z + mat[12];
  dest[13] = a01 * x + a11 * y + a21 * z + mat[13];
  dest[14] = a02 * x + a12 * y + a22 * z + mat[14];
  dest[15] = a03 * x + a13 * y + a23 * z + mat[15];
  return dest;
};

/**
* Scales a matrix by the given vector
*
* _param {mat4} mat mat4 to scale
* _param {vec3} vec vec3 specifying the scale for each axis
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.scale = function (mat, vec, dest) {
  var x = vec[0], y = vec[1], z = vec[2];

  if (!dest || mat === dest) {
      mat[0] *= x;
      mat[1] *= x;
      mat[2] *= x;
      mat[3] *= x;
      mat[4] *= y;
      mat[5] *= y;
      mat[6] *= y;
      mat[7] *= y;
      mat[8] *= z;
      mat[9] *= z;
      mat[10] *= z;
      mat[11] *= z;
      return mat;
  }

  dest[0] = mat[0] * x;
  dest[1] = mat[1] * x;
  dest[2] = mat[2] * x;
  dest[3] = mat[3] * x;
  dest[4] = mat[4] * y;
  dest[5] = mat[5] * y;
  dest[6] = mat[6] * y;
  dest[7] = mat[7] * y;
  dest[8] = mat[8] * z;
  dest[9] = mat[9] * z;
  dest[10] = mat[10] * z;
  dest[11] = mat[11] * z;
  dest[12] = mat[12];
  dest[13] = mat[13];
  dest[14] = mat[14];
  dest[15] = mat[15];
  return dest;
};

/**
* Rotates a matrix by the given angle around the specified axis
* If rotating around a primary axis (X,Y,Z) one of the specialized rotation functions should be used instead for performance
*
* _param {mat4} mat mat4 to rotate
* _param {number} angle Angle (in radians) to rotate
* _param {vec3} axis vec3 representing the axis to rotate around
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.rotate = function (mat, angle, axis, dest) {
  var x = axis[0], y = axis[1], z = axis[2],
      len = Math.sqrt(x * x + y * y + z * z),
      s, c, t,
      a00, a01, a02, a03,
      a10, a11, a12, a13,
      a20, a21, a22, a23,
      b00, b01, b02,
      b10, b11, b12,
      b20, b21, b22;

  if (!len) { return null; }
  if (len !== 1) {
      len = 1 / len;
      x *= len;
      y *= len;
      z *= len;
  }

  s = Math.sin(angle);
  c = Math.cos(angle);
  t = 1 - c;

  a00 = mat[0]; a01 = mat[1]; a02 = mat[2]; a03 = mat[3];
  a10 = mat[4]; a11 = mat[5]; a12 = mat[6]; a13 = mat[7];
  a20 = mat[8]; a21 = mat[9]; a22 = mat[10]; a23 = mat[11];

  // Construct the elements of the rotation matrix
  b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
  b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
  b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

  if (!dest) {
      dest = mat;
  } else if (mat !== dest) { // If the source and destination differ, copy the unchanged last row
      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
  }

  // Perform rotation-specific matrix multiplication
  dest[0] = a00 * b00 + a10 * b01 + a20 * b02;
  dest[1] = a01 * b00 + a11 * b01 + a21 * b02;
  dest[2] = a02 * b00 + a12 * b01 + a22 * b02;
  dest[3] = a03 * b00 + a13 * b01 + a23 * b02;

  dest[4] = a00 * b10 + a10 * b11 + a20 * b12;
  dest[5] = a01 * b10 + a11 * b11 + a21 * b12;
  dest[6] = a02 * b10 + a12 * b11 + a22 * b12;
  dest[7] = a03 * b10 + a13 * b11 + a23 * b12;

  dest[8] = a00 * b20 + a10 * b21 + a20 * b22;
  dest[9] = a01 * b20 + a11 * b21 + a21 * b22;
  dest[10] = a02 * b20 + a12 * b21 + a22 * b22;
  dest[11] = a03 * b20 + a13 * b21 + a23 * b22;
  return dest;
};

/**
* Rotates a matrix by the given angle around the X axis
*
* _param {mat4} mat mat4 to rotate
* _param {number} angle Angle (in radians) to rotate
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.rotateX = function (mat, angle, dest) {
  var s = Math.sin(angle),
      c = Math.cos(angle),
      a10 = mat[4],
      a11 = mat[5],
      a12 = mat[6],
      a13 = mat[7],
      a20 = mat[8],
      a21 = mat[9],
      a22 = mat[10],
      a23 = mat[11];

  if (!dest) {
      dest = mat;
  } else if (mat !== dest) { // If the source and destination differ, copy the unchanged rows
      dest[0] = mat[0];
      dest[1] = mat[1];
      dest[2] = mat[2];
      dest[3] = mat[3];

      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
  }

  // Perform axis-specific matrix multiplication
  dest[4] = a10 * c + a20 * s;
  dest[5] = a11 * c + a21 * s;
  dest[6] = a12 * c + a22 * s;
  dest[7] = a13 * c + a23 * s;

  dest[8] = a10 * -s + a20 * c;
  dest[9] = a11 * -s + a21 * c;
  dest[10] = a12 * -s + a22 * c;
  dest[11] = a13 * -s + a23 * c;
  return dest;
};

/**
* Rotates a matrix by the given angle around the Y axis
*
* _param {mat4} mat mat4 to rotate
* _param {number} angle Angle (in radians) to rotate
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.rotateY = function (mat, angle, dest) {
  var s = Math.sin(angle),
      c = Math.cos(angle),
      a00 = mat[0],
      a01 = mat[1],
      a02 = mat[2],
      a03 = mat[3],
      a20 = mat[8],
      a21 = mat[9],
      a22 = mat[10],
      a23 = mat[11];

  if (!dest) {
      dest = mat;
  } else if (mat !== dest) { // If the source and destination differ, copy the unchanged rows
      dest[4] = mat[4];
      dest[5] = mat[5];
      dest[6] = mat[6];
      dest[7] = mat[7];

      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
  }

  // Perform axis-specific matrix multiplication
  dest[0] = a00 * c + a20 * -s;
  dest[1] = a01 * c + a21 * -s;
  dest[2] = a02 * c + a22 * -s;
  dest[3] = a03 * c + a23 * -s;

  dest[8] = a00 * s + a20 * c;
  dest[9] = a01 * s + a21 * c;
  dest[10] = a02 * s + a22 * c;
  dest[11] = a03 * s + a23 * c;
  return dest;
};

/**
* Rotates a matrix by the given angle around the Z axis
*
* _param {mat4} mat mat4 to rotate
* _param {number} angle Angle (in radians) to rotate
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to mat
*/
mat4.rotateZ = function (mat, angle, dest) {
  var s = Math.sin(angle),
      c = Math.cos(angle),
      a00 = mat[0],
      a01 = mat[1],
      a02 = mat[2],
      a03 = mat[3],
      a10 = mat[4],
      a11 = mat[5],
      a12 = mat[6],
      a13 = mat[7];

  if (!dest) {
      dest = mat;
  } else if (mat !== dest) { // If the source and destination differ, copy the unchanged last row
      dest[8] = mat[8];
      dest[9] = mat[9];
      dest[10] = mat[10];
      dest[11] = mat[11];

      dest[12] = mat[12];
      dest[13] = mat[13];
      dest[14] = mat[14];
      dest[15] = mat[15];
  }

  // Perform axis-specific matrix multiplication
  dest[0] = a00 * c + a10 * s;
  dest[1] = a01 * c + a11 * s;
  dest[2] = a02 * c + a12 * s;
  dest[3] = a03 * c + a13 * s;

  dest[4] = a00 * -s + a10 * c;
  dest[5] = a01 * -s + a11 * c;
  dest[6] = a02 * -s + a12 * c;
  dest[7] = a03 * -s + a13 * c;

  return dest;
};

/**
* Generates a frustum matrix with the given bounds
*
* _param {number} left Left bound of the frustum
* _param {number} right Right bound of the frustum
* _param {number} bottom Bottom bound of the frustum
* _param {number} top Top bound of the frustum
* _param {number} near Near bound of the frustum
* _param {number} far Far bound of the frustum
* _param {mat4} [dest] mat4 frustum matrix will be written into
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
mat4.frustum = function (left, right, bottom, top, near, far, dest) {
  if (!dest) { dest = mat4.create(); }
  var rl = (right - left),
      tb = (top - bottom),
      fn = (far - near);
  dest[0] = (near * 2) / rl;
  dest[1] = 0;
  dest[2] = 0;
  dest[3] = 0;
  dest[4] = 0;
  dest[5] = (near * 2) / tb;
  dest[6] = 0;
  dest[7] = 0;
  dest[8] = (right + left) / rl;
  dest[9] = (top + bottom) / tb;
  dest[10] = -(far + near) / fn;
  dest[11] = -1;
  dest[12] = 0;
  dest[13] = 0;
  dest[14] = -(far * near * 2) / fn;
  dest[15] = 0;
  return dest;
};

/**
* Generates a perspective projection matrix with the given bounds
*
* _param {number} fovy Vertical field of view
* _param {number} aspect Aspect ratio. typically viewport width/height
* _param {number} near Near bound of the frustum
* _param {number} far Far bound of the frustum
* _param {mat4} [dest] mat4 frustum matrix will be written into
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
mat4.perspective = function (fovy, aspect, near, far, dest) {
  var top = near * Math.tan(fovy * Math.PI / 360.0),
      right = top * aspect;
  return mat4.frustum(-right, right, -top, top, near, far, dest);
};

/**
* Generates a orthogonal projection matrix with the given bounds
*
* _param {number} left Left bound of the frustum
* _param {number} right Right bound of the frustum
* _param {number} bottom Bottom bound of the frustum
* _param {number} top Top bound of the frustum
* _param {number} near Near bound of the frustum
* _param {number} far Far bound of the frustum
* _param {mat4} [dest] mat4 frustum matrix will be written into
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
mat4.ortho = function (left, right, bottom, top, near, far, dest) {
  if (!dest) { dest = mat4.create(); }
  var rl = (right - left),
      tb = (top - bottom),
      fn = (far - near);
  dest[0] = 2 / rl;
  dest[1] = 0;
  dest[2] = 0;
  dest[3] = 0;
  dest[4] = 0;
  dest[5] = 2 / tb;
  dest[6] = 0;
  dest[7] = 0;
  dest[8] = 0;
  dest[9] = 0;
  dest[10] = -2 / fn;
  dest[11] = 0;
  dest[12] = -(left + right) / rl;
  dest[13] = -(top + bottom) / tb;
  dest[14] = -(far + near) / fn;
  dest[15] = 1;
  return dest;
};

/**
* Generates a look-at matrix with the given eye position, focal point, and up axis
*
* _param {vec3} eye Position of the viewer
* _param {vec3} center Point the viewer is looking at
* _param {vec3} up vec3 pointing "up"
* _param {mat4} [dest] mat4 frustum matrix will be written into
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
mat4.lookAt = function (eye, center, up, dest) {
  if (!dest) { dest = mat4.create(); }

  var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
      eyex = eye[0],
      eyey = eye[1],
      eyez = eye[2],
      upx = up[0],
      upy = up[1],
      upz = up[2],
      centerx = center[0],
      centery = center[1],
      centerz = center[2];

  if (eyex === centerx && eyey === centery && eyez === centerz) {
      return mat4.identity(dest);
  }

  //vec3.direction(eye, center, z);
  z0 = eyex - centerx;
  z1 = eyey - centery;
  z2 = eyez - centerz;

  // normalize (no check needed for 0 because of early return)
  len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
  z0 *= len;
  z1 *= len;
  z2 *= len;

  //vec3.normalize(vec3.cross(up, z, x));
  x0 = upy * z2 - upz * z1;
  x1 = upz * z0 - upx * z2;
  x2 = upx * z1 - upy * z0;
  len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
  if (!len) {
      x0 = 0;
      x1 = 0;
      x2 = 0;
  } else {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
  }

  //vec3.normalize(vec3.cross(z, x, y));
  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;

  len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
  if (!len) {
      y0 = 0;
      y1 = 0;
      y2 = 0;
  } else {
      len = 1 / len;
      y0 *= len;
      y1 *= len;
      y2 *= len;
  }

  dest[0] = x0;
  dest[1] = y0;
  dest[2] = z0;
  dest[3] = 0;
  dest[4] = x1;
  dest[5] = y1;
  dest[6] = z1;
  dest[7] = 0;
  dest[8] = x2;
  dest[9] = y2;
  dest[10] = z2;
  dest[11] = 0;
  dest[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  dest[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  dest[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  dest[15] = 1;

  return dest;
};

/**
* Creates a matrix from a quaternion rotation and vector translation
* This is equivalent to (but much faster than):
*
*     mat4.identity(dest);
*     mat4.translate(dest, vec);
*     var quatMat = mat4.create();
*     quat4.toMat4(quat, quatMat);
*     mat4.multiply(dest, quatMat);
*
* _param {quat4} quat Rotation quaternion
* _param {vec3} vec Translation vector
* _param {mat4} [dest] mat4 receiving operation result. If not specified result is written to a new mat4
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
mat4.fromRotationTranslation = function (quat, vec, dest) {
  if (!dest) { dest = mat4.create(); }

  // Quaternion math
  var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      x2 = x + x,
      y2 = y + y,
      z2 = z + z,

      xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;

  dest[0] = 1 - (yy + zz);
  dest[1] = xy + wz;
  dest[2] = xz - wy;
  dest[3] = 0;
  dest[4] = xy - wz;
  dest[5] = 1 - (xx + zz);
  dest[6] = yz + wx;
  dest[7] = 0;
  dest[8] = xz + wy;
  dest[9] = yz - wx;
  dest[10] = 1 - (xx + yy);
  dest[11] = 0;
  dest[12] = vec[0];
  dest[13] = vec[1];
  dest[14] = vec[2];
  dest[15] = 1;

  return dest;
};

/**
* Returns a string representation of a mat4
*
* _param {mat4} mat mat4 to represent as a string
*
* _returns {string} String representation of mat
*/
mat4.str = function (mat) {
  return '[' + mat[0] + ', ' + mat[1] + ', ' + mat[2] + ', ' + mat[3] +
      ', ' + mat[4] + ', ' + mat[5] + ', ' + mat[6] + ', ' + mat[7] +
      ', ' + mat[8] + ', ' + mat[9] + ', ' + mat[10] + ', ' + mat[11] +
      ', ' + mat[12] + ', ' + mat[13] + ', ' + mat[14] + ', ' + mat[15] + ']';
};

/*
* quat4
*/

/**
* Creates a new instance of a quat4 using the default array type
* Any javascript array containing at least 4 numeric elements can serve as a quat4
*
* _param {quat4} [quat] quat4 containing values to initialize with
*
* _returns {quat4} New quat4
*/
quat4.create = function (quat) {
  var dest = new MatrixArray(4);

  if (quat) {
      dest[0] = quat[0];
      dest[1] = quat[1];
      dest[2] = quat[2];
      dest[3] = quat[3];
  }

  return dest;
};

/**
* Copies the values of one quat4 to another
*
* _param {quat4} quat quat4 containing values to copy
* _param {quat4} dest quat4 receiving copied values
*
* _returns {quat4} dest
*/
quat4.set = function (quat, dest) {
  dest[0] = quat[0];
  dest[1] = quat[1];
  dest[2] = quat[2];
  dest[3] = quat[3];

  return dest;
};

/**
* Calculates the W component of a quat4 from the X, Y, and Z components.
* Assumes that quaternion is 1 unit in length.
* Any existing W component will be ignored.
*
* _param {quat4} quat quat4 to calculate W component of
* _param {quat4} [dest] quat4 receiving calculated values. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.calculateW = function (quat, dest) {
  var x = quat[0], y = quat[1], z = quat[2];

  if (!dest || quat === dest) {
      quat[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
      return quat;
  }
  dest[0] = x;
  dest[1] = y;
  dest[2] = z;
  dest[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
  return dest;
};

/**
* Calculates the dot product of two quaternions
*
* _param {quat4} quat First operand
* _param {quat4} quat2 Second operand
*
* @return {number} Dot product of quat and quat2
*/
quat4.dot = function(quat, quat2){
  return quat[0]*quat2[0] + quat[1]*quat2[1] + quat[2]*quat2[2] + quat[3]*quat2[3];
};

/**
* Calculates the inverse of a quat4
*
* _param {quat4} quat quat4 to calculate inverse of
* _param {quat4} [dest] quat4 receiving inverse values. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.inverse = function(quat, dest) {
  var q0 = quat[0], q1 = quat[1], q2 = quat[2], q3 = quat[3],
      dot = q0*q0 + q1*q1 + q2*q2 + q3*q3,
      invDot = dot ? 1.0/dot : 0;

  // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

  if(!dest || quat === dest) {
      quat[0] *= -invDot;
      quat[1] *= -invDot;
      quat[2] *= -invDot;
      quat[3] *= invDot;
      return quat;
  }
  dest[0] = -quat[0]*invDot;
  dest[1] = -quat[1]*invDot;
  dest[2] = -quat[2]*invDot;
  dest[3] = quat[3]*invDot;
  return dest;
};


/**
* Calculates the conjugate of a quat4
* If the quaternion is normalized, this function is faster than quat4.inverse and produces the same result.
*
* _param {quat4} quat quat4 to calculate conjugate of
* _param {quat4} [dest] quat4 receiving conjugate values. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.conjugate = function (quat, dest) {
  if (!dest || quat === dest) {
      quat[0] *= -1;
      quat[1] *= -1;
      quat[2] *= -1;
      return quat;
  }
  dest[0] = -quat[0];
  dest[1] = -quat[1];
  dest[2] = -quat[2];
  dest[3] = quat[3];
  return dest;
};

/**
* Calculates the length of a quat4
*
* Params:
* _param {quat4} quat quat4 to calculate length of
*
* _returns Length of quat
*/
quat4.length = function (quat) {
  var x = quat[0], y = quat[1], z = quat[2], w = quat[3];
  return Math.sqrt(x * x + y * y + z * z + w * w);
};

/**
* Generates a unit quaternion of the same direction as the provided quat4
* If quaternion length is 0, returns [0, 0, 0, 0]
*
* _param {quat4} quat quat4 to normalize
* _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.normalize = function (quat, dest) {
  if (!dest) { dest = quat; }

  var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (len === 0) {
      dest[0] = 0;
      dest[1] = 0;
      dest[2] = 0;
      dest[3] = 0;
      return dest;
  }
  len = 1 / len;
  dest[0] = x * len;
  dest[1] = y * len;
  dest[2] = z * len;
  dest[3] = w * len;

  return dest;
};

/**
* Performs quaternion addition
*
* _param {quat4} quat First operand
* _param {quat4} quat2 Second operand
* _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.add = function (quat, quat2, dest) {
  if(!dest || quat === dest) {
      quat[0] += quat2[0];
      quat[1] += quat2[1];
      quat[2] += quat2[2];
      quat[3] += quat2[3];
      return quat;
  }
  dest[0] = quat[0]+quat2[0];
  dest[1] = quat[1]+quat2[1];
  dest[2] = quat[2]+quat2[2];
  dest[3] = quat[3]+quat2[3];
  return dest;
};

/**
* Performs a quaternion multiplication
*
* _param {quat4} quat First operand
* _param {quat4} quat2 Second operand
* _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.multiply = function (quat, quat2, dest) {
  if (!dest) { dest = quat; }

  var qax = quat[0], qay = quat[1], qaz = quat[2], qaw = quat[3],
      qbx = quat2[0], qby = quat2[1], qbz = quat2[2], qbw = quat2[3];

  dest[0] = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
  dest[1] = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
  dest[2] = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
  dest[3] = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;

  return dest;
};

/**
* Transforms a vec3 with the given quaternion
*
* _param {quat4} quat quat4 to transform the vector with
* _param {vec3} vec vec3 to transform
* _param {vec3} [dest] vec3 receiving operation result. If not specified result is written to vec
*
* _returns dest if specified, vec otherwise
*/
quat4.multiplyVec3 = function (quat, vec, dest) {
  if (!dest) { dest = vec; }

  var x = vec[0], y = vec[1], z = vec[2],
      qx = quat[0], qy = quat[1], qz = quat[2], qw = quat[3],

      // calculate quat * vec
      ix = qw * x + qy * z - qz * y,
      iy = qw * y + qz * x - qx * z,
      iz = qw * z + qx * y - qy * x,
      iw = -qx * x - qy * y - qz * z;

  // calculate result * inverse quat
  dest[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  dest[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  dest[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  return dest;
};

/**
* Multiplies the components of a quaternion by a scalar value
*
* _param {quat4} quat to scale
* _param {number} val Value to scale by
* _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.scale = function (quat, val, dest) {
  if(!dest || quat === dest) {
      quat[0] *= val;
      quat[1] *= val;
      quat[2] *= val;
      quat[3] *= val;
      return quat;
  }
  dest[0] = quat[0]*val;
  dest[1] = quat[1]*val;
  dest[2] = quat[2]*val;
  dest[3] = quat[3]*val;
  return dest;
};

/**
* Calculates a 3x3 matrix from the given quat4
*
* _param {quat4} quat quat4 to create matrix from
* _param {mat3} [dest] mat3 receiving operation result
*
* _returns {mat3} dest if specified, a new mat3 otherwise
*/
quat4.toMat3 = function (quat, dest) {
  if (!dest) { dest = mat3.create(); }

  var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      x2 = x + x,
      y2 = y + y,
      z2 = z + z,

      xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;

  dest[0] = 1 - (yy + zz);
  dest[1] = xy + wz;
  dest[2] = xz - wy;

  dest[3] = xy - wz;
  dest[4] = 1 - (xx + zz);
  dest[5] = yz + wx;

  dest[6] = xz + wy;
  dest[7] = yz - wx;
  dest[8] = 1 - (xx + yy);

  return dest;
};

/**
* Calculates a 4x4 matrix from the given quat4
*
* _param {quat4} quat quat4 to create matrix from
* _param {mat4} [dest] mat4 receiving operation result
*
* _returns {mat4} dest if specified, a new mat4 otherwise
*/
quat4.toMat4 = function (quat, dest) {
  if (!dest) { dest = mat4.create(); }

  var x = quat[0], y = quat[1], z = quat[2], w = quat[3],
      x2 = x + x,
      y2 = y + y,
      z2 = z + z,

      xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;

  dest[0] = 1 - (yy + zz);
  dest[1] = xy + wz;
  dest[2] = xz - wy;
  dest[3] = 0;

  dest[4] = xy - wz;
  dest[5] = 1 - (xx + zz);
  dest[6] = yz + wx;
  dest[7] = 0;

  dest[8] = xz + wy;
  dest[9] = yz - wx;
  dest[10] = 1 - (xx + yy);
  dest[11] = 0;

  dest[12] = 0;
  dest[13] = 0;
  dest[14] = 0;
  dest[15] = 1;

  return dest;
};

/**
* Performs a spherical linear interpolation between two quat4
*
* _param {quat4} quat First quaternion
* _param {quat4} quat2 Second quaternion
* _param {number} slerp Interpolation amount between the two inputs
* _param {quat4} [dest] quat4 receiving operation result. If not specified result is written to quat
*
* _returns {quat4} dest if specified, quat otherwise
*/
quat4.slerp = function (quat, quat2, slerp, dest) {
  if (!dest) { dest = quat; }

  var cosHalfTheta = quat[0] * quat2[0] + quat[1] * quat2[1] + quat[2] * quat2[2] + quat[3] * quat2[3],
      halfTheta,
      sinHalfTheta,
      ratioA,
      ratioB;

  if (Math.abs(cosHalfTheta) >= 1.0) {
      if (dest !== quat) {
          dest[0] = quat[0];
          dest[1] = quat[1];
          dest[2] = quat[2];
          dest[3] = quat[3];
      }
      return dest;
  }

  halfTheta = Math.acos(cosHalfTheta);
  sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

  if (Math.abs(sinHalfTheta) < 0.001) {
      dest[0] = (quat[0] * 0.5 + quat2[0] * 0.5);
      dest[1] = (quat[1] * 0.5 + quat2[1] * 0.5);
      dest[2] = (quat[2] * 0.5 + quat2[2] * 0.5);
      dest[3] = (quat[3] * 0.5 + quat2[3] * 0.5);
      return dest;
  }

  ratioA = Math.sin((1 - slerp) * halfTheta) / sinHalfTheta;
  ratioB = Math.sin(slerp * halfTheta) / sinHalfTheta;

  dest[0] = (quat[0] * ratioA + quat2[0] * ratioB);
  dest[1] = (quat[1] * ratioA + quat2[1] * ratioB);
  dest[2] = (quat[2] * ratioA + quat2[2] * ratioB);
  dest[3] = (quat[3] * ratioA + quat2[3] * ratioB);

  return dest;
};

/**
* Returns a string representation of a quaternion
*
* _param {quat4} quat quat4 to represent as a string
*
* _returns {string} String representation of quat
*/
quat4.str = function (quat) {
  return '[' + quat[0] + ', ' + quat[1] + ', ' + quat[2] + ', ' + quat[3] + ']';
};


return {
vec3: vec3,
mat3: mat3,
mat4: mat4,
quat4: quat4
};

})();

;

var GLImmediateSetup = {
};
var _glLoadIdentity = () => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1)|0;
  GLImmediate.matrixLib.mat4.identity(GLImmediate.matrix[GLImmediate.currentMatrix]);
};

var _glLoadMatrixf = (matrix) => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1)|0;
  GLImmediate.matrixLib.mat4.set(HEAPF32.subarray((((matrix)>>2)), ((matrix+64)>>2)), GLImmediate.matrix[GLImmediate.currentMatrix]);
};



var _glMatrixMode = (mode) => {
  if (mode == 0x1700 /* GL_MODELVIEW */) {
    GLImmediate.currentMatrix = 0/*m*/;
  } else if (mode == 0x1701 /* GL_PROJECTION */) {
    GLImmediate.currentMatrix = 1/*p*/;
  } else if (mode == 0x1702) { // GL_TEXTURE
    GLImmediate.useTextureMatrix = true;
    GLImmediate.currentMatrix = 2/*t*/ + GLImmediate.TexEnvJIT.getActiveTexture();
  } else {
    throw `Wrong mode ${mode} passed to glMatrixMode`;
  }
};

var _glNormalPointer = (type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.NORMAL, 3, type, stride, pointer);
};

var _glPolygonMode = () => {};

var _glPolygonOffset = (x0, x1) => GLctx.polygonOffset(x0, x1);

var _glPopMatrix = () => {
  if (GLImmediate.matrixStack[GLImmediate.currentMatrix].length == 0) {
    GL.recordError(0x504/*GL_STACK_UNDERFLOW*/);
    return;
  }
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1)|0;
  GLImmediate.matrix[GLImmediate.currentMatrix] = GLImmediate.matrixStack[GLImmediate.currentMatrix].pop();
};

var _glPushMatrix = () => {
  GLImmediate.matricesModified = true;
  GLImmediate.matrixVersion[GLImmediate.currentMatrix] = (GLImmediate.matrixVersion[GLImmediate.currentMatrix] + 1)|0;
  GLImmediate.matrixStack[GLImmediate.currentMatrix].push(
      Array.prototype.slice.call(GLImmediate.matrix[GLImmediate.currentMatrix]));
};

var computeUnpackAlignedImageSize = (width, height, sizePerPixel) => {
  function roundedToNextMultipleOf(x, y) {
    return (x + y - 1) & -y;
  }
  var plainRowSize = (GL.unpackRowLength || width) * sizePerPixel;
  var alignedRowSize = roundedToNextMultipleOf(plainRowSize, GL.unpackAlignment);
  return height * alignedRowSize;
};

var colorChannelsInGlTextureFormat = (format) => {
  // Micro-optimizations for size: map format to size by subtracting smallest
  // enum value (0x1902) from all values first.  Also omit the most common
  // size value (1) from the list, which is assumed by formats not on the
  // list.
  var colorChannels = {
    // 0x1902 /* GL_DEPTH_COMPONENT */ - 0x1902: 1,
    // 0x1906 /* GL_ALPHA */ - 0x1902: 1,
    5: 3,
    6: 4,
    // 0x1909 /* GL_LUMINANCE */ - 0x1902: 1,
    8: 2,
    29502: 3,
    29504: 4,
  };
  return colorChannels[format - 0x1902]||1;
};

var heapObjectForWebGLType = (type) => {
  // Micro-optimization for size: Subtract lowest GL enum number (0x1400/* GL_BYTE */) from type to compare
  // smaller values for the heap, for shorter generated code size.
  // Also the type HEAPU16 is not tested for explicitly, but any unrecognized type will return out HEAPU16.
  // (since most types are HEAPU16)
  type -= 0x1400;

  if (type == 1) return HEAPU8;

  if (type == 4) return HEAP32;

  if (type == 6) return HEAPF32;

  if (type == 5
    || type == 28922
    )
    return HEAPU32;

  return HEAPU16;
};

var toTypedArrayIndex = (pointer, heap) =>
  pointer >>> (31 - Math.clz32(heap.BYTES_PER_ELEMENT));

var emscriptenWebGLGetTexPixelData = (type, format, width, height, pixels, internalFormat) => {
  var heap = heapObjectForWebGLType(type);
  var sizePerPixel = colorChannelsInGlTextureFormat(format) * heap.BYTES_PER_ELEMENT;
  var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel);
  return heap.subarray(toTypedArrayIndex(pixels, heap), toTypedArrayIndex(pixels + bytes, heap));
};

var _glReadPixels = (x, y, width, height, format, type, pixels) => {
  var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
  if (!pixelData) {
    GL.recordError(0x500/*GL_INVALID_ENUM*/);
    return;
  }
  GLctx.readPixels(x, y, width, height, format, type, pixelData);
};

var _glRenderbufferStorage = (x0, x1, x2, x3) => GLctx.renderbufferStorage(x0, x1, x2, x3);

function _glRenderbufferStorageMultisample() { }

var _glScissor = (x0, x1, x2, x3) => GLctx.scissor(x0, x1, x2, x3);

var _glShadeModel = () => warnOnce('TODO: glShadeModel');

var _glStencilFunc = (x0, x1, x2) => GLctx.stencilFunc(x0, x1, x2);

var _glStencilOp = (x0, x1, x2) => GLctx.stencilOp(x0, x1, x2);

var _glTexCoordPointer = (size, type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.TEXTURE0 + GLImmediate.clientActiveTexture, size, type, stride, pointer);
};

var _glTexEnvi = (target, pname, params) => warnOnce('glTexEnvi: TODO');


var _glTexImage2D = (target, level, internalFormat, width, height, border, format, type, pixels) => {
  var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null;
  GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData);
};

var _glTexParameteri = (x0, x1, x2) => GLctx.texParameteri(x0, x1, x2);


var _glTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, type, pixels) => {
  var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0) : null;
  GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
};

var _glVertexPointer = (size, type, stride, pointer) => {
  GLImmediate.setClientAttribute(GLImmediate.VERTEX, size, type, stride, pointer);
};

var _glViewport = (x0, x1, x2, x3) => GLctx.viewport(x0, x1, x2, x3);




let EMGL = window.EMGL = {
  glAlphaFunc: _glAlphaFunc,
  /** @export */
  glBindBufferARB: _glBindBufferARB,
  /** @export */
  glBindFramebuffer: _glBindFramebuffer,
  /** @export */
  glBindRenderbuffer: _glBindRenderbuffer,
  /** @export */
  glBindTexture: _glBindTexture,
  /** @export */
  glBlendFunc: _glBlendFunc,
  /** @export */
  glBlitFramebuffer: _glBlitFramebuffer,
  /** @export */
  glBufferDataARB: _glBufferDataARB,
  /** @export */
  glCheckFramebufferStatus: _glCheckFramebufferStatus,
  /** @export */
  glClear: _glClear,
  /** @export */
  glClearColor: _glClearColor,
  /** @export */
  glClearDepth: _glClearDepth,
  /** @export */
  glColor4f: _glColor4f,
  /** @export */
  glColorMask: _glColorMask,
  /** @export */
  glColorPointer: _glColorPointer,
  /** @export */
  glCullFace: _glCullFace,
  /** @export */
  glDeleteBuffersARB: _glDeleteBuffersARB,
  /** @export */
  glDeleteFramebuffers: _glDeleteFramebuffers,
  /** @export */
  glDeleteRenderbuffers: _glDeleteRenderbuffers,
  /** @export */
  glDeleteTextures: _glDeleteTextures,
  /** @export */
  glDepthFunc: _glDepthFunc,
  /** @export */
  glDepthMask: _glDepthMask,
  /** @export */
  glDepthRange: _glDepthRange,
  /** @export */
  glDisable: _glDisable,
  /** @export */
  glDisableClientState: _glDisableClientState,
  /** @export */
  glDrawArrays: _glDrawArrays,
  /** @export */
  glDrawBuffer: function _glDrawBuffer(buf) {
    GLctx["drawBuffers"]([buf]);
  },
  /** @export */
  glDrawElements: _glDrawElements,
  /** @export */
  glEnable: _glEnable,
  /** @export */
  glEnableClientState: _glEnableClientState,
  /** @export */
  glFinish: _glFinish,
  /** @export */
  glFramebufferRenderbuffer: _glFramebufferRenderbuffer,
  /** @export */
  glFramebufferTexture2D: _glFramebufferTexture2D,
  /** @export */
  glGenBuffersARB: _glGenBuffersARB,
  /** @export */
  glGenFramebuffers: _glGenFramebuffers,
  /** @export */
  glGenRenderbuffers: _glGenRenderbuffers,
  /** @export */
  glGenTextures: _glGenTextures,
  /** @export */
  glGetBooleanv: _glGetBooleanv,
  /** @export */
  glGetError: _glGetError,
  /** @export */
  glGetFramebufferAttachmentParameteriv: _glGetFramebufferAttachmentParameteriv,
  /** @export */
  glGetIntegerv: _glGetIntegerv,
  /** @export */
  glGetInternalformativ: _glGetInternalformativ,
  /** @export */
  glGetRenderbufferParameteriv: _glGetRenderbufferParameteriv,
  /** @export */
  glGetString: _glGetString,
  /** @export */
  glIsFramebuffer: _glIsFramebuffer,
  /** @export */
  glLineWidth: _glLineWidth,
  /** @export */
  glLoadIdentity: _glLoadIdentity,
  /** @export */
  glLoadMatrixf: _glLoadMatrixf,
  /** @export */
  glMatrixMode: _glMatrixMode,
  /** @export */
  glNormalPointer: _glNormalPointer,
  /** @export */
  glPolygonMode: _glPolygonMode,
  /** @export */
  glPolygonOffset: _glPolygonOffset,
  /** @export */
  glPopMatrix: _glPopMatrix,
  /** @export */
  glPushMatrix: _glPushMatrix,
  /** @export */
  glReadPixels: _glReadPixels,
  /** @export */
  glRenderbufferStorage: _glRenderbufferStorage,
  /** @export */
  glRenderbufferStorageMultisample: _glRenderbufferStorageMultisample,
  /** @export */
  glScissor: _glScissor,
  /** @export */
  glShadeModel: _glShadeModel,
  /** @export */
  glStencilFunc: _glStencilFunc,
  /** @export */
  glStencilOp: _glStencilOp,
  /** @export */
  glTexCoordPointer: _glTexCoordPointer,
  /** @export */
  glTexEnvi: _glTexEnvi,
  /** @export */
  glTexImage2D: _glTexImage2D,
  /** @export */
  glTexParameteri: _glTexParameteri,
  /** @export */
  glTexSubImage2D: _glTexSubImage2D,
  /** @export */
  glVertexPointer: _glVertexPointer,
  /** @export */
  glViewport: _glViewport,

  GL_GetProcAddress: function () { debugger }
}
