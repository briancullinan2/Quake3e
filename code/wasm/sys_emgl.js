// TODO: can call all EMGL functions or re.* renderer2 export functions from scripts
//   Maybe this is where the paralel frame buffering comes in, or treat the javascript
//   like update calls and extrapolate.
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder() : undefined;
  
var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on
  // null terminator by itself.  Also, use the length info to avoid running tiny
  // strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation,
  // so that undefined means Infinity)
  while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
    return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
  }
  var str = '';
  // If building with TextDecoder, we have already computed the string length
  // above, so test loop end condition against that
  while (idx < endPtr) {
    // For UTF8 byte structure, see:
    // http://en.wikipedia.org/wiki/UTF-8#Description
    // https://www.ietf.org/rfc/rfc2279.txt
    // https://tools.ietf.org/html/rfc3629
    var u0 = heapOrArray[idx++];
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    var u1 = heapOrArray[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    var u2 = heapOrArray[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte ' + ptrToString(u0) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
      u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
    }

    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
  return str;
};

var UTF8ToString = (ptr, maxBytesToRead) => {
  assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
};

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

var webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance = (ctx) =>
  // Closure is expected to be allowed to minify the '.dibvbi' property, so not accessing it quoted.
  !!(ctx.dibvbi = ctx.getExtension('WEBGL_draw_instanced_base_vertex_base_instance'));

var webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance = (ctx) => {
  // Closure is expected to be allowed to minify the '.mdibvbi' property, so not accessing it quoted.
  return !!(ctx.mdibvbi = ctx.getExtension('WEBGL_multi_draw_instanced_base_vertex_base_instance'));
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
    // WebGL 2 extensions
    'EXT_color_buffer_float',
    'EXT_conservative_depth',
    'EXT_disjoint_timer_query_webgl2',
    'EXT_texture_norm16',
    'NV_shader_noperspective_interpolation',
    'WEBGL_clip_cull_distance',
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
mappedBuffers:{
},
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
samplers:[],
transformFeedbacks:[],
syncs:[],
byteSizeByTypeRoot:5120,
byteSizeByType:[1,1,2,2,4,4,4,2,3,4,8],
stringCache:{
},
stringiCache:{
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
    return source;
  },
calcBufLength:(size, type, stride, count) => {
    if (stride > 0) {
      return count * stride;  // XXXvlad this is not exactly correct I don't think
    }
    var typeSize = GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
    return size * typeSize * count;
  },
usedTempBuffers:[],
preDrawHandleClientVertexAttribBindings:(count) => {
    GL.resetBufferBinding = false;

    // TODO: initial pass to detect ranges we need to upload, might not need
    // an upload per attrib
    for (var i = 0; i < GL.currentContext.maxVertexAttribs; ++i) {
      var cb = GL.currentContext.clientBuffers[i];
      if (!cb.clientside || !cb.enabled) continue;

      GL.resetBufferBinding = true;

      var size = GL.calcBufLength(cb.size, cb.type, cb.stride, count);
      var buf = GL.getTempVertexBuffer(size);
      GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, buf);
      GLctx.bufferSubData(0x8892 /*GL_ARRAY_BUFFER*/,
                               0,
                               HEAPU8.subarray(cb.ptr, cb.ptr + size));
      cb.vertexAttribPointerAdaptor.call(GLctx, i, cb.size, cb.type, cb.normalized, cb.stride, 0);
    }
  },
postDrawHandleClientVertexAttribBindings:() => {
    if (GL.resetBufferBinding) {
      GLctx.bindBuffer(0x8892 /*GL_ARRAY_BUFFER*/, GL.buffers[GLctx.currentArrayBufferBinding]);
    }
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
      (webGLContextAttributes.majorVersion > 1)
      ?
        canvas.getContext("webgl2", webGLContextAttributes)
      :
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

    context.maxVertexAttribs = context.GLctx.getParameter(0x8869 /*GL_MAX_VERTEX_ATTRIBS*/);
    context.clientBuffers = [];
    for (var i = 0; i < context.maxVertexAttribs; i++) {
      context.clientBuffers[i] = {
        enabled: false,
        clientside: false,
        size: 0,
        type: 0,
        normalized: 0,
        stride: 0,
        ptr: 0,
        vertexAttribPointerAdaptor: null,
      };
    }

    GL.generateTempBuffers(false, context);

    return handle;
  },
makeContextCurrent:(contextHandle) => {

    // Active Emscripten GL layer context object.
    GL.currentContext = GL.contexts[contextHandle];
    // Active WebGL context object.
    Module.ctx = GLctx = GL.currentContext?.GLctx;
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

    // Extensions that are only available in WebGL 1 (the calls will be no-ops
    // if called on a WebGL 2 context active)
    webgl_enable_ANGLE_instanced_arrays(GLctx);
    webgl_enable_OES_vertex_array_object(GLctx);
    webgl_enable_WEBGL_draw_buffers(GLctx);
    // Extensions that are available from WebGL >= 2 (no-op if called on a WebGL 1 context active)
    webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
    webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);

    // On WebGL 2, EXT_disjoint_timer_query is replaced with an alternative
    // that's based on core APIs, and exposes only the queryCounterEXT()
    // entrypoint.
    if (context.version >= 2) {
      GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query_webgl2");
    }

    // However, Firefox exposes the WebGL 1 version on WebGL 2 as well and
    // thus we look for the WebGL 1 version again if the WebGL 2 version
    // isn't present. https://bugzilla.mozilla.org/show_bug.cgi?id=1328882
    if (context.version < 2 || !GLctx.disjointTimerQueryExt)
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
var _glActiveTexture = (x0) => GLctx.activeTexture(x0);

function _glAlphaFunc() { debugger }

function _glArrayElement() { debugger }

var _glAttachShader = (program, shader) => {
  GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
};

var _glBegin = () => {
  throw 'Legacy GL function (glBegin) called. If you want legacy GL emulation, you need to compile with -sLEGACY_GL_EMULATION to enable legacy GL emulation.';
};


var _glBindAttribLocation = (program, index, name) => {
  GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
};

var _glBindBuffer = (target, buffer) => {
  if (target == 0x8892 /*GL_ARRAY_BUFFER*/) {
    GLctx.currentArrayBufferBinding = buffer;
  } else if (target == 0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/) {
    GLctx.currentElementArrayBufferBinding = buffer;
  }

  if (target == 0x88EB /*GL_PIXEL_PACK_BUFFER*/) {
    // In WebGL 2 glReadPixels entry point, we need to use a different WebGL 2
    // API function call when a buffer is bound to
    // GL_PIXEL_PACK_BUFFER_BINDING point, so must keep track whether that
    // binding point is non-null to know what is the proper API function to
    // call.
    GLctx.currentPixelPackBufferBinding = buffer;
  } else if (target == 0x88EC /*GL_PIXEL_UNPACK_BUFFER*/) {
    // In WebGL 2 gl(Compressed)Tex(Sub)Image[23]D entry points, we need to
    // use a different WebGL 2 API function call when a buffer is bound to
    // GL_PIXEL_UNPACK_BUFFER_BINDING point, so must keep track whether that
    // binding point is non-null to know what is the proper API function to
    // call.
    GLctx.currentPixelUnpackBufferBinding = buffer;
  }
  GLctx.bindBuffer(target, GL.buffers[buffer]);
};

var _glBindFramebuffer = (target, framebuffer) => {

  GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);

};

