if(typeof global != 'undefined' && typeof global.window == 'undefined') {
  global.window = {}
}

function addressToString(addr, length) {
  let newString = ''
  for(let i = 0; i < length || 1024; i++) {
    if(Q3e['paged'][addr + i] == '0') {
      break;
    }
    newString += String.fromCharCode(Q3e['paged'][addr + i])
  }
  return newString
}

function stringsToMemory(addr, list, ) {
  let posInSeries = addr + list.length // add list length so we can return addresses like char **
  for (let i = 0; i < list.length; i++) {
    Q3e.paged32[(addr+i*4)>>2] = posInSeries // save the starting address in the list
    for(let j = 0; j < list[i].length; j++) {
      Q3e.paged[posInSeries+j] = list[i].charCodeAt(j)
    }
    Q3e.paged[posInSeries+list[i].length] = 0
    posInSeries += list[i].length + 1
  }
  return posInSeries + list.length
}

function Sys_ListFiles (directory, ext, filter, numfiles, dironly) {
  let files = {
    'default.cfg': {
      mtime: 0,
      size: 1024,
      
    }
  }
  let matches = Object.keys(files).reduce(function (list, name) {
   // TODO: match directory 
   return !ext || name.lastIndexOf(ext) === (name.length - ext.length)
  }, [])
  /* let inMemory = */ stringsToMemory(Q3e.shared + Q3e.sharedCounter, matches)
  Q3e.paged32[(numfiles+0)>>2] = matches.length;
  // here's the thing, I know for a fact that all the callers copy this stuff
  //   so I don't need to increase my temporary storage because by the time it's
  //   overwritten the data won't be needed, should only keep shared storage around
  //   for events and stuff that might take more than 1 frame
  //Q3e.sharedCounter += inMemory
  return Q3e.shared + Q3e.sharedCounter + matches.length // skip address-list because for loop is used with numfiles
}

function Sys_Offline() {

}

function Sys_NET_MulticastLocal (net, length, data) {
  // all this does is use a dedicated server in a service worker
  window.serverWorker.postMessage([
    'net', net, Uint8Array.from(HEAP8.slice(data, data+length))])
}

function SDL_GetDesktopDisplayMode(display, mode) {
  Q3e.paged32[(mode+1)>>2] = window.innerWidth
  Q3e.paged32[(mode+2)>>2] = window.innerHeight
}


function SDL_GL_GetDrawableSize(display, width, height) {
  Q3e.paged32[(width+0)>>2] = Q3e.canvas.width
  Q3e.paged32[(height+0)>>2] = Q3e.canvas.height
}

function SDL_CreateWindow (title, x, y, w, h, flags) {
  //var win = malloc(8)
  // TODO: multiple windows like a DVR?
  //   what kind of game needs two screens for one player to switch back and forth?
  /*
  SDL.windows[handle] = {
    x: x,
    y: y,
    w: w,
    h: h,
    title: title,
    flags: flags,
  }
  */
  Q3e.canvas = document.createElement('canvas')
  Q3e.canvas.width = document.body.innerWidth
  Q3e.canvas.height = document.body.innerHeight
  document.getElementById('viewport-frame').appendChild(Q3e.canvas)

  //Q3e.paged32[win>>2] = 1
  window.title = addressToString(title)
  return 1 //win;
}

function SDL_GL_CreateContext(canvas) {
  // TODO: keep track of multiple?
  let webGLContextAttributes = {
    failIfMajorPerformanceCaveat: true
  }
  Q3e['webgl'] = (Q3e.majorVersion > 1)
    ? Q3e.canvas.getContext('webgl2', webGLContextAttributes)
    : (Q3e.canvas.getContext('webgl', webGLContextAttributes)
      || Q3e.canvas.getContext('experimental-webgl'))
  if (!Q3e['webgl']) return 0
  //let handle = malloc(8);
  //Q3e.paged32[handle>>2] = 1
  return 1 // handle
}

function SDL_GL_SetAttribute(attr, value) {
  Q3e.majorVersion = value
}

function SDL_GetError() {
  stringsToMemory(Q3e.shared + Q3e.sharedCounter, ['Unknown WebGL error.'])
  return Q3e.shared + Q3e.sharedCounter + 1
}

function SDL_SetWindowDisplayMode () { 
  // TODO: add a button or something for user
} 

