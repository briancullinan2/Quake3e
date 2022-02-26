// this bastard only connects the functions together for emscripten's screwy non-standard, 
//   obviously written by people who only know how to write python's, module system.
function GL_GetProcAddress() {

}

let ARB = {
  glBindBufferARB: function (target, buffer) { 
    if (target == 0x8892 /*GL_ARRAY_BUFFER*/) {
      GLctx.currentArrayBufferBinding = buffer;
    } else if (target == 0x8893 /*GL_ELEMENT_ARRAY_BUFFER*/) {
      GLctx.currentElementArrayBufferBinding = buffer;
    }
  },

}


let LibrarySys = {
  glAlphaFunc: function () {},
  glArrayElement: function () {},
  glClipPlane: function () {},
  glColor3f: function () {},
  glColor4f: function () {},
  glColor4ubv: function () {},
  glColorPointer: function () {},
  glDisableClientState: function () {},
  glDrawBuffer: function () {},
  glEnableClientState: function () {},
  glEnd: function () {},
  glFrustum: function () {},
  glLoadMatrixf: function () {},
  glOrtho: function () {},
  glPolygonMode: function () {},
  glPopMatrix: function () {},
  glPushMatrix: function () {},
  glShadeModel: function () {},
  glTexCoord2f: function () {},
  glTexCoord2fv: function () {},
  glTexCoordPointer: function () {},
  glTexEnvf: function () {},
  glTranslatef: function () {},
  glVertex2f: function () {},
  glVertex3f: function () {},
  glVertex3fv: function () {},
  glProgramUniform4fEXT: function () {},
  glProgramUniform1fvEXT: function () {},
  glProgramUniform1fEXT: function () {},
  glTextureImage2DEXT: function () {},
  /*
  glDeletePrograms: function () {},
  glGenPrograms: function (size, programs) {
    for(let i = 0; i < size; i++) {
      ++ARB.numProgramPointers
      //ARB.programPointers[ARB.numProgramPointers] = Q3e.webgl.createProgram()
      HEAP32[(programs >> 2) + i] = ARB.numProgramPointers
    }
  },
  glBindProgramARB: function (program) {
    debugger
  },
  glLockArrays: function () {},
  glMultiTexCoord2f: function () { debugger },
  glProgramLocalParameter4f: function () {},
  glProgramLocalParameter4fv: function () {},
  glProgramString: function () {},
  glUnlockArrays: function () {},
  */
  glUnmapBuffer: function () {},
  glMapBufferRange: function () {},
  GL_GetProcAddress: GL_GetProcAddress,
  Com_RealTime: Com_RealTime,
  assert_fail: function (fail) {
    console.assert(fail)
  },
	$SYS__deps: ['$GL'],
	$SYS: {
    checkPasteEvent: checkPasteEvent,
    getMovementX: getMovementX,
    getMovementY: getMovementY,
    openDatabase: openDatabase,
    writeStore: writeStore,
    InputInit: InputInit,
    SDL_ShowCursor: SDL_ShowCursor,
    InputPushKeyEvent: InputPushKeyEvent,
    InputPushTextEvent: InputPushTextEvent,
    InputPushMovedEvent: InputPushMovedEvent,
    resizeViewport: resizeViewport,
    InputPushMouseEvent: InputPushMouseEvent,
    InputPushWheelEvent: InputPushWheelEvent,
    InputPushFocusEvent: InputPushFocusEvent,
    DB_STORE_NAME: DB_STORE_NAME,
    stringToAddress: stringToAddress,
    addressToString: addressToString,
    stringsToMemory: stringsToMemory,
    controller: null,
    numProgramPointers: 0,
    pointers: {},
    filePointer: 0,
    virtual: {}, // temporarily store items as they go in and out of memory
    keystrings: {},
    SE_NONE: 0,	// evTime is still valid
    SE_KEY: 1,		// evValue is a key code, evValue2 is the down flag
    SE_FINGER_DOWN: 2,
    SE_FINGER_UP: 3,
    SE_CHAR: 4,	// evValue is an ascii char
    SE_MOUSE: 5,	// evValue and evValue2 are relative signed x / y moves
    SE_MOUSE_ABS: 6,
    SE_JOYSTICK_AXIS: 7,	// evValue is an axis number and evValue2 is the current state (-127 to 127)
    SE_CONSOLE: 8,	// evPtr is a char*
    SE_MAX: 9,
    SE_DROPBEGIN: 10,
    SE_DROPCOMPLETE: 11,
    SE_DROPFILE: 12,
    SE_DROPTEXT: 13,
    KEYCATCH_CONSOLE: 0x0001,
    KEYCATCH_UI     :  0x0002,
    KEYCATCH_MESSAGE:  0x0004,
    KEYCATCH_CGAME  :  0x0008,
  }
}

// assign everything to env because this bullshit don't work
Object.assign(LibrarySys, Q3e, SYS, FS, NET, INPUT, ARB)

autoAddDeps(LibrarySys, '$SYS')
mergeInto(LibraryManager.library, LibrarySys)