function _glBindMultiTextureEXT() { }

var _glBindRenderbuffer = (target, renderbuffer) => {
  GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
};

var _glBindTexture = (target, texture) => {
  GLctx.bindTexture(target, GL.textures[texture]);
};

var _glBindVertexArray = (vao) => {
  GLctx.bindVertexArray(GL.vaos[vao]);
  var ibo = GLctx.getParameter(0x8895 /*ELEMENT_ARRAY_BUFFER_BINDING*/);
  GLctx.currentElementArrayBufferBinding = ibo ? (ibo.name | 0) : 0;
};

var _glBlendFunc = (x0, x1) => GLctx.blendFunc(x0, x1);

function _glBlitFramebuffer() { }

var _glBufferData = (target, size, data, usage) => {

  if (GL.currentContext.version >= 2) {
    // If size is zero, WebGL would interpret uploading the whole input
    // arraybuffer (starting from given offset), which would not make sense in
    // WebAssembly, so avoid uploading if size is zero. However we must still
    // call bufferData to establish a backing storage of zero bytes.
    if (data && size) {
      GLctx.bufferData(target, HEAPU8, usage, data, size);
    } else {
      GLctx.bufferData(target, size, usage);
    }
    return;
  }
  // N.b. here first form specifies a heap subarray, second form an integer
  // size, so the ?: code here is polymorphic. It is advised to avoid
  // randomly mixing both uses in calling code, to avoid any potential JS
  // engine JIT issues.
  GLctx.bufferData(target, data ? HEAPU8.subarray(data, data+size) : size, usage);
};

var _glBufferSubData = (target, offset, size, data) => {
  if (GL.currentContext.version >= 2) {
    size && GLctx.bufferSubData(target, offset, HEAPU8, data, size);
    return;
  }
  GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data+size));
};

var _glCheckFramebufferStatus = (x0) => GLctx.checkFramebufferStatus(x0);

function _glCheckNamedFramebufferStatusEXT() { }

var _glClear = (x0) => GLctx.clear(x0);

var _glClearColor = (x0, x1, x2, x3) => GLctx.clearColor(x0, x1, x2, x3);

var _glClearDepth = (x0) => GLctx.clearDepth(x0);

var _glClearStencil = (x0) => GLctx.clearStencil(x0);

function _glClipPlane() { debugger }

function _glColor3f() { debugger }

function _glColor4f() { debugger }

function _glColor4ubv() { debugger }

var _glColorMask = (red, green, blue, alpha) => {
  GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
};

function _glColorPointer() { debugger }

var _glCompileShader = (shader) => {
  GLctx.compileShader(GL.shaders[shader]);
};

var _glCompressedTexImage2D = (target, level, internalFormat, width, height, border, imageSize, data) => {
  if (GL.currentContext.version >= 2) {
    if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
      GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data);
      return;
    }
    GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
    return;
  }
  GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, data ? HEAPU8.subarray((data), data+imageSize) : null);
};

var _glCompressedTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, imageSize, data) => {
  if (GL.currentContext.version >= 2) {
    if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
      GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data);
      return;
    }
    GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, HEAPU8, data, imageSize);
    return;
  }
  GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray((data), data+imageSize) : null);
};

function _glCompressedTextureImage2DEXT() { }

function _glCompressedTextureSubImage2DEXT() { }

var _glCopyTexSubImage2D = (x0, x1, x2, x3, x4, x5, x6, x7) => GLctx.copyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7);

function _glCopyTextureSubImage2DEXT() { }

var _glCreateProgram = () => {
  var id = GL.getNewId(GL.programs);
  var program = GLctx.createProgram();
  // Store additional information needed for each shader program:
  program.name = id;
  // Lazy cache results of
  // glGetProgramiv(GL_ACTIVE_UNIFORM_MAX_LENGTH/GL_ACTIVE_ATTRIBUTE_MAX_LENGTH/GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH)
  program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
  program.uniformIdCounter = 1;
  GL.programs[id] = program;
  return id;
};

var _glCreateShader = (shaderType) => {
  var id = GL.getNewId(GL.shaders);
  GL.shaders[id] = GLctx.createShader(shaderType);

  return id;
};

var _glCullFace = (x0) => GLctx.cullFace(x0);

var _glDeleteBuffers = (n, buffers) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((buffers)+(i*4))>>2)];
    var buffer = GL.buffers[id];

    // From spec: "glDeleteBuffers silently ignores 0's and names that do not
    // correspond to existing buffer objects."
    if (!buffer) continue;

    GLctx.deleteBuffer(buffer);
    buffer.name = 0;
    GL.buffers[id] = null;

    if (id == GLctx.currentArrayBufferBinding) GLctx.currentArrayBufferBinding = 0;
    if (id == GLctx.currentElementArrayBufferBinding) GLctx.currentElementArrayBufferBinding = 0;
    if (id == GLctx.currentPixelPackBufferBinding) GLctx.currentPixelPackBufferBinding = 0;
    if (id == GLctx.currentPixelUnpackBufferBinding) GLctx.currentPixelUnpackBufferBinding = 0;
  }
};

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