function SDL_SetWindowGrab (window, grabbed) {
  // set the window to do the grabbing, when ungrabbing this doesn't really matter
  if(grabbed) {
    Q3e.canvas.requestPointerLock();
  } else {
    Q3e.canvas.exitPointerLock();
  }
}

function SDL_StopTextInput () {
  SDL.textInput = false;
}

function SDL_ShowCursor() {
  // TODO: some safety stuff?
  Q3e.canvas.exitPointerLock();
}

function CL_Download(cmd, name, auto) {
  fetch(addressToString(name))
}

function Sys_UnloadLibrary() {

}

function Sys_LoadLibrary() {
  
}

function Sys_LoadFunction() {
  
}

var Q3e = {
  DebugBreak: function () { debugger; },
  longjmp: function (id, code) { throw new Error('longjmp', id, code) },
  setjmp: function (id) { try {  } catch (e) { } },
  CL_Download: CL_Download,
  SDL_GetDesktopDisplayMode: SDL_GetDesktopDisplayMode,
  SDL_GL_SetAttribute: SDL_GL_SetAttribute,
  SDL_CreateWindow: SDL_CreateWindow,
  SDL_GetError: SDL_GetError,
  SDL_SetWindowDisplayMode: SDL_SetWindowDisplayMode,
  SDL_GL_CreateContext: SDL_GL_CreateContext,
  SDL_GL_GetDrawableSize: SDL_GL_GetDrawableSize,
  SDL_WasInit: function (device) { return 1; },
  SDL_Init: function () {},
  SDL_OpenAudioDevice: function () {},
  SDL_PauseAudioDevice: function () {},
  SDL_CloseAudioDevice: function () {},
  SDL_StopTextInput: SDL_StopTextInput,
  SDL_SetWindowGrab: SDL_SetWindowGrab,
  SDL_ShowCursor: SDL_ShowCursor,
  Sys_RandomBytes: Sys_RandomBytes,
  Sys_Milliseconds: Sys_Milliseconds,
  Sys_Offline: Sys_Offline,
  Sys_NET_MulticastLocal: Sys_NET_MulticastLocal,
  Sys_Exit: function () {
    // TODO: was Sys_Main_PlatformExit
  },
  Sys_Error: Sys_Error,
  
  Sys_UnloadLibrary: Sys_UnloadLibrary,
  Sys_LoadLibrary: Sys_LoadLibrary,
  Sys_LoadFunction: Sys_LoadFunction,

  fprintf: function (f, err, args) {
    // TODO: rewrite va_args in JS for convenience?
    console.log(addressToString(err), addressToString(Q3e.paged32[(args) >> 2]));
  },
  srand: function srand() {}, // TODO: highly under-appreciated game dynamic
  atoi: function (i) { return parseInt(addressToString(i)) },
  atof: function (f) { return parseFloat(addressToString(f)) },
  strtof: function (f, n) { 
    // TODO: convert this to some sort of template?
    let str = addressToString(f)
    let result = parseFloat(str)
    if(isNaN(result)) {
      if(n) Q3e.paged32[(n) >> 2] = f
      return 0
    } else {
      if(n) Q3e.paged32[(n) >> 2] = f + str.length
      return result
    }
  },
  popen: function popen() {},
  assert: console.assert, // TODO: convert to variadic fmt for help messages
  asctime: function () {
    // Don't really care what time it is because this is what the engine does
    //   right above this call
    stringsToMemory(Q3e.shared + Q3e.sharedCounter, [new Date().toLocaleString()])
    return Q3e.shared + Q3e.sharedCounter + 1
  },
  Sys_Print: Sys_Print,


}

// These can be assigned automatically? but only because they deal only with numbers and not strings
//   TODO: What about converting between float, endian, and shorts?
let maths = Object.getOwnPropertyNames(Math)
for(let j = 0; j < maths.length; j++) {
  Q3e[maths[j] + 'f'] = Math[maths[j]]
  Q3e[maths[j]] = Math[maths[j]]
}