var _glDeleteShader = (id) => {
  if (!id) return;
  var shader = GL.shaders[id];
  if (!shader) {
    // glDeleteShader actually signals an error when deleting a nonexisting
    // object, unlike some other GL delete functions.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  GLctx.deleteShader(shader);
  GL.shaders[id] = null;
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

var _glDeleteVertexArrays = (n, vaos) => {
  for (var i = 0; i < n; i++) {
    var id = HEAP32[(((vaos)+(i*4))>>2)];
    GLctx.deleteVertexArray(GL.vaos[id]);
    GL.vaos[id] = null;
  }
};

var _glDepthFunc = (x0) => GLctx.depthFunc(x0);

var _glDepthMask = (flag) => {
  GLctx.depthMask(!!flag);
};

var _glDepthRange = (x0, x1) => GLctx.depthRange(x0, x1);

var _glDetachShader = (program, shader) => {
  GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
};

var _glDisable = (x0) => GLctx.disable(x0);

function _glDisableClientState() { debugger }

var _glDisableVertexAttribArray = (index) => {
  var cb = GL.currentContext.clientBuffers[index];
  cb.enabled = false;
  GLctx.disableVertexAttribArray(index);
};

var _glDrawArrays = (mode, first, count) => {
  // bind any client-side buffers
  GL.preDrawHandleClientVertexAttribBindings(first + count);

  GLctx.drawArrays(mode, first, count);

  GL.postDrawHandleClientVertexAttribBindings();
};

function _glDrawBuffer(buf) {
  GLctx["drawBuffers"]([buf]);
}

var tempFixedLengthArray = [];

var _glDrawBuffers = (n, bufs) => {

  var bufArray = tempFixedLengthArray[n];
  for (var i = 0; i < n; i++) {
    bufArray[i] = HEAP32[(((bufs)+(i*4))>>2)];
  }

  GLctx.drawBuffers(bufArray);
};

var _glDrawElements = (mode, count, type, indices) => {
  var buf;
  if (!GLctx.currentElementArrayBufferBinding) {
    var size = GL.calcBufLength(1, type, 0, count);
    buf = GL.getTempIndexBuffer(size);
    GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, buf);
    GLctx.bufferSubData(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/,
                        0,
                        HEAPU8.subarray(indices, indices + size));
    // the index is now 0
    indices = 0;
  }

  // bind any client-side buffers
  GL.preDrawHandleClientVertexAttribBindings(count);

  GLctx.drawElements(mode, count, type, indices);

  GL.postDrawHandleClientVertexAttribBindings(count);

  if (!GLctx.currentElementArrayBufferBinding) {
    GLctx.bindBuffer(0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/, null);
  }
};

var _glEnable = (x0) => GLctx.enable(x0);

function _glEnableClientState() { debugger; }

var _glEnableVertexAttribArray = (index) => {
  var cb = GL.currentContext.clientBuffers[index];
  cb.enabled = true;
  GLctx.enableVertexAttribArray(index);
};

function _glEnd() { debugger; }

var _glFinish = () => GLctx.finish();

var _glFlush = () => GLctx.flush();

var _glFramebufferRenderbuffer = (target, attachment, renderbuffertarget, renderbuffer) => {
  GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
                                     GL.renderbuffers[renderbuffer]);
};

var _glFramebufferTexture2D = (target, attachment, textarget, texture, level) => {
  GLctx.framebufferTexture2D(target, attachment, textarget,
                                  GL.textures[texture], level);
};

function _glFrustum() { debugger; }

var _glGenBuffers = (n, buffers) => {
  GL.genObject(n, buffers, 'createBuffer', GL.buffers
    );
};

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

var _glGenVertexArrays = (n, arrays) => {
  GL.genObject(n, arrays, 'createVertexArray', GL.vaos
    );
};

var _glGenerateMipmap = (x0) => GLctx.generateMipmap(x0);

function _glGenerateTextureMipmapEXT() { }


var __glGetActiveAttribOrUniform = (funcName, program, index, bufSize, length, size, type, name) => {
  program = GL.programs[program];
  var info = GLctx[funcName](program, index);
  if (info) {
    // If an error occurs, nothing will be written to length, size and type and name.
    var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
    if (length) HEAP32[((length)>>2)] = numBytesWrittenExclNull;
    if (size) HEAP32[((size)>>2)] = info.size;
    if (type) HEAP32[((type)>>2)] = info.type;
  }
};

var _glGetActiveUniform = (program, index, bufSize, length, size, type, name) => {
  __glGetActiveAttribOrUniform('getActiveUniform', program, index, bufSize, length, size, type, name);
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


var webglGetExtensions = function $webglGetExtensions() {
  var exts = getEmscriptenSupportedExtensions(GLctx);
  exts = exts.concat(exts.map((e) => "GL_" + e));
  return exts;
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
    case 0x87FE: // GL_NUM_PROGRAM_BINARY_FORMATS
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

    case 0x821D: // GL_NUM_EXTENSIONS
      if (GL.currentContext.version < 2) {
        // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
        GL.recordError(0x502 /* GL_INVALID_OPERATION */);
        return;
      }
      ret = webglGetExtensions().length;
      break;
    case 0x821B: // GL_MAJOR_VERSION
    case 0x821C: // GL_MINOR_VERSION
      if (GL.currentContext.version < 2) {
        GL.recordError(0x500); // GL_INVALID_ENUM
        return;
      }
      ret = name_ == 0x821B ? 3 : 0; // return version 3.0
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
            case 0x8F36: // COPY_READ_BUFFER_BINDING or COPY_READ_BUFFER
            case 0x8F37: // COPY_WRITE_BUFFER_BINDING or COPY_WRITE_BUFFER
            case 0x88ED: // PIXEL_PACK_BUFFER_BINDING
            case 0x88EF: // PIXEL_UNPACK_BUFFER_BINDING
            case 0x8CAA: // READ_FRAMEBUFFER_BINDING
            case 0x8919: // SAMPLER_BINDING
            case 0x8C1D: // TEXTURE_BINDING_2D_ARRAY
            case 0x806A: // TEXTURE_BINDING_3D
            case 0x8E25: // TRANSFORM_FEEDBACK_BINDING
            case 0x8C8F: // TRANSFORM_FEEDBACK_BUFFER_BINDING
            case 0x8A28: // UNIFORM_BUFFER_BINDING
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


var _glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);

var _glGetProgramInfoLog = (program, maxLength, length, infoLog) => {
  var log = GLctx.getProgramInfoLog(GL.programs[program]);
  if (log === null) log = '(unknown error)';
  var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
  if (length) HEAP32[((length)>>2)] = numBytesWrittenExclNull;
};

var _glGetProgramiv = (program, pname, p) => {
  if (!p) {
    // GLES2 specification does not specify how to behave if p is a null
    // pointer. Since calling this function does not make sense if p == null,
    // issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }

  if (program >= GL.counter) {
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }

  program = GL.programs[program];

  if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
    var log = GLctx.getProgramInfoLog(program);
    if (log === null) log = '(unknown error)';
    HEAP32[((p)>>2)] = log.length + 1;
  } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
    if (!program.maxUniformLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/); ++i) {
        program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i).name.length+1);
      }
    }
    HEAP32[((p)>>2)] = program.maxUniformLength;
  } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
    if (!program.maxAttributeLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8B89/*GL_ACTIVE_ATTRIBUTES*/); ++i) {
        program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i).name.length+1);
      }
    }
    HEAP32[((p)>>2)] = program.maxAttributeLength;
  } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
    if (!program.maxUniformBlockNameLength) {
      for (var i = 0; i < GLctx.getProgramParameter(program, 0x8A36/*GL_ACTIVE_UNIFORM_BLOCKS*/); ++i) {
        program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i).length+1);
      }
    }
    HEAP32[((p)>>2)] = program.maxUniformBlockNameLength;
  } else {
    HEAP32[((p)>>2)] = GLctx.getProgramParameter(program, pname);
  }
};


var _glGetShaderInfoLog = (shader, maxLength, length, infoLog) => {
  var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
  if (log === null) log = '(unknown error)';
  var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
  if (length) HEAP32[((length)>>2)] = numBytesWrittenExclNull;
};

var _glGetShaderSource = (shader, bufSize, length, source) => {
  var result = GLctx.getShaderSource(GL.shaders[shader]);
  if (!result) return; // If an error occurs, nothing will be written to length or source.
  var numBytesWrittenExclNull = (bufSize > 0 && source) ? stringToUTF8(result, source, bufSize) : 0;
  if (length) HEAP32[((length)>>2)] = numBytesWrittenExclNull;
};

var _glGetShaderiv = (shader, pname, p) => {
  if (!p) {
    // GLES2 specification does not specify how to behave if p is a null
    // pointer. Since calling this function does not make sense if p == null,
    // issue a GL error to notify user about it.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
    return;
  }
  if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = '(unknown error)';
    // The GLES2 specification says that if the shader has an empty info log,
    // a value of 0 is returned. Otherwise the log has a null char appended.
    // (An empty string is falsey, so we can just check that instead of
    // looking at log.length.)
    var logLength = log ? log.length + 1 : 0;
    HEAP32[((p)>>2)] = logLength;
  } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
    var source = GLctx.getShaderSource(GL.shaders[shader]);
    // source may be a null, or the empty string, both of which are falsey
    // values that we report a 0 length for.
    var sourceLength = source ? source.length + 1 : 0;
    HEAP32[((p)>>2)] = sourceLength;
  } else {
    HEAP32[((p)>>2)] = GLctx.getShaderParameter(GL.shaders[shader], pname);
  }
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
        if (GL.currentContext.version >= 2) glVersion = `OpenGL ES 3.0 (${glVersion})`;
        else
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


var _glGetStringi = (name, index) => {
  if (GL.currentContext.version < 2) {
    GL.recordError(0x502 /* GL_INVALID_OPERATION */); // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
    return 0;
  }
  var stringiCache = GL.stringiCache[name];
  if (stringiCache) {
    if (index < 0 || index >= stringiCache.length) {
      GL.recordError(0x501/*GL_INVALID_VALUE*/);
      return 0;
    }
    return stringiCache[index];
  }
  switch (name) {
    case 0x1F03 /* GL_EXTENSIONS */:
      var exts = webglGetExtensions().map(stringToAddress);
      stringiCache = GL.stringiCache[name] = exts;
      if (index < 0 || index >= stringiCache.length) {
        GL.recordError(0x501/*GL_INVALID_VALUE*/);
        return 0;
      }
      return stringiCache[index];
    default:
      GL.recordError(0x500/*GL_INVALID_ENUM*/);
      return 0;
  }
};

/** @suppress {checkTypes} */
var jstoi_q = (str) => parseInt(str);

/** @noinline */
var webglGetLeftBracePos = (name) => name.slice(-1) == ']' && name.lastIndexOf('[');

var webglPrepareUniformLocationsBeforeFirstUse = (program) => {
  var uniformLocsById = program.uniformLocsById, // Maps GLuint -> WebGLUniformLocation
    uniformSizeAndIdsByName = program.uniformSizeAndIdsByName, // Maps name -> [uniform array length, GLuint]
    i, j;

  // On the first time invocation of glGetUniformLocation on this shader program:
  // initialize cache data structures and discover which uniforms are arrays.
  if (!uniformLocsById) {
    // maps GLint integer locations to WebGLUniformLocations
    program.uniformLocsById = uniformLocsById = {};
    // maps integer locations back to uniform name strings, so that we can lazily fetch uniform array locations
    program.uniformArrayNamesById = {};

    for (i = 0; i < GLctx.getProgramParameter(program, 0x8B86/*GL_ACTIVE_UNIFORMS*/); ++i) {
      var u = GLctx.getActiveUniform(program, i);
      var nm = u.name;
      var sz = u.size;
      var lb = webglGetLeftBracePos(nm);
      var arrayName = lb > 0 ? nm.slice(0, lb) : nm;

      // Assign a new location.
      var id = program.uniformIdCounter;
      program.uniformIdCounter += sz;
      // Eagerly get the location of the uniformArray[0] base element.
      // The remaining indices >0 will be left for lazy evaluation to
      // improve performance. Those may never be needed to fetch, if the
      // application fills arrays always in full starting from the first
      // element of the array.
      uniformSizeAndIdsByName[arrayName] = [sz, id];

      // Store placeholder integers in place that highlight that these
      // >0 index locations are array indices pending population.
      for (j = 0; j < sz; ++j) {
        uniformLocsById[id] = j;
        program.uniformArrayNamesById[id++] = arrayName;
      }
    }
  }
};