var GL = {
  textures: [],
  colorChannels: [
    // 0x1902 /* GL_DEPTH_COMPONENT */: 1,
    // 0x1906 /* GL_ALPHA */: 1,
    /* 0x1907 /* GL_RGB */  3,
    /* 0x1908 /* GL_RGBA */  4,
    // 0x1909 /* GL_LUMINANCE */: 1,
    /* 0x190A /*GL_LUMINANCE_ALPHA*/  2,
    /* 0x8C40 /*(GL_SRGB_EXT)*/  3,
    /* 0x8C42 /*(GL_SRGB_ALPHA_EXT*/  4,
// webgl2
    // 0x1903 /* GL_RED */: 1,
    /* 0x8227 /*GL_RG*/  2,
    /* 0x8228 /*GL_RG_INTEGER*/  2,
    // 0x8D94 /* GL_RED_INTEGER */: 1,
    /* 0x8D98 /*GL_RGB_INTEGER*/  3,
    /* 0x8D99 /*GL_RGBA_INTEGER*/  4
  ],
  // in non-dll mode, this just returns the exported function returned from importing
  GL_GetProcAddress: function (fn) {
    // TODO: REND1.exports?
    let realFunction = Q3e.exports[addressToString(fn) + 'Real']
    if(!realFunction)
      debugger
    for(let i = 0; i < Q3e.table.length; i++) {
      if(Q3e.table.get(i) == realFunction) {
        return i
      }
    }
    Q3e.table.set(Q3e.tableCount--, realFunction)
    return Q3e.tableCount+1
  },
  glDisable: function () {},
  glEnable: function () {},
  glBindProgramARB: function () {},
  glProgramLocalParameter4fARB: function () {},
  glProgramLocalParameter4fvARB: function () {},
  glPolygonOffset: function () {},
  glTexCoordPointer: function () {},
  glNormalPointer: function () {},
  glVertexPointer: function () {},
  glLockArraysEXT: function () {},
  glUnlockArraysEXT: function () {},
  glProgramStringARB: function () {},
  glGetIntegerv: function (pname, param) {
    switch (pname) {
      case 0x8872 /* GL_MAX_TEXTURE_IMAGE_UNITS */: 
        Q3e.paged32[(param) >> 2] = Q3e.webgl.MAX_TEXTURE_IMAGE_UNITS
        break
      case 0x0D33 /* GL_MAX_TEXTURE_SIZE */:
        Q3e.paged32[(param) >> 2] = Q3e.webgl.MAX_TEXTURE_SIZE
        break
      case 0x8B4D /* GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS */:
        Q3e.paged32[(param) >> 2] = Q3e.webgl.MAX_COMBINED_TEXTURE_IMAGE_UNITS
        break
      case 0x864B /* GL_PROGRAM_ERROR_POSITION_ARB */:
        // TODO: make something up?
        break
      default:
        debugger
    }
  },
  glGetError: function () {},
  glGetString: function (id) {
    switch(id) {
      case 0x1F03 /* GL_EXTENSIONS */:
        stringsToMemory(Q3e.shared + Q3e.sharedCounter, Q3e.webgl.getSupportedExtensions())
        return Q3e.shared + Q3e.sharedCounter
      case 0x1F00 /* GL_VENDOR */:
      case 0x1F01 /* GL_RENDERER */:
      case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
      case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
      case 0x1F02 /* GL_VERSION */:
      case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
        stringsToMemory(Q3e.shared + Q3e.sharedCounter, ['' + Q3e.webgl.getParameter(id)]);
        return Q3e.shared + Q3e.sharedCounter + 1
      case 0x8874 /* GL_PROGRAM_ERROR_STRING_ARB */ :
        break
      default:
        return 0

    }
  },
  glDeleteProgramsARB: function () {},
  glGenProgramsARB: function () {},
  glBindRenderbuffer: function () {},
  glDeleteRenderbuffers: function () {},
  glFramebufferTexture2D: function () {},
  glDeleteTextures: function () {},
  glDeleteFramebuffers: function () {},
  glBindFramebuffer: function () {},
  glBlitFramebuffer: function () {},
  glViewport: function () {},
  glScissor: function () {},
  glMatrixMode: function () {},
  glLoadMatrixf: function () {},
  glLoadIdentity: function () {},
  glColor4f: function () {},
  glDrawArrays: function () {
    debugger
  },
  glColorPointer: function () {},
  glDrawBuffer: function () {},
  glClearColor: function () {},
  glClear: function () {},
  glColorMask: function () {},
  glGenFramebuffers: function () {},
  glGenRenderbuffers: function () {},
  glRenderbufferStorageMultisample: function () {},
  glFramebufferRenderbuffer: function () {},
  glCheckFramebufferStatus: function () {},
  glGenTextures: function (n, textures) {
    GL.textures.push(Q3e.webgl.createTexture())
    Q3e.paged32[textures >> 2] = GL.textures.length
  },
  glTexParameteri: function (target, pname, param) { 
    if(param == 0x2900) {
      param = 0x812F /*GL_CLAMP_TO_EDGE*/
    }
    Q3e.webgl.texParameteri(target, pname, param) 
  },
  glTexImage2D: function (target, level, internalFormat, width, height, border, format, type, pixels) {
    if(target != 0x0DE1) {
      debugger
    }
    let computedSize = width * height * GL.colorChannels[format - 0x1902]
    let imageView = Q3e.paged.subarray(pixels, pixels + computedSize)
    Q3e.webgl.texImage2D(target, level, internalFormat, width, height, border, format, type, null) 
  },
  glGetInternalformativ: function () {},
  glBindTexture: function (target, id) { Q3e.webgl.bindTexture(target, GL.textures[id - 1]) },
  glActiveTextureARB: function (unit) { Q3e.webgl.activeTexture(unit) },
  glCullFace: function (side) { Q3e.webgl.cullFace(side) },
  glTexEnvi: function () {},
  glDepthFunc: function (depth) { Q3e.webgl.depthFunc(depth) },
  glBlendFunc: function () {},
  glDepthMask: function (mask) { Q3e.webgl.depthMask(mask) },
  glPolygonMode: function () {},
  glAlphaFunc: function () {},
  glEnableClientState: function () {},
  glDisableClientState: function () {},
  glClientActiveTextureARB: function () {},
  glTexSubImage2D: function (a1, a2, a3, a4, a5, a6, a7) { 
    Q3e.webgl.texSubImage2D(a1, a2, a3, a4, a5, a6, a7) 
  },
  glFinish: function () {
    debugger
  },
  glDepthRange: function (range) { Q3e.webgl.depthRange(range) },
  glPushMatrix: function () {},
  glPopMatrix: function () {},
  glReadPixels: function () {},
  glClearDepth: function () {},
  glShadeModel: function () {},
  glDrawElements: function () {
    debugger
  },
  glGetBooleanv: function () {},
  glLineWidth: function () {},
  glStencilFunc: function () {},
  glStencilOp: function () {},
  glMultiTexCoord2fARB: function () {},
  glGenBuffersARB: function () {},
  glDeleteBuffersARB: function () {},
  glBindBufferARB: function () {},
  glBufferDataARB: function () {},
  glRenderbufferStorage: function () {},
  glGetRenderbufferParameteriv: function () {},
  glIsFramebuffer: function () {},
  glGetFramebufferAttachmentParameteriv: function () {},

}

var NET = {
  Sys_SockaddrToString: Sys_SockaddrToString,
  Sys_StringToSockaddr: Sys_StringToSockaddr,
  NET_GetPacket: NET_GetPacket,
  NET_Sleep: NET_Sleep,
  NET_SendPacket: NET_SendPacket,
  NET_OpenIP: NET_OpenIP,
  Sys_StringToAdr: Sys_StringToAdr,
  Sys_SendPacket: Sys_SendPacket,
  Sys_IsLANAddress: Sys_IsLANAddress,

}

var FS = {
  Sys_ListFiles: Sys_ListFiles,
  Sys_FTell: Sys_FTell,
  Sys_FSeek: Sys_FSeek,
  Sys_FClose: Sys_FClose,
  Sys_FWrite: Sys_FWrite,
  Sys_FFlush: Sys_FFlush,
  Sys_FRead: Sys_FRead,
  Sys_FOpen: Sys_FOpen,
  Sys_Remove: Sys_Remove,
  Sys_Rename: Sys_Rename,

}

window.Q3e = Q3e
init(Q3e)

function init(env) {
  fetch('./quake3e_slim.wasm').then(function(response) {
    return response.arrayBuffer()
  }).then(function(bytes) {
    Q3e['imports'] = env
    Q3e['tableCount'] = 511
    Q3e['table'] = Q3e['__indirect_function_table'] =
      new WebAssembly.Table({ initial: 512, element: 'anyfunc' });
    Q3e['memory'] = new WebAssembly.Memory( {
      'initial': 2048,
      //'shared': true
    } )
    Q3e['paged'] = new Uint8Array( Q3e['memory'].buffer )
    Q3e['paged32'] = new Uint32Array( Q3e['memory'].buffer )
    Q3e['paged32f'] = new Float32Array( Q3e['memory'].buffer )
    return WebAssembly.instantiate(bytes, { env: env, GL: GL, Math: Math, FS: FS, NET: NET })
  }).then(function(program) {
    // share the game with window for hackers
    Q3e['program'] = program
    Q3e['instance'] = program.instance
    Q3e['exports'] = program.instance.exports
    let newMethods = Object.keys(Q3e['exports'])
    for(let i = 0; i < newMethods.length; i++) {
      window[newMethods[i]] = Q3e['exports'][newMethods[i]] //.apply(Q3e['exports'])
    }
    Object.assign(window, Q3e['exports'])

    // reserve some memory at the beginning for passing shit back and forth with JS
    //   not to use a complex HEAP, just loop around on bytes[b % 128] and if 
    //   something isn't cleared out, crash
    //Q3e['inputMemory'] = malloc(1024 * 1024) // store inputs in it's own space
    Q3e['glProcAddresses'] = malloc(1024 * 4) // store function points between plugins
    Q3e['shared'] = malloc(1024 * 1024) // store some strings and crap
    Q3e['sharedCounter'] = 0

    // Wow, look at all the unfuckery I don't have to do with startup options because
    //   I'm not using emscripten anymore.
    let startup = [
      'quake3e_web',
      '+set', 'fs_basepath', '/base',
      '+set', 'sv_pure', '0', // require for now, TODO: server side zips
    ];
    let startupArgs = stringsToMemory(Q3e.shared + Q3e.sharedCounter, startup);
    let posArgInMemory = Q3e.shared + Q3e.sharedCounter
    // Whoops, startup args is expecting a char ** list
    Q3e.sharedCounter += startupArgs // add total length of stringsToMemory
    // start a brand new call frame
    setTimeout(function () {
      try {
        RunGame(startup.length, posArgInMemory)
        setInterval(requestAnimationFrame.bind(null, Q3e.exports.Com_Frame), 1000 / 60);
      } catch (e) {
        console.log(e)
      }
    }, 13)
    return true
  });
}