var _glGetUniformLocation = (program, name) => {

  name = UTF8ToString(name);

  if (program = GL.programs[program]) {
    webglPrepareUniformLocationsBeforeFirstUse(program);
    var uniformLocsById = program.uniformLocsById; // Maps GLuint -> WebGLUniformLocation
    var arrayIndex = 0;
    var uniformBaseName = name;

    // Invariant: when populating integer IDs for uniform locations, we must
    // maintain the precondition that arrays reside in contiguous addresses,
    // i.e. for a 'vec4 colors[10];', colors[4] must be at location
    // colors[0]+4.  However, user might call glGetUniformLocation(program,
    // "colors") for an array, so we cannot discover based on the user input
    // arguments whether the uniform we are dealing with is an array. The only
    // way to discover which uniforms are arrays is to enumerate over all the
    // active uniforms in the program.
    var leftBrace = webglGetLeftBracePos(name);

    // If user passed an array accessor "[index]", parse the array index off the accessor.
    if (leftBrace > 0) {
      arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0; // "index]", coerce parseInt(']') with >>>0 to treat "foo[]" as "foo[0]" and foo[-1] as unsigned out-of-bounds.
      uniformBaseName = name.slice(0, leftBrace);
    }

    // Have we cached the location of this uniform before?
    // A pair [array length, GLint of the uniform location]
    var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];

    // If an uniform with this name exists, and if its index is within the
    // array limits (if it's even an array), query the WebGLlocation, or
    // return an existing cached location.
    if (sizeAndId && arrayIndex < sizeAndId[0]) {
      arrayIndex += sizeAndId[1]; // Add the base location of the uniform to the array index offset.
      if ((uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name))) {
        return arrayIndex;
      }
    }
  }
  else {
    // N.b. we are currently unable to distinguish between GL program IDs that
    // never existed vs GL program IDs that have been deleted, so report
    // GL_INVALID_VALUE in both cases.
    GL.recordError(0x501 /* GL_INVALID_VALUE */);
  }
  return -1;
};

var _glLineWidth = (x0) => GLctx.lineWidth(x0);

var _glLinkProgram = (program) => {
  program = GL.programs[program];
  GLctx.linkProgram(program);
  // Invalidate earlier computed uniform->ID mappings, those have now become stale
  program.uniformLocsById = 0; // Mark as null-like so that glGetUniformLocation() knows to populate this again.
  program.uniformSizeAndIdsByName = {};

};

var _glLoadIdentity = () => {
  throw 'Legacy GL function (glLoadIdentity) called. If you want legacy GL emulation, you need to compile with -sLEGACY_GL_EMULATION to enable legacy GL emulation.';
};

function _glLoadMatrixf() { debugger }

function _glMapBufferRange() { debugger }

var _glMatrixMode = () => {
  throw 'Legacy GL function (glMatrixMode) called. If you want legacy GL emulation, you need to compile with -sLEGACY_GL_EMULATION to enable legacy GL emulation.';
};

function _glNamedFramebufferRenderbufferEXT() { }

function _glNamedFramebufferTexture2DEXT() { }

function _glNamedRenderbufferStorageEXT() { }

function _glNamedRenderbufferStorageMultisampleEXT() { }

function _glOrtho() { debugger }

function _glPolygonMode() { }

var _glPolygonOffset = (x0, x1) => GLctx.polygonOffset(x0, x1);

function _glPopMatrix() { debugger }

function _glProgramUniform1fEXT() { }

function _glProgramUniform1fvEXT() { }

function _glProgramUniform1iEXT() { }

function _glProgramUniform2fEXT() { }

function _glProgramUniform3fEXT() { }

function _glProgramUniform4fEXT() { }

function _glProgramUniformMatrix4fvEXT() { }

function _glPushMatrix() { debugger }

var _glReadBuffer = (x0) => GLctx.readBuffer(x0);

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
    // 0x1903 /* GL_RED */ - 0x1902: 1,
    26917: 2,
    26918: 2,
    // 0x8D94 /* GL_RED_INTEGER */ - 0x1902: 1,
    29846: 3,
    29847: 4
  };
  return colorChannels[format - 0x1902]||1;
};

var heapObjectForWebGLType = (type) => {
  // Micro-optimization for size: Subtract lowest GL enum number (0x1400/* GL_BYTE */) from type to compare
  // smaller values for the heap, for shorter generated code size.
  // Also the type HEAPU16 is not tested for explicitly, but any unrecognized type will return out HEAPU16.
  // (since most types are HEAPU16)
  type -= 0x1400;
  if (type == 0) return HEAP8;

  if (type == 1) return HEAPU8;

  if (type == 2) return HEAP16;

  if (type == 4) return HEAP32;

  if (type == 6) return HEAPF32;

  if (type == 5
    || type == 28922
    || type == 28520
    || type == 30779
    || type == 30782
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
  if (GL.currentContext.version >= 2) {
    if (GLctx.currentPixelPackBufferBinding) {
      GLctx.readPixels(x, y, width, height, format, type, pixels);
      return;
    }
    var heap = heapObjectForWebGLType(type);
    var target = toTypedArrayIndex(pixels, heap);
    GLctx.readPixels(x, y, width, height, format, type, heap, target);
    return;
  }
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

function _glShadeModel() { debugger }

var _glShaderSource = (shader, count, string, length) => {
  var source = GL.getSource(shader, count, string, length);

  GLctx.shaderSource(GL.shaders[shader], source);
};

var _glStencilFunc = (x0, x1, x2) => GLctx.stencilFunc(x0, x1, x2);

var _glStencilMask = (x0) => GLctx.stencilMask(x0);

var _glStencilOp = (x0, x1, x2) => GLctx.stencilOp(x0, x1, x2);

function _glTexCoord2f() { debugger }

function _glTexCoord2fv() { debugger }

function _glTexCoordPointer() { debugger }

function _glTexEnvf() { debugger }




var _glTexImage2D = (target, level, internalFormat, width, height, border, format, type, pixels) => {
  if (GL.currentContext.version >= 2) {
    if (GLctx.currentPixelUnpackBufferBinding) {
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
      return;
    }
    if (pixels) {
      var heap = heapObjectForWebGLType(type);
      var index = toTypedArrayIndex(pixels, heap);
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, index);
      return;
    }
  }
  var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null;
  GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData);
};

var _glTexParameterf = (x0, x1, x2) => GLctx.texParameterf(x0, x1, x2);

var _glTexParameteri = (x0, x1, x2) => GLctx.texParameteri(x0, x1, x2);




var _glTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, type, pixels) => {
  if (GL.currentContext.version >= 2) {
    if (GLctx.currentPixelUnpackBufferBinding) {
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
      return;
    }
    if (pixels) {
      var heap = heapObjectForWebGLType(type);
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, toTypedArrayIndex(pixels, heap));
      return;
    }
  }
  var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0) : null;
  GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
};

function _glTextureImage2DEXT() { }

function _glTextureParameterfEXT() { }

function _glTextureParameteriEXT() { }

function _glTextureSubImage2DEXT() { }

function _glTranslatef() { debugger }

var webglGetUniformLocation = (location) => {
  var p = GLctx.currentProgram;

  if (p) {
    var webglLoc = p.uniformLocsById[location];
    // p.uniformLocsById[location] stores either an integer, or a
    // WebGLUniformLocation.
    // If an integer, we have not yet bound the location, so do it now. The
    // integer value specifies the array index we should bind to.
    if (typeof webglLoc == 'number') {
      p.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(p, p.uniformArrayNamesById[location] + (webglLoc > 0 ? `[${webglLoc}]` : ''));
    }
    // Else an already cached WebGLUniformLocation, return it.
    return webglLoc;
  } else {
    GL.recordError(0x502/*GL_INVALID_OPERATION*/);
  }
};

var _glUniform1f = (location, v0) => {
  GLctx.uniform1f(webglGetUniformLocation(location), v0);
};


var miniTempWebGLFloatBuffers = [];

var _glUniform1fv = (location, count, value) => {

  if (GL.currentContext.version >= 2) {
    count && GLctx.uniform1fv(webglGetUniformLocation(location), HEAPF32, ((value)>>2), count);
    return;
  }

  if (count <= 288) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[count];
    for (var i = 0; i < count; ++i) {
      view[i] = HEAPF32[(((value)+(4*i))>>2)];
    }
  } else
  {
    var view = HEAPF32.subarray((((value)>>2)), ((value+count*4)>>2));
  }
  GLctx.uniform1fv(webglGetUniformLocation(location), view);
};


var _glUniform1i = (location, v0) => {
  GLctx.uniform1i(webglGetUniformLocation(location), v0);
};


var _glUniform2f = (location, v0, v1) => {
  GLctx.uniform2f(webglGetUniformLocation(location), v0, v1);
};


var _glUniform3f = (location, v0, v1, v2) => {
  GLctx.uniform3f(webglGetUniformLocation(location), v0, v1, v2);
};


var _glUniform4f = (location, v0, v1, v2, v3) => {
  GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3);
};



var _glUniformMatrix4fv = (location, count, transpose, value) => {

  if (GL.currentContext.version >= 2) {
    count && GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, ((value)>>2), count*16);
    return;
  }

  if (count <= 18) {
    // avoid allocation when uploading few enough uniforms
    var view = miniTempWebGLFloatBuffers[16*count];
    // hoist the heap out of the loop for size and for pthreads+growth.
    var heap = HEAPF32;
    value = ((value)>>2);
    for (var i = 0; i < 16 * count; i += 16) {
      var dst = value + i;
      view[i] = heap[dst];
      view[i + 1] = heap[dst + 1];
      view[i + 2] = heap[dst + 2];
      view[i + 3] = heap[dst + 3];
      view[i + 4] = heap[dst + 4];
      view[i + 5] = heap[dst + 5];
      view[i + 6] = heap[dst + 6];
      view[i + 7] = heap[dst + 7];
      view[i + 8] = heap[dst + 8];
      view[i + 9] = heap[dst + 9];
      view[i + 10] = heap[dst + 10];
      view[i + 11] = heap[dst + 11];
      view[i + 12] = heap[dst + 12];
      view[i + 13] = heap[dst + 13];
      view[i + 14] = heap[dst + 14];
      view[i + 15] = heap[dst + 15];
    }
  } else
  {
    var view = HEAPF32.subarray((((value)>>2)), ((value+count*64)>>2));
  }
  GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, view);
};

var emscriptenWebGLGetBufferBinding = (target) => {
  switch (target) {
    case 0x8892 /*GL_ARRAY_BUFFER*/: target = 0x8894 /*GL_ARRAY_BUFFER_BINDING*/; break;
    case 0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/: target = 0x8895 /*GL_ELEMENT_ARRAY_BUFFER_BINDING*/; break;
    case 0x88EB /*GL_PIXEL_PACK_BUFFER*/: target = 0x88ED /*GL_PIXEL_PACK_BUFFER_BINDING*/; break;
    case 0x88EC /*GL_PIXEL_UNPACK_BUFFER*/: target = 0x88EF /*GL_PIXEL_UNPACK_BUFFER_BINDING*/; break;
    case 0x8C8E /*GL_TRANSFORM_FEEDBACK_BUFFER*/: target = 0x8C8F /*GL_TRANSFORM_FEEDBACK_BUFFER_BINDING*/; break;
    case 0x8F36 /*GL_COPY_READ_BUFFER*/: target = 0x8F36 /*GL_COPY_READ_BUFFER_BINDING*/; break;
    case 0x8F37 /*GL_COPY_WRITE_BUFFER*/: target = 0x8F37 /*GL_COPY_WRITE_BUFFER_BINDING*/; break;
    case 0x8A11 /*GL_UNIFORM_BUFFER*/: target = 0x8A28 /*GL_UNIFORM_BUFFER_BINDING*/; break;
    // In default case, fall through and assume passed one of the _BINDING enums directly.
  }
  var buffer = GLctx.getParameter(target);
  if (buffer) return buffer.name|0;
  else return 0;
};