function Sys_Milliseconds() {
  // javascript times are bigger, so start at zero
  if (!Q3e['timeBase']) {
    Q3e['timeBase'] = Date.now();
  }

  if (window.performance.now) {
    return parseInt(window.performance.now(), 10);
  } else if (window.performance.webkitNow) {
    return parseInt(window.performance.webkitNow(), 10);
  } else {
    return Date.now() - SYS.timeBase();
  }
}

function Sys_RandomBytes (string, len) {
	if(typeof crypto != 'undefined') {
		crypto.getRandomValues(Q3e.paged.subarray(string, string+len))
	} else {
		for(var i = 0; i < len; i++) {
			Q3e.paged[string] = Math.random() * 255
		}
	}
	return true;
}

function Sys_SockaddrToString() {
  // DNS doesn't work in the browser, but UDP works with SOCKS
  //   How complicated to add DNS lookup through SOCK?
}

function Sys_StringToAdr() {

}

function Sys_StringToSockaddr() {
  
}

function Sys_SendPacket() {

}

function NET_GetPacket() {

}

function NET_Sleep() {

}

function NET_SendPacket() {

}

function NET_OpenIP() {

}

function Sys_IsLANAddress() {
  
}

function Sys_Print(message) {
  console.log(addressToString(message))
}

function Sys_Error(fmt, args) {
  let len = BG_sprintf(Q3e.shared + Q3e.sharedCounter, fmt, args)
  if(len > 0)
    console.log('Sys_Error: ', addressToString(Q3e.shared + Q3e.sharedCounter))
  throw new Error(addressToString(fmt))
}

function Sys_FOpen() {

}

function Sys_FTell() {

}

function Sys_FSeek() {

}

function Sys_FClose() {

}

function Sys_FWrite() {

}

function Sys_FFlush() {

}

function Sys_FRead() {

}

function Sys_Remove() {

}

function Sys_Rename() {

}