var emscriptenWebGLValidateMapBufferTarget = (target) => {
  switch (target) {
    case 0x8892: // GL_ARRAY_BUFFER
    case 0x8893: // GL_ELEMENT_ARRAY_BUFFER
    case 0x8F36: // GL_COPY_READ_BUFFER
    case 0x8F37: // GL_COPY_WRITE_BUFFER
    case 0x88EB: // GL_PIXEL_PACK_BUFFER
    case 0x88EC: // GL_PIXEL_UNPACK_BUFFER
    case 0x8C2A: // GL_TEXTURE_BUFFER
    case 0x8C8E: // GL_TRANSFORM_FEEDBACK_BUFFER
    case 0x8A11: // GL_UNIFORM_BUFFER
      return true;
    default:
      return false;
  }
};


var _glUnmapBuffer = (target) => {
  if (!emscriptenWebGLValidateMapBufferTarget(target)) {
    GL.recordError(0x500/*GL_INVALID_ENUM*/);
    err('GL_INVALID_ENUM in glUnmapBuffer');
    return 0;
  }

  var buffer = emscriptenWebGLGetBufferBinding(target);
  var mapping = GL.mappedBuffers[buffer];
  if (!mapping || !mapping.mem) {
    GL.recordError(0x502 /* GL_INVALID_OPERATION */);
    err('buffer was never mapped in glUnmapBuffer');
    return 0;
  }

  if (!(mapping.access & 0x10)) { /* GL_MAP_FLUSH_EXPLICIT_BIT */
    if (GL.currentContext.version >= 2) {
      GLctx.bufferSubData(target, mapping.offset, HEAPU8, mapping.mem, mapping.length);
    } else
    GLctx.bufferSubData(target, mapping.offset, HEAPU8.subarray(mapping.mem, mapping.mem+mapping.length));
  }
  _free(mapping.mem);
  mapping.mem = 0;
  return 1;
};

var _glUseProgram = (program) => {
  program = GL.programs[program];
  GLctx.useProgram(program);
  // Record the currently active program so that we can access the uniform
  // mapping table of that program.
  GLctx.currentProgram = program;
};

var _glValidateProgram = (program) => {
  GLctx.validateProgram(GL.programs[program]);
};

function _glVertex2f() { debugger }

function _glVertex3f() { debugger }

function _glVertex3fv() { debugger }

var _glVertexAttribPointer = (index, size, type, normalized, stride, ptr) => {
  var cb = GL.currentContext.clientBuffers[index];
  if (!GLctx.currentArrayBufferBinding) {
    cb.size = size;
    cb.type = type;
    cb.normalized = normalized;
    cb.stride = stride;
    cb.ptr = ptr;
    cb.clientside = true;
    cb.vertexAttribPointerAdaptor = function(index, size, type, normalized, stride, ptr) {
      this.vertexAttribPointer(index, size, type, normalized, stride, ptr);
    };
    return;
  }
  cb.clientside = false;
  GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
};

var _glVertexPointer = (size, type, stride, ptr) => {
  throw 'Legacy GL function (glVertexPointer) called. If you want legacy GL emulation, you need to compile with -sLEGACY_GL_EMULATION to enable legacy GL emulation.';
};

var _glViewport = (x0, x1, x2, x3) => GLctx.viewport(x0, x1, x2, x3);


let GLctx;

for (var i = 0; i < 32; ++i) tempFixedLengthArray.push(new Array(i));;
var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
  // Create GL_POOL_TEMP_BUFFERS_SIZE+1 temporary buffers, for uploads of size 0 through GL_POOL_TEMP_BUFFERS_SIZE inclusive
  for (/**@suppress{duplicate}*/var i = 0; i <= 288; ++i) {
    miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(0, i);
  };

let EMGL = window.EMGL = {
  previousName: '',
  previousImage: null,
  previousTex: 0,
  texFiles: [],
  GL_GetProcAddress: function () { },
  "glActiveTexture": _glActiveTexture,
  "glAlphaFunc": _glAlphaFunc,
  "glArrayElement": _glArrayElement,
  "glAttachShader": _glAttachShader,
  "glBegin": _glBegin,
  "glBindAttribLocation": _glBindAttribLocation,
  "glBindBuffer": _glBindBuffer,
  "glBindFramebuffer": _glBindFramebuffer,
  "glBindRenderbuffer": _glBindRenderbuffer,
  "glBindTexture": _glBindTexture,
  "glBindVertexArray": _glBindVertexArray,
  "glBlendFunc": _glBlendFunc,
  "glBlitFramebuffer": _glBlitFramebuffer,
  "glBufferData": _glBufferData,
  "glBufferSubData": _glBufferSubData,
  "glCheckFramebufferStatus": _glCheckFramebufferStatus,
  "glClear": _glClear,
  "glClearColor": _glClearColor,
  "glClearDepth": _glClearDepth,
  "glClearStencil": _glClearStencil,
  "glClipPlane": _glClipPlane,
  "glColor3f": _glColor3f,
  "glColor4f": _glColor4f,
  "glColor4ubv": _glColor4ubv,
  "glColorMask": _glColorMask,
  "glColorPointer": _glColorPointer,
  "glCompileShader": _glCompileShader,
  "glCompressedTexImage2D": _glCompressedTexImage2D,
  "glCompressedTexSubImage2D": _glCompressedTexSubImage2D,
  "glCopyTexSubImage2D": _glCopyTexSubImage2D,
  "glCreateProgram": _glCreateProgram,
  "glCreateShader": _glCreateShader,
  "glCullFace": _glCullFace,
  "glDeleteBuffers": _glDeleteBuffers,
  "glDeleteFramebuffers": _glDeleteFramebuffers,
  "glDeleteProgram": _glDeleteProgram,
  "glDeleteRenderbuffers": _glDeleteRenderbuffers,
  "glDeleteShader": _glDeleteShader,
  "glDeleteTextures": _glDeleteTextures,
  "glDeleteVertexArrays": _glDeleteVertexArrays,
  "glDepthFunc": _glDepthFunc,
  "glDepthMask": _glDepthMask,
  "glDepthRange": _glDepthRange,
  "glDetachShader": _glDetachShader,
  "glDisable": _glDisable,
  "glDisableClientState": _glDisableClientState,
  "glDisableVertexAttribArray": _glDisableVertexAttribArray,
  "glDrawArrays": _glDrawArrays,
  "glDrawBuffer": _glDrawBuffer,
  "glDrawBuffers": _glDrawBuffers,
  "glDrawElements": _glDrawElements,
  "glEnable": _glEnable,
  "glEnableClientState": _glEnableClientState,
  "glEnableVertexAttribArray": _glEnableVertexAttribArray,
  "glEnd": _glEnd,
  "glFinish": _glFinish,
  "glFlush": _glFlush,
  "glFramebufferRenderbuffer": _glFramebufferRenderbuffer,
  "glFramebufferTexture2D": _glFramebufferTexture2D,
  "glFrustum": _glFrustum,
  "glGenBuffers": _glGenBuffers,
  "glGenFramebuffers": _glGenFramebuffers,
  "glGenRenderbuffers": _glGenRenderbuffers,
  "glGenTextures": _glGenTextures,
  "glGenVertexArrays": _glGenVertexArrays,
  "glGenerateMipmap": _glGenerateMipmap,
  "glGetActiveUniform": _glGetActiveUniform,
  "glGetBooleanv": _glGetBooleanv,
  "glGetError": _glGetError,
  "glGetIntegerv": _glGetIntegerv,
  "glGetProgramInfoLog": _glGetProgramInfoLog,
  "glGetProgramiv": _glGetProgramiv,
  "glGetShaderInfoLog": _glGetShaderInfoLog,
  "glGetShaderSource": _glGetShaderSource,
  "glGetShaderiv": _glGetShaderiv,
  "glGetString": _glGetString,
  "glGetStringi": _glGetStringi,
  "glGetUniformLocation": _glGetUniformLocation,
  "glLineWidth": _glLineWidth,
  "glLinkProgram": _glLinkProgram,
  "glLoadIdentity": _glLoadIdentity,
  "glLoadMatrixf": _glLoadMatrixf,
  "glMapBufferRange": _glMapBufferRange,
  "glMatrixMode": _glMatrixMode,
  "glOrtho": _glOrtho,
  "glPolygonMode": _glPolygonMode,
  "glPolygonOffset": _glPolygonOffset,
  "glPopMatrix": _glPopMatrix,
  "glPushMatrix": _glPushMatrix,
  "glReadBuffer": _glReadBuffer,
  "glReadPixels": _glReadPixels,
  "glRenderbufferStorage": _glRenderbufferStorage,
  "glRenderbufferStorageMultisample": _glRenderbufferStorageMultisample,
  "glScissor": _glScissor,
  "glShadeModel": _glShadeModel,
  "glShaderSource": _glShaderSource,
  "glStencilFunc": _glStencilFunc,
  "glStencilMask": _glStencilMask,
  "glStencilOp": _glStencilOp,
  "glTexCoord2f": _glTexCoord2f,
  "glTexCoord2fv": _glTexCoord2fv,
  "glTexCoordPointer": _glTexCoordPointer,
  "glTexEnvf": _glTexEnvf,
  "glTexImage2D": _glTexImage2D,
  "glTexParameterf": _glTexParameterf,
  "glTexParameteri": _glTexParameteri,
  "glTexSubImage2D": _glTexSubImage2D,
  "glTranslatef": _glTranslatef,
  "glUniform1f": _glUniform1f,
  "glUniform1fv": _glUniform1fv,
  "glUniform1i": _glUniform1i,
  "glUniform2f": _glUniform2f,
  "glUniform3f": _glUniform3f,
  "glUniform4f": _glUniform4f,
  "glUniformMatrix4fv": _glUniformMatrix4fv,
  "glUnmapBuffer": _glUnmapBuffer,
  "glUseProgram": _glUseProgram,
  "glValidateProgram": _glValidateProgram,
  "glVertex2f": _glVertex2f,
  "glVertex3f": _glVertex3f,
  "glVertex3fv": _glVertex3fv,
  "glVertexAttribPointer": _glVertexAttribPointer,
  "glVertexPointer": _glVertexPointer,
  "glViewport": _glViewport,
  glGenQueries: function () { },
  glDeleteQueries: function () { },
  glBeginQuery: function () { },
  glEndQuery: function () { },
  glGetQueryObjectiv: function () { },
  glGetQueryObjectuiv: function () { },
  glTextureParameterfEXT: function () { },
  glBindMultiTextureEXT: function () { },
  glTextureParameteriEXT: function () { },
  glTextureImage2DEXT: function () { },
  glTextureSubImage2DEXT: function () { },
  glCopyTextureSubImage2DEXT: function () { },
  glCompressedTextureImage2DEXT: function () { },
  glCompressedTextureSubImage2DEXT: function () { },
  glGenerateTextureMipmapEXT: function () { },
  glProgramUniform1iEXT: function () { },
  glProgramUniform1fEXT: function () { },
  glProgramUniform2fEXT: function () { },
  glProgramUniform3fEXT: function () { },
  glProgramUniform4fEXT: function () { },
  glProgramUniform1fvEXT: function () { },
  glProgramUniformMatrix4fvEXT: function () { },
  glNamedRenderbufferStorageEXT: function () { },
  glNamedRenderbufferStorageMultisampleEXT: function () { },
  glCheckNamedFramebufferStatusEXT: function () { },
  glNamedFramebufferRenderbufferEXT: function () { },
  glNamedFramebufferTexture2DEXT: function () { },


  glBindBufferARB: function () { },
  glBlitFramebuffer: function () { },
  glBufferDataARB: function () { },
  glDeleteBuffersARB: function () { },
  glGenBuffersARB: function () { },
  glGetInternalformativ: function () { },
  glRenderbufferStorageMultisample: function () { },
  

}

