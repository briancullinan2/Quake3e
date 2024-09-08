// include: shell.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module != 'undefined' ? Module : {};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == 'object';
var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
}

if (ENVIRONMENT_IS_NODE) {
  // `require()` is no-op in an ESM module, use `createRequire()` to construct
  // the require()` function.  This is only necessary for multi-environment
  // builds, `-sENVIRONMENT=node` emits a static import declaration instead.
  // TODO: Swap all `require()`'s with `import()`'s?

}

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = Object.assign({}, Module);

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  if (typeof process == 'undefined' || !process.release || process.release.name !== 'node') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  var nodeVersion = process.versions.node;
  var numericVersion = nodeVersion.split('.').slice(0, 3);
  numericVersion = (numericVersion[0] * 10000) + (numericVersion[1] * 100) + (numericVersion[2].split('-')[0] * 1);
  var minVersion = 160000;
  if (numericVersion < 160000) {
    throw new Error('This emscripten-generated code requires node v16.0.0 (detected v' + nodeVersion + ')');
  }

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('fs');
  var nodePath = require('path');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs. Normalizing isn't
  // necessary in that case, the path should already be absolute.
  filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
  var ret = fs.readFileSync(filename);
  assert(ret.buffer);
  return ret;
};

readAsync = (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
  return new Promise((resolve, reject) => {
    fs.readFile(filename, binary ? undefined : 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(binary ? data.buffer : data);
    });
  });
};
// end include: node_shell_read.js
  if (!Module['thisProgram'] && process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  arguments_ = process.argv.slice(2);

  if (typeof module != 'undefined') {
    module['exports'] = Module;
  }

  process.on('uncaughtException', (ex) => {
    // suppress ExitStatus exceptions from showing an error
    if (ex !== 'unwind' && !(ex instanceof ExitStatus) && !(ex.context instanceof ExitStatus)) {
      throw ex;
    }
  });

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else
if (ENVIRONMENT_IS_SHELL) {

  if ((typeof process == 'object' && typeof require === 'function') || typeof window == 'object' || typeof importScripts == 'function') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (typeof document != 'undefined' && document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
  // they are removed because they could contain a slash.
  if (scriptDirectory.startsWith('blob:')) {
    scriptDirectory = '';
  } else {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/')+1);
  }

  if (!(typeof window == 'object' || typeof importScripts == 'function')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = (url) => {
    // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
    // See https://github.com/github/fetch/pull/92#issuecomment-140665932
    // Cordova or Electron apps are typically loaded from a file:// url.
    // So use XHR on webview if URL is a file URL.
    if (isFileURI(url)) {
      return new Promise((reject, resolve) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => {
          if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
            resolve(xhr.response);
          }
          reject(xhr.status);
        };
        xhr.onerror = reject;
        xhr.send(null);
      });
    }
    return fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (response.ok) {
          return response.arrayBuffer();
        }
        return Promise.reject(new Error(response.status + ' : ' + response.url));
      })
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

var out = Module['print'] || console.log.bind(console);
var err = Module['printErr'] || console.error.bind(console);

// Merge back in the overrides
Object.assign(Module, moduleOverrides);
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used.
moduleOverrides = null;
checkIncomingModuleAPI();

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.

if (Module['arguments']) arguments_ = Module['arguments'];legacyModuleProp('arguments', 'arguments_');

if (Module['thisProgram']) thisProgram = Module['thisProgram'];legacyModuleProp('thisProgram', 'thisProgram');

if (Module['quit']) quit_ = Module['quit'];legacyModuleProp('quit', 'quit_');

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// Assertions on removed incoming Module JS APIs.
assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
legacyModuleProp('asm', 'wasmExports');
legacyModuleProp('readAsync', 'readAsync');
legacyModuleProp('readBinary', 'readBinary');
legacyModuleProp('setWindowTitle', 'setWindowTitle');
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

assert(!ENVIRONMENT_IS_SHELL, 'shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.');

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary; 
if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];legacyModuleProp('wasmBinary', 'wasmBinary');

if (typeof WebAssembly != 'object') {
  err('no native wasm support detected');
}

// Wasm globals

var wasmMemory;

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.

// Memory management

var HEAP,
/** @type {!Int8Array} */
  HEAP8,
/** @type {!Uint8Array} */
  HEAPU8,
/** @type {!Int16Array} */
  HEAP16,
/** @type {!Uint16Array} */
  HEAPU16,
/** @type {!Int32Array} */
  HEAP32,
/** @type {!Uint32Array} */
  HEAPU32,
/** @type {!Float32Array} */
  HEAPF32,
/** @type {!Float64Array} */
  HEAPF64;

// include: runtime_shared.js
function updateMemoryViews() {
  var b = wasmMemory.buffer;
  Module['HEAP8'] = HEAP8 = new Int8Array(b);
  Module['HEAP16'] = HEAP16 = new Int16Array(b);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
  Module['HEAP32'] = HEAP32 = new Int32Array(b);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
}
// end include: runtime_shared.js
assert(!Module['STACK_SIZE'], 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')

assert(typeof Int32Array != 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray != undefined && Int32Array.prototype.set != undefined,
       'JS engine does not provide full typed array support');

// If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
assert(!Module['wasmMemory'], 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
assert(!Module['INITIAL_MEMORY'], 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = 0x02135467;
  HEAPU32[(((max)+(4))>>2)] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max)>>2)];
  var cookie2 = HEAPU32[(((max)+(4))>>2)];
  if (cookie1 != 0x02135467 || cookie2 != 0x89BACDFE) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// include: runtime_assertions.js
// Endianness check
(function() {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)';
})();

// end include: runtime_assertions.js
var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;

function preRun() {
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();

  
if (!Module['noFSInit'] && !FS.init.initialized)
  FS.init();
FS.ignorePermissions = false;

TTY.init();
  callRuntimeCallbacks(__ATINIT__);
}

function postRun() {
  checkStackCookie();

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnExit(cb) {
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// include: runtime_math.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
// end include: runtime_math.js
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}

function addRunDependency(id) {
  runDependencies++;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(() => {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err(`dependency: ${dep}`);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

/** @param {string|number=} what */
function abort(what) {
  Module['onAbort']?.(what);

  what = 'Aborted(' + what + ')';
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;
  EXITSTATUS = 1;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// include: URIUtils.js
// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

/**
 * Indicates whether filename is a base64 data URI.
 * @noinline
 */
var isDataURI = (filename) => filename.startsWith(dataURIPrefix);

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');
// end include: URIUtils.js
function createExportWrapper(name, nargs) {
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    var f = wasmExports[name];
    assert(f, `exported native function \`${name}\` not found`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return f(...args);
  };
}

// include: runtime_exceptions.js
// end include: runtime_exceptions.js
function findWasmBinary() {
    var f = 'quake3e.wasm';
    if (!isDataURI(f)) {
      return locateFile(f);
    }
    return f;
}

var wasmBinaryFile;

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  throw 'both async and sync fetching of the wasm failed';
}

function getBinaryPromise(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary
      ) {
    // Fetch the binary using readAsync
    return readAsync(binaryFile).then(
      (response) => new Uint8Array(/** @type{!ArrayBuffer} */(response)),
      // Fall back to getBinarySync if readAsync fails
      () => getBinarySync(binaryFile)
    );
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return Promise.resolve().then(() => getBinarySync(binaryFile));
}

function instantiateArrayBuffer(binaryFile, imports, receiver) {
  return getBinaryPromise(binaryFile).then((binary) => {
    return WebAssembly.instantiate(binary, imports);
  }).then(receiver, (reason) => {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(wasmBinaryFile)) {
      err(`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  });
}

function instantiateAsync(binary, binaryFile, imports, callback) {
  if (!binary &&
      typeof WebAssembly.instantiateStreaming == 'function' &&
      !isDataURI(binaryFile) &&
      // Don't use streaming for file:// delivered objects in a webview, fetch them synchronously.
      !isFileURI(binaryFile) &&
      // Avoid instantiateStreaming() on Node.js environment for now, as while
      // Node.js v18.1.0 implements it, it does not have a full fetch()
      // implementation yet.
      //
      // Reference:
      //   https://github.com/emscripten-core/emscripten/pull/16917
      !ENVIRONMENT_IS_NODE &&
      typeof fetch == 'function') {
    return fetch(binaryFile, { credentials: 'same-origin' }).then((response) => {
      // Suppress closure warning here since the upstream definition for
      // instantiateStreaming only allows Promise<Repsponse> rather than
      // an actual Response.
      // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
      /** @suppress {checkTypes} */
      var result = WebAssembly.instantiateStreaming(response, imports);

      return result.then(
        callback,
        function(reason) {
          // We expect the most common failure cause to be a bad MIME type for the binary,
          // in which case falling back to ArrayBuffer instantiation should work.
          err(`wasm streaming compile failed: ${reason}`);
          err('falling back to ArrayBuffer instantiation');
          return instantiateArrayBuffer(binaryFile, imports, callback);
        });
    });
  }
  return instantiateArrayBuffer(binaryFile, imports, callback);
}

function getWasmImports() {
  // prepare imports
  return {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  }
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  var info = getWasmImports();
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;

    

    wasmMemory = wasmExports['memory'];
    
    assert(wasmMemory, 'memory not found in wasm exports');
    updateMemoryViews();

    addOnInit(wasmExports['__wasm_call_ctors']);

    removeRunDependency('wasm-instantiate');
    return wasmExports;
  }
  // wait for the pthread pool (if any)
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    receiveInstance(result['instance']);
  }

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module['instantiateWasm']) {
    try {
      return Module['instantiateWasm'](info, receiveInstance);
    } catch(e) {
      err(`Module.instantiateWasm callback failed with error: ${e}`);
        return false;
    }
  }

  if (!wasmBinaryFile) wasmBinaryFile = findWasmBinary();

  instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult);
  return {}; // no exports yet; we'll fill them in later
}

// Globals used by JS i64 conversions (see makeSetValue)
var tempDouble;
var tempI64;

// include: runtime_debug.js
function legacyModuleProp(prop, newName, incoming=true) {
  if (!Object.getOwnPropertyDescriptor(Module, prop)) {
    Object.defineProperty(Module, prop, {
      configurable: true,
      get() {
        let extra = incoming ? ' (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)' : '';
        abort(`\`Module.${prop}\` has been replaced by \`${newName}\`` + extra);

      }
    });
  }
}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         // The old FS has some functionality that WasmFS lacks.
         name === 'FS_createLazyFile' ||
         name === 'FS_createDevice' ||
         name === 'removeRunDependency';
}

function missingGlobal(sym, msg) {
  if (typeof globalThis != 'undefined') {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
        return undefined;
      }
    });
  }
}

missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer');
missingGlobal('asm', 'Please use wasmExports instead');

function missingLibrarySymbol(sym) {
  if (typeof globalThis != 'undefined' && !Object.getOwnPropertyDescriptor(globalThis, sym)) {
    Object.defineProperty(globalThis, sym, {
      configurable: true,
      get() {
        // Can't `abort()` here because it would break code that does runtime
        // checks.  e.g. `if (typeof SDL === 'undefined')`.
        var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
        // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
        // library.js, which means $name for a JS name with no prefix, or name
        // for a JS name like _name.
        var librarySymbol = sym;
        if (!librarySymbol.startsWith('_')) {
          librarySymbol = '$' + sym;
        }
        msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        warnOnce(msg);
        return undefined;
      }
    });
  }
  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      }
    });
  }
}

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}
// end include: runtime_debug.js
// === Body ===
// end include: preamble.js


  /** @constructor */
  function ExitStatus(status) {
      this.name = 'ExitStatus';
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }

  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };

  
    /**
     * @param {number} ptr
     * @param {string} type
     */
  function getValue(ptr, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': return HEAP8[ptr];
      case 'i8': return HEAP8[ptr];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': abort('to do getValue(i64) use WASM_BIGINT');
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      case '*': return HEAPU32[((ptr)>>2)];
      default: abort(`invalid type for getValue: ${type}`);
    }
  }

  var noExitRuntime = Module['noExitRuntime'] || true;

  var ptrToString = (ptr) => {
      assert(typeof ptr === 'number');
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    };

  
    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
  function setValue(ptr, value, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': HEAP8[ptr] = value; break;
      case 'i8': HEAP8[ptr] = value; break;
      case 'i16': HEAP16[((ptr)>>1)] = value; break;
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'i64': abort('to do setValue(i64) use WASM_BIGINT');
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      case '*': HEAPU32[((ptr)>>2)] = value; break;
      default: abort(`invalid type for setValue: ${type}`);
    }
  }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };

  var SYSC = {
  };
  function _CL_Download(cmd, name, auto) {
    if (!FS.database) {
      openDatabase()
    }
    //if(NET.downloadCount > 5) {
    //  return 0 // delay like cl_curl does
    //}
  
    // TODO: make a utility for Cvar stuff?
    let cmdStr = addressToString(cmd)
    let dlURL = addressToString(Cvar_VariableString(stringToAddress('cl_dlURL')))
    let gamedir = addressToString(FS_GetCurrentGameDir())
    let nameStr = addressToString(name)
    let basegame = addressToString(Cvar_VariableString(stringToAddress('fs_basegame')))
    let localName = nameStr
    if (localName[0] == '/')
      localName = localName.substring(1)
    if (localName.startsWith(gamedir + '/'))
      localName = localName.substring(gamedir.length + 1)
  
    let remoteURL
    if (dlURL.includes('%1')) {
      remoteURL = dlURL.replace('%1', localName.replace(/\//ig, '%2F'))
    } else {
      remoteURL = dlURL + '/' + localName
    }
    if (dlURL.startsWith('//')) {
      remoteURL = window.location.protocol + remoteURL
    } else
      if (dlURL.startsWith('/')) {
        remoteURL = window.location.origin + remoteURL
      } else
        if (!dlURL.includes('://')) {
          remoteURL = window.location.origin + window.location.pathname.replace(/\/*[^\/]*$/gi, '') + '/' + remoteURL
        }
    if (remoteURL.includes('.googleapis.com')) {
      if (nameStr.endsWith('/')) {
        remoteURL = 'https://www.googleapis.com/storage/v1/b/'
          + remoteURL.match(/\/b\/(.*?)\/o\//)[1]
          + '/o/?includeTrailingDelimiter=true&maxResults=100&delimiter=%2f&prefix='
          + remoteURL.match(/\/o\/(.*)/)[1]
      } else if (!remoteURL.includes('?')) {
        remoteURL += '?alt=media'
      }
    }
  
    var server = addressToString(Cvar_VariableString('cl_currentServerAddress'))
    if(server.length && !window.location.includes(server))
      history.pushState({location: window.location.toString()}, window.title, '?connect ' + server)
  
    let waitFor = Promise.resolve((async function () {
      try {
        NET.downloadCount++
        let result
        //if (nameStr.includes('version.json') || nameStr.includes('maps/maplist.json')) {
        //} else {
        //  result = await readStore(nameStr)
        //}
        let responseData
        //if (!result || (result.mode >> 12) == ST_DIR
          // bust the caches!
        //  || result.timestamp.getTime() < NET.cacheBuster) {
          responseData = (await Promise.all([
            await Com_DL_Begin(localName, remoteURL),
            await Com_DL_Begin(localName + '.pk3', remoteURL + '.pk3')
              .then(responseData => {
                if(responseData && !nameStr.match(/\.pk3$/)) {
                  localName += '.pk3'
                }
                return responseData
              }),
            await Com_DL_Begin(localName + '.bsp', remoteURL + '.bsp')
            .then(responseData => {
              if(responseData && !nameStr.match(/\.bsp$/)) {
                nameStr = 'maps/' + localName + '.bsp'
              }
              return responseData
            }),
            await Com_DL_Begin(localName + '.bsp', basegame + '/pak0.pk3dir/maps/' + localName + '.bsp')
            .then(responseData => {
              if(responseData && !nameStr.match(/\.bsp$/)) {
                nameStr = 'maps/' + localName + '.bsp'
              }
              return responseData
            }),
            await Com_DL_Begin(localName + '.bsp', gamedir + '/pak0.pk3dir/maps/' + localName + '.bsp')
            .then(responseData => {
              if(responseData && !nameStr.match(/\.bsp$/)) {
                nameStr = 'maps/' + localName + '.bsp'
              }
              return responseData
            }),
          ])).filter(f => f)[0]
  
          let rename = responseData.response.headers.get('content-disposition')
          let newFilename = localName
          if (rename) {
            let newFilename = (/filename=['"]*(.*?)['"]*$/i).exec(rename)
            if (newFilename) {
              newFilename = localName.replace(/[^\/]*$/, newFilename[1])
              nameStr = nameStr.replace(/[^\/]*$/, newFilename[1])
            }
          }
  
          Com_DL_Perform(gamedir + '/' + nameStr, gamedir + '/' + newFilename, responseData)
    
          let responseData2 = (await Promise.all([
            await Com_DL_Begin(localName + '.aas', remoteURL + '.aas'),
            await Com_DL_Begin(localName + '.aas', basegame + '/pak0.pk3dir/maps/' + localName + '.aas'),
            await Com_DL_Begin(localName + '.aas', gamedir + '/pak0.pk3dir/maps/' + localName + '.aas'),
          ])).filter(f => f)[0]
  
          Com_DL_Perform(gamedir + '/maps/' + localName + '.aas', gamedir + '/' + localName, responseData2)
  
        //} else {
          // valid from disk
        //  responseData = result.contents
        //}
  
        Cvar_Set( stringToAddress('cl_downloadName'), stringToAddress('') );
        Cvar_Set( stringToAddress('cl_downloadSize'), stringToAddress('0') );
        Cvar_Set( stringToAddress('cl_downloadCount'), stringToAddress('0') );
        Cvar_Set( stringToAddress('cl_downloadTime'), stringToAddress('0') );
        if (nameStr.match(/\.pk3/i) || nameStr.match(/\.bsp/i)) {
          if(cmdStr == 'dlmap') {
            Cbuf_AddText(stringToAddress(` ; fs_restart ; vid_restart ; `))
          } else {
            Cbuf_AddText(stringToAddress(` ; wait 100 ; fs_restart ; ${cmdStr} ${localName} ; `))
          }
        }
      } catch (e) {
  
      }
    })())
    return waitFor
  }

  var _CL_cURL_BeginDownload = function CL_cURL_BeginDownload(localName, remoteURL) {
    Cvar_Set(stringToAddress('cl_downloadName'), localName)
    Cvar_SetIntegerValue(stringToAddress('cl_downloadSize'), 0)
    Cvar_SetIntegerValue(stringToAddress('cl_downloadCount'), 0)
    //Cvar_SetIntegerValue( stringToAddress('cl_downloadTime', cls.realtime );
    localName = addressToString(localName)
    Promise.resolve(Com_DL_Begin(localName, addressToString(remoteURL)))
      .then(responseData => Com_DL_Perform(localName, localName, responseData))
      .then(() => CL_NextDownload())
    return true
  };

  function _Com_DL_Cleanup() {
    if (NET.controller) {
      NET.controller.abort()
      NET.controller = null
    }
  }

  function _Com_RealTime(tm) {
    // locale time is really complicated
    //   use simple Q3 time structure
    let now = new Date()
    let t = now / 1000
    if (tm) {
      HEAP32[(tm >> 2) + 5] = now.getFullYear() - 1900
      HEAP32[(tm >> 2) + 4] = now.getMonth() // already subtracted by 1
      HEAP32[(tm >> 2) + 3] = now.getDate()
      HEAP32[(tm >> 2) + 2] = (t / 60 / 60) % 24
      HEAP32[(tm >> 2) + 1] = (t / 60) % 60
      HEAP32[(tm >> 2) + 0] = t % 60
    }
    return t
  }

  function _DebugBreak() { debugger }

  function _GL_GetDrawableSize(width, height) {
    // THIS IS THE NEW VID_RESTART FAST HACK
    INPUT.updateWidth = width
    INPUT.updateHeight = height
    HEAP32[width >> 2] = GL.canvas.width
    HEAP32[height >> 2] = GL.canvas.height
  }

  function _GL_GetProcAddress() { }

  function _GLimp_Shutdown(destroy) {
    window.removeEventListener('resize', resizeViewport)
    window.removeEventListener('keydown', InputPushKeyEvent)
    window.removeEventListener('keyup', InputPushKeyEvent)
    window.removeEventListener('keypress', InputPushTextEvent)
    window.removeEventListener('mouseout', InputPushMovedEvent)
    //window.removeEventListener('popstate', CL_ModifyMenu)
  
    document.removeEventListener('mousewheel', InputPushWheelEvent)
    document.removeEventListener('visibilitychange', InputPushFocusEvent)
    document.removeEventListener('focus', InputPushFocusEvent)
    document.removeEventListener('blur', InputPushFocusEvent)
    //document.removeEventListener('drop', dropHandler)
    //document.removeEventListener('dragenter', INPUT.dragEnterHandler)
    //document.removeEventListener('dragover', INPUT.dragOverHandler)
    document.removeEventListener('pointerlockchange', InputPushFocusEvent);
  
    if (destroy && GL.canvas) {
      document.removeEventListener('mousemove', InputPushMouseEvent)
      document.removeEventListener('mousedown', InputPushMouseEvent)
      document.removeEventListener('mouseup', InputPushMouseEvent)
      GL.deleteContext(INPUT.handle);
      GL.canvas.remove()
      delete GL.canvas
    }
  }

  function _GLimp_StartDriverAndSetMode(mode, modeFS, fullscreen, fallback) {
    // TODO: multiple windows like a DVR?
    //   what kind of game needs two screens for one player to switch back and forth?
    GL.canvas.setAttribute('width', GL.canvas.clientWidth)
    GL.canvas.setAttribute('height', GL.canvas.clientHeight)
    if (window.flipper) {
      window.flipper.remove()
    }
  
    // TODO: keep track of multiple?
    let webGLContextAttributes = {
      failIfMajorPerformanceCaveat: true,
      alpha: false,
      stencil: true,
      premultipliedAlpha: false,
    }
  
    GL.context = (!fallback)
      ? GL.canvas.getContext('webgl2', webGLContextAttributes)
      : (GL.canvas.getContext('webgl', webGLContextAttributes)
        || GL.canvas.getContext('experimental-webgl'))
  
    GL.context2D = GL.canvas2D.getContext('2d', { willReadFrequently: true })
    
    GL.context.viewport(0, 0, GL.canvas.width, GL.canvas.height);
    if (!GL.context) return 2
    if (typeof GL != 'undefined') {
      INPUT.handle = GL.registerContext(GL.context, webGLContextAttributes)
      GL.makeContextCurrent(INPUT.handle)
    }
  
    // set the window to do the grabbing, when ungrabbing this doesn't really matter
    if (!HEAPU32[first_click >> 2]) {
      //GL.canvas.requestPointerLock();
    } else {
      SDL_ShowCursor()
    }
  
    return 0 // no error
  }

  function _IN_Init() {
  
    console.log('\n------- Input Initialization -------\n')
  
    CopyBiases()
  
    INPUT.aspect = Cvar_Get(stringToAddress('r_customAspect'), stringToAddress(''), 0);
    INPUT.fpsUnfocused = Cvar_Get(stringToAddress('com_maxfpsUnfocused'), stringToAddress('60'), 0);
    INPUT.fps = Cvar_Get(stringToAddress('com_maxfps'), stringToAddress('250'), 0);
    INPUT.fpsModified = HEAPU32[(INPUT.fps >> 2) + 6]
    INPUT.fpsUnfocusedModified = HEAPU32[(INPUT.fpsUnfocused >> 2) + 6]
    INPUT.in_keyboardDebug = Cvar_Get(stringToAddress('in_keyboardDebug'), 
        stringToAddress('0'), CVAR_ARCHIVE)
    INPUT.in_mouse = Cvar_Get(stringToAddress('in_mouse'), stringToAddress('1'), CVAR_ARCHIVE)
    HEAPU32[(INPUT.in_mouse>>2) + 8] = 1
    Cvar_CheckRange(INPUT.in_mouse, stringToAddress('-1'), stringToAddress('1'), CV_INTEGER)
  
    // ~ and `, as keys and characters
    Cvar_Get(stringToAddress('cl_consoleKeys'), stringToAddress('~ ` \u007e \u0060'), CVAR_ARCHIVE);
    if (!INPUT.consoleKeys) {
      INPUT.consoleKeys = addressToString(Cvar_VariableString(stringToAddress('cl_consoleKeys')))
        .split(' ').map(function (c) {
          return c[0] == '0' && c[1] == 'x'
            ? String.fromCharCode(parseInt(c.substr(2), 16))
            : c
        })
    }
  
    // TODO: activate text input for text fields
    //SDL_StartTextInput();
  
    //let in_nograb = Cvar_Get( 'in_nograb', '0', CVAR_ARCHIVE );
    //let r_allowSoftwareGL = Cvar_Get( 'r_allowSoftwareGL', '0', CVAR_LATCH );
    //let r_swapInterval = Cvar_Get( 'r_swapInterval', '0', CVAR_ARCHIVE | CVAR_LATCH );
    //let r_stereoEnabled = Cvar_Get( 'r_stereoEnabled', '0', CVAR_ARCHIVE | CVAR_LATCH );
  
    for (let i = 0; i < 1024; i++) {
      let name = addressToString(Key_KeynumToString(i))
      if (name.length == 0) continue
      INPUT.keystrings[name] = i
    }
    window.addEventListener('keydown', InputPushKeyEvent, false)
    window.addEventListener('keyup', InputPushKeyEvent, false)
    window.addEventListener('keypress', InputPushTextEvent, false)
    window.addEventListener('mouseout', InputPushMovedEvent, false)
    window.addEventListener('resize', resizeViewport, false)
    //window.addEventListener('popstate', CL_ModifyMenu, false)
  
    document.addEventListener('mousemove', InputPushMouseEvent, false)
    document.addEventListener('mousedown', InputPushMouseEvent, false)
    document.addEventListener('mouseup', InputPushMouseEvent, false)
  
    document.addEventListener('mousewheel', InputPushWheelEvent, { capture: false, passive: true })
    document.addEventListener('visibilitychange', InputPushFocusEvent, false)
    document.addEventListener('focus', InputPushFocusEvent, false)
    document.addEventListener('blur', InputPushFocusEvent, false)
    //document.addEventListener('drop', dropHandler, false)
    //document.addEventListener('dragenter', dragEnterHandler, false)
    //document.addEventListener('dragover', dragOverHandler, false)
  
    document.addEventListener('pointerlockchange', InputPushFocusEvent, false)
  
    InitNippleJoysticks()
    /*
    let nipple handle touch events
    GL.canvas.addEventListener('touchstart', InputPushTouchEvent, false)
    GL.canvas.addEventListener('touchend', InputPushTouchEvent, false)
    GL.canvas.addEventListener('touchmove', InputPushTouchEvent, false)
    GL.canvas.addEventListener('touchcancel', InputPushTouchEvent, false)
    setTimeout(function () {
      Sys_QueEvent( Sys_Milliseconds(), SE_KEY, 
        INPUT.keystrings['MOUSE1'], true, 0, null );
      Sys_QueEvent( Sys_Milliseconds(), SE_KEY, 
        INPUT.keystrings['MOUSE1'], false, 0, null );
      Sys_QueEvent( Sys_Milliseconds(), SE_KEY, 
        INPUT.keystrings['ESCAPE'], true, 0, null );
    }, 2000)
    */
  
    console.log('------------------------------------\n')
  }

  function _NET_AdrToString(net) {
    if (HEAPU32[net >> 2] == 2) {
      return stringToAddress('localhost')
    } else
      if (HEAPU32[net >> 2] == 4) {
        let lookup = reverseLookup(HEAPU8.slice(net + 4, net + 8))
        if (lookup)
          return stringToAddress(lookup)
        return stringToAddress(
          HEAPU8[net + 4] + '.'
          + HEAPU8[net + 5] + '.'
          + HEAPU8[net + 6] + '.'
          + HEAPU8[net + 7])
      }
  }

  function _NET_OpenIP() {
    NET.net_port = NET.original_port = 0
    NET.net_socksServer = window.location.hostname
    NET.net_socksPort = window.location.port
  
    if (typeof Cvar_VariableString != 'undefined') {
      NET.net_port = NET.original_port = addressToString(Cvar_VariableString(stringToAddress('net_port')))
      NET.net_socksServer = addressToString(Cvar_VariableString(stringToAddress('net_socksServer')))
      NET.net_socksPort = addressToString(Cvar_VariableString(stringToAddress('net_socksPort')))
    }
  
    if (!NET.buffer && typeof malloc != 'undefined') {
      // from NET_Event() + netmsg_t + netadr_t
      NET.bufferLength = MAX_MSGLEN + 8 + 24 + 1024
      NET.bufferAlternate = 0
      NET.buffer = malloc(NET.bufferLength * 4)
    }
    if (!NET.queue) {
      NET.queue = []
    }
    NET.queue.splice(0)
    //NET.socket1Queue.splice(0)
    //NET.socket2Queue.splice(0)
  
    if (window.location.protocol != 'http:'
      && window.location.protocol != 'https:') {
      return
    }
    let fullAddress = 'ws'
      + (window.location.protocol.length > 5 ? 's' : '')
      + '://' + NET.net_socksServer + ':' + NET.net_socksPort
  
    /*
        for( i = 0 ; i < 10 ; i++ ) {
        ip_socket = NET_IPSocket( net_ip->string, port + i, &err );
        if (ip_socket != INVALID_SOCKET) {
          Cvar_SetIntegerValue( 'net_port', port + i );
  
          if (net_socksEnabled->integer)
            NET_OpenSocks( port + i );
  
          break;
        }
        else
        {
          if(err == EAFNOSUPPORT)
            break;
        }
      }
    */
    try {
  
      if (!NET.socket1) {
        NET.socket1 = new WebSocket(fullAddress)
        NET.socket1.binaryType = 'arraybuffer';
        NET.socket1.addEventListener('open', socketOpen, false)
        NET.socket1.addEventListener('message', socketMessage, false)
        NET.socket1.addEventListener('error', socketError, false)
      }
      if (!NET.socket2) {
        NET.socket2 = new WebSocket(fullAddress)
        NET.socket2.binaryType = 'arraybuffer';
        NET.socket2.addEventListener('open', socketOpen, false)
        NET.socket2.addEventListener('message', socketMessage, false)
        NET.socket2.addEventListener('error', socketError, false)
      }
  
    } catch (e) {
      console.error(e)
    }
  }

  function _NET_Sleep() {
    let sv_running = Cvar_VariableIntegerValue(stringToAddress('sv_running'))
    let sv_dedicated = Cvar_VariableIntegerValue(stringToAddress('dedicated'))
    if (!NET.queue || !NET.buffer) {
      return
    }
    let count = NET.queue.length
    // alternate buffers so we don't overwrite
    for (let i = 0; i < count; i++) {
      let packet = NET.queue.shift()
      if (!packet) {
        break
      }
      NET.bufferAlternate = NET.bufferAlternate ? 0 : 1
      let buffer = NET.buffer + NET.bufferAlternate * NET.bufferLength * 2
      let from = buffer
      let netmsg = buffer + 512
      let data = buffer + 1024
      HEAPU8.set(packet[2], data)
      MSG_Init(netmsg, data, MAX_MSGLEN)
      //console.log(packet[2].length, packet)
      HEAPU8.fill(0, from, from + 512)
      //HEAPU8.fill(0, netmsg, netmsg + 512)
      //HEAPU32[(netmsg >> 2) + 3] = data
      //HEAPU32[(netmsg >> 2) + 4] = MAX_MSGLEN
      //HEAPU32[(netmsg >> 2) + 5] = MAX_MSGLEN * 8
      HEAPU32[(netmsg >> 2) + 6] = packet[2].length
      //(packet[2].length && 0xFF000000) >> 24
      //+ (packet[2].length && 0x00FF0000) >> 16 + 
      HEAPU32[from >> 2] = 4 /* NA_IP */
      HEAPU8[from + 8] = packet[1][1]
      HEAPU8[from + 9] = packet[1][0]
      //HEAPU16[(from + 8) >> 1] = (packet[1][0] << 8) + packet[1][1] // port
      if (typeof packet[0] == 'string') {
        Sys_StringToAdr(stringToAddress(packet[0]), from)
      } else {
        HEAPU8.set(packet[0], from + 4)
      }
  
      try {
        if (sv_running || sv_dedicated)
          Com_RunAndTimeServerPacket(from, netmsg);
        else
          CL_PacketEvent(from, netmsg);
      } catch (up) {
        console.log(Array.from(packet[2]).map(c => String.fromCharCode(c)).join(''))
        throw up
      }
    }
  }

  function _SNDDMA_Init() {
    SND.inited = true
    if(HEAPU32[first_click >> 2]) {
      return 0
    }
    HEAPU32[(dma >> 2) + 0] = 2
    HEAPU32[(dma >> 2) + 1] = 16384
    HEAPU32[(dma >> 2) + 2] = 16384 / 2
    HEAPU32[(dma >> 2) + 3] = 1
    HEAPU32[(dma >> 2) + 4] = 32
    HEAPU32[(dma >> 2) + 5] = 1
    HEAPU32[(dma >> 2) + 6] = 44100
    //HEAPU32[(dma >> 2) + 7] = Z_Malloc(16384 * 200)
    HEAPU32[(dma >> 2) + 8] = Z_Malloc(AUDIO_DRIVER.length + 1)
    stringToAddress(AUDIO_DRIVER, HEAPU32[(dma >> 2) + 7])
    if(!listener) {
      InitListener()
    }
    return 1
  }

  function _SNDDMA_Shutdown() {
    if(HEAPU32[(dma >> 2) + 8]) {
      //Z_Free(HEAPU32[(dma >> 2) + 7])
      Z_Free(HEAPU32[(dma >> 2) + 8])
      //HEAPU32[(dma >> 2) + 7] = 0
      HEAPU32[(dma >> 2) + 8] = 0
    }
    HEAPU32[first_click >> 2] = 1
  }

  function _S_Base_AddLoopingSound(entityNum, origin, velocity, sfx) {
    if(!SND.inited) {
      return
    }
    if(HEAPU32[first_click >> 2]) {
      return
    }
  
    let name = addressToString(s_knownSfx + sfx * 100 + 28).replace(/\..*?$/, '.ogg')
    // TODO: basically the same thing as above but add an event handler
    let track = FindTrack(name)
    if(origin) {
      entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
    }
    if(track) {
      track.mediaElement.lastPlayed = Date.now()
      track.mediaElement.play()
      track.mediaElement.onEnded = () => {
        track.mediaElement.play()
      }
      if(looping[entityNum] && looping[entityNum] != track) {
        //looping[entityNum].mediaElement.pause()
        looping[entityNum].mediaElement.onEnded = null
        looping[entityNum] = null
      }
      looping[entityNum] = track
      if(origin) {
        //track.panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
      }
      //audioElement.addEventListener('ended', )
    }
  }

  function _S_Base_AddRealLoopingSound(entityNum, origin, velocity, sfx) {
    if(!SND.inited) {
      return
    }
    if(HEAPU32[first_click >> 2]) {
      return
    }
  
    let name = addressToString(s_knownSfx + sfx * 100 + 28).replace(/\..*?$/, '.ogg')
    // TODO: basically the same thing as above but add an event handler
    let track = FindTrack(name)
    if(origin) {
      entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
    }
    if(track) {
      track.mediaElement.lastPlayed = Date.now()
      track.mediaElement.play()
      track.mediaElement.onEnded = () => {
        track.mediaElement.play()
      }
      if(looping[entityNum] && looping[entityNum] != track) {
        //looping[entityNum].mediaElement.pause()
        looping[entityNum].mediaElement.onEnded = null
        looping[entityNum] = null
      }
      looping[entityNum] = track
      if(origin) {
        //track.panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
      }
      //audioElement.addEventListener('ended', )
    }
  }

  function _S_Base_ClearLoopingSounds() {
    for(let i = 0; i < looping.length; i++) {
      if(looping[i]) {
        looping[i].mediaElement.pause()
        looping[i].mediaElement.onEnded = null
        looping[i] = null
      }
    }
  }

  function _S_Base_ClearSoundBuffer() {
    for(let i = 0; i < looping.length; i++) {
      if(looping[i]) {
        looping[i].mediaElement.pause()
        looping[i].mediaElement.onEnded = null
        looping[i] = null
      }
    }
  }

  function _S_Base_RawSamples() {
  
  }

  function _S_Base_Respatialize(entityNum, head, axis, inwater) {
    //listener.setPosition(HEAPF32[(head >> 2) + 0], HEAPF32[(head >> 2) + 1], HEAPF32[(head >> 2) + 2])
    //listener.setOrientation(HEAPF32[(axis >> 2) + 0], HEAPF32[(axis >> 2) + 1], HEAPF32[(axis >> 2) + 2], 0, 1, 0)
  }

  function _S_Base_StartBackgroundTrack() {
  
  }

  function _S_Base_StartLocalSound(sfx, channel) {
    return S_Base_StartSound(0, null, channel, sfx)
  
  }

  function _S_Base_StartSound(origin, entityNum, entchannel, sfx) {
    if(!SND.inited) {
      return
    }
    if(HEAPU32[first_click >> 2]) {
      return
    }
    let name = addressToString(s_knownSfx + sfx * 100 + 28).replace(/\..*?$/, '.ogg')
    //let name = sfx-72
  
    /*
    let now = Date.now()
    for(i = 0; i < channels.length; i++) {
      if(!channels[i].lastPlayed || channels[i].lastPlayed + soundEffects[name][0].duration < now) {
        break;
      }
    }
    */
    if(origin == 0) {
      let sound = FindSound(name)
      if(sound) {
        sound.lastPlayed = Date.now()
        sound.play()
      }
      // TODO: reset track panner location
      return
    } else {
      entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
    }
  
    let track = FindTrack(name)
    if(track) {
      track.mediaElement.lastPlayed = Date.now()
      track.mediaElement.play()
      track.panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
    }
      // TODO: reset track panner location
  }

  function _S_Base_StopAllSounds() {
    for(let i = 0; i < looping.length; i++) {
      if(looping[i]) {
        looping[i].mediaElement.pause()
        looping[i].mediaElement.onEnded = null
        looping[i] = null
      }
    }
  }

  function _S_Base_StopBackgroundTrack() {
  
  }

  function _S_Base_StopLoopingSound(entityNum) {
    if(looping[entityNum]) {
      looping[entityNum].mediaElement.pause()
      looping[entityNum].mediaElement.onEnded = null
      looping[entityNum] = null
    }
  }

  function _S_Base_Update() {
  
  }

  function _S_Base_UpdateEntityPosition(entityNum, origin) {
    if(origin) {
      entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
      if(looping[entityNum]) {
        //looping[entityNum].panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
      }
    }
  }

  function _S_CodecInit() {}

  function _S_CodecShutdown() {}

  function _S_LoadSound(name, info) {
    //if(!SND.inited) {
    //  return 0
    //}
    let filenameStr = addressToString(name)
    if(filenameStr.length == 0) {
      return 0
    }
    if(typeof REMOTE_SOUNDS[filenameStr] != 'undefined'
      && !REMOTE_SOUNDS[filenameStr]
    ) {
      return 0
    }
    if(!filenameStr.endsWith('.ogg')) {
      filenameStr = filenameStr.replace(/\..*?$/, '.ogg')
    }
    let existing = Object.values(soundEffects)
    for(let i = 0; i < existing.length; i++) {
      if(existing[i][0].name == filenameStr) {
        //soundEffects[filenameStr] = existing[i]
        return 1
      }
    }
  
    let buf = Z_Malloc(8) // pointer to pointer
    HEAPU32[buf >> 2] = 0
    
    if ((length = FS_ReadFile(stringToAddress(filenameStr), buf)) > 0 && HEAPU32[buf >> 2] > 0) {
      let thisAudio = document.createElement('AUDIO')
      thisAudio.addEventListener('load', function () {
        debugger
      })
      let audioView = Array.from(HEAPU8.slice(HEAPU32[buf >> 2], HEAPU32[buf >> 2] + length))
      let utfEncoded = audioView.map(function (c) { return String.fromCharCode(c) }).join('')
      thisAudio.src = 'data:audio/ogg;base64,' + btoa(utfEncoded)
      thisAudio.name = filenameStr
      console.log('loading audio:' + filenameStr)
      //thisAudio.address = name - 28
      soundEffects[filenameStr] = [thisAudio]
      if(info) {
        HEAPU32[(info >> 2) + 4] = length
      }
      FS_FreeFile(HEAPU32[buf >> 2])
      Z_Free(buf)
      return 1
    }
  
    // TODO: try alternative download paths and make file available for next time?
    if(typeof REMOTE_SOUNDS[filenameStr] == 'undefined') {
      REMOTE_SOUNDS[filenameStr] = true
  
      let gamedir = addressToString(FS_GetCurrentGameDir())
      let remoteFile = 'pak0.pk3dir/' + filenameStr
      Promise.resolve(Com_DL_Begin(gamedir + '/' + remoteFile, '/' + gamedir + '/' + remoteFile + '?alt')
          .then(function (responseData) {
            Com_DL_Perform(gamedir + '/' + remoteFile, remoteFile, responseData)
            if(!responseData) {
              REMOTE_SOUNDS[filenameStr] = false
            }
          }))
    }
  
    Z_Free(buf)
    return 0
  }

  function _Sys_Error(fmt, args) {
  	let len = sprintf(STD.sharedMemory + STD.sharedCounter, fmt, args)
  	if(len > 0)
  		console.error('Sys_Error: ', addressToString(STD.sharedMemory + STD.sharedCounter))
  	Sys_Exit( 1 )
  	throw new Error(addressToString(fmt))
  }

  function _Sys_Exit(code) {
  	SYS.exited = true
  	GLimp_Shutdown(true)
  	NET_Shutdown()
  	if(SYS.frameInterval) {
  		clearInterval(SYS.frameInterval)
  		SYS.frameInterval = null
  	}
  	if(code == 0) {
  		Sys_Return()
  	}
  	if(	GL.canvas ) {
  		GL.canvas.remove()
  	}
  }

  function _Sys_FClose(pointer) {
    if(typeof FS.pointers[pointer] == 'undefined') {
      throw new Error('File IO Error') // TODO: POSIX
    }
    Sys_notify(FS.pointers[pointer][2], FS.pointers[pointer][3], FS.pointers[pointer][4])
    FS.pointers[pointer] = void 0
  	return 0
  }

  function _Sys_FOpen(filename, mode) {
    // now we don't have to do the indexing crap here because it's built into the engine already
    let fileStr = addressToString(filename)
  	let extName
  	if(fileStr.includes('.')) {
  		extName = fileStr.substring(fileStr.lastIndexOf('.')).toLowerCase()
  	}
    let modeStr = addressToString(mode)
    let localName = fileStr
    if(localName.startsWith('/base')
      || localName.startsWith('/home'))
      localName = localName.substring('/base'.length)
    if(localName[0] == '/')
      localName = localName.substring(1)
  
    let createFP = function () {
      FS.filePointer++
      FS.pointers[FS.filePointer] = [
        0, // seek/tell
        modeStr,
        FS.virtual[localName],
        localName,
  			FS.filePointer
      ]
      // DO THIS ON OPEN SO WE CAN CHANGE ICONS
      Sys_notify(FS.virtual[localName], localName)
      return FS.filePointer // not zero
    }
  
    // check if parent directory has been created, TODO: POSIX errno?
    let parentDirectory = localName.substring(0, localName.lastIndexOf('/'))
    // TODO: check mode?
    if(typeof FS.virtual[localName] != 'undefined'
      && (FS.virtual[localName].mode >> 12) == ST_FILE) {
      // open the file successfully
      return createFP()
    } else 
    // only write+ files after they have all been loaded, so we don't accidentally overwrite
    if (/* !FS.isSyncing && */ modeStr.includes('w')
      && (typeof FS.virtual[parentDirectory] != 'undefined'
      // allow writing to root path
      || parentDirectory.length == 0)
    ) {
      // create the file for write because the parent directory exists
      FS.virtual[localName] = {
        timestamp: new Date(),
        mode: FS_FILE,
        contents: new Uint8Array(0)
      }
      return createFP()
    } else {
  		let gamedir = addressToString(FS_GetCurrentGameDir())
  		if (localName.startsWith(gamedir + '/'))
  			localName = localName.substring(gamedir.length  +1)
  
  		// TODO: if MD3/IQM try to load remotely
  		if(typeof REMOTE_MODELS[localName] == 'undefined'
  			&& typeof REMOTE_MODELS[localName.replace(extName, '')] == 'undefined'
  			&& (extName == '.md3' || extName == '.iqm')) {
  			// ?alt will redirect to the correct extension and `ui_breadCrumb` will pick it up regardless
  			REMOTE_MODELS[localName.replace(extName, '')] = REMOTE_MODELS[localName] = true
  
        let remoteFile = 'pak0.pk3dir/' + localName
        Promise.resolve(Com_DL_Begin(gamedir + '/' + remoteFile, '/' + gamedir + '/' + remoteFile + '?alt')
            .then(function (responseData) {
              Com_DL_Perform(gamedir + '/' + remoteFile, remoteFile, responseData)
  			      Cvar_Set( stringToAddress('ui_breadCrumb'), stringToAddress(localName) )
  						if(responseData)
  							FS_RecordFile(stringToAddress(localName))
            }))
      }
  
      return 0 // POSIX
    }
  }

  function _Sys_FRead(bufferAddress, byteSize, count, pointer) {
    if(typeof FS.pointers[pointer] == 'undefined') {
      throw new Error('File IO Error') // TODO: POSIX
    }
    let i = 0
    for(; i < count * byteSize; i++ ) {
      if(FS.pointers[pointer][0] >= FS.pointers[pointer][2].contents.length) {
        break
      }
      HEAPU8[bufferAddress + i] = FS.pointers[pointer][2].contents[FS.pointers[pointer][0]]
      FS.pointers[pointer][0]++
    }
  
    return (i - (i % byteSize)) / byteSize
  }

  function _Sys_FSeek(pointer, position, mode) {
    if(typeof FS.pointers[pointer] == 'undefined') {
      throw new Error('File IO Error') // TODO: POSIX
    }
    if(mode == 0 /* SEEK_SET */) {
      FS.pointers[pointer][0] = position
    } else if (mode == 1 /* SEEK_CUR */) {
      FS.pointers[pointer][0] += position
    } else if (mode == 2 /* SEEK_END */) {
      FS.pointers[pointer][0] = FS.pointers[pointer][2].contents.length + position
    } else {
      return -1 // POSIX?
    }
    return 0
  }

  function _Sys_FTell(pointer) {
    if(typeof FS.pointers[pointer] == 'undefined') {
      throw new Error('File IO Error') // TODO: POSIX
    }
    return FS.pointers[pointer][0]
  }

  function _Sys_FWrite(buf, size, nmemb, pointer) {
  	// something wrong with breaking inside `node -e`
  	//   maybe someone at Google saw my stream because they made it even worse.
  	//   now it shows Nodejs system code all the time instead of only when I 
  	//   click on it like resharper. LOL!
    if(typeof FS.pointers[pointer] == 'undefined') {
      throw new Error('File IO Error') // TODO: POSIX
    }
    let tmp = FS.pointers[pointer][2].contents
    if(FS.pointers[pointer][0] + size * nmemb > FS.pointers[pointer][2].contents.length) {
      tmp = new Uint8Array(FS.pointers[pointer][2].contents.length + size * nmemb);
      tmp.set(FS.pointers[pointer][2].contents, 0);
    }
    tmp.set(HEAPU8.slice(buf, buf + size * nmemb), FS.pointers[pointer][0]);
    FS.pointers[pointer][0] += size * nmemb
  	// WE DON'T NEED FILE LOCKING BECAUSE IT'S SINGLE THREADED IN NATURE
  	//   IT WOULD BE IMPOSSIBLE FOR ANOTHER PROCESS TO COME ALONG AND
  	//   OVERWRITE OUR TMP CONTENTS MID FUNCTION.
    FS.pointers[pointer][2].contents = tmp
    Sys_notify(FS.pointers[pointer][2], FS.pointers[pointer][3], FS.pointers[pointer][4])
    return nmemb // k==size*nmemb ? nmemb : k/size;
  }

  function _Sys_GetFileStats( filename, size, mtime, ctime ) {
    let fileStr = addressToString(filename)
    let localName = fileStr
    if(localName.startsWith('/base')
      || localName.startsWith('/home'))
      localName = localName.substring('/base'.length)
    if(localName[0] == '/')
      localName = localName.substring(1)
    if(typeof FS.virtual[localName] != 'undefined') {
      HEAPU32[size >> 2] = (FS.virtual[localName].contents || []).length
      HEAPU32[mtime >> 2] = FS.virtual[localName].timestamp.getTime()
      HEAPU32[ctime >> 2] = FS.virtual[localName].timestamp.getTime()
      return 1
    } else {
      HEAPU32[size >> 2] = 0
      HEAPU32[mtime >> 2] = 0
      HEAPU32[ctime >> 2] = 0
      return 0
    }
  }

  function _Sys_IsLANAddress() {
  
  }

  function _Sys_ListFiles(directory, extension, filter, numfiles, wantsubs) {
    let files = {
      'default.cfg': {
        mtime: 0,
        size: 1024,
      }
    }
  	let dironly = wantsubs
    // TODO: don't combine /home and /base?
    let localName = addressToString(directory)
    if(localName.startsWith('/base'))
      localName = localName.substring('/base'.length)
    if(localName[0] == '/')
      localName = localName.substring(1)
    let extensionStr = addressToString(extension)
    //let matches = []
    // can't use utility because FS_* frees and moves stuff around
    let matches = Object.keys(FS.virtual).filter(function (key) { 
  		let subdirI = key.substring(localName.length + 1).indexOf('/')
      return (!extensionStr || key.endsWith(extensionStr) 
        || (extensionStr == '/' && (FS.virtual[key].mode >> 12) == ST_DIR))
        // TODO: match directory 
  			&& (key[localName.length] == '/')
  			&& (wantsubs || subdirI == -1 || subdirI == key.length - 1)
        && (!localName || key.startsWith(localName))
        && (!dironly || (FS.virtual[key].mode >> 12) == ST_DIR)
    })
    // return a copy!
  	let listInMemory
  	if(typeof Z_Malloc != 'undefined') {
  		listInMemory = Z_Malloc( ( matches.length + 1 ) * 4 )
  	} else {
  		listInMemory = malloc( ( matches.length + 1 ) * 4 )
  	}
    for(let i = 0; i < matches.length; i++) {
      let relativeName = matches[i]
      if(localName && relativeName.startsWith(localName)) {
        relativeName = relativeName.substring(localName.length)
      }
      if(relativeName[0] == '/')
        relativeName = relativeName.substring(1)
      //matches.push(files[i])
      HEAPU32[(listInMemory + i*4)>>2] = FS_CopyString(stringToAddress(relativeName));
    }
    HEAPU32[(listInMemory>>2)+matches.length] = 0
    HEAPU32[numfiles >> 2] = matches.length
    // skip address-list because for-loop counts \0 with numfiles
    return listInMemory
  }

  function _Sys_LoadFunction() {
  	
  }

  function _Sys_LoadLibrary() {
  	
  }

  function _Sys_Microseconds() {
    if (window.performance.now) {
      return parseInt(window.performance.now(), 10);
    } else if (window.performance.webkitNow) {
      return parseInt(window.performance.webkitNow(), 10);
    }
  
    STD.sharedCounter += 8
    return STD.sharedMemory + STD.sharedCounter - 8
  }

  function _Sys_MilliSeconds() {
    if (!DATE.timeBase) {
      // javascript times are bigger, so start at zero
      //   pretend like we've been alive for at least a few seconds
      //   I actually had to do this because files it checking times and this caused a delay
      DATE.timeBase = Date.now();
    }
  
    //if (window.performance.now) {
    //  return parseInt(window.performance.now(), 10);
    //} else if (window.performance.webkitNow) {
    //  return parseInt(window.performance.webkitNow(), 10);
    //} else {
    return SYS.milliseconds - DATE.timeBase;
    //}
  }

  function _Sys_Milliseconds() {
    if (!DATE.timeBase) {
      // javascript times are bigger, so start at zero
      //   pretend like we've been alive for at least a few seconds
      //   I actually had to do this because files it checking times and this caused a delay
      DATE.timeBase = Date.now();
    }
  
    //if (window.performance.now) {
    //  return parseInt(window.performance.now(), 10);
    //} else if (window.performance.webkitNow) {
    //  return parseInt(window.performance.webkitNow(), 10);
    //} else {
    return SYS.milliseconds - DATE.timeBase;
    //}
  }

  function _Sys_Mkdir(filename) {
    let fileStr = addressToString(filename)
    let localName = fileStr
    if(localName.startsWith('/base')
      || localName.startsWith('/home'))
      localName = localName.substring('/base'.length)
    if(localName[0] == '/')
      localName = localName.substring(1)
  	// check if parent directory has been created, TODO: POSIX errno?
  	let parentDirectory = localName.substring(0, localName.lastIndexOf('/'))
  	if(parentDirectory && !FS.virtual[parentDirectory]) {
  		throw new Error('ENOENT')
  	}
    FS.virtual[localName] = {
      timestamp: new Date(),
      mode: FS_DIR,
    }
    // async to filesystem
    // does it REALLY matter if it makes it? wont it just redownload?
    Sys_notify(FS.virtual[localName], localName)
  }

  function _Sys_Print(message) {
  	let messageStr = addressToString(message)
  	if(messageStr.includes('Client Information')) {
  		messageTime = Date.now()
  	}
  	let stateMatch
  	if(Date.now() - messageTime < 100 && (stateMatch = (/state:\s*([0-9]+)/g).exec(messageStr))) {
  		SYS.state = parseInt(stateMatch[1])
  	}
  	if(messageStr.includes('error')
  		|| messageStr.includes('RE_Shutdown')
  		|| messageStr.includes('Hunk_Clear')
  		|| messageStr.includes('ERROR:')) {
  		console.error(messageStr)
  	} else {
  		console.log(messageStr)
  	}
  }

  function _Sys_RandomBytes(string, len) {
  	if(typeof crypto != 'undefined') {
  		crypto.getRandomValues((new Int8Array(ENV.memory.buffer)).slice(string, string+(len / 4)))
  	} else {
  		for(let i = 0; i < (len / 4); i++) {
  			ENV.memory.buffer[string] = Math.random() * 255
  		}
  	}
  	return true;
  }

  function _Sys_SendPacket(length, data, to) {
    let nameStr = addressToString(to + 10)
      || reverseLookup(HEAPU8.slice(to + 4, to + 8))
    if (nameStr && nameStr.includes('ws://')) {
      nameStr = nameStr.replace('ws://', '')
        .replace(/\:[0-9]+$/, '')
    }
    let fullMessage = new Uint8Array(
      4 + (nameStr ? (nameStr.length + 2) : 4)
      + 2 + length)
    fullMessage[0] = 0x00 // 0x05
    fullMessage[1] = 0x00 // 0x01
    fullMessage[2] = 0x00 // reserved
    if (nameStr) {
      fullMessage[3] = 0x03
      fullMessage[4] = nameStr.length + 1
      fullMessage.set(nameStr.split('').map(c => c.charCodeAt(0)), 5)
      fullMessage[5 + nameStr.length + 1] = HEAPU8[to + 8]
      fullMessage[5 + nameStr.length + 2] = HEAPU8[to + 9]
    } else {
      fullMessage[3] = 0x01
      fullMessage[4] = HEAPU8[to + 4]
      fullMessage[5] = HEAPU8[to + 5]
      fullMessage[6] = HEAPU8[to + 6]
      fullMessage[7] = HEAPU8[to + 7]
      fullMessage[8] = HEAPU8[to + 8]
      fullMessage[9] = HEAPU8[to + 9]
    }
    fullMessage.set(HEAPU8.slice(data, data + length), fullMessage.length - length);
    if (!NET.socket1 || NET.socket1.readyState != WebSocket.OPEN) {
      //NET.socket1Queue.push(fullMessage)
      //NET.socket2Queue.push(fullMessage)
    }
    if (NET.socket1 && NET.socket1.readyState == WebSocket.OPEN
      && NET.socket1.fresh >= 3) {
      NET.socket1.send(fullMessage)
    } else
      if (NET.socket2 && NET.socket2.readyState == WebSocket.OPEN
        && NET.socket2.fresh >= 3) {
        NET.socket2.send(fullMessage)
      }
  }

  function _Sys_SetStatus(status, replacementStr) {
  	// TODO: something like  window.title = , then setTimeout( window.title = 'Quake3e' again)
  	console.log(addressToString(status), replacementStr)
  	
  }

  function _Sys_StringToAdr(addr, net) {
    let addrStr = addressToString(addr)
  
    //if(addrStr.includes('local.games')) {
    //	debugger
    //}
  
    if (addrStr.match(/localhost/i)) {
      HEAPU32[net >> 2] = 2 /* NA_LOOPBACK */
      NET.lookup[addrStr] = [127, 0, 0, 1]
    } else
  
      if (typeof NET.lookup[addrStr] == 'undefined') {
        if (NET.lookupCount1 == 256) {
          NET.lookupCount2++;
          NET.lookupCount1 = 1;
        } else {
          NET.lookupCount1++;
        }
        HEAPU32[net >> 2] = 4 /* NA_IP */
        let ip = addrStr.match(/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/)
        if (ip) {
          NET.lookup[addrStr] = [
            parseInt(ip[1]), parseInt(ip[2]),
            parseInt(ip[3]), parseInt(ip[4]),
          ]
        } else {
          NET.lookup[addrStr] = [10, 0, NET.lookupCount2, NET.lookupCount1]
        }
      } else {
        HEAPU32[net >> 2] = 4 /* NA_IP */
      }
    HEAPU8[net + 4] = NET.lookup[addrStr][0];
    HEAPU8[net + 5] = NET.lookup[addrStr][1];
    HEAPU8[net + 6] = NET.lookup[addrStr][2];
    HEAPU8[net + 7] = NET.lookup[addrStr][3];
    return true
  }

  function _Sys_UnloadLibrary() {
  
  }

  function _Sys_fprintf(fp, fmt, args) {
  	let formatted = stringToAddress('DEADBEEF')
  	let length = sprintf(formatted, fmt, args)
  	if(length < 1 || !HEAPU32[formatted>>2]) {
  		formatted = fmt
  	}
  	Sys_fputs(formatted, fp)
  }

  function _Sys_longjmp(id, code) {
    let error = new Error('longjmp', id, code)
    error.stackPointer = id
    error.stackCode = code
    throw error
  }

  function _Sys_setjmp(id) {
    try {
      STD.longjumps[id] = stackSave()
    } catch (e) {
      if (e.message == 'longjmp') {
        stackRestore(STD.longjumps[jumps[jumps.length - 1]])
        //Sys_longjmp(STD.longjumps[jumps[jumps.length - 1]], e.stackCode)
        return
      }
      throw e
    }
  }

  function _Sys_time(tm) {
    // locale time is really complicated
    //   use simple Q3 time structure
    let now = new Date()
    let t = now / 1000
    if (tm) {
      HEAP32[(tm >> 2) + 5] = now.getFullYear() - 1900
      HEAP32[(tm >> 2) + 4] = now.getMonth() // already subtracted by 1
      HEAP32[(tm >> 2) + 3] = now.getDate()
      HEAP32[(tm >> 2) + 2] = (t / 60 / 60) % 24
      HEAP32[(tm >> 2) + 1] = (t / 60) % 60
      HEAP32[(tm >> 2) + 0] = t % 60
    }
    return t
  }

  function _Sys_umask() {}

  function _Sys_vfprintf(fp, fmt, args) {
  	let formatted = stringToAddress('DEADBEEF')
  	let length = sprintf(formatted, fmt, args)
  	if(length < 1 || !HEAPU32[formatted>>2]) {
  		formatted = fmt
  	}
  	Sys_fputs(formatted, fp)
  }

  /** @suppress {duplicate } */
  function syscallGetVarargI() {
      assert(SYSCALLS.varargs != undefined);
      // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
      var ret = HEAP32[((+SYSCALLS.varargs)>>2)];
      SYSCALLS.varargs += 4;
      return ret;
    }
  var syscallGetVarargP = syscallGetVarargI;
  
  
  var PATH = {
  isAbs:(path) => path.charAt(0) === '/',
  splitPath:(filename) => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
  normalizeArray:(parts, allowAboveRoot) => {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },
  normalize:(path) => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },
  dirname:(path) => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },
  basename:(path) => {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        path = PATH.normalize(path);
        path = path.replace(/\/$/, "");
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },
  join:(...paths) => PATH.normalize(paths.join('/')),
  join2:(l, r) => PATH.normalize(l + '/' + r),
  };
  
  var initRandomFill = () => {
      if (typeof crypto == 'object' && typeof crypto['getRandomValues'] == 'function') {
        // for modern web browsers
        return (view) => crypto.getRandomValues(view);
      } else
      if (ENVIRONMENT_IS_NODE) {
        // for nodejs with or without crypto support included
        try {
          var crypto_module = require('crypto');
          var randomFillSync = crypto_module['randomFillSync'];
          if (randomFillSync) {
            // nodejs with LTS crypto support
            return (view) => crypto_module['randomFillSync'](view);
          }
          // very old nodejs with the original crypto API
          var randomBytes = crypto_module['randomBytes'];
          return (view) => (
            view.set(randomBytes(view.byteLength)),
            // Return the original view to match modern native implementations.
            view
          );
        } catch (e) {
          // nodejs doesn't have crypto support
        }
      }
      // we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
      abort('no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: (array) => { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };');
    };
  var randomFill = (view) => {
      // Lazily init on the first invocation.
      return (randomFill = initRandomFill())(view);
    };
  
  
  
  var PATH_FS = {
  resolve:(...args) => {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? args[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path != 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = PATH.isAbs(path);
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },
  relative:(from, to) => {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      },
  };
  
  
  var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder() : undefined;
  
    /**
     * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
     * array that contains uint8 values, returns a copy of that string as a
     * Javascript String object.
     * heapOrArray is either a regular array, or a JavaScript typed array view.
     * @param {number} idx
     * @param {number=} maxBytesToRead
     * @return {string}
     */
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
  
  var FS_stdin_getChar_buffer = [];
  
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
  /** @type {function(string, boolean=, number=)} */
  function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  }
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (typeof window != 'undefined' &&
          typeof window.prompt == 'function') {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var TTY = {
  ttys:[],
  init() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process.stdin.setEncoding('utf8');
        // }
      },
  shutdown() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process.stdin.pause();
        // }
      },
  register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
  stream_ops:{
  open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
  close(stream) {
          // flush any pending line data
          stream.tty.ops.fsync(stream.tty);
        },
  fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
  read(stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
  write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        },
  },
  default_tty_ops:{
  get_char(tty) {
          return FS_stdin_getChar();
        },
  put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },
  fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        },
  ioctl_tcgets(tty) {
          // typical setting
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a, 0x00,
              0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]
          };
        },
  ioctl_tcsets(tty, optional_actions, data) {
          // currently just ignore
          return 0;
        },
  ioctl_tiocgwinsz(tty) {
          return [24, 80];
        },
  },
  default_tty1_ops:{
  put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
  fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        },
  },
  };
  
  
  var zeroMemory = (address, size) => {
      HEAPU8.fill(0, address, address + size);
      return address;
    };
  
  var alignMemory = (size, alignment) => {
      assert(alignment, "alignment argument is required");
      return Math.ceil(size / alignment) * alignment;
    };
  var mmapAlloc = (size) => {
      size = alignMemory(size, 65536);
      var ptr = _emscripten_builtin_memalign(65536, size);
      if (!ptr) return 0;
      return zeroMemory(ptr, size);
    };
  var MEMFS = {
  ops_table:null,
  mount(mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },
  createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(63);
        }
        MEMFS.ops_table ||= {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              allocate: MEMFS.stream_ops.allocate,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        };
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
          parent.timestamp = node.timestamp;
        }
        return node;
      },
  getFileDataAsTypedArray(node) {
        if (!node.contents) return new Uint8Array(0);
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },
  expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
        // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
        // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
        // avoid overshooting the allocation cap by a very large margin.
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity); // Allocate new storage.
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
      },
  resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
        } else {
          var oldContents = node.contents;
          node.contents = new Uint8Array(newSize); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
        }
      },
  node_ops:{
  getattr(node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
  setattr(node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
  lookup(parent, name) {
          throw FS.genericErrors[44];
        },
  mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
  rename(old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.parent.timestamp = Date.now()
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          new_dir.timestamp = old_node.parent.timestamp;
        },
  unlink(parent, name) {
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
  rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
  readdir(node) {
          var entries = ['.', '..'];
          for (var key of Object.keys(node.contents)) {
            entries.push(key);
          }
          return entries;
        },
  symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },
  readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        },
  },
  stream_ops:{
  read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },
  write(stream, buffer, offset, length, position, canOwn) {
          // The data buffer should be a typed array view
          assert(!(buffer instanceof ArrayBuffer));
  
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = buffer.slice(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) {
            // Use typed array write which is available.
            node.contents.set(buffer.subarray(offset, offset + length), position);
          } else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position + length);
          return length;
        },
  llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
  allocate(stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },
  mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
            // We can't emulate MAP_SHARED when the file is not backed by the
            // buffer we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < contents.length) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            HEAP8.set(contents, ptr);
          }
          return { ptr, allocated };
        },
  msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        },
  },
  };
  
  /** @param {boolean=} noRunDep */
  var asyncLoad = (url, onload, onerror, noRunDep) => {
      var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : '';
      readAsync(url).then(
        (arrayBuffer) => {
          assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        (err) => {
          if (onerror) {
            onerror();
          } else {
            throw `Loading data file "${url}" failed.`;
          }
        }
      );
      if (dep) addRunDependency(dep);
    };
  
  
  var FS_createDataFile = (parent, name, fileData, canRead, canWrite, canOwn) => {
      FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
    };
  
  var preloadPlugins = Module['preloadPlugins'] || [];
  var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
      // Ensure plugins are ready.
      if (typeof Browser != 'undefined') Browser.init();
  
      var handled = false;
      preloadPlugins.forEach((plugin) => {
        if (handled) return;
        if (plugin['canHandle'](fullname)) {
          plugin['handle'](byteArray, fullname, finish, onerror);
          handled = true;
        }
      });
      return handled;
    };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
      function processData(byteArray) {
        function finish(byteArray) {
          preFinish?.();
          if (!dontCreateFile) {
            FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
          }
          onload?.();
          removeRunDependency(dep);
        }
        if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
          onerror?.();
          removeRunDependency(dep);
        })) {
          return;
        }
        finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == 'string') {
        asyncLoad(url, processData, onerror);
      } else {
        processData(url);
      }
    };
  
  var FS_modeStringToFlags = (str) => {
      var flagModes = {
        'r': 0,
        'r+': 2,
        'w': 512 | 64 | 1,
        'w+': 512 | 64 | 2,
        'a': 1024 | 64 | 1,
        'a+': 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == 'undefined') {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
  
  var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
  
  
  
  
  
  
    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index (i.e. maxBytesToRead will not
     *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
     *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
     *   JS JIT optimizations off, so it is worth to consider consistently using one
     * @return {string}
     */
  var UTF8ToString = (ptr, maxBytesToRead) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
    };
  
  var strError = (errno) => {
      return UTF8ToString(_strerror(errno));
    };
  
  var ERRNO_CODES = {
      'EPERM': 63,
      'ENOENT': 44,
      'ESRCH': 71,
      'EINTR': 27,
      'EIO': 29,
      'ENXIO': 60,
      'E2BIG': 1,
      'ENOEXEC': 45,
      'EBADF': 8,
      'ECHILD': 12,
      'EAGAIN': 6,
      'EWOULDBLOCK': 6,
      'ENOMEM': 48,
      'EACCES': 2,
      'EFAULT': 21,
      'ENOTBLK': 105,
      'EBUSY': 10,
      'EEXIST': 20,
      'EXDEV': 75,
      'ENODEV': 43,
      'ENOTDIR': 54,
      'EISDIR': 31,
      'EINVAL': 28,
      'ENFILE': 41,
      'EMFILE': 33,
      'ENOTTY': 59,
      'ETXTBSY': 74,
      'EFBIG': 22,
      'ENOSPC': 51,
      'ESPIPE': 70,
      'EROFS': 69,
      'EMLINK': 34,
      'EPIPE': 64,
      'EDOM': 18,
      'ERANGE': 68,
      'ENOMSG': 49,
      'EIDRM': 24,
      'ECHRNG': 106,
      'EL2NSYNC': 156,
      'EL3HLT': 107,
      'EL3RST': 108,
      'ELNRNG': 109,
      'EUNATCH': 110,
      'ENOCSI': 111,
      'EL2HLT': 112,
      'EDEADLK': 16,
      'ENOLCK': 46,
      'EBADE': 113,
      'EBADR': 114,
      'EXFULL': 115,
      'ENOANO': 104,
      'EBADRQC': 103,
      'EBADSLT': 102,
      'EDEADLOCK': 16,
      'EBFONT': 101,
      'ENOSTR': 100,
      'ENODATA': 116,
      'ETIME': 117,
      'ENOSR': 118,
      'ENONET': 119,
      'ENOPKG': 120,
      'EREMOTE': 121,
      'ENOLINK': 47,
      'EADV': 122,
      'ESRMNT': 123,
      'ECOMM': 124,
      'EPROTO': 65,
      'EMULTIHOP': 36,
      'EDOTDOT': 125,
      'EBADMSG': 9,
      'ENOTUNIQ': 126,
      'EBADFD': 127,
      'EREMCHG': 128,
      'ELIBACC': 129,
      'ELIBBAD': 130,
      'ELIBSCN': 131,
      'ELIBMAX': 132,
      'ELIBEXEC': 133,
      'ENOSYS': 52,
      'ENOTEMPTY': 55,
      'ENAMETOOLONG': 37,
      'ELOOP': 32,
      'EOPNOTSUPP': 138,
      'EPFNOSUPPORT': 139,
      'ECONNRESET': 15,
      'ENOBUFS': 42,
      'EAFNOSUPPORT': 5,
      'EPROTOTYPE': 67,
      'ENOTSOCK': 57,
      'ENOPROTOOPT': 50,
      'ESHUTDOWN': 140,
      'ECONNREFUSED': 14,
      'EADDRINUSE': 3,
      'ECONNABORTED': 13,
      'ENETUNREACH': 40,
      'ENETDOWN': 38,
      'ETIMEDOUT': 73,
      'EHOSTDOWN': 142,
      'EHOSTUNREACH': 23,
      'EINPROGRESS': 26,
      'EALREADY': 7,
      'EDESTADDRREQ': 17,
      'EMSGSIZE': 35,
      'EPROTONOSUPPORT': 66,
      'ESOCKTNOSUPPORT': 137,
      'EADDRNOTAVAIL': 4,
      'ENETRESET': 39,
      'EISCONN': 30,
      'ENOTCONN': 53,
      'ETOOMANYREFS': 141,
      'EUSERS': 136,
      'EDQUOT': 19,
      'ESTALE': 72,
      'ENOTSUP': 138,
      'ENOMEDIUM': 148,
      'EILSEQ': 25,
      'EOVERFLOW': 61,
      'ECANCELED': 11,
      'ENOTRECOVERABLE': 56,
      'EOWNERDEAD': 62,
      'ESTRPIPE': 135,
    };
  var FS = {
  root:null,
  mounts:[],
  devices:{
  },
  streams:[],
  nextInode:1,
  nameTable:null,
  currentPath:"/",
  initialized:false,
  ignorePermissions:true,
  ErrnoError:class extends Error {
        // We set the `name` property to be able to identify `FS.ErrnoError`
        // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
        // - when using PROXYFS, an error can come from an underlying FS
        // as different FS objects have their own FS.ErrnoError each,
        // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
        // we'll use the reliable test `err.name == "ErrnoError"` instead
        constructor(errno) {
          super(runtimeInitialized ? strError(errno) : '');
          // TODO(sbc): Use the inline member declaration syntax once we
          // support it in acorn and closure.
          this.name = 'ErrnoError';
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        }
      },
  genericErrors:{
  },
  filesystems:null,
  syncFSRequests:0,
  FSStream:class {
        constructor() {
          // TODO(https://github.com/emscripten-core/emscripten/issues/21414):
          // Use inline field declarations.
          this.shared = {};
        }
        get object() {
          return this.node;
        }
        set object(val) {
          this.node = val;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return (this.flags & 1024);
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(val) {
          this.shared.flags = val;
        }
        get position() {
          return this.shared.position;
        }
        set position(val) {
          this.shared.position = val;
        }
      },
  FSNode:class {
        constructor(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;  // root node sets parent to itself
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.mounted = null;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.node_ops = {};
          this.stream_ops = {};
          this.rdev = rdev;
          this.readMode = 292/*292*/ | 73/*73*/;
          this.writeMode = 146/*146*/;
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(val) {
          val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(val) {
          val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
      },
  lookupPath(path, opts = {}) {
        path = PATH_FS.resolve(path);
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        opts = Object.assign(defaults, opts)
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(32);
        }
  
        // split the absolute path
        var parts = path.split('/').filter((p) => !!p);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count + 1 });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(32);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },
  getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? `${mount}/${path}` : mount + path;
          }
          path = path ? `${node.name}/${path}` : node.name;
          node = node.parent;
        }
      },
  hashName(parentid, name) {
        var hash = 0;
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },
  hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
  hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
  lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },
  createNode(parent, name, mode, rdev) {
        assert(typeof parent == 'object')
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },
  destroyNode(node) {
        FS.hashRemoveNode(node);
      },
  isRoot(node) {
        return node === node.parent;
      },
  isMountpoint(node) {
        return !!node.mounted;
      },
  isFile(mode) {
        return (mode & 61440) === 32768;
      },
  isDir(mode) {
        return (mode & 61440) === 16384;
      },
  isLink(mode) {
        return (mode & 61440) === 40960;
      },
  isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
  isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
  isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
  isSocket(mode) {
        return (mode & 49152) === 49152;
      },
  flagsToPermissionString(flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },
  nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.includes('r') && !(node.mode & 292)) {
          return 2;
        } else if (perms.includes('w') && !(node.mode & 146)) {
          return 2;
        } else if (perms.includes('x') && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
  mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, 'x');
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
  mayCreate(dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },
  mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, 'wx');
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return 31;
          }
        }
        return 0;
      },
  mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return 31;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },
  MAX_OPEN_FDS:4096,
  nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
  getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
  getStream:(fd) => FS.streams[fd],
  createStream(stream, fd = -1) {
        assert(fd >= -1);
  
        // clone it, so we can return an instance of FSStream
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
  closeStream(fd) {
        FS.streams[fd] = null;
      },
  dupStream(origStream, fd = -1) {
        var stream = FS.createStream(origStream, fd);
        stream.stream_ops?.dup?.(stream);
        return stream;
      },
  chrdev_stream_ops:{
  open(stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          stream.stream_ops.open?.(stream);
        },
  llseek() {
          throw new FS.ErrnoError(70);
        },
  },
  major:(dev) => ((dev) >> 8),
  minor:(dev) => ((dev) & 0xff),
  makedev:(ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
  getDevice:(dev) => FS.devices[dev],
  getMounts(mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push(...m.mounts);
        }
  
        return mounts;
      },
  syncfs(populate, callback) {
        if (typeof populate == 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(errCode) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(errCode);
        }
  
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach((mount) => {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },
  mount(type, opts, mountpoint) {
        if (typeof type == 'string') {
          // The filesystem was not included, and instead we have an error
          // message stored in the variable.
          throw type;
        }
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
  
        var mount = {
          type,
          opts,
          mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },
  unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach((hash) => {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },
  lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
  mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
  create(path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
  mkdir(path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
  mkdirTree(path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != 20) throw e;
          }
        }
      },
  mkdev(path, mode, dev) {
        if (typeof dev == 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
  symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
  rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
  
        // let the errors from non existent directories percolate up
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
  
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(28);
        }
        // new path should not be an ancestor of the old path
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(55);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        errCode = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(10);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, 'w');
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
          // update old node (we do this here to avoid each backend 
          // needing to)
          old_node.parent = new_dir;
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
      },
  rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
  readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(54);
        }
        return node.node_ops.readdir(node);
      },
  unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
  readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },
  stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(63);
        }
        return node.node_ops.getattr(node);
      },
  lstat(path) {
        return FS.stat(path, true);
      },
  chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },
  lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
  fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.chmod(stream.node, mode);
      },
  chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },
  lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
  fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.chown(stream.node, uid, gid);
      },
  truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, 'w');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },
  ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.truncate(stream.node, len);
      },
  utime(path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },
  open(path, flags, mode) {
        if (path === "") {
          throw new FS.ErrnoError(44);
        }
        flags = typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;
        if ((flags & 64)) {
          mode = typeof mode == 'undefined' ? 438 /* 0666 */ : mode;
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path == 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(20);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // do truncation if necessary
        if ((flags & 512) && !created) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512 | 131072);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        });
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
          }
        }
        return stream;
      },
  close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
  isClosed(stream) {
        return stream.fd === null;
      },
  llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
  read(stream, buffer, offset, length, position) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
  write(stream, buffer, offset, length, position, canOwn) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
  allocate(stream, offset, length) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(28);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(138);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },
  mmap(stream, length, position, prot, flags) {
        // User requests writing to file (prot & PROT_WRITE != 0).
        // Checking if we have permissions to write to the file unless
        // MAP_PRIVATE flag is set. According to POSIX spec it is possible
        // to write to file opened in read-only mode with MAP_PRIVATE flag,
        // as all modifications will be visible only in the memory of
        // the current process.
        if ((prot & 2) !== 0
            && (flags & 2) === 0
            && (stream.flags & 2097155) !== 2) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
  msync(stream, buffer, offset, length, mmapFlags) {
        assert(offset >= 0);
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },
  ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
  readFile(path, opts = {}) {
        opts.flags = opts.flags || 0;
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error(`Invalid encoding type "${opts.encoding}"`);
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },
  writeFile(path, data, opts = {}) {
        opts.flags = opts.flags || 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data == 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
        }
        FS.close(stream);
      },
  cwd:() => FS.currentPath,
  chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, 'x');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
  createDefaultDirectories() {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },
  createDefaultDevices() {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length,
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using err() rather than out()
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        // use a buffer to avoid overhead of individual crypto calls per byte
        var randomBuffer = new Uint8Array(1024), randomLeft = 0;
        var randomByte = () => {
          if (randomLeft === 0) {
            randomLeft = randomFill(randomBuffer).byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice('/dev', 'random', randomByte);
        FS.createDevice('/dev', 'urandom', randomByte);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },
  createSpecialDirectories() {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
        // name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        var proc_self = FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount() {
            var node = FS.createNode(proc_self, 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup(parent, name) {
                var fd = +name;
                var stream = FS.getStreamChecked(fd);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: () => stream.path },
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },
  createStandardStreams() {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 0);
        var stdout = FS.open('/dev/stdout', 1);
        var stderr = FS.open('/dev/stderr', 1);
        assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
        assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
        assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
      },
  staticInit() {
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [44].forEach((code) => {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
        };
      },
  init(input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },
  quit() {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        _fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },
  findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
  analyzePath(path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },
  createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },
  createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == 'string' ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data == 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
      },
  createDevice(parent, name, input, output) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            // flush any pending line data
            if (output?.buffer?.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
  forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (typeof XMLHttpRequest != 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else { // Command-line.
          try {
            obj.contents = readBinary(obj.url);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
      },
  createLazyFile(parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array).
        // Actual getting is abstracted away for eventual reuse.
        class LazyUint8Array {
          constructor() {
            this.lengthKnown = false;
            this.chunks = []; // Loaded chunks. Index is the chunk number
          }
          get(idx) {
            if (idx > this.length-1 || idx < 0) {
              return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize)|0;
            return this.getter(chunkNum)[chunkOffset];
          }
          setDataGetter(getter) {
            this.getter = getter;
          }
          cacheLength() {
            // Find length
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
            var chunkSize = 1024*1024; // Chunk size in bytes
  
            if (!hasByteServing) chunkSize = datalength;
  
            // Function to get a range from the remote URL.
            var doXHR = (from, to) => {
              if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
              if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
              // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, false);
              if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
              // Some hints to the browser that we want binary data.
              xhr.responseType = 'arraybuffer';
              if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/plain; charset=x-user-defined');
              }
  
              xhr.send(null);
              if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
              if (xhr.response !== undefined) {
                return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
              }
              return intArrayFromString(xhr.responseText || '', true);
            };
            var lazyArray = this;
            lazyArray.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum+1) * chunkSize - 1; // including this byte
              end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
                lazyArray.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') throw new Error('doXHR failed!');
              return lazyArray.chunks[chunkNum];
            });
  
            if (usesGzip || !datalength) {
              // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
              chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out("LazyFiles on gzip forces download of the whole file when length is accessed");
            }
  
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          }
          get length() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
          get chunkSize() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
  
        if (typeof XMLHttpRequest != 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach((key) => {
          var fn = node.stream_ops[key];
          stream_ops[key] = (...args) => {
            FS.forceLoadFile(node);
            return fn(...args);
          };
        });
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        // use a custom read function
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position)
        };
        // use a custom mmap function
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, HEAP8, ptr, length, position);
          return { ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
  absolutePath() {
        abort('FS.absolutePath has been removed; use PATH_FS.resolve instead');
      },
  createFolder() {
        abort('FS.createFolder has been removed; use FS.mkdir instead');
      },
  createLink() {
        abort('FS.createLink has been removed; use FS.symlink instead');
      },
  joinPath() {
        abort('FS.joinPath has been removed; use PATH.join instead');
      },
  mmapAlloc() {
        abort('FS.mmapAlloc has been replaced by the top level function mmapAlloc');
      },
  standardizePath() {
        abort('FS.standardizePath has been removed; use PATH.normalize instead');
      },
  };
  
  var SYSCALLS = {
  DEFAULT_POLLMASK:5,
  calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
          return path;
        }
        // relative path
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = SYSCALLS.getStreamFromFD(dirfd);
          dir = dirstream.path;
        }
        if (path.length == 0) {
          if (!allowEmpty) {
            throw new FS.ErrnoError(44);;
          }
          return dir;
        }
        return PATH.join2(dir, path);
      },
  doStat(func, path, buf) {
        var stat = func(path);
        HEAP32[((buf)>>2)] = stat.dev;
        HEAP32[(((buf)+(4))>>2)] = stat.mode;
        HEAPU32[(((buf)+(8))>>2)] = stat.nlink;
        HEAP32[(((buf)+(12))>>2)] = stat.uid;
        HEAP32[(((buf)+(16))>>2)] = stat.gid;
        HEAP32[(((buf)+(20))>>2)] = stat.rdev;
        (tempI64 = [stat.size>>>0,(tempDouble = stat.size,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(24))>>2)] = tempI64[0],HEAP32[(((buf)+(28))>>2)] = tempI64[1]);
        HEAP32[(((buf)+(32))>>2)] = 4096;
        HEAP32[(((buf)+(36))>>2)] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        (tempI64 = [Math.floor(atime / 1000)>>>0,(tempDouble = Math.floor(atime / 1000),(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(40))>>2)] = tempI64[0],HEAP32[(((buf)+(44))>>2)] = tempI64[1]);
        HEAPU32[(((buf)+(48))>>2)] = (atime % 1000) * 1000;
        (tempI64 = [Math.floor(mtime / 1000)>>>0,(tempDouble = Math.floor(mtime / 1000),(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(56))>>2)] = tempI64[0],HEAP32[(((buf)+(60))>>2)] = tempI64[1]);
        HEAPU32[(((buf)+(64))>>2)] = (mtime % 1000) * 1000;
        (tempI64 = [Math.floor(ctime / 1000)>>>0,(tempDouble = Math.floor(ctime / 1000),(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(72))>>2)] = tempI64[0],HEAP32[(((buf)+(76))>>2)] = tempI64[1]);
        HEAPU32[(((buf)+(80))>>2)] = (ctime % 1000) * 1000;
        (tempI64 = [stat.ino>>>0,(tempDouble = stat.ino,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(88))>>2)] = tempI64[0],HEAP32[(((buf)+(92))>>2)] = tempI64[1]);
        return 0;
      },
  doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (flags & 2) {
          // MAP_PRIVATE calls need not to be synced back to underlying fs
          return 0;
        }
        var buffer = HEAPU8.slice(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags);
      },
  getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream;
      },
  varargs:undefined,
  getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
  };
  function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = syscallGetVarargI();
          if (arg < 0) {
            return -28;
          }
          while (FS.streams[arg]) {
            arg++;
          }
          var newStream;
          newStream = FS.dupStream(stream, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = syscallGetVarargI();
          stream.flags |= arg;
          return 0;
        }
        case 12: {
          var arg = syscallGetVarargP();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)] = 2;
          return 0;
        }
        case 13:
        case 14:
          return 0; // Pretend that the locking is successful.
      }
      return -28;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  
  function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21505: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcgets) {
            var termios = stream.tty.ops.ioctl_tcgets(stream);
            var argp = syscallGetVarargP();
            HEAP32[((argp)>>2)] = termios.c_iflag || 0;
            HEAP32[(((argp)+(4))>>2)] = termios.c_oflag || 0;
            HEAP32[(((argp)+(8))>>2)] = termios.c_cflag || 0;
            HEAP32[(((argp)+(12))>>2)] = termios.c_lflag || 0;
            for (var i = 0; i < 32; i++) {
              HEAP8[(argp + i)+(17)] = termios.c_cc[i] || 0;
            }
            return 0;
          }
          return 0;
        }
        case 21510:
        case 21511:
        case 21512: {
          if (!stream.tty) return -59;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcsets) {
            var argp = syscallGetVarargP();
            var c_iflag = HEAP32[((argp)>>2)];
            var c_oflag = HEAP32[(((argp)+(4))>>2)];
            var c_cflag = HEAP32[(((argp)+(8))>>2)];
            var c_lflag = HEAP32[(((argp)+(12))>>2)];
            var c_cc = []
            for (var i = 0; i < 32; i++) {
              c_cc.push(HEAP8[(argp + i)+(17)]);
            }
            return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
          }
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = syscallGetVarargP();
          HEAP32[((argp)>>2)] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28; // not supported
        }
        case 21531: {
          var argp = syscallGetVarargP();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tiocgwinsz) {
            var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
            var argp = syscallGetVarargP();
            HEAP16[((argp)>>1)] = winsize[0];
            HEAP16[(((argp)+(2))>>1)] = winsize[1];
          }
          return 0;
        }
        case 21524: {
          // TODO: technically, this ioctl call should change the window size.
          // but, since emscripten doesn't have any concept of a terminal window
          // yet, we'll just silently throw it away as we do TIOCGWINSZ
          if (!stream.tty) return -59;
          return 0;
        }
        case 21515: {
          if (!stream.tty) return -59;
          return 0;
        }
        default: return -28; // not supported
      }
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  
  function ___syscall_openat(dirfd, path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      var mode = varargs ? syscallGetVarargI() : 0;
      return FS.open(path, flags, mode).fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
  try {
  
      oldpath = SYSCALLS.getStr(oldpath);
      newpath = SYSCALLS.getStr(newpath);
      oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
      newpath = SYSCALLS.calculateAt(newdirfd, newpath);
      FS.rename(oldpath, newpath);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_rmdir(path) {
  try {
  
      path = SYSCALLS.getStr(path);
      FS.rmdir(path);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_unlinkat(dirfd, path, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      if (flags === 0) {
        FS.unlink(path);
      } else if (flags === 512) {
        FS.rmdir(path);
      } else {
        abort('Invalid flags passed to unlinkat');
      }
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);

  var isLeapYear = (year) => year%4 === 0 && (year%100 !== 0 || year%400 === 0);
  
  var MONTH_DAYS_LEAP_CUMULATIVE = [0,31,60,91,121,152,182,213,244,274,305,335];
  
  var MONTH_DAYS_REGULAR_CUMULATIVE = [0,31,59,90,120,151,181,212,243,273,304,334];
  var ydayFromDate = (date) => {
      var leap = isLeapYear(date.getFullYear());
      var monthDaysCumulative = (leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE);
      var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1
  
      return yday;
    };
  
  var convertI32PairToI53Checked = (lo, hi) => {
      assert(lo == (lo >>> 0) || lo == (lo|0)); // lo should either be a i32 or a u32
      assert(hi === (hi|0));                    // hi should be a i32
      return ((hi + 0x200000) >>> 0 < 0x400001 - !!lo) ? (lo >>> 0) + hi * 4294967296 : NaN;
    };
  function __localtime_js(time_low, time_high,tmPtr) {
    var time = convertI32PairToI53Checked(time_low, time_high);
  
    
      var date = new Date(time*1000);
      HEAP32[((tmPtr)>>2)] = date.getSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getDay();
  
      var yday = ydayFromDate(date)|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
      HEAP32[(((tmPtr)+(36))>>2)] = -(date.getTimezoneOffset() * 60);
  
      // Attention: DST is in December in South, and some regions don't have DST at all.
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset))|0;
      HEAP32[(((tmPtr)+(32))>>2)] = dst;
    ;
  }

  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
  
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
      // TODO: Use (malleable) environment variables instead of system settings.
      var currentYear = new Date().getFullYear();
      var winter = new Date(currentYear, 0, 1);
      var summer = new Date(currentYear, 6, 1);
      var winterOffset = winter.getTimezoneOffset();
      var summerOffset = summer.getTimezoneOffset();
  
      // Local standard timezone offset. Local standard time is not adjusted for
      // daylight savings.  This code uses the fact that getTimezoneOffset returns
      // a greater value during Standard Time versus Daylight Saving Time (DST).
      // Thus it determines the expected output during Standard Time, and it
      // compares whether the output of the given date the same (Standard) or less
      // (DST).
      var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
  
      // timezone is specified as seconds west of UTC ("The external variable
      // `timezone` shall be set to the difference, in seconds, between
      // Coordinated Universal Time (UTC) and local standard time."), the same
      // as returned by stdTimezoneOffset.
      // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
      HEAPU32[((timezone)>>2)] = stdTimezoneOffset * 60;
  
      HEAP32[((daylight)>>2)] = Number(winterOffset != summerOffset);
  
      var extractZone = (timezoneOffset) => {
        // Why inverse sign?
        // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
        var sign = timezoneOffset >= 0 ? "-" : "+";
  
        var absOffset = Math.abs(timezoneOffset)
        var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
        var minutes = String(absOffset % 60).padStart(2, "0");
  
        return `UTC${sign}${hours}${minutes}`;
      }
  
      var winterName = extractZone(winterOffset);
      var summerName = extractZone(summerOffset);
      assert(winterName);
      assert(summerName);
      assert(lengthBytesUTF8(winterName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${winterName})`);
      assert(lengthBytesUTF8(summerName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${summerName})`);
      if (summerOffset < winterOffset) {
        // Northern hemisphere
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17);
      } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17);
      }
    };

  var getHeapMax = () =>
      HEAPU8.length;
  
  var abortOnCannotGrowMemory = (requestedSize) => {
      abort(`Cannot enlarge memory arrays to size ${requestedSize} bytes (OOM). Either (1) compile with -sINITIAL_MEMORY=X with X higher than the current value ${HEAP8.length}, (2) compile with -sALLOW_MEMORY_GROWTH which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with -sABORTING_MALLOC=0`);
    };
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      abortOnCannotGrowMemory(requestedSize);
    };

  function _exit(code) {
  	SYS.exited = true
  	GLimp_Shutdown(true)
  	NET_Shutdown()
  	if(SYS.frameInterval) {
  		clearInterval(SYS.frameInterval)
  		SYS.frameInterval = null
  	}
  	if(code == 0) {
  		Sys_Return()
  	}
  	if(	GL.canvas ) {
  		GL.canvas.remove()
  	}
  }

  function _fd_close(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  /** @param {number=} offset */
  var doReadv = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        var curr = FS.read(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break; // nothing more to read
        if (typeof offset != 'undefined') {
          offset += curr;
        }
      }
      return ret;
    };
  
  function _fd_read(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doReadv(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  
  function _fd_seek(fd,offset_low, offset_high,whence,newOffset) {
    var offset = convertI32PairToI53Checked(offset_low, offset_high);
  
    
  try {
  
      if (isNaN(offset)) return 61;
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.llseek(stream, offset, whence);
      (tempI64 = [stream.position>>>0,(tempDouble = stream.position,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[((newOffset)>>2)] = tempI64[0],HEAP32[(((newOffset)+(4))>>2)] = tempI64[1]);
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
  }

  /** @param {number=} offset */
  var doWritev = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        var curr = FS.write(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (typeof offset != 'undefined') {
          offset += curr;
        }
      }
      return ret;
    };
  
  function _fd_write(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doWritev(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

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
  
        if (!Module.useWebGL) return; // a 2D canvas may be currently used TODO: make sure we are actually called in that case
  
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
  
  var _glEnable = (x0) => GLctx.enable(x0);
  
  var _glDisable = (x0) => GLctx.disable(x0);
  
  var _glIsEnabled = (x0) => GLctx.isEnabled(x0);
  
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
  
  
  var _glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);
  
  
  
  var stringToNewUTF8 = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = _malloc(size);
      if (ret) stringToUTF8(str, ret, size);
      return ret;
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
            ret = stringToNewUTF8(webglGetExtensions().join(' '));
            break;
          case 0x1F00 /* GL_VENDOR */:
          case 0x1F01 /* GL_RENDERER */:
          case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
          case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
            var s = GLctx.getParameter(name_);
            if (!s) {
              GL.recordError(0x500/*GL_INVALID_ENUM*/);
            }
            ret = s ? stringToNewUTF8(s) : 0;
            break;
  
          case 0x1F02 /* GL_VERSION */:
            var glVersion = GLctx.getParameter(0x1F02 /*GL_VERSION*/);
            // return GLES version string corresponding to the version of the WebGL context
            {
              glVersion = `OpenGL ES 2.0 (${glVersion})`;
            }
            ret = stringToNewUTF8(glVersion);
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
            ret = stringToNewUTF8(glslVersion);
            break;
          default:
            GL.recordError(0x500/*GL_INVALID_ENUM*/);
            // fall through
        }
        GL.stringCache[name_] = ret;
      }
      return ret;
    };
  
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
              var ret = stringToNewUTF8(getEmscriptenSupportedExtensions(GLctx).join(' ') +
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





  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.staticInit();;
/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDrawArrays;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDrawElements;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glActiveTexture;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glEnable;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDisable;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glTexEnvf;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glTexEnvi;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glTexEnvfv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetIntegerv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glIsEnabled;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetBooleanv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetString;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glCreateShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glShaderSource;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glCompileShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glAttachShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDetachShader;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glUseProgram;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDeleteProgram;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glBindAttribLocation;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glLinkProgram;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glBindBuffer;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glGetFloatv;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glHint;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glEnableVertexAttribArray;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glDisableVertexAttribArray;/**@suppress {duplicate, undefinedVars}*/var _emscripten_glVertexAttribPointer;/**@suppress {duplicate, undefinedVars}*/var _glTexEnvf;/**@suppress {duplicate, undefinedVars}*/var _glTexEnvi;/**@suppress {duplicate, undefinedVars}*/var _glTexEnvfv;/**@suppress {duplicate, undefinedVars}*/var _glGetTexEnviv;/**@suppress {duplicate, undefinedVars}*/var _glGetTexEnvfv;GLEmulation.init();;
GLImmediate.setupFuncs(); Browser.moduleContextCreatedCallbacks.push(() => GLImmediate.init());;

      // exports
      Module["requestFullscreen"] = Browser.requestFullscreen;
      Module["requestFullScreen"] = Browser.requestFullScreen;
      Module["requestAnimationFrame"] = Browser.requestAnimationFrame;
      Module["setCanvasSize"] = Browser.setCanvasSize;
      Module["pauseMainLoop"] = Browser.mainLoop.pause;
      Module["resumeMainLoop"] = Browser.mainLoop.resume;
      Module["getUserMedia"] = Browser.getUserMedia;
      Module["createContext"] = Browser.createContext;
      var preloadedImages = {};
      var preloadedAudios = {};;
var GLctx;;
function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
}
var wasmImports = {
  /** @export */
  CL_Download: _CL_Download,
  /** @export */
  CL_cURL_BeginDownload: _CL_cURL_BeginDownload,
  /** @export */
  Com_DL_Cleanup: _Com_DL_Cleanup,
  /** @export */
  Com_RealTime: _Com_RealTime,
  /** @export */
  DebugBreak: _DebugBreak,
  /** @export */
  GL_GetDrawableSize: _GL_GetDrawableSize,
  /** @export */
  GL_GetProcAddress: _GL_GetProcAddress,
  /** @export */
  GLimp_Shutdown: _GLimp_Shutdown,
  /** @export */
  GLimp_StartDriverAndSetMode: _GLimp_StartDriverAndSetMode,
  /** @export */
  IN_Init: _IN_Init,
  /** @export */
  NET_AdrToString: _NET_AdrToString,
  /** @export */
  NET_OpenIP: _NET_OpenIP,
  /** @export */
  NET_Sleep: _NET_Sleep,
  /** @export */
  SNDDMA_Init: _SNDDMA_Init,
  /** @export */
  SNDDMA_Shutdown: _SNDDMA_Shutdown,
  /** @export */
  S_Base_AddLoopingSound: _S_Base_AddLoopingSound,
  /** @export */
  S_Base_AddRealLoopingSound: _S_Base_AddRealLoopingSound,
  /** @export */
  S_Base_ClearLoopingSounds: _S_Base_ClearLoopingSounds,
  /** @export */
  S_Base_ClearSoundBuffer: _S_Base_ClearSoundBuffer,
  /** @export */
  S_Base_RawSamples: _S_Base_RawSamples,
  /** @export */
  S_Base_Respatialize: _S_Base_Respatialize,
  /** @export */
  S_Base_StartBackgroundTrack: _S_Base_StartBackgroundTrack,
  /** @export */
  S_Base_StartLocalSound: _S_Base_StartLocalSound,
  /** @export */
  S_Base_StartSound: _S_Base_StartSound,
  /** @export */
  S_Base_StopAllSounds: _S_Base_StopAllSounds,
  /** @export */
  S_Base_StopBackgroundTrack: _S_Base_StopBackgroundTrack,
  /** @export */
  S_Base_StopLoopingSound: _S_Base_StopLoopingSound,
  /** @export */
  S_Base_Update: _S_Base_Update,
  /** @export */
  S_Base_UpdateEntityPosition: _S_Base_UpdateEntityPosition,
  /** @export */
  S_CodecInit: _S_CodecInit,
  /** @export */
  S_CodecShutdown: _S_CodecShutdown,
  /** @export */
  S_LoadSound: _S_LoadSound,
  /** @export */
  Sys_Error: _Sys_Error,
  /** @export */
  Sys_Exit: _Sys_Exit,
  /** @export */
  Sys_FClose: _Sys_FClose,
  /** @export */
  Sys_FOpen: _Sys_FOpen,
  /** @export */
  Sys_FRead: _Sys_FRead,
  /** @export */
  Sys_FSeek: _Sys_FSeek,
  /** @export */
  Sys_FTell: _Sys_FTell,
  /** @export */
  Sys_FWrite: _Sys_FWrite,
  /** @export */
  Sys_GetFileStats: _Sys_GetFileStats,
  /** @export */
  Sys_IsLANAddress: _Sys_IsLANAddress,
  /** @export */
  Sys_ListFiles: _Sys_ListFiles,
  /** @export */
  Sys_LoadFunction: _Sys_LoadFunction,
  /** @export */
  Sys_LoadLibrary: _Sys_LoadLibrary,
  /** @export */
  Sys_Microseconds: _Sys_Microseconds,
  /** @export */
  Sys_MilliSeconds: _Sys_MilliSeconds,
  /** @export */
  Sys_Milliseconds: _Sys_Milliseconds,
  /** @export */
  Sys_Mkdir: _Sys_Mkdir,
  /** @export */
  Sys_Print: _Sys_Print,
  /** @export */
  Sys_RandomBytes: _Sys_RandomBytes,
  /** @export */
  Sys_SendPacket: _Sys_SendPacket,
  /** @export */
  Sys_SetStatus: _Sys_SetStatus,
  /** @export */
  Sys_StringToAdr: _Sys_StringToAdr,
  /** @export */
  Sys_UnloadLibrary: _Sys_UnloadLibrary,
  /** @export */
  Sys_fprintf: _Sys_fprintf,
  /** @export */
  Sys_longjmp: _Sys_longjmp,
  /** @export */
  Sys_setjmp: _Sys_setjmp,
  /** @export */
  Sys_time: _Sys_time,
  /** @export */
  Sys_umask: _Sys_umask,
  /** @export */
  Sys_vfprintf: _Sys_vfprintf,
  /** @export */
  __syscall_fcntl64: ___syscall_fcntl64,
  /** @export */
  __syscall_ioctl: ___syscall_ioctl,
  /** @export */
  __syscall_openat: ___syscall_openat,
  /** @export */
  __syscall_renameat: ___syscall_renameat,
  /** @export */
  __syscall_rmdir: ___syscall_rmdir,
  /** @export */
  __syscall_unlinkat: ___syscall_unlinkat,
  /** @export */
  _emscripten_memcpy_js: __emscripten_memcpy_js,
  /** @export */
  _localtime_js: __localtime_js,
  /** @export */
  _tzset_js: __tzset_js,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  exit: _exit,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_read: _fd_read,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_write: _fd_write
};
var wasmExports = createWasm();
var ___wasm_call_ctors = createExportWrapper('__wasm_call_ctors', 0);
var _CL_ShutdownCGame = Module['_CL_ShutdownCGame'] = createExportWrapper('CL_ShutdownCGame', 0);
var _Key_GetCatcher = Module['_Key_GetCatcher'] = createExportWrapper('Key_GetCatcher', 0);
var _Key_SetCatcher = Module['_Key_SetCatcher'] = createExportWrapper('Key_SetCatcher', 1);
var _VM_Call = Module['_VM_Call'] = createExportWrapper('VM_Call', 4);
var _VM_Free = Module['_VM_Free'] = createExportWrapper('VM_Free', 1);
var _FS_VM_CloseFiles = Module['_FS_VM_CloseFiles'] = createExportWrapper('FS_VM_CloseFiles', 1);
var _CL_InitCGame = Module['_CL_InitCGame'] = createExportWrapper('CL_InitCGame', 0);
var _Cbuf_NestedReset = Module['_Cbuf_NestedReset'] = createExportWrapper('Cbuf_NestedReset', 0);
var _Con_Close = Module['_Con_Close'] = createExportWrapper('Con_Close', 0);
var _Info_ValueForKey = Module['_Info_ValueForKey'] = createExportWrapper('Info_ValueForKey', 2);
var _Com_sprintf = Module['_Com_sprintf'] = createExportWrapper('Com_sprintf', 4);
var _Cvar_VariableIntegerValue = Module['_Cvar_VariableIntegerValue'] = createExportWrapper('Cvar_VariableIntegerValue', 1);
var _VM_Create = Module['_VM_Create'] = createExportWrapper('VM_Create', 4);
var _Cvar_SetCheatState = Module['_Cvar_SetCheatState'] = createExportWrapper('Cvar_SetCheatState', 0);
var _Com_Printf = Module['_Com_Printf'] = createExportWrapper('Com_Printf', 2);
var _Sys_LowPhysicalMemory = Module['_Sys_LowPhysicalMemory'] = createExportWrapper('Sys_LowPhysicalMemory', 0);
var _Com_TouchMemory = Module['_Com_TouchMemory'] = createExportWrapper('Com_TouchMemory', 0);
var _Con_ClearNotify = Module['_Con_ClearNotify'] = createExportWrapper('Con_ClearNotify', 0);
var _Com_Error = Module['_Com_Error'] = createExportWrapper('Com_Error', 3);
var _Q_stristr = Module['_Q_stristr'] = createExportWrapper('Q_stristr', 2);
var _Cvar_Register = Module['_Cvar_Register'] = createExportWrapper('Cvar_Register', 5);
var _Cvar_Update = Module['_Cvar_Update'] = createExportWrapper('Cvar_Update', 2);
var _Cvar_SetSafe = Module['_Cvar_SetSafe'] = createExportWrapper('Cvar_SetSafe', 2);
var _VM_CheckBounds = Module['_VM_CheckBounds'] = createExportWrapper('VM_CheckBounds', 3);
var _Cvar_VariableStringBufferSafe = Module['_Cvar_VariableStringBufferSafe'] = createExportWrapper('Cvar_VariableStringBufferSafe', 4);
var _Cmd_Argc = Module['_Cmd_Argc'] = createExportWrapper('Cmd_Argc', 0);
var _Cmd_ArgvBuffer = Module['_Cmd_ArgvBuffer'] = createExportWrapper('Cmd_ArgvBuffer', 3);
var _Cmd_ArgsBuffer = Module['_Cmd_ArgsBuffer'] = createExportWrapper('Cmd_ArgsBuffer', 2);
var _FS_VM_OpenFile = Module['_FS_VM_OpenFile'] = createExportWrapper('FS_VM_OpenFile', 4);
var _FS_VM_ReadFile = Module['_FS_VM_ReadFile'] = createExportWrapper('FS_VM_ReadFile', 4);
var _FS_VM_WriteFile = Module['_FS_VM_WriteFile'] = createExportWrapper('FS_VM_WriteFile', 4);
var _FS_VM_CloseFile = Module['_FS_VM_CloseFile'] = createExportWrapper('FS_VM_CloseFile', 2);
var _FS_VM_SeekFile = Module['_FS_VM_SeekFile'] = createExportWrapper('FS_VM_SeekFile', 4);
var _Cbuf_NestedAdd = Module['_Cbuf_NestedAdd'] = createExportWrapper('Cbuf_NestedAdd', 1);
var _Cmd_RemoveCommandSafe = Module['_Cmd_RemoveCommandSafe'] = createExportWrapper('Cmd_RemoveCommandSafe', 1);
var _CL_AddReliableCommand = Module['_CL_AddReliableCommand'] = createExportWrapper('CL_AddReliableCommand', 2);
var _SCR_UpdateScreen = Module['_SCR_UpdateScreen'] = createExportWrapper('SCR_UpdateScreen', 1);
var _CM_LoadMap = Module['_CM_LoadMap'] = createExportWrapper('CM_LoadMap', 3);
var _CM_NumInlineModels = Module['_CM_NumInlineModels'] = createExportWrapper('CM_NumInlineModels', 0);
var _CM_InlineModel = Module['_CM_InlineModel'] = createExportWrapper('CM_InlineModel', 1);
var _CM_TempBoxModel = Module['_CM_TempBoxModel'] = createExportWrapper('CM_TempBoxModel', 3);
var _CM_PointContents = Module['_CM_PointContents'] = createExportWrapper('CM_PointContents', 2);
var _CM_TransformedPointContents = Module['_CM_TransformedPointContents'] = createExportWrapper('CM_TransformedPointContents', 4);
var _CM_BoxTrace = Module['_CM_BoxTrace'] = createExportWrapper('CM_BoxTrace', 8);
var _CM_TransformedBoxTrace = Module['_CM_TransformedBoxTrace'] = createExportWrapper('CM_TransformedBoxTrace', 10);
var _S_StartSound = Module['_S_StartSound'] = createExportWrapper('S_StartSound', 4);
var _S_StartLocalSound = Module['_S_StartLocalSound'] = createExportWrapper('S_StartLocalSound', 2);
var _S_ClearLoopingSounds = Module['_S_ClearLoopingSounds'] = createExportWrapper('S_ClearLoopingSounds', 1);
var _S_AddLoopingSound = Module['_S_AddLoopingSound'] = createExportWrapper('S_AddLoopingSound', 4);
var _S_AddRealLoopingSound = Module['_S_AddRealLoopingSound'] = createExportWrapper('S_AddRealLoopingSound', 4);
var _S_StopLoopingSound = Module['_S_StopLoopingSound'] = createExportWrapper('S_StopLoopingSound', 1);
var _S_UpdateEntityPosition = Module['_S_UpdateEntityPosition'] = createExportWrapper('S_UpdateEntityPosition', 2);
var _S_Respatialize = Module['_S_Respatialize'] = createExportWrapper('S_Respatialize', 4);
var _S_RegisterSound = Module['_S_RegisterSound'] = createExportWrapper('S_RegisterSound', 2);
var _S_StartBackgroundTrack = Module['_S_StartBackgroundTrack'] = createExportWrapper('S_StartBackgroundTrack', 2);
var _Hunk_MemoryRemaining = Module['_Hunk_MemoryRemaining'] = createExportWrapper('Hunk_MemoryRemaining', 0);
var _Key_IsDown = Module['_Key_IsDown'] = createExportWrapper('Key_IsDown', 1);
var _Key_GetKey = Module['_Key_GetKey'] = createExportWrapper('Key_GetKey', 1);
var _VM_CheckBounds2 = Module['_VM_CheckBounds2'] = createExportWrapper('VM_CheckBounds2', 4);
var _Q_strncpy = Module['_Q_strncpy'] = createExportWrapper('Q_strncpy', 3);
var _Q_acos = Module['_Q_acos'] = createExportWrapper('Q_acos', 1);
var _S_StopBackgroundTrack = Module['_S_StopBackgroundTrack'] = createExportWrapper('S_StopBackgroundTrack', 0);
var _Sys_SnapVector = Module['_Sys_SnapVector'] = createExportWrapper('Sys_SnapVector', 1);
var _CIN_PlayCinematic = Module['_CIN_PlayCinematic'] = createExportWrapper('CIN_PlayCinematic', 6);
var _CIN_StopCinematic = Module['_CIN_StopCinematic'] = createExportWrapper('CIN_StopCinematic', 1);
var _CIN_RunCinematic = Module['_CIN_RunCinematic'] = createExportWrapper('CIN_RunCinematic', 1);
var _CIN_DrawCinematic = Module['_CIN_DrawCinematic'] = createExportWrapper('CIN_DrawCinematic', 1);
var _CIN_SetExtents = Module['_CIN_SetExtents'] = createExportWrapper('CIN_SetExtents', 5);
var _loadCamera = Module['_loadCamera'] = createExportWrapper('loadCamera', 1);
var _startCamera = Module['_startCamera'] = createExportWrapper('startCamera', 2);
var _getCameraInfo = Module['_getCameraInfo'] = createExportWrapper('getCameraInfo', 5);
var _stopCamera = Module['_stopCamera'] = createExportWrapper('stopCamera', 1);
var _FS_GetAsyncFiles = Module['_FS_GetAsyncFiles'] = createExportWrapper('FS_GetAsyncFiles', 2);
var _CL_GameCommand = Module['_CL_GameCommand'] = createExportWrapper('CL_GameCommand', 0);
var _CL_CGameRendering = Module['_CL_CGameRendering'] = createExportWrapper('CL_CGameRendering', 1);
var _CL_SetCGameTime = Module['_CL_SetCGameTime'] = createExportWrapper('CL_SetCGameTime', 0);
var _CL_ReadDemoMessage = Module['_CL_ReadDemoMessage'] = createExportWrapper('CL_ReadDemoMessage', 0);
var _CL_CheckPaused = Module['_CL_CheckPaused'] = createExportWrapper('CL_CheckPaused', 0);
var _CL_ResetOldGame = Module['_CL_ResetOldGame'] = createExportWrapper('CL_ResetOldGame', 0);
var _Cbuf_AddText = Module['_Cbuf_AddText'] = createExportWrapper('Cbuf_AddText', 1);
var _Cvar_Set = Module['_Cvar_Set'] = createExportWrapper('Cvar_Set', 2);
var _Sys_BeginProfiling = Module['_Sys_BeginProfiling'] = createExportWrapper('Sys_BeginProfiling', 0);
var _Cmd_AddCommand = Module['_Cmd_AddCommand'] = createExportWrapper('Cmd_AddCommand', 2);
var _Com_DPrintf = Module['_Com_DPrintf'] = createExportWrapper('Com_DPrintf', 2);
var _Cmd_TokenizeString = Module['_Cmd_TokenizeString'] = createExportWrapper('Cmd_TokenizeString', 1);
var _Cmd_Argv = Module['_Cmd_Argv'] = createExportWrapper('Cmd_Argv', 1);
var _Cmd_Clear = Module['_Cmd_Clear'] = createExportWrapper('Cmd_Clear', 0);
var _Cvar_Get = Module['_Cvar_Get'] = createExportWrapper('Cvar_Get', 3);
var _Cvar_CheckRange = Module['_Cvar_CheckRange'] = createExportWrapper('Cvar_CheckRange', 4);
var _Q_stricmp = Module['_Q_stricmp'] = createExportWrapper('Q_stricmp', 2);
var _Cmd_ArgsFrom = Module['_Cmd_ArgsFrom'] = createExportWrapper('Cmd_ArgsFrom', 1);
var _CL_SystemInfoChanged = Module['_CL_SystemInfoChanged'] = createExportWrapper('CL_SystemInfoChanged', 1);
var _CIN_CloseAllVideos = Module['_CIN_CloseAllVideos'] = createExportWrapper('CIN_CloseAllVideos', 0);
var _RllDecodeMonoToMono = Module['_RllDecodeMonoToMono'] = createExportWrapper('RllDecodeMonoToMono', 5);
var _RllDecodeStereoToMono = Module['_RllDecodeStereoToMono'] = createExportWrapper('RllDecodeStereoToMono', 5);
var _FS_FCloseFile = Module['_FS_FCloseFile'] = createExportWrapper('FS_FCloseFile', 1);
var _Cvar_VariableString = Module['_Cvar_VariableString'] = createExportWrapper('Cvar_VariableString', 1);
var _va = Module['_va'] = createExportWrapper('va', 2);
var _Cbuf_ExecuteText = Module['_Cbuf_ExecuteText'] = createExportWrapper('Cbuf_ExecuteText', 2);
var _CL_ScaledMilliseconds = Module['_CL_ScaledMilliseconds'] = createExportWrapper('CL_ScaledMilliseconds', 0);
var _FS_FOpenFileRead = Module['_FS_FOpenFileRead'] = createExportWrapper('FS_FOpenFileRead', 3);
var _FS_Read = Module['_FS_Read'] = createExportWrapper('FS_Read', 3);
var _S_RawSamples = Module['_S_RawSamples'] = createExportWrapper('S_RawSamples', 6);
var _S_Update = Module['_S_Update'] = createExportWrapper('S_Update', 1);
var _SCR_AdjustFrom640 = Module['_SCR_AdjustFrom640'] = createExportWrapper('SCR_AdjustFrom640', 4);
var _Hunk_AllocateTempMemory = Module['_Hunk_AllocateTempMemory'] = createExportWrapper('Hunk_AllocateTempMemory', 1);
var _Hunk_FreeTempMemory = Module['_Hunk_FreeTempMemory'] = createExportWrapper('Hunk_FreeTempMemory', 1);
var _CL_PlayCinematic_f = Module['_CL_PlayCinematic_f'] = createExportWrapper('CL_PlayCinematic_f', 0);
var _S_StopAllSounds = Module['_S_StopAllSounds'] = createExportWrapper('S_StopAllSounds', 0);
var _SCR_StopCinematic = Module['_SCR_StopCinematic'] = createExportWrapper('SCR_StopCinematic', 0);
var _SCR_RunCinematic = Module['_SCR_RunCinematic'] = createExportWrapper('SCR_RunCinematic', 0);
var _SCR_DrawCinematic = Module['_SCR_DrawCinematic'] = createExportWrapper('SCR_DrawCinematic', 0);
var _CIN_UploadCinematic = Module['_CIN_UploadCinematic'] = createExportWrapper('CIN_UploadCinematic', 1);
var _Con_ToggleConsole_f = Module['_Con_ToggleConsole_f'] = createExportWrapper('Con_ToggleConsole_f', 0);
var _Field_Clear = Module['_Field_Clear'] = createExportWrapper('Field_Clear', 1);
var _Con_CheckResize = Module['_Con_CheckResize'] = createExportWrapper('Con_CheckResize', 0);
var _Con_Bottom = Module['_Con_Bottom'] = createExportWrapper('Con_Bottom', 0);
var _Con_Init = Module['_Con_Init'] = createExportWrapper('Con_Init', 0);
var _Cvar_SetDescription = Module['_Cvar_SetDescription'] = createExportWrapper('Cvar_SetDescription', 2);
var _Cmd_SetCommandCompletionFunc = Module['_Cmd_SetCommandCompletionFunc'] = createExportWrapper('Cmd_SetCommandCompletionFunc', 2);
var _Q_strncpyz = Module['_Q_strncpyz'] = createExportWrapper('Q_strncpyz', 3);
var _COM_DefaultExtension = Module['_COM_DefaultExtension'] = createExportWrapper('COM_DefaultExtension', 3);
var _FS_AllowedExtension = Module['_FS_AllowedExtension'] = createExportWrapper('FS_AllowedExtension', 3);
var _FS_FOpenFileWrite = Module['_FS_FOpenFileWrite'] = createExportWrapper('FS_FOpenFileWrite', 1);
var _Q_strcat = Module['_Q_strcat'] = createExportWrapper('Q_strcat', 3);
var _FS_Write = Module['_FS_Write'] = createExportWrapper('FS_Write', 3);
var _Field_CompleteFilename = Module['_Field_CompleteFilename'] = createExportWrapper('Field_CompleteFilename', 4);
var _Con_Shutdown = Module['_Con_Shutdown'] = createExportWrapper('Con_Shutdown', 0);
var _Cmd_RemoveCommand = Module['_Cmd_RemoveCommand'] = createExportWrapper('Cmd_RemoveCommand', 1);
var _CL_ConsolePrint = Module['_CL_ConsolePrint'] = createExportWrapper('CL_ConsolePrint', 1);
var _Q_strncmp = Module['_Q_strncmp'] = createExportWrapper('Q_strncmp', 3);
var _ColorIndexFromChar = Module['_ColorIndexFromChar'] = createExportWrapper('ColorIndexFromChar', 1);
var _Con_DrawConsole = Module['_Con_DrawConsole'] = createExportWrapper('Con_DrawConsole', 0);
var _Com_Split = Module['_Com_Split'] = createExportWrapper('Com_Split', 4);
var _Q_atof = Module['_Q_atof'] = createExportWrapper('Q_atof', 1);
var _SCR_DrawSmallString = Module['_SCR_DrawSmallString'] = createExportWrapper('SCR_DrawSmallString', 4);
var _SCR_DrawSmallChar = Module['_SCR_DrawSmallChar'] = createExportWrapper('SCR_DrawSmallChar', 3);
var _SCR_DrawBigString = Module['_SCR_DrawBigString'] = createExportWrapper('SCR_DrawBigString', 5);
var _Field_BigDraw = Module['_Field_BigDraw'] = createExportWrapper('Field_BigDraw', 6);
var _Con_RunConsole = Module['_Con_RunConsole'] = createExportWrapper('Con_RunConsole', 0);
var _Con_PageUp = Module['_Con_PageUp'] = createExportWrapper('Con_PageUp', 1);
var _Con_PageDown = Module['_Con_PageDown'] = createExportWrapper('Con_PageDown', 1);
var _Con_Top = Module['_Con_Top'] = createExportWrapper('Con_Top', 0);
var _Field_Draw = Module['_Field_Draw'] = createExportWrapper('Field_Draw', 6);
var _CL_MouseEvent = Module['_CL_MouseEvent'] = createExportWrapper('CL_MouseEvent', 3);
var _CL_JoystickEvent = Module['_CL_JoystickEvent'] = createExportWrapper('CL_JoystickEvent', 3);
var _CL_WritePacket = Module['_CL_WritePacket'] = createExportWrapper('CL_WritePacket', 1);
var _MSG_Init = Module['_MSG_Init'] = createExportWrapper('MSG_Init', 3);
var _MSG_Bitstream = Module['_MSG_Bitstream'] = createExportWrapper('MSG_Bitstream', 1);
var _MSG_WriteLong = Module['_MSG_WriteLong'] = createExportWrapper('MSG_WriteLong', 2);
var _MSG_WriteByte = Module['_MSG_WriteByte'] = createExportWrapper('MSG_WriteByte', 2);
var _MSG_WriteString = Module['_MSG_WriteString'] = createExportWrapper('MSG_WriteString', 2);
var _MSG_HashKey = Module['_MSG_HashKey'] = createExportWrapper('MSG_HashKey', 2);
var _MSG_WriteDeltaUsercmdKey = Module['_MSG_WriteDeltaUsercmdKey'] = createExportWrapper('MSG_WriteDeltaUsercmdKey', 4);
var _CL_Netchan_Transmit = Module['_CL_Netchan_Transmit'] = createExportWrapper('CL_Netchan_Transmit', 2);
var _CL_Netchan_Enqueue = Module['_CL_Netchan_Enqueue'] = createExportWrapper('CL_Netchan_Enqueue', 3);
var _NET_FlushPacketQueue = Module['_NET_FlushPacketQueue'] = createExportWrapper('NET_FlushPacketQueue', 1);
var _CL_SendCmd = Module['_CL_SendCmd'] = createExportWrapper('CL_SendCmd', 0);
var _CL_InitInput = Module['_CL_InitInput'] = createExportWrapper('CL_InitInput', 0);
var _CL_ClearInput = Module['_CL_ClearInput'] = createExportWrapper('CL_ClearInput', 0);
var _SCR_DebugGraph = Module['_SCR_DebugGraph'] = createExportWrapper('SCR_DebugGraph', 1);
var _ClampCharMove = Module['_ClampCharMove'] = createExportWrapper('ClampCharMove', 1);
var _SCR_DrawSmallStringExt = Module['_SCR_DrawSmallStringExt'] = createExportWrapper('SCR_DrawSmallStringExt', 6);
var _SCR_DrawStringExt = Module['_SCR_DrawStringExt'] = createExportWrapper('SCR_DrawStringExt', 7);
var _CL_KeyEvent = Module['_CL_KeyEvent'] = createExportWrapper('CL_KeyEvent', 4);
var _Cvar_SetValue = Module['_Cvar_SetValue'] = createExportWrapper('Cvar_SetValue', 2);
var _Key_ClearStates = Module['_Key_ClearStates'] = createExportWrapper('Key_ClearStates', 0);
var _S_SoundInfo = Module['_S_SoundInfo'] = createExportWrapper('S_SoundInfo', 0);
var _S_BeginRegistration = Module['_S_BeginRegistration'] = createExportWrapper('S_BeginRegistration', 0);
var _CL_Play_f = Module['_CL_Play_f'] = createExportWrapper('CL_Play_f', 0);
var _CL_Disconnect = Module['_CL_Disconnect'] = createExportWrapper('CL_Disconnect', 1);
var _CL_FlushMemory = Module['_CL_FlushMemory'] = createExportWrapper('CL_FlushMemory', 0);
var _CL_Pause_f = Module['_CL_Pause_f'] = createExportWrapper('CL_Pause_f', 0);
var _Key_ParseBinding = Module['_Key_ParseBinding'] = createExportWrapper('Key_ParseBinding', 3);
var _CL_CharEvent = Module['_CL_CharEvent'] = createExportWrapper('CL_CharEvent', 1);
var _Con_SaveField = Module['_Con_SaveField'] = createExportWrapper('Con_SaveField', 1);
var _Field_AutoComplete = Module['_Field_AutoComplete'] = createExportWrapper('Field_AutoComplete', 1);
var _Con_HistoryGetPrev = Module['_Con_HistoryGetPrev'] = createExportWrapper('Con_HistoryGetPrev', 1);
var _Con_HistoryGetNext = Module['_Con_HistoryGetNext'] = createExportWrapper('Con_HistoryGetNext', 1);
var _Z_Free = Module['_Z_Free'] = createExportWrapper('Z_Free', 1);
var _CL_CDDialog = Module['_CL_CDDialog'] = createExportWrapper('CL_CDDialog', 0);
var _CL_StopRecord_f = Module['_CL_StopRecord_f'] = createExportWrapper('CL_StopRecord_f', 0);
var _FS_FileExists = Module['_FS_FileExists'] = createExportWrapper('FS_FileExists', 1);
var _FS_Remove = Module['_FS_Remove'] = createExportWrapper('FS_Remove', 1);
var _FS_Rename = Module['_FS_Rename'] = createExportWrapper('FS_Rename', 2);
var _CL_ReadDemoIndex = Module['_CL_ReadDemoIndex'] = createExportWrapper('CL_ReadDemoIndex', 0);
var _MSG_ReadLong = Module['_MSG_ReadLong'] = createExportWrapper('MSG_ReadLong', 1);
var _MSG_ReadByte = Module['_MSG_ReadByte'] = createExportWrapper('MSG_ReadByte', 1);
var _FS_Seek = Module['_FS_Seek'] = createExportWrapper('FS_Seek', 3);
var _Z_Malloc = Module['_Z_Malloc'] = createExportWrapper('Z_Malloc', 1);
var _CL_ClearState = Module['_CL_ClearState'] = createExportWrapper('CL_ClearState', 0);
var _MSG_ReadShort = Module['_MSG_ReadShort'] = createExportWrapper('MSG_ReadShort', 1);
var _MSG_ReadBigString = Module['_MSG_ReadBigString'] = createExportWrapper('MSG_ReadBigString', 1);
var _MSG_ReadBits = Module['_MSG_ReadBits'] = createExportWrapper('MSG_ReadBits', 2);
var _MSG_ReadDeltaEntity = Module['_MSG_ReadDeltaEntity'] = createExportWrapper('MSG_ReadDeltaEntity', 4);
var _CL_ParseSnapshot = Module['_CL_ParseSnapshot'] = createExportWrapper('CL_ParseSnapshot', 1);
var _FS_FTell = Module['_FS_FTell'] = createExportWrapper('FS_FTell', 1);
var _CL_ParseServerMessage = Module['_CL_ParseServerMessage'] = createExportWrapper('CL_ParseServerMessage', 1);
var _MSG_WriteShort = Module['_MSG_WriteShort'] = createExportWrapper('MSG_WriteShort', 2);
var _MSG_WriteBigString = Module['_MSG_WriteBigString'] = createExportWrapper('MSG_WriteBigString', 2);
var _MSG_WriteDeltaEntity = Module['_MSG_WriteDeltaEntity'] = createExportWrapper('MSG_WriteDeltaEntity', 4);
var _MSG_WriteData = Module['_MSG_WriteData'] = createExportWrapper('MSG_WriteData', 3);
var _MSG_WriteDeltaPlayerstate = Module['_MSG_WriteDeltaPlayerstate'] = createExportWrapper('MSG_WriteDeltaPlayerstate', 3);
var _CL_SpawnModel_f = Module['_CL_SpawnModel_f'] = createExportWrapper('CL_SpawnModel_f', 0);
var _CL_ShutdownAll = Module['_CL_ShutdownAll'] = createExportWrapper('CL_ShutdownAll', 0);
var _S_DisableSounds = Module['_S_DisableSounds'] = createExportWrapper('S_DisableSounds', 0);
var _CL_GameSwitch = Module['_CL_GameSwitch'] = createExportWrapper('CL_GameSwitch', 0);
var _SCR_Done = Module['_SCR_Done'] = createExportWrapper('SCR_Done', 0);
var _CL_ShutdownUI = Module['_CL_ShutdownUI'] = createExportWrapper('CL_ShutdownUI', 0);
var _S_Shutdown = Module['_S_Shutdown'] = createExportWrapper('S_Shutdown', 0);
var _CL_ClearMemory = Module['_CL_ClearMemory'] = createExportWrapper('CL_ClearMemory', 0);
var _Hunk_Clear = Module['_Hunk_Clear'] = createExportWrapper('Hunk_Clear', 0);
var _CM_ClearMap = Module['_CM_ClearMap'] = createExportWrapper('CM_ClearMap', 0);
var _Hunk_ClearToMark = Module['_Hunk_ClearToMark'] = createExportWrapper('Hunk_ClearToMark', 0);
var _CL_StartHunkUsers = Module['_CL_StartHunkUsers'] = createExportWrapper('CL_StartHunkUsers', 0);
var _S_Init = Module['_S_Init'] = createExportWrapper('S_Init', 0);
var _CL_InitUI = Module['_CL_InitUI'] = createExportWrapper('CL_InitUI', 0);
var _CL_MapLoading = Module['_CL_MapLoading'] = createExportWrapper('CL_MapLoading', 0);
var _NET_StringToAdr = Module['_NET_StringToAdr'] = createExportWrapper('NET_StringToAdr', 3);
var _CL_VideoRecording = Module['_CL_VideoRecording'] = createExportWrapper('CL_VideoRecording', 0);
var _CL_CloseAVI = Module['_CL_CloseAVI'] = createExportWrapper('CL_CloseAVI', 1);
var _FS_PureServerSetLoadedPaks = Module['_FS_PureServerSetLoadedPaks'] = createExportWrapper('FS_PureServerSetLoadedPaks', 2);
var _FS_PureServerSetReferencedPaks = Module['_FS_PureServerSetReferencedPaks'] = createExportWrapper('FS_PureServerSetReferencedPaks', 2);
var _FS_ClearPakReferences = Module['_FS_ClearPakReferences'] = createExportWrapper('FS_ClearPakReferences', 1);
var _Cmd_RemoveCgameCommands = Module['_Cmd_RemoveCgameCommands'] = createExportWrapper('Cmd_RemoveCgameCommands', 0);
var _NET_OutOfBandPrint = Module['_NET_OutOfBandPrint'] = createExportWrapper('NET_OutOfBandPrint', 4);
var _Cvar_InfoString = Module['_Cvar_InfoString'] = createExportWrapper('Cvar_InfoString', 2);
var _Info_RemoveKey = Module['_Info_RemoveKey'] = createExportWrapper('Info_RemoveKey', 2);
var _Info_SetValueForKey_s = Module['_Info_SetValueForKey_s'] = createExportWrapper('Info_SetValueForKey_s', 4);
var _NET_OutOfBandCompress = Module['_NET_OutOfBandCompress'] = createExportWrapper('NET_OutOfBandCompress', 4);
var _Com_MD5Buf = Module['_Com_MD5Buf'] = createExportWrapper('Com_MD5Buf', 4);
var _FS_ConditionalRestart = Module['_FS_ConditionalRestart'] = createExportWrapper('FS_ConditionalRestart', 2);
var _CL_ForwardCommandToServer = Module['_CL_ForwardCommandToServer'] = createExportWrapper('CL_ForwardCommandToServer', 1);
var _CL_Disconnect_f = Module['_CL_Disconnect_f'] = createExportWrapper('CL_Disconnect_f', 0);
var _SV_Shutdown = Module['_SV_Shutdown'] = createExportWrapper('SV_Shutdown', 1);
var _CL_OpenedPK3List_f = Module['_CL_OpenedPK3List_f'] = createExportWrapper('CL_OpenedPK3List_f', 0);
var _FS_LoadedPakNames = Module['_FS_LoadedPakNames'] = createExportWrapper('FS_LoadedPakNames', 0);
var _CL_NextDownload = Module['_CL_NextDownload'] = createExportWrapper('CL_NextDownload', 0);
var _FS_BuildOSPath = Module['_FS_BuildOSPath'] = createExportWrapper('FS_BuildOSPath', 3);
var _FS_CompareZipChecksum = Module['_FS_CompareZipChecksum'] = createExportWrapper('FS_CompareZipChecksum', 1);
var _FS_Restart = Module['_FS_Restart'] = createExportWrapper('FS_Restart', 1);
var _Com_EventLoop = Module['_Com_EventLoop'] = createExportWrapper('Com_EventLoop', 0);
var _Cvar_SetIntegerValue = Module['_Cvar_SetIntegerValue'] = createExportWrapper('Cvar_SetIntegerValue', 2);
var _CL_InitDownloads = Module['_CL_InitDownloads'] = createExportWrapper('CL_InitDownloads', 0);
var _FS_ComparePaks = Module['_FS_ComparePaks'] = createExportWrapper('FS_ComparePaks', 3);
var _CL_PacketEvent = Module['_CL_PacketEvent'] = createExportWrapper('CL_PacketEvent', 2);
var _NET_AdrToStringwPort = Module['_NET_AdrToStringwPort'] = createExportWrapper('NET_AdrToStringwPort', 1);
var _NET_CompareAdr = Module['_NET_CompareAdr'] = createExportWrapper('NET_CompareAdr', 2);
var _CL_Netchan_Process = Module['_CL_Netchan_Process'] = createExportWrapper('CL_Netchan_Process', 2);
var _MSG_BeginReadingOOB = Module['_MSG_BeginReadingOOB'] = createExportWrapper('MSG_BeginReadingOOB', 1);
var _MSG_ReadStringLine = Module['_MSG_ReadStringLine'] = createExportWrapper('MSG_ReadStringLine', 1);
var _Netchan_Setup = Module['_Netchan_Setup'] = createExportWrapper('Netchan_Setup', 6);
var _MSG_ReadString = Module['_MSG_ReadString'] = createExportWrapper('MSG_ReadString', 1);
var _CL_NoDelay = Module['_CL_NoDelay'] = createExportWrapper('CL_NoDelay', 0);
var _CL_Frame = Module['_CL_Frame'] = createExportWrapper('CL_Frame', 2);
var _CL_TakeVideoFrame = Module['_CL_TakeVideoFrame'] = createExportWrapper('CL_TakeVideoFrame', 0);
var _COM_SkipPath = Module['_COM_SkipPath'] = createExportWrapper('COM_SkipPath', 1);
var _COM_StripExtension = Module['_COM_StripExtension'] = createExportWrapper('COM_StripExtension', 3);
var _SCR_Init = Module['_SCR_Init'] = createExportWrapper('SCR_Init', 0);
var _CL_R_FinishImage3 = Module['_CL_R_FinishImage3'] = createExportWrapper('CL_R_FinishImage3', 4);
var _CL_GetModeInfo = Module['_CL_GetModeInfo'] = createExportWrapper('CL_GetModeInfo', 8);
var _CL_Init = Module['_CL_Init'] = createExportWrapper('CL_Init', 0);
var _FS_GetBaseGameDir = Module['_FS_GetBaseGameDir'] = createExportWrapper('FS_GetBaseGameDir', 0);
var _Info_Print = Module['_Info_Print'] = createExportWrapper('Info_Print', 1);
var _NET_IsLocalAddress = Module['_NET_IsLocalAddress'] = createExportWrapper('NET_IsLocalAddress', 1);
var _COM_GetExtension = Module['_COM_GetExtension'] = createExportWrapper('COM_GetExtension', 1);
var _Com_TruncateLongString = Module['_Com_TruncateLongString'] = createExportWrapper('Com_TruncateLongString', 2);
var _Q_stricmpn = Module['_Q_stricmpn'] = createExportWrapper('Q_stricmpn', 3);
var _FS_BypassPure = Module['_FS_BypassPure'] = createExportWrapper('FS_BypassPure', 0);
var _FS_RestorePure = Module['_FS_RestorePure'] = createExportWrapper('FS_RestorePure', 0);
var _FS_SetFilenameCallback = Module['_FS_SetFilenameCallback'] = createExportWrapper('FS_SetFilenameCallback', 1);
var _SV_Frame = Module['_SV_Frame'] = createExportWrapper('SV_Frame', 1);
var _ShortSwap = Module['_ShortSwap'] = createExportWrapper('ShortSwap', 1);
var _Com_RandomBytes = Module['_Com_RandomBytes'] = createExportWrapper('Com_RandomBytes', 2);
var _Cmd_Cmd = Module['_Cmd_Cmd'] = createExportWrapper('Cmd_Cmd', 0);
var _NET_SendPacket = Module['_NET_SendPacket'] = createExportWrapper('NET_SendPacket', 4);
var _Com_SkipTokens = Module['_Com_SkipTokens'] = createExportWrapper('Com_SkipTokens', 3);
var _Field_CompleteCommand = Module['_Field_CompleteCommand'] = createExportWrapper('Field_CompleteCommand', 3);
var _FS_ReferencedPakNames = Module['_FS_ReferencedPakNames'] = createExportWrapper('FS_ReferencedPakNames', 0);
var _Cvar_VariableStringBuffer = Module['_Cvar_VariableStringBuffer'] = createExportWrapper('Cvar_VariableStringBuffer', 3);
var _CL_OpenAVIForWriting = Module['_CL_OpenAVIForWriting'] = createExportWrapper('CL_OpenAVIForWriting', 3);
var _CL_Shutdown = Module['_CL_Shutdown'] = createExportWrapper('CL_Shutdown', 2);
var _CL_ServerStatus = Module['_CL_ServerStatus'] = createExportWrapper('CL_ServerStatus', 3);
var _CL_GetPing = Module['_CL_GetPing'] = createExportWrapper('CL_GetPing', 4);
var _CL_GetPingInfo = Module['_CL_GetPingInfo'] = createExportWrapper('CL_GetPingInfo', 3);
var _CL_ClearPing = Module['_CL_ClearPing'] = createExportWrapper('CL_ClearPing', 1);
var _CL_GetPingQueueCount = Module['_CL_GetPingQueueCount'] = createExportWrapper('CL_GetPingQueueCount', 0);
var _CL_UpdateVisiblePings_f = Module['_CL_UpdateVisiblePings_f'] = createExportWrapper('CL_UpdateVisiblePings_f', 1);
var _Cbuf_Execute = Module['_Cbuf_Execute'] = createExportWrapper('Cbuf_Execute', 0);
var _MSG_WriteBits = Module['_MSG_WriteBits'] = createExportWrapper('MSG_WriteBits', 3);
var _FS_ReferencedPakPureChecksums = Module['_FS_ReferencedPakPureChecksums'] = createExportWrapper('FS_ReferencedPakPureChecksums', 1);
var _FS_WriteFile = Module['_FS_WriteFile'] = createExportWrapper('FS_WriteFile', 3);
var _FS_FreeFile = Module['_FS_FreeFile'] = createExportWrapper('FS_FreeFile', 1);
var _FS_ReadFile = Module['_FS_ReadFile'] = createExportWrapper('FS_ReadFile', 2);
var _CM_DrawDebugSurface = Module['_CM_DrawDebugSurface'] = createExportWrapper('CM_DrawDebugSurface', 1);
var _CM_ClusterPVS = Module['_CM_ClusterPVS'] = createExportWrapper('CM_ClusterPVS', 1);
var _Hunk_Alloc = Module['_Hunk_Alloc'] = createExportWrapper('Hunk_Alloc', 2);
var _FS_ListFiles = Module['_FS_ListFiles'] = createExportWrapper('FS_ListFiles', 3);
var _FS_FreeFileList = Module['_FS_FreeFileList'] = createExportWrapper('FS_FreeFileList', 1);
var _Cvar_SetGroup = Module['_Cvar_SetGroup'] = createExportWrapper('Cvar_SetGroup', 2);
var _Cvar_CheckGroup = Module['_Cvar_CheckGroup'] = createExportWrapper('Cvar_CheckGroup', 1);
var _Cvar_ResetGroup = Module['_Cvar_ResetGroup'] = createExportWrapper('Cvar_ResetGroup', 2);
var _CL_WriteAVIVideoFrame = Module['_CL_WriteAVIVideoFrame'] = createExportWrapper('CL_WriteAVIVideoFrame', 2);
var _Sys_SetClipboardBitmap = Module['_Sys_SetClipboardBitmap'] = createExportWrapper('Sys_SetClipboardBitmap', 2);
var _GLimp_InitGamma = Module['_GLimp_InitGamma'] = createExportWrapper('GLimp_InitGamma', 1);
var _GLimp_SetGamma = Module['_GLimp_SetGamma'] = createExportWrapper('GLimp_SetGamma', 3);
var _GLimp_Init = Module['_GLimp_Init'] = createExportWrapper('GLimp_Init', 1);
var _GLimp_EndFrame = Module['_GLimp_EndFrame'] = createExportWrapper('GLimp_EndFrame', 0);
var _GetRefAPI = Module['_GetRefAPI'] = createExportWrapper('GetRefAPI', 2);
var _Z_TagMalloc = Module['_Z_TagMalloc'] = createExportWrapper('Z_TagMalloc', 2);
var _Z_FreeTags = Module['_Z_FreeTags'] = createExportWrapper('Z_FreeTags', 1);
var _Netchan_Transmit = Module['_Netchan_Transmit'] = createExportWrapper('Netchan_Transmit', 3);
var _Netchan_TransmitNextFragment = Module['_Netchan_TransmitNextFragment'] = createExportWrapper('Netchan_TransmitNextFragment', 1);
var _Netchan_Enqueue = Module['_Netchan_Enqueue'] = createExportWrapper('Netchan_Enqueue', 3);
var _Netchan_Process = Module['_Netchan_Process'] = createExportWrapper('Netchan_Process', 2);
var _MSG_ReadData = Module['_MSG_ReadData'] = createExportWrapper('MSG_ReadData', 3);
var _MSG_ReadDeltaPlayerstate = Module['_MSG_ReadDeltaPlayerstate'] = createExportWrapper('MSG_ReadDeltaPlayerstate', 3);
var _MSG_ReadEntitynum = Module['_MSG_ReadEntitynum'] = createExportWrapper('MSG_ReadEntitynum', 1);
var _FS_InvalidGameDir = Module['_FS_InvalidGameDir'] = createExportWrapper('FS_InvalidGameDir', 1);
var _Cvar_Flags = Module['_Cvar_Flags'] = createExportWrapper('Cvar_Flags', 1);
var _Cvar_SetModified = Module['_Cvar_SetModified'] = createExportWrapper('Cvar_SetModified', 2);
var _Info_NextPair = Module['_Info_NextPair'] = createExportWrapper('Info_NextPair', 3);
var _CL_ValidPakSignature = Module['_CL_ValidPakSignature'] = createExportWrapper('CL_ValidPakSignature', 2);
var _FS_SV_FOpenFileWrite = Module['_FS_SV_FOpenFileWrite'] = createExportWrapper('FS_SV_FOpenFileWrite', 1);
var _FS_SV_Rename = Module['_FS_SV_Rename'] = createExportWrapper('FS_SV_Rename', 2);
var _SCR_DrawNamedPic = Module['_SCR_DrawNamedPic'] = createExportWrapper('SCR_DrawNamedPic', 5);
var _SCR_FillRect = Module['_SCR_FillRect'] = createExportWrapper('SCR_FillRect', 5);
var _SCR_DrawPic = Module['_SCR_DrawPic'] = createExportWrapper('SCR_DrawPic', 5);
var _SCR_GetBigStringWidth = Module['_SCR_GetBigStringWidth'] = createExportWrapper('SCR_GetBigStringWidth', 1);
var _Cvar_VariableValue = Module['_Cvar_VariableValue'] = createExportWrapper('Cvar_VariableValue', 1);
var _Cvar_SetValueSafe = Module['_Cvar_SetValueSafe'] = createExportWrapper('Cvar_SetValueSafe', 2);
var _Cvar_Reset = Module['_Cvar_Reset'] = createExportWrapper('Cvar_Reset', 1);
var _Cvar_InfoStringBuffer = Module['_Cvar_InfoStringBuffer'] = createExportWrapper('Cvar_InfoStringBuffer', 3);
var _FS_GetFileList = Module['_FS_GetFileList'] = createExportWrapper('FS_GetFileList', 4);
var _Key_SetBinding = Module['_Key_SetBinding'] = createExportWrapper('Key_SetBinding', 2);
var _Key_GetOverstrikeMode = Module['_Key_GetOverstrikeMode'] = createExportWrapper('Key_GetOverstrikeMode', 0);
var _Key_SetOverstrikeMode = Module['_Key_SetOverstrikeMode'] = createExportWrapper('Key_SetOverstrikeMode', 1);
var _Com_CDKeyValidate = Module['_Com_CDKeyValidate'] = createExportWrapper('Com_CDKeyValidate', 2);
var _UI_usesUniqueCDKey = Module['_UI_usesUniqueCDKey'] = createExportWrapper('UI_usesUniqueCDKey', 0);
var _UI_GameCommand = Module['_UI_GameCommand'] = createExportWrapper('UI_GameCommand', 0);
var _Key_KeynumToString = Module['_Key_KeynumToString'] = createExportWrapper('Key_KeynumToString', 1);
var _Key_GetBinding = Module['_Key_GetBinding'] = createExportWrapper('Key_GetBinding', 1);
var _FS_Home_FOpenFileRead = Module['_FS_Home_FOpenFileRead'] = createExportWrapper('FS_Home_FOpenFileRead', 2);
var _NET_AdrToStringwPortandProtocol = Module['_NET_AdrToStringwPortandProtocol'] = createExportWrapper('NET_AdrToStringwPortandProtocol', 1);
var _FS_PipeOpenWrite = Module['_FS_PipeOpenWrite'] = createExportWrapper('FS_PipeOpenWrite', 2);
var _CL_WriteAVIAudioFrame = Module['_CL_WriteAVIAudioFrame'] = createExportWrapper('CL_WriteAVIAudioFrame', 2);
var _FS_HomeRemove = Module['_FS_HomeRemove'] = createExportWrapper('FS_HomeRemove', 1);
var _Com_BlockChecksum = Module['_Com_BlockChecksum'] = createExportWrapper('Com_BlockChecksum', 2);
var _CM_FloodAreaConnections = Module['_CM_FloodAreaConnections'] = createExportWrapper('CM_FloodAreaConnections', 0);
var _CM_ClearLevelPatches = Module['_CM_ClearLevelPatches'] = createExportWrapper('CM_ClearLevelPatches', 0);
var _CM_GeneratePatchCollide = Module['_CM_GeneratePatchCollide'] = createExportWrapper('CM_GeneratePatchCollide', 3);
var _SetPlaneSignbits = Module['_SetPlaneSignbits'] = createExportWrapper('SetPlaneSignbits', 1);
var _CM_ClipHandleToModel = Module['_CM_ClipHandleToModel'] = createExportWrapper('CM_ClipHandleToModel', 1);
var _CM_NumClusters = Module['_CM_NumClusters'] = createExportWrapper('CM_NumClusters', 0);
var _CM_EntityString = Module['_CM_EntityString'] = createExportWrapper('CM_EntityString', 0);
var _CM_LeafCluster = Module['_CM_LeafCluster'] = createExportWrapper('CM_LeafCluster', 1);
var _CM_LeafArea = Module['_CM_LeafArea'] = createExportWrapper('CM_LeafArea', 1);
var _CM_ModelBounds = Module['_CM_ModelBounds'] = createExportWrapper('CM_ModelBounds', 3);
var _ClearBounds = Module['_ClearBounds'] = createExportWrapper('ClearBounds', 2);
var _AddPointToBounds = Module['_AddPointToBounds'] = createExportWrapper('AddPointToBounds', 3);
var _CM_TraceThroughPatchCollide = Module['_CM_TraceThroughPatchCollide'] = createExportWrapper('CM_TraceThroughPatchCollide', 2);
var _CM_BoundsIntersect = Module['_CM_BoundsIntersect'] = createExportWrapper('CM_BoundsIntersect', 4);
var _CM_PositionTestInPatchCollide = Module['_CM_PositionTestInPatchCollide'] = createExportWrapper('CM_PositionTestInPatchCollide', 2);
var _BotDrawDebugPolygons = Module['_BotDrawDebugPolygons'] = createExportWrapper('BotDrawDebugPolygons', 2);
var _BaseWindingForPlane = Module['_BaseWindingForPlane'] = createExportWrapper('BaseWindingForPlane', 2);
var _ChopWindingInPlace = Module['_ChopWindingInPlace'] = createExportWrapper('ChopWindingInPlace', 4);
var _FreeWinding = Module['_FreeWinding'] = createExportWrapper('FreeWinding', 1);
var _WindingBounds = Module['_WindingBounds'] = createExportWrapper('WindingBounds', 3);
var _CopyWinding = Module['_CopyWinding'] = createExportWrapper('CopyWinding', 1);
var _RemoveColinearPoints = Module['_RemoveColinearPoints'] = createExportWrapper('RemoveColinearPoints', 1);
var _VectorNormalize2 = Module['_VectorNormalize2'] = createExportWrapper('VectorNormalize2', 2);
var _WindingPlane = Module['_WindingPlane'] = createExportWrapper('WindingPlane', 3);
var _WindingCenter = Module['_WindingCenter'] = createExportWrapper('WindingCenter', 2);
var _ReverseWinding = Module['_ReverseWinding'] = createExportWrapper('ReverseWinding', 1);
var _ChopWinding = Module['_ChopWinding'] = createExportWrapper('ChopWinding', 3);
var _CheckWinding = Module['_CheckWinding'] = createExportWrapper('CheckWinding', 1);
var _WindingOnPlaneSide = Module['_WindingOnPlaneSide'] = createExportWrapper('WindingOnPlaneSide', 3);
var _AddWindingToConvexHull = Module['_AddWindingToConvexHull'] = createExportWrapper('AddWindingToConvexHull', 3);
var _CM_PointLeafnum = Module['_CM_PointLeafnum'] = createExportWrapper('CM_PointLeafnum', 1);
var _CM_StoreLeafs = Module['_CM_StoreLeafs'] = createExportWrapper('CM_StoreLeafs', 2);
var _CM_StoreBrushes = Module['_CM_StoreBrushes'] = createExportWrapper('CM_StoreBrushes', 2);
var _CM_BoxLeafnums_r = Module['_CM_BoxLeafnums_r'] = createExportWrapper('CM_BoxLeafnums_r', 2);
var _BoxOnPlaneSide = Module['_BoxOnPlaneSide'] = createExportWrapper('BoxOnPlaneSide', 3);
var _CM_BoxLeafnums = Module['_CM_BoxLeafnums'] = createExportWrapper('CM_BoxLeafnums', 5);
var _CM_BoxBrushes = Module['_CM_BoxBrushes'] = createExportWrapper('CM_BoxBrushes', 4);
var _CM_BoundsIntersectPoint = Module['_CM_BoundsIntersectPoint'] = createExportWrapper('CM_BoundsIntersectPoint', 3);
var _AngleVectors = Module['_AngleVectors'] = createExportWrapper('AngleVectors', 4);
var _CM_AdjustAreaPortalState = Module['_CM_AdjustAreaPortalState'] = createExportWrapper('CM_AdjustAreaPortalState', 3);
var _CM_AreasConnected = Module['_CM_AreasConnected'] = createExportWrapper('CM_AreasConnected', 2);
var _CM_WriteAreaBits = Module['_CM_WriteAreaBits'] = createExportWrapper('CM_WriteAreaBits', 2);
var _VectorNormalize = Module['_VectorNormalize'] = createExportWrapper('VectorNormalize', 1);
var _Cbuf_Init = Module['_Cbuf_Init'] = createExportWrapper('Cbuf_Init', 0);
var _Cbuf_InsertText = Module['_Cbuf_InsertText'] = createExportWrapper('Cbuf_InsertText', 1);
var _Cmd_ExecuteString = Module['_Cmd_ExecuteString'] = createExportWrapper('Cmd_ExecuteString', 1);
var _Cvar_Command = Module['_Cvar_Command'] = createExportWrapper('Cvar_Command', 0);
var _SV_GameCommand = Module['_SV_GameCommand'] = createExportWrapper('SV_GameCommand', 0);
var _Cbuf_Wait = Module['_Cbuf_Wait'] = createExportWrapper('Cbuf_Wait', 0);
var _Q_stradd = Module['_Q_stradd'] = createExportWrapper('Q_stradd', 2);
var _Cmd_Args_Sanitize = Module['_Cmd_Args_Sanitize'] = createExportWrapper('Cmd_Args_Sanitize', 1);
var _Cmd_TokenizeStringIgnoreQuotes = Module['_Cmd_TokenizeStringIgnoreQuotes'] = createExportWrapper('Cmd_TokenizeStringIgnoreQuotes', 1);
var _S_Malloc = Module['_S_Malloc'] = createExportWrapper('S_Malloc', 1);
var _CopyString = Module['_CopyString'] = createExportWrapper('CopyString', 1);
var _Cmd_CommandCompletion = Module['_Cmd_CommandCompletion'] = createExportWrapper('Cmd_CommandCompletion', 1);
var _Cmd_CompleteArgument = Module['_Cmd_CompleteArgument'] = createExportWrapper('Cmd_CompleteArgument', 3);
var _Cmd_CompleteWriteCfgName = Module['_Cmd_CompleteWriteCfgName'] = createExportWrapper('Cmd_CompleteWriteCfgName', 2);
var _Cmd_Init = Module['_Cmd_Init'] = createExportWrapper('Cmd_Init', 0);
var _Cvar_CompleteCvarName = Module['_Cvar_CompleteCvarName'] = createExportWrapper('Cvar_CompleteCvarName', 2);
var _Com_Filter = Module['_Com_Filter'] = createExportWrapper('Com_Filter', 2);
var _Com_WriteConfiguration = Module['_Com_WriteConfiguration'] = createExportWrapper('Com_WriteConfiguration', 0);
var _levenshtein = Module['_levenshtein'] = createExportWrapper('levenshtein', 2);
var _Com_BeginRedirect = Module['_Com_BeginRedirect'] = createExportWrapper('Com_BeginRedirect', 3);
var _Com_EndRedirect = Module['_Com_EndRedirect'] = createExportWrapper('Com_EndRedirect', 0);
var _FS_Initialized = Module['_FS_Initialized'] = createExportWrapper('FS_Initialized', 0);
var _FS_FOpenFileAppend = Module['_FS_FOpenFileAppend'] = createExportWrapper('FS_FOpenFileAppend', 1);
var _FS_ForceFlush = Module['_FS_ForceFlush'] = createExportWrapper('FS_ForceFlush', 1);
var _VM_Forced_Unload_Start = Module['_VM_Forced_Unload_Start'] = createExportWrapper('VM_Forced_Unload_Start', 0);
var _VM_Forced_Unload_Done = Module['_VM_Forced_Unload_Done'] = createExportWrapper('VM_Forced_Unload_Done', 0);
var _Com_Quit_f = Module['_Com_Quit_f'] = createExportWrapper('Com_Quit_f', 0);
var _FS_Shutdown = Module['_FS_Shutdown'] = createExportWrapper('FS_Shutdown', 1);
var _Sys_Quit = Module['_Sys_Quit'] = createExportWrapper('Sys_Quit', 0);
var _Com_EarlyParseCmdLine = Module['_Com_EarlyParseCmdLine'] = createExportWrapper('Com_EarlyParseCmdLine', 5);
var _Com_SafeMode = Module['_Com_SafeMode'] = createExportWrapper('Com_SafeMode', 0);
var _Com_StartupVariable = Module['_Com_StartupVariable'] = createExportWrapper('Com_StartupVariable', 1);
var _Cvar_Set2 = Module['_Cvar_Set2'] = createExportWrapper('Cvar_Set2', 3);
var _Com_FilterExt = Module['_Com_FilterExt'] = createExportWrapper('Com_FilterExt', 2);
var _Com_HasPatterns = Module['_Com_HasPatterns'] = createExportWrapper('Com_HasPatterns', 1);
var _Com_FilterPath = Module['_Com_FilterPath'] = createExportWrapper('Com_FilterPath', 2);
var _Z_AvailableMemory = Module['_Z_AvailableMemory'] = createExportWrapper('Z_AvailableMemory', 0);
var _Sys_QueEvent = Module['_Sys_QueEvent'] = createExportWrapper('Sys_QueEvent', 6);
var _Com_RunAndTimeServerPacket = Module['_Com_RunAndTimeServerPacket'] = createExportWrapper('Com_RunAndTimeServerPacket', 2);
var _SV_PacketEvent = Module['_SV_PacketEvent'] = createExportWrapper('SV_PacketEvent', 2);
var _Com_Frame = Module['_Com_Frame'] = createExportWrapper('Com_Frame', 1);
var _Sys_ShowConsole = Module['_Sys_ShowConsole'] = createExportWrapper('Sys_ShowConsole', 2);
var _SV_FrameMsec = Module['_SV_FrameMsec'] = createExportWrapper('SV_FrameMsec', 0);
var _SV_SendQueuedPackets = Module['_SV_SendQueuedPackets'] = createExportWrapper('SV_SendQueuedPackets', 0);
var _SV_RemoveDedicatedCommands = Module['_SV_RemoveDedicatedCommands'] = createExportWrapper('SV_RemoveDedicatedCommands', 0);
var _SV_AddDedicatedCommands = Module['_SV_AddDedicatedCommands'] = createExportWrapper('SV_AddDedicatedCommands', 0);
var _Z_LogHeap = Module['_Z_LogHeap'] = createExportWrapper('Z_LogHeap', 0);
var _FS_Flush = Module['_FS_Flush'] = createExportWrapper('FS_Flush', 1);
var _Hunk_Log = Module['_Hunk_Log'] = createExportWrapper('Hunk_Log', 0);
var _Hunk_SetMark = Module['_Hunk_SetMark'] = createExportWrapper('Hunk_SetMark', 0);
var _Hunk_CheckMark = Module['_Hunk_CheckMark'] = createExportWrapper('Hunk_CheckMark', 0);
var _SV_ShutdownGameProgs = Module['_SV_ShutdownGameProgs'] = createExportWrapper('SV_ShutdownGameProgs', 0);
var _VM_Clear = Module['_VM_Clear'] = createExportWrapper('VM_Clear', 0);
var _Hunk_ClearTempMemory = Module['_Hunk_ClearTempMemory'] = createExportWrapper('Hunk_ClearTempMemory', 0);
var _NET_GetLoopPacket = Module['_NET_GetLoopPacket'] = createExportWrapper('NET_GetLoopPacket', 3);
var _Com_Milliseconds = Module['_Com_Milliseconds'] = createExportWrapper('Com_Milliseconds', 0);
var _Sys_SendKeyEvents = Module['_Sys_SendKeyEvents'] = createExportWrapper('Sys_SendKeyEvents', 0);
var _Com_GameRestart = Module['_Com_GameRestart'] = createExportWrapper('Com_GameRestart', 2);
var _Con_ResetHistory = Module['_Con_ResetHistory'] = createExportWrapper('Con_ResetHistory', 0);
var _Cvar_Restart = Module['_Cvar_Restart'] = createExportWrapper('Cvar_Restart', 1);
var _Com_ReadCDKey = Module['_Com_ReadCDKey'] = createExportWrapper('Com_ReadCDKey', 1);
var _FS_SV_FOpenFileRead = Module['_FS_SV_FOpenFileRead'] = createExportWrapper('FS_SV_FOpenFileRead', 2);
var _Com_AppendCDKey = Module['_Com_AppendCDKey'] = createExportWrapper('Com_AppendCDKey', 1);
var _Com_Init = Module['_Com_Init'] = createExportWrapper('Com_Init', 1);
var _Cvar_Init = Module['_Cvar_Init'] = createExportWrapper('Cvar_Init', 0);
var _Com_InitKeyCommands = Module['_Com_InitKeyCommands'] = createExportWrapper('Com_InitKeyCommands', 0);
var _FS_InitFilesystem = Module['_FS_InitFilesystem'] = createExportWrapper('FS_InitFilesystem', 0);
var _MSG_ReportChangeVectors_f = Module['_MSG_ReportChangeVectors_f'] = createExportWrapper('MSG_ReportChangeVectors_f', 0);
var _Sys_Init = Module['_Sys_Init'] = createExportWrapper('Sys_Init', 0);
var _Netchan_Init = Module['_Netchan_Init'] = createExportWrapper('Netchan_Init', 1);
var _VM_Init = Module['_VM_Init'] = createExportWrapper('VM_Init', 0);
var _SV_Init = Module['_SV_Init'] = createExportWrapper('SV_Init', 0);
var _calloc = Module['_calloc'] = createExportWrapper('calloc', 2);
var _FS_LoadStack = Module['_FS_LoadStack'] = createExportWrapper('FS_LoadStack', 0);
var _FS_GetCurrentGameDir = Module['_FS_GetCurrentGameDir'] = createExportWrapper('FS_GetCurrentGameDir', 0);
var _FS_ResetReadOnlyAttribute = Module['_FS_ResetReadOnlyAttribute'] = createExportWrapper('FS_ResetReadOnlyAttribute', 1);
var _FS_Printf = Module['_FS_Printf'] = createExportWrapper('FS_Printf', 3);
var _Key_WriteBindings = Module['_Key_WriteBindings'] = createExportWrapper('Key_WriteBindings', 1);
var _Cvar_WriteVariables = Module['_Cvar_WriteVariables'] = createExportWrapper('Cvar_WriteVariables', 1);
var _Field_CompleteKeyname = Module['_Field_CompleteKeyname'] = createExportWrapper('Field_CompleteKeyname', 0);
var _Key_KeynameCompletion = Module['_Key_KeynameCompletion'] = createExportWrapper('Key_KeynameCompletion', 1);
var _Field_CompleteKeyBind = Module['_Field_CompleteKeyBind'] = createExportWrapper('Field_CompleteKeyBind', 1);
var _FS_FilenameCompletion = Module['_FS_FilenameCompletion'] = createExportWrapper('FS_FilenameCompletion', 5);
var _Com_SkipCharset = Module['_Com_SkipCharset'] = createExportWrapper('Com_SkipCharset', 2);
var _Cvar_CommandCompletion = Module['_Cvar_CommandCompletion'] = createExportWrapper('Cvar_CommandCompletion', 1);
var _Com_SortFileList = Module['_Com_SortFileList'] = createExportWrapper('Com_SortFileList', 3);
var _sprintf = Module['_sprintf'] = createExportWrapper('sprintf', 3);
var _malloc = createExportWrapper('malloc', 1);
var _FS_CreatePath = Module['_FS_CreatePath'] = createExportWrapper('FS_CreatePath', 1);
var _free = createExportWrapper('free', 1);
var _R_FindPalette = Module['_R_FindPalette'] = createExportWrapper('R_FindPalette', 1);
var _FS_CopyString = Module['_FS_CopyString'] = createExportWrapper('FS_CopyString', 1);
var _FS_RecordFile = Module['_FS_RecordFile'] = createExportWrapper('FS_RecordFile', 1);
var _Q_isanumber = Module['_Q_isanumber'] = createExportWrapper('Q_isanumber', 1);
var _Cvar_SetLatched = Module['_Cvar_SetLatched'] = createExportWrapper('Cvar_SetLatched', 2);
var _Q_isintegral = Module['_Q_isintegral'] = createExportWrapper('Q_isintegral', 1);
var _Cvar_ForceReset = Module['_Cvar_ForceReset'] = createExportWrapper('Cvar_ForceReset', 1);
var _Cvar_InfoString_Big = Module['_Cvar_InfoString_Big'] = createExportWrapper('Cvar_InfoString_Big', 2);
var _FS_PakIndexForHandle = Module['_FS_PakIndexForHandle'] = createExportWrapper('FS_PakIndexForHandle', 1);
var _FS_SV_FileExists = Module['_FS_SV_FileExists'] = createExportWrapper('FS_SV_FileExists', 1);
var _unzCloseCurrentFile = Module['_unzCloseCurrentFile'] = createExportWrapper('unzCloseCurrentFile', 1);
var _unzClose = Module['_unzClose'] = createExportWrapper('unzClose', 1);
var _Sys_ResetReadOnlyAttribute = Module['_Sys_ResetReadOnlyAttribute'] = createExportWrapper('Sys_ResetReadOnlyAttribute', 1);
var _FS_FilenameCompare = Module['_FS_FilenameCompare'] = createExportWrapper('FS_FilenameCompare', 2);
var _FS_StripExt = Module['_FS_StripExt'] = createExportWrapper('FS_StripExt', 2);
var _Com_GenerateHashValue = Module['_Com_GenerateHashValue'] = createExportWrapper('Com_GenerateHashValue', 2);
var _unzOpen = Module['_unzOpen'] = createExportWrapper('unzOpen', 1);
var _unzReOpen = Module['_unzReOpen'] = createExportWrapper('unzReOpen', 2);
var _unzSetCurrentFileInfoPosition = Module['_unzSetCurrentFileInfoPosition'] = createExportWrapper('unzSetCurrentFileInfoPosition', 2);
var _unzOpenCurrentFile = Module['_unzOpenCurrentFile'] = createExportWrapper('unzOpenCurrentFile', 1);
var _FS_TouchFileInPak = Module['_FS_TouchFileInPak'] = createExportWrapper('FS_TouchFileInPak', 1);
var _unzReadCurrentFile = Module['_unzReadCurrentFile'] = createExportWrapper('unzReadCurrentFile', 3);
var _fflush = createExportWrapper('fflush', 1);
var _unztell = Module['_unztell'] = createExportWrapper('unztell', 1);
var _FS_FileIsInPAK = Module['_FS_FileIsInPAK'] = createExportWrapper('FS_FileIsInPAK', 3);
var _unzGetGlobalInfo = Module['_unzGetGlobalInfo'] = createExportWrapper('unzGetGlobalInfo', 2);
var _unzGoToFirstFile = Module['_unzGoToFirstFile'] = createExportWrapper('unzGoToFirstFile', 1);
var _unzGetCurrentFileInfo = Module['_unzGetCurrentFileInfo'] = createExportWrapper('unzGetCurrentFileInfo', 8);
var _unzGoToNextFile = Module['_unzGoToNextFile'] = createExportWrapper('unzGoToNextFile', 1);
var _unzGetCurrentFileInfoPosition = Module['_unzGetCurrentFileInfoPosition'] = createExportWrapper('unzGetCurrentFileInfoPosition', 2);
var _FS_GetZipChecksum = Module['_FS_GetZipChecksum'] = createExportWrapper('FS_GetZipChecksum', 1);
var _FS_ListNearestFiles = Module['_FS_ListNearestFiles'] = createExportWrapper('FS_ListNearestFiles', 5);
var _FS_SimpleFilename = Module['_FS_SimpleFilename'] = createExportWrapper('FS_SimpleFilename', 1);
var _Sys_FreeFileList = Module['_Sys_FreeFileList'] = createExportWrapper('Sys_FreeFileList', 1);
var _FS_idPak = Module['_FS_idPak'] = createExportWrapper('FS_idPak', 3);
var _FS_IsPureChecksum = Module['_FS_IsPureChecksum'] = createExportWrapper('FS_IsPureChecksum', 1);
var _FS_LoadedPakChecksums = Module['_FS_LoadedPakChecksums'] = createExportWrapper('FS_LoadedPakChecksums', 1);
var _FS_ReferencedPakChecksums = Module['_FS_ReferencedPakChecksums'] = createExportWrapper('FS_ReferencedPakChecksums', 0);
var _FS_ExcludeReference = Module['_FS_ExcludeReference'] = createExportWrapper('FS_ExcludeReference', 0);
var _Sys_DefaultBasePath = Module['_Sys_DefaultBasePath'] = createExportWrapper('Sys_DefaultBasePath', 0);
var _Sys_SteamPath = Module['_Sys_SteamPath'] = createExportWrapper('Sys_SteamPath', 0);
var _Sys_DefaultHomePath = Module['_Sys_DefaultHomePath'] = createExportWrapper('Sys_DefaultHomePath', 0);
var _FS_Reload = Module['_FS_Reload'] = createExportWrapper('FS_Reload', 0);
var _FS_FOpenFileByMode = Module['_FS_FOpenFileByMode'] = createExportWrapper('FS_FOpenFileByMode', 3);
var _FS_GetHomePath = Module['_FS_GetHomePath'] = createExportWrapper('FS_GetHomePath', 0);
var _FS_PipeClose = Module['_FS_PipeClose'] = createExportWrapper('FS_PipeClose', 1);
var _FS_LoadLibrary = Module['_FS_LoadLibrary'] = createExportWrapper('FS_LoadLibrary', 1);
var _COM_Parse = Module['_COM_Parse'] = createExportWrapper('COM_Parse', 1);
var _Key_StringToKeynum = Module['_Key_StringToKeynum'] = createExportWrapper('Key_StringToKeynum', 1);
var _Com_HexStrToInt = Module['_Com_HexStrToInt'] = createExportWrapper('Com_HexStrToInt', 1);
var _mdfour_begin = Module['_mdfour_begin'] = createExportWrapper('mdfour_begin', 1);
var _Com_MD5File = Module['_Com_MD5File'] = createExportWrapper('Com_MD5File', 4);
var _Com_MD5Init = Module['_Com_MD5Init'] = createExportWrapper('Com_MD5Init', 0);
var _Com_MD5Addr = Module['_Com_MD5Addr'] = createExportWrapper('Com_MD5Addr', 2);
var _MSG_InitOOB = Module['_MSG_InitOOB'] = createExportWrapper('MSG_InitOOB', 3);
var _MSG_Clear = Module['_MSG_Clear'] = createExportWrapper('MSG_Clear', 1);
var _MSG_BeginReading = Module['_MSG_BeginReading'] = createExportWrapper('MSG_BeginReading', 1);
var _MSG_Copy = Module['_MSG_Copy'] = createExportWrapper('MSG_Copy', 4);
var _HuffmanPutBit = Module['_HuffmanPutBit'] = createExportWrapper('HuffmanPutBit', 3);
var _HuffmanPutSymbol = Module['_HuffmanPutSymbol'] = createExportWrapper('HuffmanPutSymbol', 3);
var _HuffmanGetBit = Module['_HuffmanGetBit'] = createExportWrapper('HuffmanGetBit', 2);
var _HuffmanGetSymbol = Module['_HuffmanGetSymbol'] = createExportWrapper('HuffmanGetSymbol', 3);
var _MSG_WriteChar = Module['_MSG_WriteChar'] = createExportWrapper('MSG_WriteChar', 2);
var _MSG_WriteFloat = Module['_MSG_WriteFloat'] = createExportWrapper('MSG_WriteFloat', 2);
var _MSG_WriteAngle = Module['_MSG_WriteAngle'] = createExportWrapper('MSG_WriteAngle', 2);
var _MSG_WriteAngle16 = Module['_MSG_WriteAngle16'] = createExportWrapper('MSG_WriteAngle16', 2);
var _MSG_ReadChar = Module['_MSG_ReadChar'] = createExportWrapper('MSG_ReadChar', 1);
var _MSG_ReadFloat = Module['_MSG_ReadFloat'] = createExportWrapper('MSG_ReadFloat', 1);
var _MSG_ReadAngle16 = Module['_MSG_ReadAngle16'] = createExportWrapper('MSG_ReadAngle16', 1);
var _MSG_ReadDeltaUsercmdKey = Module['_MSG_ReadDeltaUsercmdKey'] = createExportWrapper('MSG_ReadDeltaUsercmdKey', 4);
var _NET_QueuePacket = Module['_NET_QueuePacket'] = createExportWrapper('NET_QueuePacket', 5);
var _Huff_Compress = Module['_Huff_Compress'] = createExportWrapper('Huff_Compress', 2);
var _NET_ParseProtocol = Module['_NET_ParseProtocol'] = createExportWrapper('NET_ParseProtocol', 2);
var _Q_CountChar = Module['_Q_CountChar'] = createExportWrapper('Q_CountChar', 2);
var _NET_CompareBaseAdrMask = Module['_NET_CompareBaseAdrMask'] = createExportWrapper('NET_CompareBaseAdrMask', 3);
var _NET_CompareBaseAdr = Module['_NET_CompareBaseAdr'] = createExportWrapper('NET_CompareBaseAdr', 2);
var _NET_Init = Module['_NET_Init'] = createExportWrapper('NET_Init', 0);
var _NET_Shutdown = Module['_NET_Shutdown'] = createExportWrapper('NET_Shutdown', 0);
var _Huff_Decompress = Module['_Huff_Decompress'] = createExportWrapper('Huff_Decompress', 2);
var _COM_BeginParseSession = Module['_COM_BeginParseSession'] = createExportWrapper('COM_BeginParseSession', 1);
var _COM_MatchToken = Module['_COM_MatchToken'] = createExportWrapper('COM_MatchToken', 2);
var _Parse1DMatrix = Module['_Parse1DMatrix'] = createExportWrapper('Parse1DMatrix', 3);
var _S_Base_Init = Module['_S_Base_Init'] = createExportWrapper('S_Base_Init', 1);
var _S_ClearSoundBuffer = Module['_S_ClearSoundBuffer'] = createExportWrapper('S_ClearSoundBuffer', 0);
var _SV_BotAllocateClient = Module['_SV_BotAllocateClient'] = createExportWrapper('SV_BotAllocateClient', 0);
var _SV_GentityNum = Module['_SV_GentityNum'] = createExportWrapper('SV_GentityNum', 1);
var _SV_BotFreeClient = Module['_SV_BotFreeClient'] = createExportWrapper('SV_BotFreeClient', 1);
var _BotImport_DebugPolygonCreate = Module['_BotImport_DebugPolygonCreate'] = createExportWrapper('BotImport_DebugPolygonCreate', 3);
var _BotImport_DebugPolygonDelete = Module['_BotImport_DebugPolygonDelete'] = createExportWrapper('BotImport_DebugPolygonDelete', 1);
var _SV_BotFrame = Module['_SV_BotFrame'] = createExportWrapper('SV_BotFrame', 1);
var _SV_BotLibSetup = Module['_SV_BotLibSetup'] = createExportWrapper('SV_BotLibSetup', 0);
var _SV_BotLibShutdown = Module['_SV_BotLibShutdown'] = createExportWrapper('SV_BotLibShutdown', 0);
var _SV_BotInitCvars = Module['_SV_BotInitCvars'] = createExportWrapper('SV_BotInitCvars', 0);
var _SV_BotInitBotLib = Module['_SV_BotInitBotLib'] = createExportWrapper('SV_BotInitBotLib', 0);
var _GetBotLibAPI = Module['_GetBotLibAPI'] = createExportWrapper('GetBotLibAPI', 2);
var _SV_Trace = Module['_SV_Trace'] = createExportWrapper('SV_Trace', 8);
var _SV_ClipToEntity = Module['_SV_ClipToEntity'] = createExportWrapper('SV_ClipToEntity', 8);
var _SV_PointContents = Module['_SV_PointContents'] = createExportWrapper('SV_PointContents', 2);
var _SV_inPVS = Module['_SV_inPVS'] = createExportWrapper('SV_inPVS', 2);
var _RadiusFromBounds = Module['_RadiusFromBounds'] = createExportWrapper('RadiusFromBounds', 2);
var _SV_ExecuteClientCommand = Module['_SV_ExecuteClientCommand'] = createExportWrapper('SV_ExecuteClientCommand', 2);
var _SV_BotGetConsoleMessage = Module['_SV_BotGetConsoleMessage'] = createExportWrapper('SV_BotGetConsoleMessage', 3);
var _SV_BotGetSnapshotEntity = Module['_SV_BotGetSnapshotEntity'] = createExportWrapper('SV_BotGetSnapshotEntity', 2);
var _WriteTGA = Module['_WriteTGA'] = createExportWrapper('WriteTGA', 5);
var _SV_XRay = Module['_SV_XRay'] = createExportWrapper('SV_XRay', 7);
var _SV_MakeMinimap = Module['_SV_MakeMinimap'] = createExportWrapper('SV_MakeMinimap', 0);
var _Com_Clamp = Module['_Com_Clamp'] = createExportWrapper('Com_Clamp', 3);
var _SV_GetPlayerByHandle = Module['_SV_GetPlayerByHandle'] = createExportWrapper('SV_GetPlayerByHandle', 0);
var _Q_CleanStr = Module['_Q_CleanStr'] = createExportWrapper('Q_CleanStr', 1);
var _SV_Strlen = Module['_SV_Strlen'] = createExportWrapper('SV_Strlen', 1);
var _SV_Heartbeat_f = Module['_SV_Heartbeat_f'] = createExportWrapper('SV_Heartbeat_f', 0);
var _SV_AddOperatorCommands = Module['_SV_AddOperatorCommands'] = createExportWrapper('SV_AddOperatorCommands', 0);
var _SV_SectorList_f = Module['_SV_SectorList_f'] = createExportWrapper('SV_SectorList_f', 0);
var _SV_AddFilter_f = Module['_SV_AddFilter_f'] = createExportWrapper('SV_AddFilter_f', 0);
var _SV_AddFilterCmd_f = Module['_SV_AddFilterCmd_f'] = createExportWrapper('SV_AddFilterCmd_f', 0);
var _SV_DropClient = Module['_SV_DropClient'] = createExportWrapper('SV_DropClient', 2);
var _SV_GameClientNum = Module['_SV_GameClientNum'] = createExportWrapper('SV_GameClientNum', 1);
var _SV_SetConfigstring = Module['_SV_SetConfigstring'] = createExportWrapper('SV_SetConfigstring', 2);
var _SV_SpawnServer = Module['_SV_SpawnServer'] = createExportWrapper('SV_SpawnServer', 2);
var _SV_RestartGameProgs = Module['_SV_RestartGameProgs'] = createExportWrapper('SV_RestartGameProgs', 0);
var _SV_AddServerCommand = Module['_SV_AddServerCommand'] = createExportWrapper('SV_AddServerCommand', 2);
var _GVM_ArgPtr = Module['_GVM_ArgPtr'] = createExportWrapper('GVM_ArgPtr', 1);
var _SV_ClientEnterWorld = Module['_SV_ClientEnterWorld'] = createExportWrapper('SV_ClientEnterWorld', 1);
var _SV_RemoveOperatorCommands = Module['_SV_RemoveOperatorCommands'] = createExportWrapper('SV_RemoveOperatorCommands', 0);
var _SV_SendServerCommand = Module['_SV_SendServerCommand'] = createExportWrapper('SV_SendServerCommand', 3);
var _SV_PrintLocations_f = Module['_SV_PrintLocations_f'] = createExportWrapper('SV_PrintLocations_f', 1);
var _SV_InitChallenger = Module['_SV_InitChallenger'] = createExportWrapper('SV_InitChallenger', 0);
var _SV_GetChallenge = Module['_SV_GetChallenge'] = createExportWrapper('SV_GetChallenge', 1);
var _SVC_RateLimitAddress = Module['_SVC_RateLimitAddress'] = createExportWrapper('SVC_RateLimitAddress', 3);
var _SV_FreeIP4DB = Module['_SV_FreeIP4DB'] = createExportWrapper('SV_FreeIP4DB', 0);
var _SV_PrintClientStateChange = Module['_SV_PrintClientStateChange'] = createExportWrapper('SV_PrintClientStateChange', 2);
var _SV_DirectConnect = Module['_SV_DirectConnect'] = createExportWrapper('SV_DirectConnect', 1);
var _SVC_RateLimit = Module['_SVC_RateLimit'] = createExportWrapper('SVC_RateLimit', 3);
var _SV_RunFilters = Module['_SV_RunFilters'] = createExportWrapper('SV_RunFilters', 2);
var _SVC_RateRestoreBurstAddress = Module['_SVC_RateRestoreBurstAddress'] = createExportWrapper('SVC_RateRestoreBurstAddress', 3);
var _SV_FreeClient = Module['_SV_FreeClient'] = createExportWrapper('SV_FreeClient', 1);
var _SV_UserinfoChanged = Module['_SV_UserinfoChanged'] = createExportWrapper('SV_UserinfoChanged', 3);
var _SVC_RateRestoreToxicAddress = Module['_SVC_RateRestoreToxicAddress'] = createExportWrapper('SVC_RateRestoreToxicAddress', 3);
var _SV_Netchan_FreeQueue = Module['_SV_Netchan_FreeQueue'] = createExportWrapper('SV_Netchan_FreeQueue', 1);
var _SV_SetUserinfo = Module['_SV_SetUserinfo'] = createExportWrapper('SV_SetUserinfo', 2);
var _SV_RemainingGameState = Module['_SV_RemainingGameState'] = createExportWrapper('SV_RemainingGameState', 0);
var _SV_SendClientGameState = Module['_SV_SendClientGameState'] = createExportWrapper('SV_SendClientGameState', 1);
var _SV_UpdateServerCommandsToClient = Module['_SV_UpdateServerCommandsToClient'] = createExportWrapper('SV_UpdateServerCommandsToClient', 2);
var _SV_SendMessageToClient = Module['_SV_SendMessageToClient'] = createExportWrapper('SV_SendMessageToClient', 2);
var _SV_UpdateConfigstrings = Module['_SV_UpdateConfigstrings'] = createExportWrapper('SV_UpdateConfigstrings', 1);
var _SV_SendQueuedMessages = Module['_SV_SendQueuedMessages'] = createExportWrapper('SV_SendQueuedMessages', 0);
var _SV_RateMsec = Module['_SV_RateMsec'] = createExportWrapper('SV_RateMsec', 1);
var _SV_Netchan_TransmitNextFragment = Module['_SV_Netchan_TransmitNextFragment'] = createExportWrapper('SV_Netchan_TransmitNextFragment', 1);
var _SV_SendDownloadMessages = Module['_SV_SendDownloadMessages'] = createExportWrapper('SV_SendDownloadMessages', 0);
var _SV_Netchan_Transmit = Module['_SV_Netchan_Transmit'] = createExportWrapper('SV_Netchan_Transmit', 2);
var _SV_ClientThink = Module['_SV_ClientThink'] = createExportWrapper('SV_ClientThink', 2);
var _SV_ExecuteClientMessage = Module['_SV_ExecuteClientMessage'] = createExportWrapper('SV_ExecuteClientMessage', 2);
var _LongSwap = Module['_LongSwap'] = createExportWrapper('LongSwap', 1);
var _SV_SendClientSnapshot = Module['_SV_SendClientSnapshot'] = createExportWrapper('SV_SendClientSnapshot', 1);
var _SV_LoadFilters = Module['_SV_LoadFilters'] = createExportWrapper('SV_LoadFilters', 1);
var _Info_Tokenize = Module['_Info_Tokenize'] = createExportWrapper('Info_Tokenize', 1);
var _Info_ValueForKeyToken = Module['_Info_ValueForKeyToken'] = createExportWrapper('Info_ValueForKeyToken', 1);
var _COM_ParseComplex = Module['_COM_ParseComplex'] = createExportWrapper('COM_ParseComplex', 2);
var _COM_ParseError = Module['_COM_ParseError'] = createExportWrapper('COM_ParseError', 2);
var _Q_strlwr = Module['_Q_strlwr'] = createExportWrapper('Q_strlwr', 1);
var _SV_NumForGentity = Module['_SV_NumForGentity'] = createExportWrapper('SV_NumForGentity', 1);
var _SV_SvEntityForGentity = Module['_SV_SvEntityForGentity'] = createExportWrapper('SV_SvEntityForGentity', 1);
var _SV_GEntityForSvEntity = Module['_SV_GEntityForSvEntity'] = createExportWrapper('SV_GEntityForSvEntity', 1);
var _VM_Restart = Module['_VM_Restart'] = createExportWrapper('VM_Restart', 1);
var _SV_InitGameProgs = Module['_SV_InitGameProgs'] = createExportWrapper('SV_InitGameProgs', 0);
var _SV_LinkEntity = Module['_SV_LinkEntity'] = createExportWrapper('SV_LinkEntity', 1);
var _SV_UnlinkEntity = Module['_SV_UnlinkEntity'] = createExportWrapper('SV_UnlinkEntity', 1);
var _SV_AreaEntities = Module['_SV_AreaEntities'] = createExportWrapper('SV_AreaEntities', 4);
var _SV_GetConfigstring = Module['_SV_GetConfigstring'] = createExportWrapper('SV_GetConfigstring', 3);
var _SV_GetUserinfo = Module['_SV_GetUserinfo'] = createExportWrapper('SV_GetUserinfo', 3);
var _MatrixMultiply = Module['_MatrixMultiply'] = createExportWrapper('MatrixMultiply', 3);
var _PerpendicularVector = Module['_PerpendicularVector'] = createExportWrapper('PerpendicularVector', 2);
var _SV_ClipHandleForEntity = Module['_SV_ClipHandleForEntity'] = createExportWrapper('SV_ClipHandleForEntity', 1);
var _SV_BoundMaxClients = Module['_SV_BoundMaxClients'] = createExportWrapper('SV_BoundMaxClients', 1);
var _SV_InitSnapshotStorage = Module['_SV_InitSnapshotStorage'] = createExportWrapper('SV_InitSnapshotStorage', 0);
var _SV_ClearWorld = Module['_SV_ClearWorld'] = createExportWrapper('SV_ClearWorld', 0);
var _SV_TrackCvarChanges = Module['_SV_TrackCvarChanges'] = createExportWrapper('SV_TrackCvarChanges', 0);
var _SV_MasterShutdown = Module['_SV_MasterShutdown'] = createExportWrapper('SV_MasterShutdown', 0);
var _SVC_RateDropAddress = Module['_SVC_RateDropAddress'] = createExportWrapper('SVC_RateDropAddress', 3);
var _SV_Netchan_Process = Module['_SV_Netchan_Process'] = createExportWrapper('SV_Netchan_Process', 2);
var _SV_IssueNewSnapshot = Module['_SV_IssueNewSnapshot'] = createExportWrapper('SV_IssueNewSnapshot', 0);
var _SV_SendClientMessages = Module['_SV_SendClientMessages'] = createExportWrapper('SV_SendClientMessages', 0);
var _Q_rand = Module['_Q_rand'] = createExportWrapper('Q_rand', 1);
var _Q_random = Module['_Q_random'] = createExportWrapper('Q_random', 1);
var _Q_crandom = Module['_Q_crandom'] = createExportWrapper('Q_crandom', 1);
var _ClampChar = Module['_ClampChar'] = createExportWrapper('ClampChar', 1);
var _ClampShort = Module['_ClampShort'] = createExportWrapper('ClampShort', 1);
var _DirToByte = Module['_DirToByte'] = createExportWrapper('DirToByte', 1);
var _ByteToDir = Module['_ByteToDir'] = createExportWrapper('ByteToDir', 2);
var _ColorBytes3 = Module['_ColorBytes3'] = createExportWrapper('ColorBytes3', 3);
var _ColorBytes4 = Module['_ColorBytes4'] = createExportWrapper('ColorBytes4', 4);
var _NormalizeColor = Module['_NormalizeColor'] = createExportWrapper('NormalizeColor', 2);
var _PlaneFromPoints = Module['_PlaneFromPoints'] = createExportWrapper('PlaneFromPoints', 4);
var _RotatePointAroundVector = Module['_RotatePointAroundVector'] = createExportWrapper('RotatePointAroundVector', 4);
var _ProjectPointOnPlane = Module['_ProjectPointOnPlane'] = createExportWrapper('ProjectPointOnPlane', 3);
var _RotateAroundDirection = Module['_RotateAroundDirection'] = createExportWrapper('RotateAroundDirection', 2);
var _vectoangles = Module['_vectoangles'] = createExportWrapper('vectoangles', 2);
var _AnglesToAxis = Module['_AnglesToAxis'] = createExportWrapper('AnglesToAxis', 2);
var _AxisClear = Module['_AxisClear'] = createExportWrapper('AxisClear', 1);
var _AxisCopy = Module['_AxisCopy'] = createExportWrapper('AxisCopy', 2);
var _MakeNormalVectors = Module['_MakeNormalVectors'] = createExportWrapper('MakeNormalVectors', 3);
var _VectorRotate = Module['_VectorRotate'] = createExportWrapper('VectorRotate', 3);
var _Q_rsqrt = Module['_Q_rsqrt'] = createExportWrapper('Q_rsqrt', 1);
var _Q_fabs = Module['_Q_fabs'] = createExportWrapper('Q_fabs', 1);
var _LerpAngle = Module['_LerpAngle'] = createExportWrapper('LerpAngle', 3);
var _AngleSubtract = Module['_AngleSubtract'] = createExportWrapper('AngleSubtract', 2);
var _AnglesSubtract = Module['_AnglesSubtract'] = createExportWrapper('AnglesSubtract', 3);
var _AngleMod = Module['_AngleMod'] = createExportWrapper('AngleMod', 1);
var _AngleNormalize360 = Module['_AngleNormalize360'] = createExportWrapper('AngleNormalize360', 1);
var _AngleNormalize180 = Module['_AngleNormalize180'] = createExportWrapper('AngleNormalize180', 1);
var _AngleDelta = Module['_AngleDelta'] = createExportWrapper('AngleDelta', 2);
var _BoundsIntersect = Module['_BoundsIntersect'] = createExportWrapper('BoundsIntersect', 4);
var _BoundsIntersectSphere = Module['_BoundsIntersectSphere'] = createExportWrapper('BoundsIntersectSphere', 4);
var _BoundsIntersectPoint = Module['_BoundsIntersectPoint'] = createExportWrapper('BoundsIntersectPoint', 3);
var __VectorMA = Module['__VectorMA'] = createExportWrapper('_VectorMA', 4);
var __DotProduct = Module['__DotProduct'] = createExportWrapper('_DotProduct', 2);
var __VectorSubtract = Module['__VectorSubtract'] = createExportWrapper('_VectorSubtract', 3);
var __VectorAdd = Module['__VectorAdd'] = createExportWrapper('_VectorAdd', 3);
var __VectorCopy = Module['__VectorCopy'] = createExportWrapper('_VectorCopy', 2);
var __VectorScale = Module['__VectorScale'] = createExportWrapper('_VectorScale', 3);
var _Vector4Scale = Module['_Vector4Scale'] = createExportWrapper('Vector4Scale', 3);
var _Q_log2 = Module['_Q_log2'] = createExportWrapper('Q_log2', 1);
var _Q_isnan = Module['_Q_isnan'] = createExportWrapper('Q_isnan', 1);
var _Q_log2f = Module['_Q_log2f'] = createExportWrapper('Q_log2f', 1);
var _Q_exp2f = Module['_Q_exp2f'] = createExportWrapper('Q_exp2f', 1);
var _COM_CompareExtension = Module['_COM_CompareExtension'] = createExportWrapper('COM_CompareExtension', 2);
var _crc32_buffer = Module['_crc32_buffer'] = createExportWrapper('crc32_buffer', 2);
var _CopyShortSwap = Module['_CopyShortSwap'] = createExportWrapper('CopyShortSwap', 2);
var _CopyLongSwap = Module['_CopyLongSwap'] = createExportWrapper('CopyLongSwap', 2);
var _ShortNoSwap = Module['_ShortNoSwap'] = createExportWrapper('ShortNoSwap', 1);
var _LongNoSwap = Module['_LongNoSwap'] = createExportWrapper('LongNoSwap', 1);
var _Long64Swap = Module['_Long64Swap'] = createExportWrapper('Long64Swap', 2);
var _Long64NoSwap = Module['_Long64NoSwap'] = createExportWrapper('Long64NoSwap', 2);
var _FloatSwap = Module['_FloatSwap'] = createExportWrapper('FloatSwap', 1);
var _FloatNoSwap = Module['_FloatNoSwap'] = createExportWrapper('FloatNoSwap', 1);
var _COM_GetCurrentParseLine = Module['_COM_GetCurrentParseLine'] = createExportWrapper('COM_GetCurrentParseLine', 0);
var _COM_ParseExt = Module['_COM_ParseExt'] = createExportWrapper('COM_ParseExt', 2);
var _COM_ParseWarning = Module['_COM_ParseWarning'] = createExportWrapper('COM_ParseWarning', 2);
var _COM_Compress = Module['_COM_Compress'] = createExportWrapper('COM_Compress', 1);
var _SkipBracedSection = Module['_SkipBracedSection'] = createExportWrapper('SkipBracedSection', 2);
var _SkipRestOfLine = Module['_SkipRestOfLine'] = createExportWrapper('SkipRestOfLine', 1);
var _Parse2DMatrix = Module['_Parse2DMatrix'] = createExportWrapper('Parse2DMatrix', 4);
var _Parse3DMatrix = Module['_Parse3DMatrix'] = createExportWrapper('Parse3DMatrix', 5);
var _Com_GetHashColor = Module['_Com_GetHashColor'] = createExportWrapper('Com_GetHashColor', 2);
var _Q_isprint = Module['_Q_isprint'] = createExportWrapper('Q_isprint', 1);
var _Q_islower = Module['_Q_islower'] = createExportWrapper('Q_islower', 1);
var _Q_isupper = Module['_Q_isupper'] = createExportWrapper('Q_isupper', 1);
var _Q_isalpha = Module['_Q_isalpha'] = createExportWrapper('Q_isalpha', 1);
var _Q_streq = Module['_Q_streq'] = createExportWrapper('Q_streq', 2);
var _Q_strupr = Module['_Q_strupr'] = createExportWrapper('Q_strupr', 1);
var _Q_replace = Module['_Q_replace'] = createExportWrapper('Q_replace', 4);
var _Q_PrintStrlen = Module['_Q_PrintStrlen'] = createExportWrapper('Q_PrintStrlen', 1);
var _Info_Validate = Module['_Info_Validate'] = createExportWrapper('Info_Validate', 1);
var _Info_ValidateKeyValue = Module['_Info_ValidateKeyValue'] = createExportWrapper('Info_ValidateKeyValue', 1);
var _unzStringFileNameCompare = Module['_unzStringFileNameCompare'] = createExportWrapper('unzStringFileNameCompare', 3);
var _unzlocal_SearchCentralDir = Module['_unzlocal_SearchCentralDir'] = createExportWrapper('unzlocal_SearchCentralDir', 1);
var _unzLocateFile = Module['_unzLocateFile'] = createExportWrapper('unzLocateFile', 3);
var _unzeof = Module['_unzeof'] = createExportWrapper('unzeof', 1);
var _unzGetLocalExtrafield = Module['_unzGetLocalExtrafield'] = createExportWrapper('unzGetLocalExtrafield', 3);
var _unzGetGlobalComment = Module['_unzGetGlobalComment'] = createExportWrapper('unzGetGlobalComment', 3);
var _puff = Module['_puff'] = createExportWrapper('puff', 4);
var _VM_ValueToSymbol = Module['_VM_ValueToSymbol'] = createExportWrapper('VM_ValueToSymbol', 2);
var _VM_ValueToFunctionSymbol = Module['_VM_ValueToFunctionSymbol'] = createExportWrapper('VM_ValueToFunctionSymbol', 2);
var _VM_SymbolToValue = Module['_VM_SymbolToValue'] = createExportWrapper('VM_SymbolToValue', 2);
var _VM_LoadInstructions = Module['_VM_LoadInstructions'] = createExportWrapper('VM_LoadInstructions', 4);
var _VM_CheckInstructions = Module['_VM_CheckInstructions'] = createExportWrapper('VM_CheckInstructions', 5);
var _VM_ReplaceInstructions = Module['_VM_ReplaceInstructions'] = createExportWrapper('VM_ReplaceInstructions', 2);
var _VM_PrepareInterpreter2 = Module['_VM_PrepareInterpreter2'] = createExportWrapper('VM_PrepareInterpreter2', 2);
var _VM_CallInterpreted2 = Module['_VM_CallInterpreted2'] = createExportWrapper('VM_CallInterpreted2', 3);
var _VM_LogSyscalls = Module['_VM_LogSyscalls'] = createExportWrapper('VM_LogSyscalls', 1);
var _VM_Indent = Module['_VM_Indent'] = createExportWrapper('VM_Indent', 1);
var _VM_StackTrace = Module['_VM_StackTrace'] = createExportWrapper('VM_StackTrace', 3);
var _AAS_Trace = Module['_AAS_Trace'] = createExportWrapper('AAS_Trace', 7);
var _AAS_PointContents = Module['_AAS_PointContents'] = createExportWrapper('AAS_PointContents', 1);
var _AAS_EntityCollision = Module['_AAS_EntityCollision'] = createExportWrapper('AAS_EntityCollision', 7);
var _AAS_BSPModelMinsMaxsOrigin = Module['_AAS_BSPModelMinsMaxsOrigin'] = createExportWrapper('AAS_BSPModelMinsMaxsOrigin', 5);
var _AAS_UnlinkFromBSPLeaves = Module['_AAS_UnlinkFromBSPLeaves'] = createExportWrapper('AAS_UnlinkFromBSPLeaves', 1);
var _AAS_BSPLinkEntity = Module['_AAS_BSPLinkEntity'] = createExportWrapper('AAS_BSPLinkEntity', 4);
var _AAS_NextBSPEntity = Module['_AAS_NextBSPEntity'] = createExportWrapper('AAS_NextBSPEntity', 1);
var _AAS_ValueForBSPEpairKey = Module['_AAS_ValueForBSPEpairKey'] = createExportWrapper('AAS_ValueForBSPEpairKey', 4);
var _AAS_VectorForBSPEpairKey = Module['_AAS_VectorForBSPEpairKey'] = createExportWrapper('AAS_VectorForBSPEpairKey', 3);
var _AAS_FloatForBSPEpairKey = Module['_AAS_FloatForBSPEpairKey'] = createExportWrapper('AAS_FloatForBSPEpairKey', 3);
var _AAS_IntForBSPEpairKey = Module['_AAS_IntForBSPEpairKey'] = createExportWrapper('AAS_IntForBSPEpairKey', 3);
var _AAS_DumpBSPData = Module['_AAS_DumpBSPData'] = createExportWrapper('AAS_DumpBSPData', 0);
var _FreeMemory = Module['_FreeMemory'] = createExportWrapper('FreeMemory', 1);
var _AAS_LoadBSPFile = Module['_AAS_LoadBSPFile'] = createExportWrapper('AAS_LoadBSPFile', 0);
var _GetClearedHunkMemory = Module['_GetClearedHunkMemory'] = createExportWrapper('GetClearedHunkMemory', 1);
var _LoadScriptMemory = Module['_LoadScriptMemory'] = createExportWrapper('LoadScriptMemory', 3);
var _SetScriptFlags = Module['_SetScriptFlags'] = createExportWrapper('SetScriptFlags', 2);
var _PS_ReadToken = Module['_PS_ReadToken'] = createExportWrapper('PS_ReadToken', 2);
var _ScriptError = Module['_ScriptError'] = createExportWrapper('ScriptError', 3);
var _StripDoubleQuotes = Module['_StripDoubleQuotes'] = createExportWrapper('StripDoubleQuotes', 1);
var _GetHunkMemory = Module['_GetHunkMemory'] = createExportWrapper('GetHunkMemory', 1);
var _PS_ExpectTokenType = Module['_PS_ExpectTokenType'] = createExportWrapper('PS_ExpectTokenType', 4);
var _FreeScript = Module['_FreeScript'] = createExportWrapper('FreeScript', 1);
var _AAS_SetViewPortalsAsClusterPortals = Module['_AAS_SetViewPortalsAsClusterPortals'] = createExportWrapper('AAS_SetViewPortalsAsClusterPortals', 0);
var _AAS_InitClustering = Module['_AAS_InitClustering'] = createExportWrapper('AAS_InitClustering', 0);
var _LibVarGetValue = Module['_LibVarGetValue'] = createExportWrapper('LibVarGetValue', 1);
var _GetClearedMemory = Module['_GetClearedMemory'] = createExportWrapper('GetClearedMemory', 1);
var _Log_Write = Module['_Log_Write'] = createExportWrapper('Log_Write', 2);
var _AAS_Error = Module['_AAS_Error'] = createExportWrapper('AAS_Error', 2);
var _AAS_AreaReachability = Module['_AAS_AreaReachability'] = createExportWrapper('AAS_AreaReachability', 1);
var _AAS_ClearShownPolygons = Module['_AAS_ClearShownPolygons'] = createExportWrapper('AAS_ClearShownPolygons', 0);
var _AAS_ClearShownDebugLines = Module['_AAS_ClearShownDebugLines'] = createExportWrapper('AAS_ClearShownDebugLines', 0);
var _AAS_DebugLine = Module['_AAS_DebugLine'] = createExportWrapper('AAS_DebugLine', 3);
var _AAS_PermanentLine = Module['_AAS_PermanentLine'] = createExportWrapper('AAS_PermanentLine', 3);
var _AAS_DrawPermanentCross = Module['_AAS_DrawPermanentCross'] = createExportWrapper('AAS_DrawPermanentCross', 3);
var _AAS_DrawPlaneCross = Module['_AAS_DrawPlaneCross'] = createExportWrapper('AAS_DrawPlaneCross', 5);
var _AAS_ShowBoundingBox = Module['_AAS_ShowBoundingBox'] = createExportWrapper('AAS_ShowBoundingBox', 3);
var _AAS_ShowFace = Module['_AAS_ShowFace'] = createExportWrapper('AAS_ShowFace', 1);
var _AAS_ShowArea = Module['_AAS_ShowArea'] = createExportWrapper('AAS_ShowArea', 2);
var _AAS_ShowAreaPolygons = Module['_AAS_ShowAreaPolygons'] = createExportWrapper('AAS_ShowAreaPolygons', 3);
var _AAS_DrawCross = Module['_AAS_DrawCross'] = createExportWrapper('AAS_DrawCross', 3);
var _AAS_PrintTravelType = Module['_AAS_PrintTravelType'] = createExportWrapper('AAS_PrintTravelType', 1);
var _AAS_DrawArrow = Module['_AAS_DrawArrow'] = createExportWrapper('AAS_DrawArrow', 4);
var _AAS_ShowReachability = Module['_AAS_ShowReachability'] = createExportWrapper('AAS_ShowReachability', 1);
var _AAS_HorizontalVelocityForJump = Module['_AAS_HorizontalVelocityForJump'] = createExportWrapper('AAS_HorizontalVelocityForJump', 4);
var _AAS_PredictClientMovement = Module['_AAS_PredictClientMovement'] = createExportWrapper('AAS_PredictClientMovement', 13);
var _AAS_JumpReachRunStart = Module['_AAS_JumpReachRunStart'] = createExportWrapper('AAS_JumpReachRunStart', 2);
var _AAS_RocketJumpZVelocity = Module['_AAS_RocketJumpZVelocity'] = createExportWrapper('AAS_RocketJumpZVelocity', 1);
var _AAS_ShowReachableAreas = Module['_AAS_ShowReachableAreas'] = createExportWrapper('AAS_ShowReachableAreas', 1);
var _AAS_Time = Module['_AAS_Time'] = createExportWrapper('AAS_Time', 0);
var _AAS_FloodAreas = Module['_AAS_FloodAreas'] = createExportWrapper('AAS_FloodAreas', 1);
var _AAS_PointAreaNum = Module['_AAS_PointAreaNum'] = createExportWrapper('AAS_PointAreaNum', 1);
var _AAS_AreaCluster = Module['_AAS_AreaCluster'] = createExportWrapper('AAS_AreaCluster', 1);
var _AAS_UpdateEntity = Module['_AAS_UpdateEntity'] = createExportWrapper('AAS_UpdateEntity', 2);
var _AAS_UnlinkFromAreas = Module['_AAS_UnlinkFromAreas'] = createExportWrapper('AAS_UnlinkFromAreas', 1);
var _AAS_LinkEntityClientBBox = Module['_AAS_LinkEntityClientBBox'] = createExportWrapper('AAS_LinkEntityClientBBox', 4);
var _AAS_EntityInfo = Module['_AAS_EntityInfo'] = createExportWrapper('AAS_EntityInfo', 2);
var _AAS_EntityModelindex = Module['_AAS_EntityModelindex'] = createExportWrapper('AAS_EntityModelindex', 1);
var _AAS_EntityType = Module['_AAS_EntityType'] = createExportWrapper('AAS_EntityType', 1);
var _AAS_EntityModelNum = Module['_AAS_EntityModelNum'] = createExportWrapper('AAS_EntityModelNum', 1);
var _AAS_OriginOfMoverWithModelNum = Module['_AAS_OriginOfMoverWithModelNum'] = createExportWrapper('AAS_OriginOfMoverWithModelNum', 2);
var _AAS_ResetEntityLinks = Module['_AAS_ResetEntityLinks'] = createExportWrapper('AAS_ResetEntityLinks', 0);
var _AAS_InvalidateEntities = Module['_AAS_InvalidateEntities'] = createExportWrapper('AAS_InvalidateEntities', 0);
var _AAS_UnlinkInvalidEntities = Module['_AAS_UnlinkInvalidEntities'] = createExportWrapper('AAS_UnlinkInvalidEntities', 0);
var _AAS_NextEntity = Module['_AAS_NextEntity'] = createExportWrapper('AAS_NextEntity', 1);
var _AAS_DumpAASData = Module['_AAS_DumpAASData'] = createExportWrapper('AAS_DumpAASData', 0);
var _AAS_LoadAASFile = Module['_AAS_LoadAASFile'] = createExportWrapper('AAS_LoadAASFile', 1);
var _LibVarGetString = Module['_LibVarGetString'] = createExportWrapper('LibVarGetString', 1);
var _AAS_WriteAASFile = Module['_AAS_WriteAASFile'] = createExportWrapper('AAS_WriteAASFile', 1);
var _AAS_Loaded = Module['_AAS_Loaded'] = createExportWrapper('AAS_Loaded', 0);
var _AAS_Initialized = Module['_AAS_Initialized'] = createExportWrapper('AAS_Initialized', 0);
var _AAS_ContinueInit = Module['_AAS_ContinueInit'] = createExportWrapper('AAS_ContinueInit', 1);
var _AAS_ContinueInitReachability = Module['_AAS_ContinueInitReachability'] = createExportWrapper('AAS_ContinueInitReachability', 1);
var _LibVarValue = Module['_LibVarValue'] = createExportWrapper('LibVarValue', 2);
var _AAS_Optimize = Module['_AAS_Optimize'] = createExportWrapper('AAS_Optimize', 0);
var _AAS_InitRouting = Module['_AAS_InitRouting'] = createExportWrapper('AAS_InitRouting', 0);
var _AAS_StartFrame = Module['_AAS_StartFrame'] = createExportWrapper('AAS_StartFrame', 1);
var _AAS_RoutingInfo = Module['_AAS_RoutingInfo'] = createExportWrapper('AAS_RoutingInfo', 0);
var _LibVarSet = Module['_LibVarSet'] = createExportWrapper('LibVarSet', 2);
var _PrintUsedMemorySize = Module['_PrintUsedMemorySize'] = createExportWrapper('PrintUsedMemorySize', 0);
var _PrintMemoryLabels = Module['_PrintMemoryLabels'] = createExportWrapper('PrintMemoryLabels', 0);
var _AAS_WriteRouteCache = Module['_AAS_WriteRouteCache'] = createExportWrapper('AAS_WriteRouteCache', 0);
var _AAS_ProjectPointOntoVector = Module['_AAS_ProjectPointOntoVector'] = createExportWrapper('AAS_ProjectPointOntoVector', 4);
var _AAS_LoadMap = Module['_AAS_LoadMap'] = createExportWrapper('AAS_LoadMap', 1);
var _AAS_FreeRoutingCaches = Module['_AAS_FreeRoutingCaches'] = createExportWrapper('AAS_FreeRoutingCaches', 0);
var _AAS_InitSettings = Module['_AAS_InitSettings'] = createExportWrapper('AAS_InitSettings', 0);
var _AAS_InitAASLinkHeap = Module['_AAS_InitAASLinkHeap'] = createExportWrapper('AAS_InitAASLinkHeap', 0);
var _AAS_InitAASLinkedEntities = Module['_AAS_InitAASLinkedEntities'] = createExportWrapper('AAS_InitAASLinkedEntities', 0);
var _AAS_InitReachability = Module['_AAS_InitReachability'] = createExportWrapper('AAS_InitReachability', 0);
var _AAS_InitAlternativeRouting = Module['_AAS_InitAlternativeRouting'] = createExportWrapper('AAS_InitAlternativeRouting', 0);
var _AAS_Setup = Module['_AAS_Setup'] = createExportWrapper('AAS_Setup', 0);
var _LibVar = Module['_LibVar'] = createExportWrapper('LibVar', 2);
var _AAS_Shutdown = Module['_AAS_Shutdown'] = createExportWrapper('AAS_Shutdown', 0);
var _AAS_ShutdownAlternativeRouting = Module['_AAS_ShutdownAlternativeRouting'] = createExportWrapper('AAS_ShutdownAlternativeRouting', 0);
var _AAS_FreeAASLinkHeap = Module['_AAS_FreeAASLinkHeap'] = createExportWrapper('AAS_FreeAASLinkHeap', 0);
var _AAS_FreeAASLinkedEntities = Module['_AAS_FreeAASLinkedEntities'] = createExportWrapper('AAS_FreeAASLinkedEntities', 0);
var _AAS_DropToFloor = Module['_AAS_DropToFloor'] = createExportWrapper('AAS_DropToFloor', 3);
var _AAS_AgainstLadder = Module['_AAS_AgainstLadder'] = createExportWrapper('AAS_AgainstLadder', 1);
var _AAS_PointInsideFace = Module['_AAS_PointInsideFace'] = createExportWrapper('AAS_PointInsideFace', 3);
var _AAS_OnGround = Module['_AAS_OnGround'] = createExportWrapper('AAS_OnGround', 3);
var _AAS_TraceClientBBox = Module['_AAS_TraceClientBBox'] = createExportWrapper('AAS_TraceClientBBox', 5);
var _AAS_PlaneFromNum = Module['_AAS_PlaneFromNum'] = createExportWrapper('AAS_PlaneFromNum', 1);
var _AAS_Swimming = Module['_AAS_Swimming'] = createExportWrapper('AAS_Swimming', 1);
var _AAS_SetMovedir = Module['_AAS_SetMovedir'] = createExportWrapper('AAS_SetMovedir', 2);
var _AAS_BFGJumpZVelocity = Module['_AAS_BFGJumpZVelocity'] = createExportWrapper('AAS_BFGJumpZVelocity', 1);
var _AAS_PointPresenceType = Module['_AAS_PointPresenceType'] = createExportWrapper('AAS_PointPresenceType', 1);
var _AAS_TraceAreas = Module['_AAS_TraceAreas'] = createExportWrapper('AAS_TraceAreas', 5);
var _AAS_ClientMovementHitBBox = Module['_AAS_ClientMovementHitBBox'] = createExportWrapper('AAS_ClientMovementHitBBox', 13);
var _AAS_PresenceTypeBoundingBox = Module['_AAS_PresenceTypeBoundingBox'] = createExportWrapper('AAS_PresenceTypeBoundingBox', 3);
var _AAS_BestReachableFromJumpPadArea = Module['_AAS_BestReachableFromJumpPadArea'] = createExportWrapper('AAS_BestReachableFromJumpPadArea', 3);
var _AAS_AreaJumpPad = Module['_AAS_AreaJumpPad'] = createExportWrapper('AAS_AreaJumpPad', 1);
var _AAS_BestReachableArea = Module['_AAS_BestReachableArea'] = createExportWrapper('AAS_BestReachableArea', 4);
var _AAS_AreaGrounded = Module['_AAS_AreaGrounded'] = createExportWrapper('AAS_AreaGrounded', 1);
var _AAS_AreaSwim = Module['_AAS_AreaSwim'] = createExportWrapper('AAS_AreaSwim', 1);
var _AAS_AreaGroundFaceArea = Module['_AAS_AreaGroundFaceArea'] = createExportWrapper('AAS_AreaGroundFaceArea', 1);
var _AAS_AreaCrouch = Module['_AAS_AreaCrouch'] = createExportWrapper('AAS_AreaCrouch', 1);
var _AAS_AreaLiquid = Module['_AAS_AreaLiquid'] = createExportWrapper('AAS_AreaLiquid', 1);
var _AAS_AreaLava = Module['_AAS_AreaLava'] = createExportWrapper('AAS_AreaLava', 1);
var _AAS_AreaSlime = Module['_AAS_AreaSlime'] = createExportWrapper('AAS_AreaSlime', 1);
var _AAS_AreaDoNotEnter = Module['_AAS_AreaDoNotEnter'] = createExportWrapper('AAS_AreaDoNotEnter', 1);
var _AAS_Reachability_WeaponJump = Module['_AAS_Reachability_WeaponJump'] = createExportWrapper('AAS_Reachability_WeaponJump', 2);
var _AAS_AreaPresenceType = Module['_AAS_AreaPresenceType'] = createExportWrapper('AAS_AreaPresenceType', 1);
var _AAS_TravelFlagForType = Module['_AAS_TravelFlagForType'] = createExportWrapper('AAS_TravelFlagForType', 1);
var _AAS_FreeRoutingCache = Module['_AAS_FreeRoutingCache'] = createExportWrapper('AAS_FreeRoutingCache', 1);
var _AAS_EnableRoutingArea = Module['_AAS_EnableRoutingArea'] = createExportWrapper('AAS_EnableRoutingArea', 2);
var _AAS_AreaContentsTravelFlags = Module['_AAS_AreaContentsTravelFlags'] = createExportWrapper('AAS_AreaContentsTravelFlags', 1);
var _AAS_AreaTravelTime = Module['_AAS_AreaTravelTime'] = createExportWrapper('AAS_AreaTravelTime', 3);
var _AAS_CreateAllRoutingCache = Module['_AAS_CreateAllRoutingCache'] = createExportWrapper('AAS_CreateAllRoutingCache', 0);
var _AAS_AreaTravelTimeToGoalArea = Module['_AAS_AreaTravelTimeToGoalArea'] = createExportWrapper('AAS_AreaTravelTimeToGoalArea', 4);
var _CRC_ProcessString = Module['_CRC_ProcessString'] = createExportWrapper('CRC_ProcessString', 2);
var _AAS_PredictRoute = Module['_AAS_PredictRoute'] = createExportWrapper('AAS_PredictRoute', 11);
var _AAS_ReachabilityFromNum = Module['_AAS_ReachabilityFromNum'] = createExportWrapper('AAS_ReachabilityFromNum', 2);
var _AAS_NextAreaReachability = Module['_AAS_NextAreaReachability'] = createExportWrapper('AAS_NextAreaReachability', 2);
var _AAS_NextModelReachability = Module['_AAS_NextModelReachability'] = createExportWrapper('AAS_NextModelReachability', 2);
var _AAS_RandomGoalArea = Module['_AAS_RandomGoalArea'] = createExportWrapper('AAS_RandomGoalArea', 4);
var _AAS_NearestHideArea = Module['_AAS_NearestHideArea'] = createExportWrapper('AAS_NearestHideArea', 7);
var _GetMemory = Module['_GetMemory'] = createExportWrapper('GetMemory', 1);
var _AAS_AlternativeRouteGoals = Module['_AAS_AlternativeRouteGoals'] = createExportWrapper('AAS_AlternativeRouteGoals', 8);
var _AAS_AllocAASLink = Module['_AAS_AllocAASLink'] = createExportWrapper('AAS_AllocAASLink', 0);
var _AAS_PointReachabilityAreaIndex = Module['_AAS_PointReachabilityAreaIndex'] = createExportWrapper('AAS_PointReachabilityAreaIndex', 1);
var _AAS_TraceEndFace = Module['_AAS_TraceEndFace'] = createExportWrapper('AAS_TraceEndFace', 1);
var _AAS_AASLinkEntity = Module['_AAS_AASLinkEntity'] = createExportWrapper('AAS_AASLinkEntity', 3);
var _AAS_BBoxAreas = Module['_AAS_BBoxAreas'] = createExportWrapper('AAS_BBoxAreas', 4);
var _AAS_AreaInfo = Module['_AAS_AreaInfo'] = createExportWrapper('AAS_AreaInfo', 2);
var _BotFreeCharacter = Module['_BotFreeCharacter'] = createExportWrapper('BotFreeCharacter', 1);
var _BotLoadCharacter = Module['_BotLoadCharacter'] = createExportWrapper('BotLoadCharacter', 2);
var _Characteristic_Float = Module['_Characteristic_Float'] = createExportWrapper('Characteristic_Float', 2);
var _Characteristic_BFloat = Module['_Characteristic_BFloat'] = createExportWrapper('Characteristic_BFloat', 4);
var _Characteristic_Integer = Module['_Characteristic_Integer'] = createExportWrapper('Characteristic_Integer', 2);
var _Characteristic_BInteger = Module['_Characteristic_BInteger'] = createExportWrapper('Characteristic_BInteger', 4);
var _Characteristic_String = Module['_Characteristic_String'] = createExportWrapper('Characteristic_String', 4);
var _BotShutdownCharacters = Module['_BotShutdownCharacters'] = createExportWrapper('BotShutdownCharacters', 0);
var _PC_SetBaseFolder = Module['_PC_SetBaseFolder'] = createExportWrapper('PC_SetBaseFolder', 1);
var _LoadSourceFile = Module['_LoadSourceFile'] = createExportWrapper('LoadSourceFile', 1);
var _PC_ReadToken = Module['_PC_ReadToken'] = createExportWrapper('PC_ReadToken', 2);
var _PC_ExpectTokenType = Module['_PC_ExpectTokenType'] = createExportWrapper('PC_ExpectTokenType', 4);
var _PC_ExpectTokenString = Module['_PC_ExpectTokenString'] = createExportWrapper('PC_ExpectTokenString', 2);
var _PC_ExpectAnyToken = Module['_PC_ExpectAnyToken'] = createExportWrapper('PC_ExpectAnyToken', 2);
var _SourceError = Module['_SourceError'] = createExportWrapper('SourceError', 3);
var _FreeSource = Module['_FreeSource'] = createExportWrapper('FreeSource', 1);
var _BotRemoveConsoleMessage = Module['_BotRemoveConsoleMessage'] = createExportWrapper('BotRemoveConsoleMessage', 2);
var _BotQueueConsoleMessage = Module['_BotQueueConsoleMessage'] = createExportWrapper('BotQueueConsoleMessage', 3);
var _BotNextConsoleMessage = Module['_BotNextConsoleMessage'] = createExportWrapper('BotNextConsoleMessage', 2);
var _BotNumConsoleMessages = Module['_BotNumConsoleMessages'] = createExportWrapper('BotNumConsoleMessages', 1);
var _UnifyWhiteSpaces = Module['_UnifyWhiteSpaces'] = createExportWrapper('UnifyWhiteSpaces', 1);
var _StringContains = Module['_StringContains'] = createExportWrapper('StringContains', 3);
var _BotReplaceSynonyms = Module['_BotReplaceSynonyms'] = createExportWrapper('BotReplaceSynonyms', 3);
var _BotFindMatch = Module['_BotFindMatch'] = createExportWrapper('BotFindMatch', 3);
var _BotMatchVariable = Module['_BotMatchVariable'] = createExportWrapper('BotMatchVariable', 4);
var _BotLoadChatFile = Module['_BotLoadChatFile'] = createExportWrapper('BotLoadChatFile', 3);
var _PC_CheckTokenString = Module['_PC_CheckTokenString'] = createExportWrapper('PC_CheckTokenString', 2);
var _BotNumInitialChats = Module['_BotNumInitialChats'] = createExportWrapper('BotNumInitialChats', 2);
var _BotInitialChat = Module['_BotInitialChat'] = createExportWrapper('BotInitialChat', 11);
var _BotReplyChat = Module['_BotReplyChat'] = createExportWrapper('BotReplyChat', 12);
var _BotChatLength = Module['_BotChatLength'] = createExportWrapper('BotChatLength', 1);
var _BotEnterChat = Module['_BotEnterChat'] = createExportWrapper('BotEnterChat', 3);
var _EA_Command = Module['_EA_Command'] = createExportWrapper('EA_Command', 2);
var _BotGetChatMessage = Module['_BotGetChatMessage'] = createExportWrapper('BotGetChatMessage', 3);
var _BotSetChatGender = Module['_BotSetChatGender'] = createExportWrapper('BotSetChatGender', 2);
var _BotSetChatName = Module['_BotSetChatName'] = createExportWrapper('BotSetChatName', 3);
var _BotResetChatAI = Module['_BotResetChatAI'] = createExportWrapper('BotResetChatAI', 0);
var _BotAllocChatState = Module['_BotAllocChatState'] = createExportWrapper('BotAllocChatState', 0);
var _BotFreeChatState = Module['_BotFreeChatState'] = createExportWrapper('BotFreeChatState', 1);
var _BotSetupChatAI = Module['_BotSetupChatAI'] = createExportWrapper('BotSetupChatAI', 0);
var _LibVarString = Module['_LibVarString'] = createExportWrapper('LibVarString', 2);
var _PC_UnreadLastToken = Module['_PC_UnreadLastToken'] = createExportWrapper('PC_UnreadLastToken', 1);
var _BotShutdownChatAI = Module['_BotShutdownChatAI'] = createExportWrapper('BotShutdownChatAI', 0);
var _SourceWarning = Module['_SourceWarning'] = createExportWrapper('SourceWarning', 3);
var _GeneticParentsAndChildSelection = Module['_GeneticParentsAndChildSelection'] = createExportWrapper('GeneticParentsAndChildSelection', 5);
var _BotGoalStateFromHandle = Module['_BotGoalStateFromHandle'] = createExportWrapper('BotGoalStateFromHandle', 1);
var _BotInterbreedGoalFuzzyLogic = Module['_BotInterbreedGoalFuzzyLogic'] = createExportWrapper('BotInterbreedGoalFuzzyLogic', 3);
var _InterbreedWeightConfigs = Module['_InterbreedWeightConfigs'] = createExportWrapper('InterbreedWeightConfigs', 3);
var _BotSaveGoalFuzzyLogic = Module['_BotSaveGoalFuzzyLogic'] = createExportWrapper('BotSaveGoalFuzzyLogic', 2);
var _BotMutateGoalFuzzyLogic = Module['_BotMutateGoalFuzzyLogic'] = createExportWrapper('BotMutateGoalFuzzyLogic', 2);
var _EvolveWeightConfig = Module['_EvolveWeightConfig'] = createExportWrapper('EvolveWeightConfig', 1);
var _InitSpawnHeap = Module['_InitSpawnHeap'] = createExportWrapper('InitSpawnHeap', 0);
var _AllocSpawn = Module['_AllocSpawn'] = createExportWrapper('AllocSpawn', 0);
var _FreeSpawn = Module['_FreeSpawn'] = createExportWrapper('FreeSpawn', 1);
var _AddSpawnToList = Module['_AddSpawnToList'] = createExportWrapper('AddSpawnToList', 1);
var _RemoveSpawnFromList = Module['_RemoveSpawnFromList'] = createExportWrapper('RemoveSpawnFromList', 1);
var _BotInitSpawns = Module['_BotInitSpawns'] = createExportWrapper('BotInitSpawns', 0);
var _BotInitLevelItems = Module['_BotInitLevelItems'] = createExportWrapper('BotInitLevelItems', 0);
var _BotGoalName = Module['_BotGoalName'] = createExportWrapper('BotGoalName', 3);
var _BotResetAvoidGoals = Module['_BotResetAvoidGoals'] = createExportWrapper('BotResetAvoidGoals', 1);
var _BotDumpAvoidGoals = Module['_BotDumpAvoidGoals'] = createExportWrapper('BotDumpAvoidGoals', 1);
var _BotRemoveFromAvoidGoals = Module['_BotRemoveFromAvoidGoals'] = createExportWrapper('BotRemoveFromAvoidGoals', 2);
var _BotAvoidGoalTime = Module['_BotAvoidGoalTime'] = createExportWrapper('BotAvoidGoalTime', 2);
var _BotSetAvoidGoalTime = Module['_BotSetAvoidGoalTime'] = createExportWrapper('BotSetAvoidGoalTime', 3);
var _BotGetLevelItemGoal = Module['_BotGetLevelItemGoal'] = createExportWrapper('BotGetLevelItemGoal', 3);
var _BotGetMapLocationGoal = Module['_BotGetMapLocationGoal'] = createExportWrapper('BotGetMapLocationGoal', 2);
var _BotGetNextCampSpotGoal = Module['_BotGetNextCampSpotGoal'] = createExportWrapper('BotGetNextCampSpotGoal', 2);
var _BotUpdateEntityItems = Module['_BotUpdateEntityItems'] = createExportWrapper('BotUpdateEntityItems', 0);
var _BotDumpGoalStack = Module['_BotDumpGoalStack'] = createExportWrapper('BotDumpGoalStack', 1);
var _BotPushGoal = Module['_BotPushGoal'] = createExportWrapper('BotPushGoal', 2);
var _BotPopGoal = Module['_BotPopGoal'] = createExportWrapper('BotPopGoal', 1);
var _BotEmptyGoalStack = Module['_BotEmptyGoalStack'] = createExportWrapper('BotEmptyGoalStack', 1);
var _BotGetTopGoal = Module['_BotGetTopGoal'] = createExportWrapper('BotGetTopGoal', 2);
var _BotGetSecondGoal = Module['_BotGetSecondGoal'] = createExportWrapper('BotGetSecondGoal', 2);
var _BotChooseLTGItem = Module['_BotChooseLTGItem'] = createExportWrapper('BotChooseLTGItem', 4);
var _BotReachabilityArea = Module['_BotReachabilityArea'] = createExportWrapper('BotReachabilityArea', 2);
var _FuzzyWeightUndecided = Module['_FuzzyWeightUndecided'] = createExportWrapper('FuzzyWeightUndecided', 3);
var _BotChooseNBGItem = Module['_BotChooseNBGItem'] = createExportWrapper('BotChooseNBGItem', 6);
var _BotTouchingGoal = Module['_BotTouchingGoal'] = createExportWrapper('BotTouchingGoal', 2);
var _BotItemGoalInVisButNotVisible = Module['_BotItemGoalInVisButNotVisible'] = createExportWrapper('BotItemGoalInVisButNotVisible', 4);
var _BotResetGoalState = Module['_BotResetGoalState'] = createExportWrapper('BotResetGoalState', 1);
var _BotLoadItemWeights = Module['_BotLoadItemWeights'] = createExportWrapper('BotLoadItemWeights', 2);
var _ReadWeightConfig = Module['_ReadWeightConfig'] = createExportWrapper('ReadWeightConfig', 1);
var _FindFuzzyWeight = Module['_FindFuzzyWeight'] = createExportWrapper('FindFuzzyWeight', 2);
var _BotFreeItemWeights = Module['_BotFreeItemWeights'] = createExportWrapper('BotFreeItemWeights', 1);
var _FreeWeightConfig = Module['_FreeWeightConfig'] = createExportWrapper('FreeWeightConfig', 1);
var _BotAllocGoalState = Module['_BotAllocGoalState'] = createExportWrapper('BotAllocGoalState', 1);
var _BotFreeGoalState = Module['_BotFreeGoalState'] = createExportWrapper('BotFreeGoalState', 1);
var _BotSetupGoalAI = Module['_BotSetupGoalAI'] = createExportWrapper('BotSetupGoalAI', 0);
var _ReadStructure = Module['_ReadStructure'] = createExportWrapper('ReadStructure', 3);
var _BotShutdownGoalAI = Module['_BotShutdownGoalAI'] = createExportWrapper('BotShutdownGoalAI', 0);
var _BotAllocMoveState = Module['_BotAllocMoveState'] = createExportWrapper('BotAllocMoveState', 0);
var _BotFreeMoveState = Module['_BotFreeMoveState'] = createExportWrapper('BotFreeMoveState', 1);
var _BotInitMoveState = Module['_BotInitMoveState'] = createExportWrapper('BotInitMoveState', 2);
var _BotFuzzyPointReachabilityArea = Module['_BotFuzzyPointReachabilityArea'] = createExportWrapper('BotFuzzyPointReachabilityArea', 1);
var _BotSetBrushModelTypes = Module['_BotSetBrushModelTypes'] = createExportWrapper('BotSetBrushModelTypes', 0);
var _BotAddAvoidSpot = Module['_BotAddAvoidSpot'] = createExportWrapper('BotAddAvoidSpot', 4);
var _BotGetReachabilityToGoal = Module['_BotGetReachabilityToGoal'] = createExportWrapper('BotGetReachabilityToGoal', 12);
var _BotMovementViewTarget = Module['_BotMovementViewTarget'] = createExportWrapper('BotMovementViewTarget', 5);
var _BotPredictVisiblePosition = Module['_BotPredictVisiblePosition'] = createExportWrapper('BotPredictVisiblePosition', 5);
var _BotMoveInDirection = Module['_BotMoveInDirection'] = createExportWrapper('BotMoveInDirection', 4);
var _EA_Move = Module['_EA_Move'] = createExportWrapper('EA_Move', 3);
var _EA_Jump = Module['_EA_Jump'] = createExportWrapper('EA_Jump', 1);
var _EA_Crouch = Module['_EA_Crouch'] = createExportWrapper('EA_Crouch', 1);
var _BotMoveToGoal = Module['_BotMoveToGoal'] = createExportWrapper('BotMoveToGoal', 4);
var _EA_Walk = Module['_EA_Walk'] = createExportWrapper('EA_Walk', 1);
var _EA_MoveForward = Module['_EA_MoveForward'] = createExportWrapper('EA_MoveForward', 1);
var _EA_DelayedJump = Module['_EA_DelayedJump'] = createExportWrapper('EA_DelayedJump', 1);
var _EA_MoveUp = Module['_EA_MoveUp'] = createExportWrapper('EA_MoveUp', 1);
var _EA_Attack = Module['_EA_Attack'] = createExportWrapper('EA_Attack', 1);
var _EA_View = Module['_EA_View'] = createExportWrapper('EA_View', 2);
var _EA_SelectWeapon = Module['_EA_SelectWeapon'] = createExportWrapper('EA_SelectWeapon', 2);
var _BotResetAvoidReach = Module['_BotResetAvoidReach'] = createExportWrapper('BotResetAvoidReach', 1);
var _BotResetLastAvoidReach = Module['_BotResetLastAvoidReach'] = createExportWrapper('BotResetLastAvoidReach', 1);
var _BotResetMoveState = Module['_BotResetMoveState'] = createExportWrapper('BotResetMoveState', 1);
var _BotSetupMoveAI = Module['_BotSetupMoveAI'] = createExportWrapper('BotSetupMoveAI', 0);
var _BotShutdownMoveAI = Module['_BotShutdownMoveAI'] = createExportWrapper('BotShutdownMoveAI', 0);
var _BotLoadWeaponWeights = Module['_BotLoadWeaponWeights'] = createExportWrapper('BotLoadWeaponWeights', 2);
var _BotGetWeaponInfo = Module['_BotGetWeaponInfo'] = createExportWrapper('BotGetWeaponInfo', 3);
var _BotChooseBestFightWeapon = Module['_BotChooseBestFightWeapon'] = createExportWrapper('BotChooseBestFightWeapon', 2);
var _FuzzyWeight = Module['_FuzzyWeight'] = createExportWrapper('FuzzyWeight', 3);
var _BotResetWeaponState = Module['_BotResetWeaponState'] = createExportWrapper('BotResetWeaponState', 1);
var _BotAllocWeaponState = Module['_BotAllocWeaponState'] = createExportWrapper('BotAllocWeaponState', 0);
var _BotFreeWeaponState = Module['_BotFreeWeaponState'] = createExportWrapper('BotFreeWeaponState', 1);
var _BotSetupWeaponAI = Module['_BotSetupWeaponAI'] = createExportWrapper('BotSetupWeaponAI', 0);
var _BotShutdownWeaponAI = Module['_BotShutdownWeaponAI'] = createExportWrapper('BotShutdownWeaponAI', 0);
var _ScaleWeight = Module['_ScaleWeight'] = createExportWrapper('ScaleWeight', 3);
var _ScaleFuzzyBalanceRange = Module['_ScaleFuzzyBalanceRange'] = createExportWrapper('ScaleFuzzyBalanceRange', 2);
var _BotShutdownWeights = Module['_BotShutdownWeights'] = createExportWrapper('BotShutdownWeights', 0);
var _EA_Say = Module['_EA_Say'] = createExportWrapper('EA_Say', 2);
var _EA_SayTeam = Module['_EA_SayTeam'] = createExportWrapper('EA_SayTeam', 2);
var _EA_Tell = Module['_EA_Tell'] = createExportWrapper('EA_Tell', 3);
var _EA_UseItem = Module['_EA_UseItem'] = createExportWrapper('EA_UseItem', 2);
var _EA_DropItem = Module['_EA_DropItem'] = createExportWrapper('EA_DropItem', 2);
var _EA_UseInv = Module['_EA_UseInv'] = createExportWrapper('EA_UseInv', 2);
var _EA_DropInv = Module['_EA_DropInv'] = createExportWrapper('EA_DropInv', 2);
var _EA_Gesture = Module['_EA_Gesture'] = createExportWrapper('EA_Gesture', 1);
var _EA_Talk = Module['_EA_Talk'] = createExportWrapper('EA_Talk', 1);
var _EA_Use = Module['_EA_Use'] = createExportWrapper('EA_Use', 1);
var _EA_Respawn = Module['_EA_Respawn'] = createExportWrapper('EA_Respawn', 1);
var _EA_Action = Module['_EA_Action'] = createExportWrapper('EA_Action', 2);
var _EA_MoveDown = Module['_EA_MoveDown'] = createExportWrapper('EA_MoveDown', 1);
var _EA_MoveBack = Module['_EA_MoveBack'] = createExportWrapper('EA_MoveBack', 1);
var _EA_MoveLeft = Module['_EA_MoveLeft'] = createExportWrapper('EA_MoveLeft', 1);
var _EA_MoveRight = Module['_EA_MoveRight'] = createExportWrapper('EA_MoveRight', 1);
var _EA_EndRegular = Module['_EA_EndRegular'] = createExportWrapper('EA_EndRegular', 2);
var _EA_GetInput = Module['_EA_GetInput'] = createExportWrapper('EA_GetInput', 3);
var _EA_ResetInput = Module['_EA_ResetInput'] = createExportWrapper('EA_ResetInput', 1);
var _EA_Setup = Module['_EA_Setup'] = createExportWrapper('EA_Setup', 0);
var _EA_Shutdown = Module['_EA_Shutdown'] = createExportWrapper('EA_Shutdown', 0);
var _BotExportTest = Module['_BotExportTest'] = createExportWrapper('BotExportTest', 4);
var _PC_SourceFileAndLine = Module['_PC_SourceFileAndLine'] = createExportWrapper('PC_SourceFileAndLine', 3);
var _PC_ReadTokenHandle = Module['_PC_ReadTokenHandle'] = createExportWrapper('PC_ReadTokenHandle', 2);
var _PC_FreeSourceHandle = Module['_PC_FreeSourceHandle'] = createExportWrapper('PC_FreeSourceHandle', 1);
var _PC_LoadSourceHandle = Module['_PC_LoadSourceHandle'] = createExportWrapper('PC_LoadSourceHandle', 1);
var _PC_AddGlobalDefine = Module['_PC_AddGlobalDefine'] = createExportWrapper('PC_AddGlobalDefine', 1);
var _Log_Open = Module['_Log_Open'] = createExportWrapper('Log_Open', 1);
var _LibVarDeAllocAll = Module['_LibVarDeAllocAll'] = createExportWrapper('LibVarDeAllocAll', 0);
var _PC_RemoveAllGlobalDefines = Module['_PC_RemoveAllGlobalDefines'] = createExportWrapper('PC_RemoveAllGlobalDefines', 0);
var _Log_Shutdown = Module['_Log_Shutdown'] = createExportWrapper('Log_Shutdown', 0);
var _PC_CheckOpenSourceHandles = Module['_PC_CheckOpenSourceHandles'] = createExportWrapper('PC_CheckOpenSourceHandles', 0);
var _LibVarAlloc = Module['_LibVarAlloc'] = createExportWrapper('LibVarAlloc', 1);
var _LibVarDeAlloc = Module['_LibVarDeAlloc'] = createExportWrapper('LibVarDeAlloc', 1);
var _LibVarGet = Module['_LibVarGet'] = createExportWrapper('LibVarGet', 1);
var _Log_FilePointer = Module['_Log_FilePointer'] = createExportWrapper('Log_FilePointer', 0);
var _Log_Flush = Module['_Log_Flush'] = createExportWrapper('Log_Flush', 0);
var _AvailableMemory = Module['_AvailableMemory'] = createExportWrapper('AvailableMemory', 0);
var _LoadScriptFile = Module['_LoadScriptFile'] = createExportWrapper('LoadScriptFile', 1);
var _PC_UnreadToken = Module['_PC_UnreadToken'] = createExportWrapper('PC_UnreadToken', 2);
var _EndOfScript = Module['_EndOfScript'] = createExportWrapper('EndOfScript', 1);
var _PS_SetBaseFolder = Module['_PS_SetBaseFolder'] = createExportWrapper('PS_SetBaseFolder', 1);
var _PunctuationFromNum = Module['_PunctuationFromNum'] = createExportWrapper('PunctuationFromNum', 2);
var _PS_ExpectAnyToken = Module['_PS_ExpectAnyToken'] = createExportWrapper('PS_ExpectAnyToken', 2);
var _PS_UnreadLastToken = Module['_PS_UnreadLastToken'] = createExportWrapper('PS_UnreadLastToken', 1);
var _StripSingleQuotes = Module['_StripSingleQuotes'] = createExportWrapper('StripSingleQuotes', 1);
var _WriteIndent = Module['_WriteIndent'] = createExportWrapper('WriteIndent', 2);
var _WriteFloat = Module['_WriteFloat'] = createExportWrapper('WriteFloat', 2);
var _WriteStructure = Module['_WriteStructure'] = createExportWrapper('WriteStructure', 3);
var _oggpack_writeinit = Module['_oggpack_writeinit'] = createExportWrapper('oggpack_writeinit', 1);
var _oggpackB_writeinit = Module['_oggpackB_writeinit'] = createExportWrapper('oggpackB_writeinit', 1);
var _oggpack_writecheck = Module['_oggpack_writecheck'] = createExportWrapper('oggpack_writecheck', 1);
var _oggpackB_writecheck = Module['_oggpackB_writecheck'] = createExportWrapper('oggpackB_writecheck', 1);
var _oggpack_writetrunc = Module['_oggpack_writetrunc'] = createExportWrapper('oggpack_writetrunc', 2);
var _oggpackB_writetrunc = Module['_oggpackB_writetrunc'] = createExportWrapper('oggpackB_writetrunc', 2);
var _oggpack_write = Module['_oggpack_write'] = createExportWrapper('oggpack_write', 3);
var _realloc = Module['_realloc'] = createExportWrapper('realloc', 2);
var _oggpack_writeclear = Module['_oggpack_writeclear'] = createExportWrapper('oggpack_writeclear', 1);
var _oggpackB_write = Module['_oggpackB_write'] = createExportWrapper('oggpackB_write', 3);
var _oggpack_writealign = Module['_oggpack_writealign'] = createExportWrapper('oggpack_writealign', 1);
var _oggpackB_writealign = Module['_oggpackB_writealign'] = createExportWrapper('oggpackB_writealign', 1);
var _oggpack_writecopy = Module['_oggpack_writecopy'] = createExportWrapper('oggpack_writecopy', 3);
var _oggpackB_writecopy = Module['_oggpackB_writecopy'] = createExportWrapper('oggpackB_writecopy', 3);
var _oggpack_reset = Module['_oggpack_reset'] = createExportWrapper('oggpack_reset', 1);
var _oggpackB_reset = Module['_oggpackB_reset'] = createExportWrapper('oggpackB_reset', 1);
var _oggpackB_writeclear = Module['_oggpackB_writeclear'] = createExportWrapper('oggpackB_writeclear', 1);
var _oggpack_readinit = Module['_oggpack_readinit'] = createExportWrapper('oggpack_readinit', 3);
var _oggpackB_readinit = Module['_oggpackB_readinit'] = createExportWrapper('oggpackB_readinit', 3);
var _oggpack_look = Module['_oggpack_look'] = createExportWrapper('oggpack_look', 2);
var _oggpackB_look = Module['_oggpackB_look'] = createExportWrapper('oggpackB_look', 2);
var _oggpack_look1 = Module['_oggpack_look1'] = createExportWrapper('oggpack_look1', 1);
var _oggpackB_look1 = Module['_oggpackB_look1'] = createExportWrapper('oggpackB_look1', 1);
var _oggpack_adv = Module['_oggpack_adv'] = createExportWrapper('oggpack_adv', 2);
var _oggpackB_adv = Module['_oggpackB_adv'] = createExportWrapper('oggpackB_adv', 2);
var _oggpack_adv1 = Module['_oggpack_adv1'] = createExportWrapper('oggpack_adv1', 1);
var _oggpackB_adv1 = Module['_oggpackB_adv1'] = createExportWrapper('oggpackB_adv1', 1);
var _oggpack_read = Module['_oggpack_read'] = createExportWrapper('oggpack_read', 2);
var _oggpackB_read = Module['_oggpackB_read'] = createExportWrapper('oggpackB_read', 2);
var _oggpack_read1 = Module['_oggpack_read1'] = createExportWrapper('oggpack_read1', 1);
var _oggpackB_read1 = Module['_oggpackB_read1'] = createExportWrapper('oggpackB_read1', 1);
var _oggpack_bytes = Module['_oggpack_bytes'] = createExportWrapper('oggpack_bytes', 1);
var _oggpack_bits = Module['_oggpack_bits'] = createExportWrapper('oggpack_bits', 1);
var _oggpackB_bytes = Module['_oggpackB_bytes'] = createExportWrapper('oggpackB_bytes', 1);
var _oggpackB_bits = Module['_oggpackB_bits'] = createExportWrapper('oggpackB_bits', 1);
var _oggpack_get_buffer = Module['_oggpack_get_buffer'] = createExportWrapper('oggpack_get_buffer', 1);
var _oggpackB_get_buffer = Module['_oggpackB_get_buffer'] = createExportWrapper('oggpackB_get_buffer', 1);
var _ogg_page_version = Module['_ogg_page_version'] = createExportWrapper('ogg_page_version', 1);
var _ogg_page_continued = Module['_ogg_page_continued'] = createExportWrapper('ogg_page_continued', 1);
var _ogg_page_bos = Module['_ogg_page_bos'] = createExportWrapper('ogg_page_bos', 1);
var _ogg_page_eos = Module['_ogg_page_eos'] = createExportWrapper('ogg_page_eos', 1);
var _ogg_page_granulepos = Module['_ogg_page_granulepos'] = createExportWrapper('ogg_page_granulepos', 1);
var _ogg_page_serialno = Module['_ogg_page_serialno'] = createExportWrapper('ogg_page_serialno', 1);
var _ogg_page_pageno = Module['_ogg_page_pageno'] = createExportWrapper('ogg_page_pageno', 1);
var _ogg_page_packets = Module['_ogg_page_packets'] = createExportWrapper('ogg_page_packets', 1);
var _ogg_stream_init = Module['_ogg_stream_init'] = createExportWrapper('ogg_stream_init', 2);
var _ogg_stream_clear = Module['_ogg_stream_clear'] = createExportWrapper('ogg_stream_clear', 1);
var _ogg_stream_check = Module['_ogg_stream_check'] = createExportWrapper('ogg_stream_check', 1);
var _ogg_stream_destroy = Module['_ogg_stream_destroy'] = createExportWrapper('ogg_stream_destroy', 1);
var _ogg_page_checksum_set = Module['_ogg_page_checksum_set'] = createExportWrapper('ogg_page_checksum_set', 1);
var _ogg_stream_iovecin = Module['_ogg_stream_iovecin'] = createExportWrapper('ogg_stream_iovecin', 6);
var _ogg_stream_packetin = Module['_ogg_stream_packetin'] = createExportWrapper('ogg_stream_packetin', 2);
var _ogg_stream_flush = Module['_ogg_stream_flush'] = createExportWrapper('ogg_stream_flush', 2);
var _ogg_stream_flush_fill = Module['_ogg_stream_flush_fill'] = createExportWrapper('ogg_stream_flush_fill', 3);
var _ogg_stream_pageout = Module['_ogg_stream_pageout'] = createExportWrapper('ogg_stream_pageout', 2);
var _ogg_stream_pageout_fill = Module['_ogg_stream_pageout_fill'] = createExportWrapper('ogg_stream_pageout_fill', 3);
var _ogg_stream_eos = Module['_ogg_stream_eos'] = createExportWrapper('ogg_stream_eos', 1);
var _ogg_sync_init = Module['_ogg_sync_init'] = createExportWrapper('ogg_sync_init', 1);
var _ogg_sync_clear = Module['_ogg_sync_clear'] = createExportWrapper('ogg_sync_clear', 1);
var _ogg_sync_destroy = Module['_ogg_sync_destroy'] = createExportWrapper('ogg_sync_destroy', 1);
var _ogg_sync_check = Module['_ogg_sync_check'] = createExportWrapper('ogg_sync_check', 1);
var _ogg_sync_buffer = Module['_ogg_sync_buffer'] = createExportWrapper('ogg_sync_buffer', 2);
var _ogg_sync_wrote = Module['_ogg_sync_wrote'] = createExportWrapper('ogg_sync_wrote', 2);
var _ogg_sync_pageseek = Module['_ogg_sync_pageseek'] = createExportWrapper('ogg_sync_pageseek', 2);
var _ogg_sync_pageout = Module['_ogg_sync_pageout'] = createExportWrapper('ogg_sync_pageout', 2);
var _ogg_stream_pagein = Module['_ogg_stream_pagein'] = createExportWrapper('ogg_stream_pagein', 2);
var _ogg_sync_reset = Module['_ogg_sync_reset'] = createExportWrapper('ogg_sync_reset', 1);
var _ogg_stream_reset = Module['_ogg_stream_reset'] = createExportWrapper('ogg_stream_reset', 1);
var _ogg_stream_reset_serialno = Module['_ogg_stream_reset_serialno'] = createExportWrapper('ogg_stream_reset_serialno', 2);
var _ogg_stream_packetout = Module['_ogg_stream_packetout'] = createExportWrapper('ogg_stream_packetout', 2);
var _ogg_stream_packetpeek = Module['_ogg_stream_packetpeek'] = createExportWrapper('ogg_stream_packetpeek', 2);
var _ogg_packet_clear = Module['_ogg_packet_clear'] = createExportWrapper('ogg_packet_clear', 1);
var _vorbis_analysis = Module['_vorbis_analysis'] = createExportWrapper('vorbis_analysis', 2);
var _vorbis_bitrate_managed = Module['_vorbis_bitrate_managed'] = createExportWrapper('vorbis_bitrate_managed', 1);
var _vorbis_bitrate_init = Module['_vorbis_bitrate_init'] = createExportWrapper('vorbis_bitrate_init', 2);
var _vorbis_bitrate_clear = Module['_vorbis_bitrate_clear'] = createExportWrapper('vorbis_bitrate_clear', 1);
var _vorbis_bitrate_addblock = Module['_vorbis_bitrate_addblock'] = createExportWrapper('vorbis_bitrate_addblock', 1);
var _vorbis_bitrate_flushpacket = Module['_vorbis_bitrate_flushpacket'] = createExportWrapper('vorbis_bitrate_flushpacket', 2);
var _vorbis_block_init = Module['_vorbis_block_init'] = createExportWrapper('vorbis_block_init', 2);
var __vorbis_block_alloc = Module['__vorbis_block_alloc'] = createExportWrapper('_vorbis_block_alloc', 2);
var __vorbis_block_ripcord = Module['__vorbis_block_ripcord'] = createExportWrapper('_vorbis_block_ripcord', 1);
var _vorbis_block_clear = Module['_vorbis_block_clear'] = createExportWrapper('vorbis_block_clear', 1);
var _vorbis_analysis_init = Module['_vorbis_analysis_init'] = createExportWrapper('vorbis_analysis_init', 2);
var __vp_global_look = Module['__vp_global_look'] = createExportWrapper('_vp_global_look', 1);
var __ve_envelope_init = Module['__ve_envelope_init'] = createExportWrapper('_ve_envelope_init', 2);
var _ov_ilog = Module['_ov_ilog'] = createExportWrapper('ov_ilog', 1);
var _mdct_init = Module['_mdct_init'] = createExportWrapper('mdct_init', 2);
var _drft_init = Module['_drft_init'] = createExportWrapper('drft_init', 2);
var _vorbis_book_init_encode = Module['_vorbis_book_init_encode'] = createExportWrapper('vorbis_book_init_encode', 2);
var __vp_psy_init = Module['__vp_psy_init'] = createExportWrapper('_vp_psy_init', 5);
var _vorbis_book_init_decode = Module['_vorbis_book_init_decode'] = createExportWrapper('vorbis_book_init_decode', 2);
var _vorbis_staticbook_destroy = Module['_vorbis_staticbook_destroy'] = createExportWrapper('vorbis_staticbook_destroy', 1);
var _vorbis_dsp_clear = Module['_vorbis_dsp_clear'] = createExportWrapper('vorbis_dsp_clear', 1);
var __ve_envelope_clear = Module['__ve_envelope_clear'] = createExportWrapper('_ve_envelope_clear', 1);
var _mdct_clear = Module['_mdct_clear'] = createExportWrapper('mdct_clear', 1);
var __vp_psy_clear = Module['__vp_psy_clear'] = createExportWrapper('_vp_psy_clear', 1);
var __vp_global_free = Module['__vp_global_free'] = createExportWrapper('_vp_global_free', 1);
var _drft_clear = Module['_drft_clear'] = createExportWrapper('drft_clear', 1);
var _vorbis_analysis_buffer = Module['_vorbis_analysis_buffer'] = createExportWrapper('vorbis_analysis_buffer', 2);
var _vorbis_analysis_wrote = Module['_vorbis_analysis_wrote'] = createExportWrapper('vorbis_analysis_wrote', 2);
var _vorbis_lpc_from_data = Module['_vorbis_lpc_from_data'] = createExportWrapper('vorbis_lpc_from_data', 4);
var _vorbis_lpc_predict = Module['_vorbis_lpc_predict'] = createExportWrapper('vorbis_lpc_predict', 5);
var _vorbis_analysis_blockout = Module['_vorbis_analysis_blockout'] = createExportWrapper('vorbis_analysis_blockout', 2);
var __ve_envelope_search = Module['__ve_envelope_search'] = createExportWrapper('_ve_envelope_search', 1);
var __ve_envelope_mark = Module['__ve_envelope_mark'] = createExportWrapper('_ve_envelope_mark', 1);
var __vp_ampmax_decay = Module['__vp_ampmax_decay'] = createExportWrapper('_vp_ampmax_decay', 2);
var __ve_envelope_shift = Module['__ve_envelope_shift'] = createExportWrapper('_ve_envelope_shift', 2);
var _vorbis_synthesis_restart = Module['_vorbis_synthesis_restart'] = createExportWrapper('vorbis_synthesis_restart', 1);
var _vorbis_synthesis_init = Module['_vorbis_synthesis_init'] = createExportWrapper('vorbis_synthesis_init', 2);
var _vorbis_synthesis_blockin = Module['_vorbis_synthesis_blockin'] = createExportWrapper('vorbis_synthesis_blockin', 2);
var __vorbis_window_get = Module['__vorbis_window_get'] = createExportWrapper('_vorbis_window_get', 1);
var _vorbis_synthesis_pcmout = Module['_vorbis_synthesis_pcmout'] = createExportWrapper('vorbis_synthesis_pcmout', 2);
var _vorbis_synthesis_read = Module['_vorbis_synthesis_read'] = createExportWrapper('vorbis_synthesis_read', 2);
var _vorbis_synthesis_lapout = Module['_vorbis_synthesis_lapout'] = createExportWrapper('vorbis_synthesis_lapout', 2);
var _vorbis_window = Module['_vorbis_window'] = createExportWrapper('vorbis_window', 2);
var _vorbis_staticbook_pack = Module['_vorbis_staticbook_pack'] = createExportWrapper('vorbis_staticbook_pack', 2);
var __book_maptype1_quantvals = Module['__book_maptype1_quantvals'] = createExportWrapper('_book_maptype1_quantvals', 1);
var _vorbis_staticbook_unpack = Module['_vorbis_staticbook_unpack'] = createExportWrapper('vorbis_staticbook_unpack', 1);
var _vorbis_book_encode = Module['_vorbis_book_encode'] = createExportWrapper('vorbis_book_encode', 3);
var _vorbis_book_decode = Module['_vorbis_book_decode'] = createExportWrapper('vorbis_book_decode', 2);
var _vorbis_book_decodevs_add = Module['_vorbis_book_decodevs_add'] = createExportWrapper('vorbis_book_decodevs_add', 4);
var _vorbis_book_decodev_add = Module['_vorbis_book_decodev_add'] = createExportWrapper('vorbis_book_decodev_add', 4);
var _vorbis_book_decodev_set = Module['_vorbis_book_decodev_set'] = createExportWrapper('vorbis_book_decodev_set', 4);
var _vorbis_book_decodevv_add = Module['_vorbis_book_decodevv_add'] = createExportWrapper('vorbis_book_decodevv_add', 6);
var _mdct_forward = Module['_mdct_forward'] = createExportWrapper('mdct_forward', 3);
var _vorbis_lsp_to_curve = Module['_vorbis_lsp_to_curve'] = createExportWrapper('vorbis_lsp_to_curve', 8);
var _floor1_fit = Module['_floor1_fit'] = createExportWrapper('floor1_fit', 4);
var _floor1_interpolate_fit = Module['_floor1_interpolate_fit'] = createExportWrapper('floor1_interpolate_fit', 5);
var _floor1_encode = Module['_floor1_encode'] = createExportWrapper('floor1_encode', 5);
var _vorbis_comment_init = Module['_vorbis_comment_init'] = createExportWrapper('vorbis_comment_init', 1);
var _vorbis_comment_add = Module['_vorbis_comment_add'] = createExportWrapper('vorbis_comment_add', 2);
var _vorbis_comment_add_tag = Module['_vorbis_comment_add_tag'] = createExportWrapper('vorbis_comment_add_tag', 3);
var _vorbis_comment_query = Module['_vorbis_comment_query'] = createExportWrapper('vorbis_comment_query', 3);
var _vorbis_comment_query_count = Module['_vorbis_comment_query_count'] = createExportWrapper('vorbis_comment_query_count', 2);
var _vorbis_comment_clear = Module['_vorbis_comment_clear'] = createExportWrapper('vorbis_comment_clear', 1);
var _vorbis_info_blocksize = Module['_vorbis_info_blocksize'] = createExportWrapper('vorbis_info_blocksize', 2);
var _vorbis_info_init = Module['_vorbis_info_init'] = createExportWrapper('vorbis_info_init', 1);
var _vorbis_info_clear = Module['_vorbis_info_clear'] = createExportWrapper('vorbis_info_clear', 1);
var _vorbis_book_clear = Module['_vorbis_book_clear'] = createExportWrapper('vorbis_book_clear', 1);
var __vi_psy_free = Module['__vi_psy_free'] = createExportWrapper('_vi_psy_free', 1);
var _vorbis_synthesis_idheader = Module['_vorbis_synthesis_idheader'] = createExportWrapper('vorbis_synthesis_idheader', 1);
var _vorbis_synthesis_headerin = Module['_vorbis_synthesis_headerin'] = createExportWrapper('vorbis_synthesis_headerin', 3);
var _vorbis_commentheader_out = Module['_vorbis_commentheader_out'] = createExportWrapper('vorbis_commentheader_out', 2);
var _vorbis_analysis_headerout = Module['_vorbis_analysis_headerout'] = createExportWrapper('vorbis_analysis_headerout', 5);
var _vorbis_granule_time = Module['_vorbis_granule_time'] = createExportWrapper('vorbis_granule_time', 3);
var _vorbis_version_string = Module['_vorbis_version_string'] = createExportWrapper('vorbis_version_string', 0);
var __vorbis_apply_window = Module['__vorbis_apply_window'] = createExportWrapper('_vorbis_apply_window', 6);
var _drft_forward = Module['_drft_forward'] = createExportWrapper('drft_forward', 2);
var __vp_noisemask = Module['__vp_noisemask'] = createExportWrapper('_vp_noisemask', 3);
var __vp_tonemask = Module['__vp_tonemask'] = createExportWrapper('_vp_tonemask', 5);
var __vp_offset_and_mix = Module['__vp_offset_and_mix'] = createExportWrapper('_vp_offset_and_mix', 7);
var __vp_couple_quantize_normalize = Module['__vp_couple_quantize_normalize'] = createExportWrapper('_vp_couple_quantize_normalize', 9);
var _mdct_backward = Module['_mdct_backward'] = createExportWrapper('mdct_backward', 3);
var __vi_gpsy_free = Module['__vi_gpsy_free'] = createExportWrapper('_vi_gpsy_free', 1);
var _res0_free_info = Module['_res0_free_info'] = createExportWrapper('res0_free_info', 1);
var _res0_free_look = Module['_res0_free_look'] = createExportWrapper('res0_free_look', 1);
var _res0_pack = Module['_res0_pack'] = createExportWrapper('res0_pack', 2);
var _res0_unpack = Module['_res0_unpack'] = createExportWrapper('res0_unpack', 2);
var _res0_look = Module['_res0_look'] = createExportWrapper('res0_look', 2);
var _res0_inverse = Module['_res0_inverse'] = createExportWrapper('res0_inverse', 5);
var _res1_forward = Module['_res1_forward'] = createExportWrapper('res1_forward', 8);
var _res1_class = Module['_res1_class'] = createExportWrapper('res1_class', 5);
var _res1_inverse = Module['_res1_inverse'] = createExportWrapper('res1_inverse', 5);
var _res2_class = Module['_res2_class'] = createExportWrapper('res2_class', 5);
var _res2_forward = Module['_res2_forward'] = createExportWrapper('res2_forward', 8);
var _res2_inverse = Module['_res2_inverse'] = createExportWrapper('res2_inverse', 5);
var _drft_backward = Module['_drft_backward'] = createExportWrapper('drft_backward', 2);
var __float32_pack = Module['__float32_pack'] = createExportWrapper('_float32_pack', 1);
var __float32_unpack = Module['__float32_unpack'] = createExportWrapper('_float32_unpack', 1);
var __make_words = Module['__make_words'] = createExportWrapper('_make_words', 3);
var __book_unquantize = Module['__book_unquantize'] = createExportWrapper('_book_unquantize', 3);
var _vorbis_book_codeword = Module['_vorbis_book_codeword'] = createExportWrapper('vorbis_book_codeword', 2);
var _vorbis_book_codelen = Module['_vorbis_book_codelen'] = createExportWrapper('vorbis_book_codelen', 2);
var _vorbis_synthesis = Module['_vorbis_synthesis'] = createExportWrapper('vorbis_synthesis', 2);
var _vorbis_synthesis_trackonly = Module['_vorbis_synthesis_trackonly'] = createExportWrapper('vorbis_synthesis_trackonly', 2);
var _vorbis_packet_blocksize = Module['_vorbis_packet_blocksize'] = createExportWrapper('vorbis_packet_blocksize', 2);
var _vorbis_synthesis_halfrate = Module['_vorbis_synthesis_halfrate'] = createExportWrapper('vorbis_synthesis_halfrate', 2);
var _vorbis_synthesis_halfrate_p = Module['_vorbis_synthesis_halfrate_p'] = createExportWrapper('vorbis_synthesis_halfrate_p', 1);
var _ov_clear = Module['_ov_clear'] = createExportWrapper('ov_clear', 1);
var _ov_open_callbacks = Module['_ov_open_callbacks'] = createExportWrapper('ov_open_callbacks', 5);
var _ov_open = Module['_ov_open'] = createExportWrapper('ov_open', 4);
var _ov_fopen = Module['_ov_fopen'] = createExportWrapper('ov_fopen', 2);
var _ov_halfrate = Module['_ov_halfrate'] = createExportWrapper('ov_halfrate', 2);
var _ov_pcm_seek = Module['_ov_pcm_seek'] = createExportWrapper('ov_pcm_seek', 3);
var _ov_pcm_seek_page = Module['_ov_pcm_seek_page'] = createExportWrapper('ov_pcm_seek_page', 3);
var _ov_pcm_total = Module['_ov_pcm_total'] = createExportWrapper('ov_pcm_total', 2);
var _ov_halfrate_p = Module['_ov_halfrate_p'] = createExportWrapper('ov_halfrate_p', 1);
var _ov_test_callbacks = Module['_ov_test_callbacks'] = createExportWrapper('ov_test_callbacks', 5);
var _ov_test = Module['_ov_test'] = createExportWrapper('ov_test', 4);
var _ov_test_open = Module['_ov_test_open'] = createExportWrapper('ov_test_open', 1);
var _ov_streams = Module['_ov_streams'] = createExportWrapper('ov_streams', 1);
var _ov_seekable = Module['_ov_seekable'] = createExportWrapper('ov_seekable', 1);
var _ov_bitrate = Module['_ov_bitrate'] = createExportWrapper('ov_bitrate', 2);
var _ov_time_total = Module['_ov_time_total'] = createExportWrapper('ov_time_total', 2);
var _ov_bitrate_instant = Module['_ov_bitrate_instant'] = createExportWrapper('ov_bitrate_instant', 1);
var _ov_serialnumber = Module['_ov_serialnumber'] = createExportWrapper('ov_serialnumber', 2);
var _ov_raw_total = Module['_ov_raw_total'] = createExportWrapper('ov_raw_total', 2);
var _ov_raw_seek = Module['_ov_raw_seek'] = createExportWrapper('ov_raw_seek', 3);
var _ov_time_seek = Module['_ov_time_seek'] = createExportWrapper('ov_time_seek', 2);
var _ov_time_seek_page = Module['_ov_time_seek_page'] = createExportWrapper('ov_time_seek_page', 2);
var _ov_raw_tell = Module['_ov_raw_tell'] = createExportWrapper('ov_raw_tell', 1);
var _ov_pcm_tell = Module['_ov_pcm_tell'] = createExportWrapper('ov_pcm_tell', 1);
var _ov_time_tell = Module['_ov_time_tell'] = createExportWrapper('ov_time_tell', 1);
var _ov_info = Module['_ov_info'] = createExportWrapper('ov_info', 2);
var _ov_comment = Module['_ov_comment'] = createExportWrapper('ov_comment', 2);
var _ov_read_filter = Module['_ov_read_filter'] = createExportWrapper('ov_read_filter', 9);
var _ov_read = Module['_ov_read'] = createExportWrapper('ov_read', 7);
var _ov_read_float = Module['_ov_read_float'] = createExportWrapper('ov_read_float', 4);
var _ov_crosslap = Module['_ov_crosslap'] = createExportWrapper('ov_crosslap', 2);
var _ov_raw_seek_lap = Module['_ov_raw_seek_lap'] = createExportWrapper('ov_raw_seek_lap', 3);
var _ov_pcm_seek_lap = Module['_ov_pcm_seek_lap'] = createExportWrapper('ov_pcm_seek_lap', 3);
var _ov_pcm_seek_page_lap = Module['_ov_pcm_seek_page_lap'] = createExportWrapper('ov_pcm_seek_page_lap', 3);
var _ov_time_seek_lap = Module['_ov_time_seek_lap'] = createExportWrapper('ov_time_seek_lap', 2);
var _ov_time_seek_page_lap = Module['_ov_time_seek_page_lap'] = createExportWrapper('ov_time_seek_page_lap', 2);
var _R_MDRAddAnimSurfaces = Module['_R_MDRAddAnimSurfaces'] = createExportWrapper('R_MDRAddAnimSurfaces', 1);
var _R_ComputeLOD = Module['_R_ComputeLOD'] = createExportWrapper('R_ComputeLOD', 1);
var _R_SetupEntityLighting = Module['_R_SetupEntityLighting'] = createExportWrapper('R_SetupEntityLighting', 2);
var _R_GetShaderByHandle = Module['_R_GetShaderByHandle'] = createExportWrapper('R_GetShaderByHandle', 1);
var _R_GetSkinByHandle = Module['_R_GetSkinByHandle'] = createExportWrapper('R_GetSkinByHandle', 1);
var _R_AddDrawSurf = Module['_R_AddDrawSurf'] = createExportWrapper('R_AddDrawSurf', 4);
var _R_CullLocalPointAndRadius = Module['_R_CullLocalPointAndRadius'] = createExportWrapper('R_CullLocalPointAndRadius', 2);
var _R_CullLocalBox = Module['_R_CullLocalBox'] = createExportWrapper('R_CullLocalBox', 1);
var _RB_MDRSurfaceAnim = Module['_RB_MDRSurfaceAnim'] = createExportWrapper('RB_MDRSurfaceAnim', 1);
var _VBO_Flush = Module['_VBO_Flush'] = createExportWrapper('VBO_Flush', 0);
var _RB_CheckOverflow = Module['_RB_CheckOverflow'] = createExportWrapper('RB_CheckOverflow', 2);
var _MC_UnCompress = Module['_MC_UnCompress'] = createExportWrapper('MC_UnCompress', 2);
var _GL_ProgramAvailable = Module['_GL_ProgramAvailable'] = createExportWrapper('GL_ProgramAvailable', 0);
var _GL_ProgramDisable = Module['_GL_ProgramDisable'] = createExportWrapper('GL_ProgramDisable', 0);
var _ARB_ProgramEnableExt = Module['_ARB_ProgramEnableExt'] = createExportWrapper('ARB_ProgramEnableExt', 2);
var _GL_ProgramEnable = Module['_GL_ProgramEnable'] = createExportWrapper('GL_ProgramEnable', 0);
var _ARB_SetupLightParams = Module['_ARB_SetupLightParams'] = createExportWrapper('ARB_SetupLightParams', 0);
var _RB_CalcFogProgramParms = Module['_RB_CalcFogProgramParms'] = createExportWrapper('RB_CalcFogProgramParms', 0);
var _GL_BindTexture = Module['_GL_BindTexture'] = createExportWrapper('GL_BindTexture', 2);
var _GL_SelectTexture = Module['_GL_SelectTexture'] = createExportWrapper('GL_SelectTexture', 1);
var _ARB_LightingPass = Module['_ARB_LightingPass'] = createExportWrapper('ARB_LightingPass', 0);
var _RB_DeformTessGeometry = Module['_RB_DeformTessGeometry'] = createExportWrapper('RB_DeformTessGeometry', 0);
var _GL_Cull = Module['_GL_Cull'] = createExportWrapper('GL_Cull', 1);
var _R_ComputeTexCoords = Module['_R_ComputeTexCoords'] = createExportWrapper('R_ComputeTexCoords', 2);
var _GL_ClientState = Module['_GL_ClientState'] = createExportWrapper('GL_ClientState', 2);
var _GL_State = Module['_GL_State'] = createExportWrapper('GL_State', 1);
var _R_BindAnimatedImage = Module['_R_BindAnimatedImage'] = createExportWrapper('R_BindAnimatedImage', 1);
var _R_DrawElements = Module['_R_DrawElements'] = createExportWrapper('R_DrawElements', 2);
var _ARB_CompileProgram = Module['_ARB_CompileProgram'] = createExportWrapper('ARB_CompileProgram', 3);
var _ARB_UpdatePrograms = Module['_ARB_UpdatePrograms'] = createExportWrapper('ARB_UpdatePrograms', 0);
var _FBO_Clean = Module['_FBO_Clean'] = createExportWrapper('FBO_Clean', 1);
var _FBO_ScreenTexture = Module['_FBO_ScreenTexture'] = createExportWrapper('FBO_ScreenTexture', 0);
var _FBO_BindMain = Module['_FBO_BindMain'] = createExportWrapper('FBO_BindMain', 0);
var _FBO_BlitSS = Module['_FBO_BlitSS'] = createExportWrapper('FBO_BlitSS', 0);
var _FBO_BlitMS = Module['_FBO_BlitMS'] = createExportWrapper('FBO_BlitMS', 1);
var _FBO_CopyScreen = Module['_FBO_CopyScreen'] = createExportWrapper('FBO_CopyScreen', 0);
var _GL_Ortho = Module['_GL_Ortho'] = createExportWrapper('GL_Ortho', 6);
var _FBO_Bloom = Module['_FBO_Bloom'] = createExportWrapper('FBO_Bloom', 3);
var _R_BloomScreen = Module['_R_BloomScreen'] = createExportWrapper('R_BloomScreen', 0);
var _RB_SetGL2D = Module['_RB_SetGL2D'] = createExportWrapper('RB_SetGL2D', 0);
var _FBO_PostProcess = Module['_FBO_PostProcess'] = createExportWrapper('FBO_PostProcess', 0);
var _QGL_SetRenderScale = Module['_QGL_SetRenderScale'] = createExportWrapper('QGL_SetRenderScale', 1);
var _QGL_DoneFBO = Module['_QGL_DoneFBO'] = createExportWrapper('QGL_DoneFBO', 0);
var _QGL_InitFBO = Module['_QGL_InitFBO'] = createExportWrapper('QGL_InitFBO', 0);
var _QGL_InitARB = Module['_QGL_InitARB'] = createExportWrapper('QGL_InitARB', 0);
var _QGL_DoneARB = Module['_QGL_DoneARB'] = createExportWrapper('QGL_DoneARB', 0);
var _GL_Bind = Module['_GL_Bind'] = createExportWrapper('GL_Bind', 1);
var _GL_BindTexNum = Module['_GL_BindTexNum'] = createExportWrapper('GL_BindTexNum', 1);
var _GL_TexEnv = Module['_GL_TexEnv'] = createExportWrapper('GL_TexEnv', 1);
var _RE_StretchRaw = Module['_RE_StretchRaw'] = createExportWrapper('RE_StretchRaw', 9);
var _RE_UploadCinematic = Module['_RE_UploadCinematic'] = createExportWrapper('RE_UploadCinematic', 7);
var _RE_StretchPic = Module['_RE_StretchPic'] = createExportWrapper('RE_StretchPic', 9);
var _R_CreateImage = Module['_R_CreateImage'] = createExportWrapper('R_CreateImage', 6);
var _RB_ShowImages = Module['_RB_ShowImages'] = createExportWrapper('RB_ShowImages', 0);
var _RB_ExecuteRenderCommands = Module['_RB_ExecuteRenderCommands'] = createExportWrapper('RB_ExecuteRenderCommands', 1);
var _RB_EndSurface = Module['_RB_EndSurface'] = createExportWrapper('RB_EndSurface', 0);
var _RB_BeginSurface = Module['_RB_BeginSurface'] = createExportWrapper('RB_BeginSurface', 2);
var _VBO_UnBind = Module['_VBO_UnBind'] = createExportWrapper('VBO_UnBind', 0);
var _RB_AddQuadStamp2 = Module['_RB_AddQuadStamp2'] = createExportWrapper('RB_AddQuadStamp2', 9);
var _RB_DrawSun = Module['_RB_DrawSun'] = createExportWrapper('RB_DrawSun', 2);
var _RB_ShadowFinish = Module['_RB_ShadowFinish'] = createExportWrapper('RB_ShadowFinish', 0);
var _RB_RenderFlares = Module['_RB_RenderFlares'] = createExportWrapper('RB_RenderFlares', 0);
var _RB_TakeScreenshot = Module['_RB_TakeScreenshot'] = createExportWrapper('RB_TakeScreenshot', 5);
var _RB_TakeScreenshotJPEG = Module['_RB_TakeScreenshotJPEG'] = createExportWrapper('RB_TakeScreenshotJPEG', 5);
var _RB_TakeScreenshotBMP = Module['_RB_TakeScreenshotBMP'] = createExportWrapper('RB_TakeScreenshotBMP', 6);
var _RB_TakeVideoFrameCmd = Module['_RB_TakeVideoFrameCmd'] = createExportWrapper('RB_TakeVideoFrameCmd', 1);
var _R_DecomposeSort = Module['_R_DecomposeSort'] = createExportWrapper('R_DecomposeSort', 5);
var _R_RotateForEntity = Module['_R_RotateForEntity'] = createExportWrapper('R_RotateForEntity', 3);
var _R_TransformDlights = Module['_R_TransformDlights'] = createExportWrapper('R_TransformDlights', 3);
var _R_SetupProjection = Module['_R_SetupProjection'] = createExportWrapper('R_SetupProjection', 3);
var _R_DecomposeLitSort = Module['_R_DecomposeLitSort'] = createExportWrapper('R_DecomposeLitSort', 4);
var _R_ColorShiftLightingBytes = Module['_R_ColorShiftLightingBytes'] = createExportWrapper('R_ColorShiftLightingBytes', 3);
var _R_GetLightmapCoords = Module['_R_GetLightmapCoords'] = createExportWrapper('R_GetLightmapCoords', 3);
var _R_LoadLightmaps = Module['_R_LoadLightmaps'] = createExportWrapper('R_LoadLightmaps', 1);
var _R_LoadAlternateImage = Module['_R_LoadAlternateImage'] = createExportWrapper('R_LoadAlternateImage', 3);
var _RE_SetWorldVisData = Module['_RE_SetWorldVisData'] = createExportWrapper('RE_SetWorldVisData', 1);
var _RE_GetEntityToken = Module['_RE_GetEntityToken'] = createExportWrapper('RE_GetEntityToken', 2);
var _RE_LoadWorldMap = Module['_RE_LoadWorldMap'] = createExportWrapper('RE_LoadWorldMap', 1);
var _R_IssuePendingRenderCommands = Module['_R_IssuePendingRenderCommands'] = createExportWrapper('R_IssuePendingRenderCommands', 0);
var _RE_ClearScene = Module['_RE_ClearScene'] = createExportWrapper('RE_ClearScene', 0);
var _COM_StripVariables = Module['_COM_StripVariables'] = createExportWrapper('COM_StripVariables', 3);
var _R_LoadImage = Module['_R_LoadImage'] = createExportWrapper('R_LoadImage', 4);
var _R_BuildWorldVBO = Module['_R_BuildWorldVBO'] = createExportWrapper('R_BuildWorldVBO', 2);
var _RE_RemapShader = Module['_RE_RemapShader'] = createExportWrapper('RE_RemapShader', 3);
var _R_FindShader = Module['_R_FindShader'] = createExportWrapper('R_FindShader', 3);
var _R_AllocModel = Module['_R_AllocModel'] = createExportWrapper('R_AllocModel', 0);
var _R_SubdividePatchToGrid = Module['_R_SubdividePatchToGrid'] = createExportWrapper('R_SubdividePatchToGrid', 3);
var _GetShaderIndexForPoint = Module['_GetShaderIndexForPoint'] = createExportWrapper('GetShaderIndexForPoint', 5);
var _GetIndexedShader = Module['_GetIndexedShader'] = createExportWrapper('GetIndexedShader', 3);
var _R_FreeSurfaceGridMesh = Module['_R_FreeSurfaceGridMesh'] = createExportWrapper('R_FreeSurfaceGridMesh', 1);
var _R_GridInsertColumn = Module['_R_GridInsertColumn'] = createExportWrapper('R_GridInsertColumn', 5);
var _R_GridInsertRow = Module['_R_GridInsertRow'] = createExportWrapper('R_GridInsertRow', 5);
var _R_AddDrawSurfCmd = Module['_R_AddDrawSurfCmd'] = createExportWrapper('R_AddDrawSurfCmd', 2);
var _RE_SetColor = Module['_RE_SetColor'] = createExportWrapper('RE_SetColor', 1);
var _RE_BeginFrame = Module['_RE_BeginFrame'] = createExportWrapper('RE_BeginFrame', 1);
var _GL_CheckErrors = Module['_GL_CheckErrors'] = createExportWrapper('GL_CheckErrors', 0);
var _RE_EndFrame = Module['_RE_EndFrame'] = createExportWrapper('RE_EndFrame', 2);
var _R_InitNextFrame = Module['_R_InitNextFrame'] = createExportWrapper('R_InitNextFrame', 0);
var _R_UpdateAlternateImages = Module['_R_UpdateAlternateImages'] = createExportWrapper('R_UpdateAlternateImages', 0);
var _GL_TextureMode = Module['_GL_TextureMode'] = createExportWrapper('GL_TextureMode', 1);
var _R_SetColorMappings = Module['_R_SetColorMappings'] = createExportWrapper('R_SetColorMappings', 0);
var _R_SumOfUsedImages = Module['_R_SumOfUsedImages'] = createExportWrapper('R_SumOfUsedImages', 0);
var _RE_TakeVideoFrame = Module['_RE_TakeVideoFrame'] = createExportWrapper('RE_TakeVideoFrame', 5);
var _RE_ThrottleBackend = Module['_RE_ThrottleBackend'] = createExportWrapper('RE_ThrottleBackend', 0);
var _RE_FinishBloom = Module['_RE_FinishBloom'] = createExportWrapper('RE_FinishBloom', 0);
var _RE_CanMinimize = Module['_RE_CanMinimize'] = createExportWrapper('RE_CanMinimize', 0);
var _RE_GetConfig = Module['_RE_GetConfig'] = createExportWrapper('RE_GetConfig', 0);
var _RE_VertexLighting = Module['_RE_VertexLighting'] = createExportWrapper('RE_VertexLighting', 1);
var _R_ClearFlares = Module['_R_ClearFlares'] = createExportWrapper('R_ClearFlares', 0);
var _RB_AddFlare = Module['_RB_AddFlare'] = createExportWrapper('RB_AddFlare', 5);
var _R_TransformModelToClip = Module['_R_TransformModelToClip'] = createExportWrapper('R_TransformModelToClip', 5);
var _R_TransformClipToWindow = Module['_R_TransformClipToWindow'] = createExportWrapper('R_TransformClipToWindow', 4);
var _RB_AddDlightFlares = Module['_RB_AddDlightFlares'] = createExportWrapper('RB_AddDlightFlares', 0);
var _RB_CalcModulateColorsByFog = Module['_RB_CalcModulateColorsByFog'] = createExportWrapper('RB_CalcModulateColorsByFog', 1);
var _readFloat = Module['_readFloat'] = createExportWrapper('readFloat', 0);
var _RE_RegisterFont = Module['_RE_RegisterFont'] = createExportWrapper('RE_RegisterFont', 3);
var _RE_RegisterShaderNoMip = Module['_RE_RegisterShaderNoMip'] = createExportWrapper('RE_RegisterShaderNoMip', 1);
var _R_InitFreeType = Module['_R_InitFreeType'] = createExportWrapper('R_InitFreeType', 0);
var _R_DoneFreeType = Module['_R_DoneFreeType'] = createExportWrapper('R_DoneFreeType', 0);
var _R_GammaCorrect = Module['_R_GammaCorrect'] = createExportWrapper('R_GammaCorrect', 2);
var _R_ImageList_f = Module['_R_ImageList_f'] = createExportWrapper('R_ImageList_f', 0);
var _R_UploadSubImage = Module['_R_UploadSubImage'] = createExportWrapper('R_UploadSubImage', 6);
var _R_FreeOldestImage = Module['_R_FreeOldestImage'] = createExportWrapper('R_FreeOldestImage', 0);
var _R_LoadTGA = Module['_R_LoadTGA'] = createExportWrapper('R_LoadTGA', 4);
var _R_LoadAlternateImage_real = Module['_R_LoadAlternateImage_real'] = createExportWrapper('R_LoadAlternateImage_real', 11);
var _R_GreyScale = Module['_R_GreyScale'] = createExportWrapper('R_GreyScale', 4);
var _R_InvertColors = Module['_R_InvertColors'] = createExportWrapper('R_InvertColors', 3);
var _R_InvertColors2 = Module['_R_InvertColors2'] = createExportWrapper('R_InvertColors2', 3);
var _R_InvertColors3 = Module['_R_InvertColors3'] = createExportWrapper('R_InvertColors3', 3);
var _R_InvertColors4 = Module['_R_InvertColors4'] = createExportWrapper('R_InvertColors4', 3);
var _R_RGBAtoR = Module['_R_RGBAtoR'] = createExportWrapper('R_RGBAtoR', 3);
var _canny_edge_detection = Module['_canny_edge_detection'] = createExportWrapper('canny_edge_detection', 7);
var _R_RtoRGBA = Module['_R_RtoRGBA'] = createExportWrapper('R_RtoRGBA', 4);
var _R_Rainbow2 = Module['_R_Rainbow2'] = createExportWrapper('R_Rainbow2', 3);
var _R_Rainbow = Module['_R_Rainbow'] = createExportWrapper('R_Rainbow', 3);
var _R_Berserk = Module['_R_Berserk'] = createExportWrapper('R_Berserk', 3);
var _R_HueShift = Module['_R_HueShift'] = createExportWrapper('R_HueShift', 4);
var _R_SatShift = Module['_R_SatShift'] = createExportWrapper('R_SatShift', 4);
var _R_LumShift = Module['_R_LumShift'] = createExportWrapper('R_LumShift', 4);
var _R_LoadAlternateImageVariables = Module['_R_LoadAlternateImageVariables'] = createExportWrapper('R_LoadAlternateImageVariables', 4);
var _COM_StripFilename = Module['_COM_StripFilename'] = createExportWrapper('COM_StripFilename', 3);
var _R_FindImageFile = Module['_R_FindImageFile'] = createExportWrapper('R_FindImageFile', 2);
var _R_InitFogTable = Module['_R_InitFogTable'] = createExportWrapper('R_InitFogTable', 0);
var _R_FogFactor = Module['_R_FogFactor'] = createExportWrapper('R_FogFactor', 2);
var _R_InitImages = Module['_R_InitImages'] = createExportWrapper('R_InitImages', 0);
var _R_ClearPalettes = Module['_R_ClearPalettes'] = createExportWrapper('R_ClearPalettes', 0);
var _R_DeleteTextures = Module['_R_DeleteTextures'] = createExportWrapper('R_DeleteTextures', 0);
var _RE_RegisterSkin = Module['_RE_RegisterSkin'] = createExportWrapper('RE_RegisterSkin', 1);
var _R_InitSkins = Module['_R_InitSkins'] = createExportWrapper('R_InitSkins', 0);
var _R_SkinList_f = Module['_R_SkinList_f'] = createExportWrapper('R_SkinList_f', 0);
var _R_LoadPNG = Module['_R_LoadPNG'] = createExportWrapper('R_LoadPNG', 4);
var _R_LoadBMP = Module['_R_LoadBMP'] = createExportWrapper('R_LoadBMP', 4);
var _R_LoadPCX = Module['_R_LoadPCX'] = createExportWrapper('R_LoadPCX', 4);
var _R_ConvertTextureFormat = Module['_R_ConvertTextureFormat'] = createExportWrapper('R_ConvertTextureFormat', 6);
var _R_AddPalette = Module['_R_AddPalette'] = createExportWrapper('R_AddPalette', 5);
var _R_RaddtoRGBA = Module['_R_RaddtoRGBA'] = createExportWrapper('R_RaddtoRGBA', 4);
var _rgb2hsl = Module['_rgb2hsl'] = createExportWrapper('rgb2hsl', 4);
var _hue2rgb = Module['_hue2rgb'] = createExportWrapper('hue2rgb', 3);
var _hsl2rgb = Module['_hsl2rgb'] = createExportWrapper('hsl2rgb', 4);
var _convolution = Module['_convolution'] = createExportWrapper('convolution', 7);
var _gaussian_filter = Module['_gaussian_filter'] = createExportWrapper('gaussian_filter', 5);
var _R_Init = Module['_R_Init'] = createExportWrapper('R_Init', 0);
var _R_NoiseInit = Module['_R_NoiseInit'] = createExportWrapper('R_NoiseInit', 0);
var _R_InitShaders = Module['_R_InitShaders'] = createExportWrapper('R_InitShaders', 0);
var _R_ModelInit = Module['_R_ModelInit'] = createExportWrapper('R_ModelInit', 0);
var _R_ShaderList_f = Module['_R_ShaderList_f'] = createExportWrapper('R_ShaderList_f', 0);
var _R_Modellist_f = Module['_R_Modellist_f'] = createExportWrapper('R_Modellist_f', 0);
var _R_ModelBounds = Module['_R_ModelBounds'] = createExportWrapper('R_ModelBounds', 3);
var _R_LerpTag = Module['_R_LerpTag'] = createExportWrapper('R_LerpTag', 6);
var _R_MarkFragments = Module['_R_MarkFragments'] = createExportWrapper('R_MarkFragments', 7);
var _RE_RegisterShader = Module['_RE_RegisterShader'] = createExportWrapper('RE_RegisterShader', 1);
var _RE_RegisterModel = Module['_RE_RegisterModel'] = createExportWrapper('RE_RegisterModel', 1);
var _RE_BeginRegistration = Module['_RE_BeginRegistration'] = createExportWrapper('RE_BeginRegistration', 1);
var _R_inPVS = Module['_R_inPVS'] = createExportWrapper('R_inPVS', 2);
var _RE_RenderScene = Module['_RE_RenderScene'] = createExportWrapper('RE_RenderScene', 1);
var _RE_AddLinearLightToScene = Module['_RE_AddLinearLightToScene'] = createExportWrapper('RE_AddLinearLightToScene', 6);
var _RE_AddAdditiveLightToScene = Module['_RE_AddAdditiveLightToScene'] = createExportWrapper('RE_AddAdditiveLightToScene', 5);
var _RE_AddLightToScene = Module['_RE_AddLightToScene'] = createExportWrapper('RE_AddLightToScene', 5);
var _R_LightForPoint = Module['_R_LightForPoint'] = createExportWrapper('R_LightForPoint', 4);
var _RE_AddPolyToScene = Module['_RE_AddPolyToScene'] = createExportWrapper('RE_AddPolyToScene', 4);
var _RE_AddRefEntityToScene = Module['_RE_AddRefEntityToScene'] = createExportWrapper('RE_AddRefEntityToScene', 2);
var _RE_AddPolyBufferToScene = Module['_RE_AddPolyBufferToScene'] = createExportWrapper('RE_AddPolyBufferToScene', 1);
var _VBO_Cleanup = Module['_VBO_Cleanup'] = createExportWrapper('VBO_Cleanup', 0);
var _R_DlightBmodel = Module['_R_DlightBmodel'] = createExportWrapper('R_DlightBmodel', 1);
var _R_LocalPointToWorld = Module['_R_LocalPointToWorld'] = createExportWrapper('R_LocalPointToWorld', 2);
var _R_CullPointAndRadius = Module['_R_CullPointAndRadius'] = createExportWrapper('R_CullPointAndRadius', 2);
var _R_CullDlight = Module['_R_CullDlight'] = createExportWrapper('R_CullDlight', 1);
var _R_WorldToLocal = Module['_R_WorldToLocal'] = createExportWrapper('R_WorldToLocal', 2);
var _R_AddLitSurf = Module['_R_AddLitSurf'] = createExportWrapper('R_AddLitSurf', 3);
var _R_RenderView = Module['_R_RenderView'] = createExportWrapper('R_RenderView', 1);
var _R_AddWorldSurfaces = Module['_R_AddWorldSurfaces'] = createExportWrapper('R_AddWorldSurfaces', 0);
var _R_AddPolygonSurfaces = Module['_R_AddPolygonSurfaces'] = createExportWrapper('R_AddPolygonSurfaces', 0);
var _R_AddPolygonBufferSurfaces = Module['_R_AddPolygonBufferSurfaces'] = createExportWrapper('R_AddPolygonBufferSurfaces', 0);
var _R_GetModelByHandle = Module['_R_GetModelByHandle'] = createExportWrapper('R_GetModelByHandle', 1);
var _R_AddIQMSurfaces = Module['_R_AddIQMSurfaces'] = createExportWrapper('R_AddIQMSurfaces', 1);
var _R_AddBrushModelSurfaces = Module['_R_AddBrushModelSurfaces'] = createExportWrapper('R_AddBrushModelSurfaces', 1);
var _R_AddMD3Surfaces = Module['_R_AddMD3Surfaces'] = createExportWrapper('R_AddMD3Surfaces', 1);
var _R_LightCullBounds = Module['_R_LightCullBounds'] = createExportWrapper('R_LightCullBounds', 3);
var _ClearSurfaces = Module['_ClearSurfaces'] = createExportWrapper('ClearSurfaces', 0);
var _R_AddSkinSurface = Module['_R_AddSkinSurface'] = createExportWrapper('R_AddSkinSurface', 2);
var _R_IQMLerpTag = Module['_R_IQMLerpTag'] = createExportWrapper('R_IQMLerpTag', 6);
var _R_LoadIQM = Module['_R_LoadIQM'] = createExportWrapper('R_LoadIQM', 4);
var _RB_IQMSurfaceAnim = Module['_RB_IQMSurfaceAnim'] = createExportWrapper('RB_IQMSurfaceAnim', 1);
var _R_LoadOBJ = Module['_R_LoadOBJ'] = createExportWrapper('R_LoadOBJ', 4);
var _R_AddOBJSurfaces = Module['_R_AddOBJSurfaces'] = createExportWrapper('R_AddOBJSurfaces', 1);
var _RB_OBJSurface = Module['_RB_OBJSurface'] = createExportWrapper('RB_OBJSurface', 1);
var _R_NoiseGet4f = Module['_R_NoiseGet4f'] = createExportWrapper('R_NoiseGet4f', 4);
var _R_ComputeColors = Module['_R_ComputeColors'] = createExportWrapper('R_ComputeColors', 1);
var _RB_CalcDiffuseColor = Module['_RB_CalcDiffuseColor'] = createExportWrapper('RB_CalcDiffuseColor', 1);
var _RB_CalcWaveColor = Module['_RB_CalcWaveColor'] = createExportWrapper('RB_CalcWaveColor', 2);
var _RB_CalcColorFromEntity = Module['_RB_CalcColorFromEntity'] = createExportWrapper('RB_CalcColorFromEntity', 1);
var _RB_CalcColorFromOneMinusEntity = Module['_RB_CalcColorFromOneMinusEntity'] = createExportWrapper('RB_CalcColorFromOneMinusEntity', 1);
var _RB_CalcAlphaFromOneMinusEntity = Module['_RB_CalcAlphaFromOneMinusEntity'] = createExportWrapper('RB_CalcAlphaFromOneMinusEntity', 1);
var _RB_CalcAlphaFromEntity = Module['_RB_CalcAlphaFromEntity'] = createExportWrapper('RB_CalcAlphaFromEntity', 1);
var _RB_CalcSpecularAlpha = Module['_RB_CalcSpecularAlpha'] = createExportWrapper('RB_CalcSpecularAlpha', 1);
var _RB_CalcWaveAlpha = Module['_RB_CalcWaveAlpha'] = createExportWrapper('RB_CalcWaveAlpha', 2);
var _RB_CalcModulateAlphasByFog = Module['_RB_CalcModulateAlphasByFog'] = createExportWrapper('RB_CalcModulateAlphasByFog', 1);
var _RB_CalcModulateRGBAsByFog = Module['_RB_CalcModulateRGBAsByFog'] = createExportWrapper('RB_CalcModulateRGBAsByFog', 1);
var _RB_CalcFogTexCoords = Module['_RB_CalcFogTexCoords'] = createExportWrapper('RB_CalcFogTexCoords', 1);
var _RB_CalcEnvironmentTexCoords = Module['_RB_CalcEnvironmentTexCoords'] = createExportWrapper('RB_CalcEnvironmentTexCoords', 1);
var _RB_CalcEnvironmentTexCoordsFP = Module['_RB_CalcEnvironmentTexCoordsFP'] = createExportWrapper('RB_CalcEnvironmentTexCoordsFP', 2);
var _RB_CalcTurbulentTexCoords = Module['_RB_CalcTurbulentTexCoords'] = createExportWrapper('RB_CalcTurbulentTexCoords', 3);
var _RB_CalcScrollTexCoords = Module['_RB_CalcScrollTexCoords'] = createExportWrapper('RB_CalcScrollTexCoords', 3);
var _RB_CalcScaleTexCoords = Module['_RB_CalcScaleTexCoords'] = createExportWrapper('RB_CalcScaleTexCoords', 3);
var _RB_CalcStretchTexCoords = Module['_RB_CalcStretchTexCoords'] = createExportWrapper('RB_CalcStretchTexCoords', 3);
var _RB_CalcTransformTexCoords = Module['_RB_CalcTransformTexCoords'] = createExportWrapper('RB_CalcTransformTexCoords', 3);
var _RB_CalcRotateTexCoords = Module['_RB_CalcRotateTexCoords'] = createExportWrapper('RB_CalcRotateTexCoords', 3);
var _RB_StageIteratorGeneric = Module['_RB_StageIteratorGeneric'] = createExportWrapper('RB_StageIteratorGeneric', 0);
var _RB_StageIteratorVBO = Module['_RB_StageIteratorVBO'] = createExportWrapper('RB_StageIteratorVBO', 0);
var _RB_ShadowTessEnd = Module['_RB_ShadowTessEnd'] = createExportWrapper('RB_ShadowTessEnd', 0);
var _VBO_Active = Module['_VBO_Active'] = createExportWrapper('VBO_Active', 0);
var _RB_ProjectionShadowDeform = Module['_RB_ProjectionShadowDeform'] = createExportWrapper('RB_ProjectionShadowDeform', 0);
var _RB_AddQuadStamp = Module['_RB_AddQuadStamp'] = createExportWrapper('RB_AddQuadStamp', 4);
var _RB_AddQuadStampExt = Module['_RB_AddQuadStampExt'] = createExportWrapper('RB_AddQuadStampExt', 8);
var _R_FindShaderByName = Module['_R_FindShaderByName'] = createExportWrapper('R_FindShaderByName', 1);
var _RE_RegisterShaderLightMap = Module['_RE_RegisterShaderLightMap'] = createExportWrapper('RE_RegisterShaderLightMap', 2);
var _RE_RegisterShaderFromImage = Module['_RE_RegisterShaderFromImage'] = createExportWrapper('RE_RegisterShaderFromImage', 4);
var _RB_StageIteratorSky = Module['_RB_StageIteratorSky'] = createExportWrapper('RB_StageIteratorSky', 0);
var _R_InitSkyTexCoords = Module['_R_InitSkyTexCoords'] = createExportWrapper('R_InitSkyTexCoords', 1);
var _RB_SurfaceGridEstimate = Module['_RB_SurfaceGridEstimate'] = createExportWrapper('RB_SurfaceGridEstimate', 3);
var _VBO_ClearQueue = Module['_VBO_ClearQueue'] = createExportWrapper('VBO_ClearQueue', 0);
var _VBO_QueueItem = Module['_VBO_QueueItem'] = createExportWrapper('VBO_QueueItem', 1);
var _VBO_PushData = Module['_VBO_PushData'] = createExportWrapper('VBO_PushData', 2);
var _BuildFP = Module['_BuildFP'] = createExportWrapper('BuildFP', 3);
var ___get_tp = Module['___get_tp'] = createExportWrapper('__get_tp', 0);
var ____errno_location = Module['____errno_location'] = createExportWrapper('___errno_location', 0);
var ___syscall3 = Module['___syscall3'] = createExportWrapper('__syscall3', 4);
var ___syscall4 = Module['___syscall4'] = createExportWrapper('__syscall4', 5);
var _Sys_Pwd = Module['_Sys_Pwd'] = createExportWrapper('Sys_Pwd', 0);
var _Sys_PrintBinVersion = Module['_Sys_PrintBinVersion'] = createExportWrapper('Sys_PrintBinVersion', 1);
var _Sys_BinName = Module['_Sys_BinName'] = createExportWrapper('Sys_BinName', 1);
var _Sys_ParseArgs = Module['_Sys_ParseArgs'] = createExportWrapper('Sys_ParseArgs', 2);
var __start = Module['__start'] = createExportWrapper('_start', 2);
var _eglGetProcAddress = Module['_eglGetProcAddress'] = createExportWrapper('eglGetProcAddress', 1);
var _emscripten_sleep = Module['_emscripten_sleep'] = createExportWrapper('emscripten_sleep', 1);
var _GLimp_LogComment = Module['_GLimp_LogComment'] = createExportWrapper('GLimp_LogComment', 1);
var _WindowResize = Module['_WindowResize'] = createExportWrapper('WindowResize', 2);
var _sbrk = Module['_sbrk'] = createExportWrapper('sbrk', 1);
var ___libc_malloc = Module['___libc_malloc'] = createExportWrapper('__libc_malloc', 1);
var ___libc_free = Module['___libc_free'] = createExportWrapper('__libc_free', 1);
var ___libc_calloc = Module['___libc_calloc'] = createExportWrapper('__libc_calloc', 2);
var ___libc_realloc = Module['___libc_realloc'] = createExportWrapper('__libc_realloc', 2);
var _realloc_in_place = Module['_realloc_in_place'] = createExportWrapper('realloc_in_place', 2);
var _memalign = Module['_memalign'] = createExportWrapper('memalign', 2);
var _posix_memalign = Module['_posix_memalign'] = createExportWrapper('posix_memalign', 3);
var _valloc = Module['_valloc'] = createExportWrapper('valloc', 1);
var _pvalloc = Module['_pvalloc'] = createExportWrapper('pvalloc', 1);
var _mallinfo = Module['_mallinfo'] = createExportWrapper('mallinfo', 1);
var _mallopt = Module['_mallopt'] = createExportWrapper('mallopt', 2);
var _malloc_trim = Module['_malloc_trim'] = createExportWrapper('malloc_trim', 1);
var _malloc_usable_size = Module['_malloc_usable_size'] = createExportWrapper('malloc_usable_size', 1);
var _malloc_footprint = Module['_malloc_footprint'] = createExportWrapper('malloc_footprint', 0);
var _malloc_max_footprint = Module['_malloc_max_footprint'] = createExportWrapper('malloc_max_footprint', 0);
var _malloc_footprint_limit = Module['_malloc_footprint_limit'] = createExportWrapper('malloc_footprint_limit', 0);
var _malloc_set_footprint_limit = Module['_malloc_set_footprint_limit'] = createExportWrapper('malloc_set_footprint_limit', 1);
var _independent_calloc = Module['_independent_calloc'] = createExportWrapper('independent_calloc', 3);
var _independent_comalloc = Module['_independent_comalloc'] = createExportWrapper('independent_comalloc', 3);
var _bulk_free = Module['_bulk_free'] = createExportWrapper('bulk_free', 2);
var _emscripten_builtin_malloc = Module['_emscripten_builtin_malloc'] = createExportWrapper('emscripten_builtin_malloc', 1);
var _emscripten_builtin_free = Module['_emscripten_builtin_free'] = createExportWrapper('emscripten_builtin_free', 1);
var _emscripten_builtin_memalign = createExportWrapper('emscripten_builtin_memalign', 2);
var _emscripten_get_sbrk_ptr = Module['_emscripten_get_sbrk_ptr'] = createExportWrapper('emscripten_get_sbrk_ptr', 0);
var _brk = Module['_brk'] = createExportWrapper('brk', 1);
var _strerror = createExportWrapper('strerror', 1);
var __emscripten_tempret_set = createExportWrapper('_emscripten_tempret_set', 1);
var __emscripten_tempret_get = createExportWrapper('_emscripten_tempret_get', 0);
var _getTempRet0 = Module['_getTempRet0'] = createExportWrapper('getTempRet0', 0);
var _setTempRet0 = Module['_setTempRet0'] = createExportWrapper('setTempRet0', 1);
var _emscripten_stack_init = () => (_emscripten_stack_init = wasmExports['emscripten_stack_init'])();
var _emscripten_stack_set_limits = Module['_emscripten_stack_set_limits'] = (a0, a1) => (_emscripten_stack_set_limits = Module['_emscripten_stack_set_limits'] = wasmExports['emscripten_stack_set_limits'])(a0, a1);
var _emscripten_stack_get_free = () => (_emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'])();
var _emscripten_stack_get_base = () => (_emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'])();
var _emscripten_stack_get_end = () => (_emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'])();
var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports['_emscripten_stack_restore'])(a0);
var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'])(a0);
var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'])();
var dynCall_j = Module['dynCall_j'] = createExportWrapper('dynCall_j', 1);
var dynCall_iij = Module['dynCall_iij'] = createExportWrapper('dynCall_iij', 4);
var dynCall_iiji = Module['dynCall_iiji'] = createExportWrapper('dynCall_iiji', 5);
var dynCall_jiji = Module['dynCall_jiji'] = createExportWrapper('dynCall_jiji', 5);
var _cls = Module['_cls'] = 3620780;
var _cgvm = Module['_cgvm'] = 3620776;
var _re = Module['_re'] = 10454796;
var _cl = Module['_cl'] = 6774904;
var _cl_connectedToPureServer = Module['_cl_connectedToPureServer'] = 11838160;
var _clc = Module['_clc'] = 6579864;
var _cl_connectedToCheatServer = Module['_cl_connectedToCheatServer'] = 11838164;
var _botlib_export = Module['_botlib_export'] = 14463188;
var _fs_cgameSawAsync = Module['_fs_cgameSawAsync'] = 13235728;
var _sv_paused = Module['_sv_paused'] = 12371668;
var _com_sv_running = Module['_com_sv_running'] = 12371604;
var _com_timescale = Module['_com_timescale'] = 12371636;
var _com_timedemo = Module['_com_timedemo'] = 12371656;
var _cl_activeAction = Module['_cl_activeAction'] = 10455172;
var _cl_autoNudge = Module['_cl_autoNudge'] = 10455152;
var _cl_timeNudge = Module['_cl_timeNudge'] = 10455156;
var _cl_showTimeDelta = Module['_cl_showTimeDelta'] = 10455164;
var _uivm = Module['_uivm'] = 11842312;
var _clientCameras = Module['_clientCameras'] = 295984;
var _s_volume = Module['_s_volume'] = 14445056;
var _s_soundtime = Module['_s_soundtime'] = 13564472;
var _s_rawend = Module['_s_rawend'] = 14313360;
var _cl_inGameVideo = Module['_cl_inGameVideo'] = 10455304;
var _con_autoclear = Module['_con_autoclear'] = 3487392;
var _g_consoleField = Module['_g_consoleField'] = 3619716;
var _g_console_field_width = Module['_g_console_field_width'] = 3487396;
var _con = Module['_con'] = 3487400;
var _con_scale = Module['_con_scale'] = 3618564;
var _smallchar_width = Module['_smallchar_width'] = 3618568;
var _smallchar_height = Module['_smallchar_height'] = 3618572;
var _bigchar_width = Module['_bigchar_width'] = 3618576;
var _bigchar_height = Module['_bigchar_height'] = 3618580;
var _con_notifytime = Module['_con_notifytime'] = 3618584;
var _con_conspeed = Module['_con_conspeed'] = 3618588;
var _chat_team = Module['_chat_team'] = 3620768;
var _chat_playerNum = Module['_chat_playerNum'] = 3620772;
var _chatField = Module['_chatField'] = 3620240;
var _cl_noprint = Module['_cl_noprint'] = 10455140;
var _cl_conColor = Module['_cl_conColor'] = 10455300;
var _g_color_table = Module['_g_color_table'] = 175760;
var _cl_conXOffset = Module['_cl_conXOffset'] = 10455296;
var _com_cl_running = Module['_com_cl_running'] = 12364100;
var _cl_paused = Module['_cl_paused'] = 12371660;
var _com_frameTime = Module['_com_frameTime'] = 12371688;
var _cl_lanForcePackets = Module['_cl_lanForcePackets'] = 10455316;
var _cl_debugMove = Module['_cl_debugMove'] = 10633024;
var _anykeydown = Module['_anykeydown'] = 13425032;
var _key_overstrikeMode = Module['_key_overstrikeMode'] = 13420592;
var _keys = Module['_keys'] = 13420608;
var _first_click = Module['_first_click'] = 295672;
var _gw_active = Module['_gw_active'] = 274832;
var _s_soundStarted = Module['_s_soundStarted'] = 13564464;
var _s_soundMuted = Module['_s_soundMuted'] = 13564468;
var _com_errorEntered = Module['_com_errorEntered'] = 12355832;
var _com_protocol = Module['_com_protocol'] = 12371616;
var _serverShift = Module['_serverShift'] = 6774900;
var _download = Module['_download'] = 10454792;
var _com_dedicated = Module['_com_dedicated'] = 12355864;
var _cvar_modifiedFlags = Module['_cvar_modifiedFlags'] = 12903240;
var _cl_oldGame = Module['_cl_oldGame'] = 10454976;
var _cl_oldGameSet = Module['_cl_oldGameSet'] = 10454964;
var _cl_cdkey = Module['_cl_cdkey'] = 275248;
var _cl_allowDownload = Module['_cl_allowDownload'] = 10455112;
var _com_developer = Module['_com_developer'] = 12355876;
var _com_protocolCompat = Module['_com_protocolCompat'] = 12371620;
var _rcon_address = Module['_rcon_address'] = 10633100;
var _cl_forceavidemo = Module['_cl_forceavidemo'] = 10455116;
var _cl_aviFrameRate = Module['_cl_aviFrameRate'] = 10455120;
var _cl_autoRecordDemo = Module['_cl_autoRecordDemo'] = 10455124;
var _cl_timegraph = Module['_cl_timegraph'] = 11842276;
var _cl_timeout = Module['_cl_timeout'] = 10455148;
var _r_customPixelAspect = Module['_r_customPixelAspect'] = 10455128;
var _r_customwidth = Module['_r_customwidth'] = 10455132;
var _r_customheight = Module['_r_customheight'] = 10455136;
var _cl_motd = Module['_cl_motd'] = 10455144;
var _cl_shownet = Module['_cl_shownet'] = 10455160;
var _rcon_client_password = Module['_rcon_client_password'] = 10455168;
var _cl_drawRecording = Module['_cl_drawRecording'] = 10455176;
var _cl_aviMotionJpeg = Module['_cl_aviMotionJpeg'] = 10455180;
var _cl_aviPipeFormat = Module['_cl_aviPipeFormat'] = 10455184;
var _rconAddress = Module['_rconAddress'] = 10455188;
var _cl_master = Module['_cl_master'] = 10455200;
var _cl_serverStatusResendTime = Module['_cl_serverStatusResendTime'] = 10455308;
var _cl_motdString = Module['_cl_motdString'] = 10455312;
var _cl_guidServerUniq = Module['_cl_guidServerUniq'] = 10455320;
var _cl_returnURL = Module['_cl_returnURL'] = 10455324;
var _cl_dlURL = Module['_cl_dlURL'] = 10455328;
var _cl_dlDirectory = Module['_cl_dlDirectory'] = 10455332;
var _cl_reconnectArgs = Module['_cl_reconnectArgs'] = 10455336;
var _cl_drawFPS = Module['_cl_drawFPS'] = 10455340;
var _cl_lagometer = Module['_cl_lagometer'] = 10455344;
var _cl_nopredict = Module['_cl_nopredict'] = 10455348;
var _demo_protocols = Module['_demo_protocols'] = 170096;
var _r_allowSoftwareGL = Module['_r_allowSoftwareGL'] = 10633044;
var _r_swapInterval = Module['_r_swapInterval'] = 10633048;
var _r_glDriver = Module['_r_glDriver'] = 10633052;
var _r_displayRefresh = Module['_r_displayRefresh'] = 10633056;
var _vid_xpos = Module['_vid_xpos'] = 10633032;
var _vid_ypos = Module['_vid_ypos'] = 10633036;
var _r_noborder = Module['_r_noborder'] = 10633040;
var _r_mode = Module['_r_mode'] = 10633064;
var _r_modeFullscreen = Module['_r_modeFullscreen'] = 10633068;
var _r_fullscreen = Module['_r_fullscreen'] = 10633060;
var _r_colorbits = Module['_r_colorbits'] = 10633072;
var _cl_stencilbits = Module['_cl_stencilbits'] = 10633076;
var _cl_depthbits = Module['_cl_depthbits'] = 10633080;
var _cl_drawBuffer = Module['_cl_drawBuffer'] = 10633084;
var _cl_birdsEye = Module['_cl_birdsEye'] = 10633092;
var _sv_birdsEye = Module['_sv_birdsEye'] = 10633096;
var _gw_minimized = Module['_gw_minimized'] = 12355840;
var _cl_mapAutoDownload = Module['_cl_mapAutoDownload'] = 10633028;
var _cl_snaps = Module['_cl_snaps'] = 10633088;
var _com_speeds = Module['_com_speeds'] = 12371600;
var _time_backend = Module['_time_backend'] = 12371708;
var _time_frontend = Module['_time_frontend'] = 12371704;
var _fs_reordered = Module['_fs_reordered'] = 13381168;
var _fs_uiSawAsync = Module['_fs_uiSawAsync'] = 13235732;
var _dma = Module['_dma'] = 13564480;
var _cm_noAreas = Module['_cm_noAreas'] = 11888788;
var _cm_noCurves = Module['_cm_noCurves'] = 11888792;
var _cm_playerCurveClip = Module['_cm_playerCurveClip'] = 11888796;
var _cm_saveEnts = Module['_cm_saveEnts'] = 11888800;
var _cm_entityString = Module['_cm_entityString'] = 11888804;
var _cm_scale = Module['_cm_scale'] = 11888808;
var _cm = Module['_cm'] = 11888812;
var _c_pointcontents = Module['_c_pointcontents'] = 11889128;
var _c_traces = Module['_c_traces'] = 11889132;
var _c_brush_traces = Module['_c_brush_traces'] = 11889136;
var _c_patch_traces = Module['_c_patch_traces'] = 11889140;
var _vec3_origin = Module['_vec3_origin'] = 175740;
var _insCmdI = Module['_insCmdI'] = 12260536;
var _execCmdI = Module['_execCmdI'] = 12260540;
var _com_journalDataFile = Module['_com_journalDataFile'] = 12355828;
var _cl_title = Module['_cl_title'] = 274848;
var _rconPassword2 = Module['_rconPassword2'] = 12368208;
var _locase = Module['_locase'] = 177296;
var _com_viewlog = Module['_com_viewlog'] = 12371648;
var _com_maxfps = Module['_com_maxfps'] = 12371624;
var _time_game = Module['_time_game'] = 12371700;
var _com_journal = Module['_com_journal'] = 12371612;
var _com_fullyInitialized = Module['_com_fullyInitialized'] = 12355836;
var _vm_rtChecks = Module['_vm_rtChecks'] = 16699700;
var _com_maxfpsUnfocused = Module['_com_maxfpsUnfocused'] = 12371628;
var _com_yieldCPU = Module['_com_yieldCPU'] = 12371632;
var _com_cameraMode = Module['_com_cameraMode'] = 12371652;
var _cl_packetdelay = Module['_cl_packetdelay'] = 12371664;
var _sv_packetdelay = Module['_sv_packetdelay'] = 12371672;
var _com_skipIdLogo = Module['_com_skipIdLogo'] = 12371680;
var _com_version = Module['_com_version'] = 12371684;
var _CPU_Flags = Module['_CPU_Flags'] = 12355824;
var _sprintfLocation = Module['_sprintfLocation'] = 275104;
var _mallocLocation = Module['_mallocLocation'] = 275108;
var _FS_CreatePathLocation = Module['_FS_CreatePathLocation'] = 275112;
var _freeLocation = Module['_freeLocation'] = 275116;
var _R_FindPaletteLocation = Module['_R_FindPaletteLocation'] = 275120;
var _Key_ClearStatesLocation = Module['_Key_ClearStatesLocation'] = 275124;
var _Key_GetCatcherLocation = Module['_Key_GetCatcherLocation'] = 275128;
var _Key_SetCatcherLocation = Module['_Key_SetCatcherLocation'] = 275132;
var _CL_PacketEventLocation = Module['_CL_PacketEventLocation'] = 275136;
var _S_SoundInfoLocation = Module['_S_SoundInfoLocation'] = 275140;
var _Cbuf_ExecuteTextLocation = Module['_Cbuf_ExecuteTextLocation'] = 275144;
var _Cbuf_AddTextLocation = Module['_Cbuf_AddTextLocation'] = 275148;
var _Z_FreeLocation = Module['_Z_FreeLocation'] = 275152;
var _CL_NextDownloadLocation = Module['_CL_NextDownloadLocation'] = 275156;
var _Z_MallocLocation = Module['_Z_MallocLocation'] = 275160;
var _Sys_QueEventLocation = Module['_Sys_QueEventLocation'] = 275164;
var _MSG_InitLocation = Module['_MSG_InitLocation'] = 275168;
var _Com_RunAndTimeServerPacketLocation = Module['_Com_RunAndTimeServerPacketLocation'] = 275172;
var _Com_FrameLocation = Module['_Com_FrameLocation'] = 275176;
var _Cvar_VariableValueLocation = Module['_Cvar_VariableValueLocation'] = 275180;
var _Cvar_VariableIntegerValueLocation = Module['_Cvar_VariableIntegerValueLocation'] = 275184;
var _Cvar_VariableStringLocation = Module['_Cvar_VariableStringLocation'] = 275188;
var _Cvar_GetLocation = Module['_Cvar_GetLocation'] = 275192;
var _Cvar_SetLocation = Module['_Cvar_SetLocation'] = 275196;
var _Cvar_SetValueLocation = Module['_Cvar_SetValueLocation'] = 275200;
var _Cvar_SetIntegerValueLocation = Module['_Cvar_SetIntegerValueLocation'] = 275204;
var _Cvar_CheckRangeLocation = Module['_Cvar_CheckRangeLocation'] = 275208;
var _FS_ReadFileLocation = Module['_FS_ReadFileLocation'] = 275212;
var _FS_FreeFileLocation = Module['_FS_FreeFileLocation'] = 275216;
var _FS_CopyStringLocation = Module['_FS_CopyStringLocation'] = 275220;
var _FS_GetCurrentGameDirLocation = Module['_FS_GetCurrentGameDirLocation'] = 275224;
var _Key_KeynumToStringLocation = Module['_Key_KeynumToStringLocation'] = 275228;
var _VM_CallLocation = Module['_VM_CallLocation'] = 275232;
var _CL_R_FinishImage3Location = Module['_CL_R_FinishImage3Location'] = 275236;
var _FS_RecordFileLocation = Module['_FS_RecordFileLocation'] = 275240;
var _fs_lastPakIndex = Module['_fs_lastPakIndex'] = 13397584;
var _numAsyncFiles = Module['_numAsyncFiles'] = 13235740;
var _asyncFiles = Module['_asyncFiles'] = 13235744;
var _fs_gameSawAsync = Module['_fs_gameSawAsync'] = 13235736;
var _showpackets = Module['_showpackets'] = 13435552;
var _showdrop = Module['_showdrop'] = 13435556;
var _qport = Module['_qport'] = 13435560;
var _HuffmanDecoderTable = Module['_HuffmanDecoderTable'] = 171008;
var _camera = Module['_camera'] = 13529920;
var _splineList = Module['_splineList'] = 13525596;
var _g_splineList = Module['_g_splineList'] = 285288;
var _eventStr = Module['_eventStr'] = 285296;
var _com_maxSplines = Module['_com_maxSplines'] = 13564416;
var _s_khz = Module['_s_khz'] = 13564444;
var _s_show = Module['_s_show'] = 13564456;
var _s_testsound = Module['_s_testsound'] = 13564460;
var _s_paintedtime = Module['_s_paintedtime'] = 13564476;
var _dma_buffer2 = Module['_dma_buffer2'] = 13630064;
var _s_knownSfx = Module['_s_knownSfx'] = 13641616;
var _s_channels = Module['_s_channels'] = 13630080;
var _loop_channels = Module['_loop_channels'] = 13635840;
var _numLoopChannels = Module['_numLoopChannels'] = 13641600;
var _s_rawsamples = Module['_s_rawsamples'] = 14313376;
var _s_musicVolume = Module['_s_musicVolume'] = 14445060;
var _s_doppler = Module['_s_doppler'] = 14445064;
var _s_muteWhenUnfocused = Module['_s_muteWhenUnfocused'] = 14445068;
var _s_muteWhenMinimized = Module['_s_muteWhenMinimized'] = 14445072;
var _sv = Module['_sv'] = 15515276;
var _svs = Module['_svs'] = 14463196;
var _sv_fps = Module['_sv_fps'] = 15827668;
var _bot_enable = Module['_bot_enable'] = 14445096;
var _gvm = Module['_gvm'] = 14463192;
var _sv_bspMiniSize = Module['_sv_bspMiniSize'] = 14445104;
var _sv_bspMiniGrid = Module['_sv_bspMiniGrid'] = 14445124;
var _sv_mapname = Module['_sv_mapname'] = 15827848;
var _sv_maxclients = Module['_sv_maxclients'] = 15827716;
var _sv_gametype = Module['_sv_gametype'] = 15827864;
var _sv_pure = Module['_sv_pure'] = 15827868;
var _sv_clientTLD = Module['_sv_clientTLD'] = 15827724;
var _sv_maxclientsPerIP = Module['_sv_maxclientsPerIP'] = 15827720;
var _sv_reconnectlimit = Module['_sv_reconnectlimit'] = 15827840;
var _sv_privatePassword = Module['_sv_privatePassword'] = 15827708;
var _sv_privateClients = Module['_sv_privateClients'] = 15827728;
var _sv_lanForceRate = Module['_sv_lanForceRate'] = 15827876;
var _sv_maxRate = Module['_sv_maxRate'] = 15827672;
var _sv_minRate = Module['_sv_minRate'] = 15827676;
var _sv_referencedPakNames = Module['_sv_referencedPakNames'] = 15827856;
var _sv_allowDownload = Module['_sv_allowDownload'] = 15827712;
var _sv_floodProtect = Module['_sv_floodProtect'] = 15827872;
var _sv_filter = Module['_sv_filter'] = 15827880;
var _com_tokentype = Module['_com_tokentype'] = 16581104;
var _sv_levelTimeReset = Module['_sv_levelTimeReset'] = 15827684;
var _sv_killserver = Module['_sv_killserver'] = 15827680;
var _sv_hostname = Module['_sv_hostname'] = 15827732;
var _sv_dlRate = Module['_sv_dlRate'] = 15827692;
var _sv_serverid = Module['_sv_serverid'] = 15827860;
var _sv_rconPassword = Module['_sv_rconPassword'] = 15827704;
var _sv_timeout = Module['_sv_timeout'] = 15827696;
var _sv_zombietime = Module['_sv_zombietime'] = 15827700;
var _sv_master = Module['_sv_master'] = 15827744;
var _sv_padPackets = Module['_sv_padPackets'] = 15827844;
var _sv_mapChecksum = Module['_sv_mapChecksum'] = 15827852;
var _bytedirs = Module['_bytedirs'] = 287680;
var _axisDefault = Module['_axisDefault'] = 287456;
var _colorBlack = Module['_colorBlack'] = 287504;
var _colorRed = Module['_colorRed'] = 287520;
var _colorGreen = Module['_colorGreen'] = 287536;
var _colorBlue = Module['_colorBlue'] = 287552;
var _colorYellow = Module['_colorYellow'] = 287568;
var _colorMagenta = Module['_colorMagenta'] = 287584;
var _colorCyan = Module['_colorCyan'] = 287600;
var _colorWhite = Module['_colorWhite'] = 287616;
var _colorLtGrey = Module['_colorLtGrey'] = 287632;
var _colorMdGrey = Module['_colorMdGrey'] = 287648;
var _colorDkGrey = Module['_colorDkGrey'] = 287664;
var _ops = Module['_ops'] = 289648;
var _opname = Module['_opname'] = 290608;
var _botimport = Module['_botimport'] = 16753496;
var _aasworld = Module['_aasworld'] = 16749072;
var _aassettings = Module['_aassettings'] = 16749684;
var _botDeveloper = Module['_botDeveloper'] = 16754140;
var _saveroutingcache = Module['_saveroutingcache'] = 16749680;
var _calcgrapplereach = Module['_calcgrapplereach'] = 16749860;
var _numareacacheupdates = Module['_numareacacheupdates'] = 16749932;
var _numportalcacheupdates = Module['_numportalcacheupdates'] = 16749936;
var _routingcachesize = Module['_routingcachesize'] = 16749940;
var _max_routingcachesize = Module['_max_routingcachesize'] = 16749944;
var _botcharacters = Module['_botcharacters'] = 16749968;
var _botlibglobals = Module['_botlibglobals'] = 16754124;
var _be_botlib_export = Module['_be_botlib_export'] = 16753588;
var _botlibsetup = Module['_botlibsetup'] = 16753492;
var _libvarlist = Module['_libvarlist'] = 16754144;
var _directives = Module['_directives'] = 293024;
var _dollardirectives = Module['_dollardirectives'] = 293184;
var _sourceFiles = Module['_sourceFiles'] = 16755184;
var __mapping_P = Module['__mapping_P'] = 294076;
var __floor_P = Module['__floor_P'] = 294056;
var __residue_P = Module['__residue_P'] = 294064;
var _floor0_exportbundle = Module['_floor0_exportbundle'] = 293980;
var _floor1_exportbundle = Module['_floor1_exportbundle'] = 294008;
var _mapping0_exportbundle = Module['_mapping0_exportbundle'] = 294036;
var _residue0_exportbundle = Module['_residue0_exportbundle'] = 294080;
var _residue1_exportbundle = Module['_residue1_exportbundle'] = 294112;
var _residue2_exportbundle = Module['_residue2_exportbundle'] = 294144;
var _errno = Module['_errno'] = 21377924;
var _tr = Module['_tr'] = 16970544;
var _ri = Module['_ri'] = 17161664;
var _r_shadows = Module['_r_shadows'] = 16937288;
var _tess = Module['_tess'] = 18246480;
var _backEnd = Module['_backEnd'] = 16756800;
var _qglDisable = Module['_qglDisable'] = 16937512;
var _qglEnable = Module['_qglEnable'] = 16937532;
var _qglBindProgramARB = Module['_qglBindProgramARB'] = 16937668;
var _fboEnabled = Module['_fboEnabled'] = 16755584;
var _glConfig = Module['_glConfig'] = 16925636;
var _r_gamma = Module['_r_gamma'] = 16937356;
var _r_intensity = Module['_r_intensity'] = 16937360;
var _qglProgramLocalParameter4fARB = Module['_qglProgramLocalParameter4fARB'] = 16937672;
var _qglProgramLocalParameter4fvARB = Module['_qglProgramLocalParameter4fvARB'] = 16937676;
var _qglPolygonOffset = Module['_qglPolygonOffset'] = 16937580;
var _r_offsetUnits = Module['_r_offsetUnits'] = 16937352;
var _r_offsetFactor = Module['_r_offsetFactor'] = 16937348;
var _qglTexCoordPointer = Module['_qglTexCoordPointer'] = 16937608;
var _qglNormalPointer = Module['_qglNormalPointer'] = 16937572;
var _qglVertexPointer = Module['_qglVertexPointer'] = 16937628;
var _qglLockArraysEXT = Module['_qglLockArraysEXT'] = 16937648;
var _gl_version = Module['_gl_version'] = 16936980;
var _qglUnlockArraysEXT = Module['_qglUnlockArraysEXT'] = 16937652;
var _qglProgramStringARB = Module['_qglProgramStringARB'] = 16937664;
var _qglGetIntegerv = Module['_qglGetIntegerv'] = 16925340;
var _qglGetError = Module['_qglGetError'] = 16925328;
var _qglGetString = Module['_qglGetString'] = 16937552;
var _qglDeleteProgramsARB = Module['_qglDeleteProgramsARB'] = 16937660;
var _qglGenProgramsARB = Module['_qglGenProgramsARB'] = 16937656;
var _fogInVPCode = Module['_fogInVPCode'] = 294228;
var _fogOutVPCode = Module['_fogOutVPCode'] = 294224;
var _r_bloom_filter_size = Module['_r_bloom_filter_size'] = 16937164;
var _fboBloomFilterSize = Module['_fboBloomFilterSize'] = 16755704;
var _r_bloom_blend_base = Module['_r_bloom_blend_base'] = 16937156;
var _fboBloomBlendBase = Module['_fboBloomBlendBase'] = 16755708;
var _r_bloom_passes = Module['_r_bloom_passes'] = 16937152;
var _r_dlightSpecColor = Module['_r_dlightSpecColor'] = 16937108;
var _r_dlightSpecPower = Module['_r_dlightSpecPower'] = 16937104;
var _r_greyscale = Module['_r_greyscale'] = 16937060;
var _r_bloom_threshold_mode = Module['_r_bloom_threshold_mode'] = 16937144;
var _r_bloom_modulate = Module['_r_bloom_modulate'] = 16937148;
var _qglBindRenderbuffer = Module['_qglBindRenderbuffer'] = 16937696;
var _qglDeleteRenderbuffers = Module['_qglDeleteRenderbuffers'] = 16937704;
var _qglFramebufferTexture2D = Module['_qglFramebufferTexture2D'] = 16937736;
var _qglDeleteTextures = Module['_qglDeleteTextures'] = 16937496;
var _qglDeleteFramebuffers = Module['_qglDeleteFramebuffers'] = 16937700;
var _qglBindFramebuffer = Module['_qglBindFramebuffer'] = 16937724;
var _blitMSfbo = Module['_blitMSfbo'] = 16755596;
var _fboReadIndex = Module['_fboReadIndex'] = 16755592;
var _qglBlitFramebuffer = Module['_qglBlitFramebuffer'] = 16937748;
var _qglViewport = Module['_qglViewport'] = 16937632;
var _qglScissor = Module['_qglScissor'] = 16937592;
var _qglMatrixMode = Module['_qglMatrixMode'] = 16937568;
var _qglLoadMatrixf = Module['_qglLoadMatrixf'] = 16937564;
var _qglLoadIdentity = Module['_qglLoadIdentity'] = 16937560;
var _qglColor4f = Module['_qglColor4f'] = 16937480;
var _fboBloomInited = Module['_fboBloomInited'] = 16755588;
var _r_bloom_threshold = Module['_r_bloom_threshold'] = 16937140;
var _fboBloomPasses = Module['_fboBloomPasses'] = 16756260;
var _r_bloom_reflection = Module['_r_bloom_reflection'] = 16937168;
var _windowAdjusted = Module['_windowAdjusted'] = 16756264;
var _r_bloom_intensity = Module['_r_bloom_intensity'] = 16937160;
var _qglDrawArrays = Module['_qglDrawArrays'] = 16937520;
var _qglColorPointer = Module['_qglColorPointer'] = 16937488;
var _qglDrawBuffer = Module['_qglDrawBuffer'] = 16937524;
var _blitClear = Module['_blitClear'] = 16756292;
var _qglClearColor = Module['_qglClearColor'] = 16937472;
var _qglClear = Module['_qglClear'] = 16937468;
var _blitY0 = Module['_blitY0'] = 16756268;
var _blitY1 = Module['_blitY1'] = 16756280;
var _blitX0 = Module['_blitX0'] = 16756272;
var _blitX1 = Module['_blitX1'] = 16756276;
var _blitFilter = Module['_blitFilter'] = 16756284;
var _r_bloom = Module['_r_bloom'] = 16937136;
var _qglActiveTextureARB = Module['_qglActiveTextureARB'] = 16937640;
var _r_anaglyphMode = Module['_r_anaglyphMode'] = 16937056;
var _qglColorMask = Module['_qglColorMask'] = 16937484;
var _superSampled = Module['_superSampled'] = 16756288;
var _gls = Module['_gls'] = 16936988;
var _qglGenFramebuffers = Module['_qglGenFramebuffers'] = 16937728;
var _r_fbo = Module['_r_fbo'] = 16937128;
var _r_renderScale = Module['_r_renderScale'] = 16937180;
var _r_ext_supersample = Module['_r_ext_supersample'] = 16937272;
var _r_hdr = Module['_r_hdr'] = 16937132;
var _fboInternalFormat = Module['_fboInternalFormat'] = 16756296;
var _r_flares = Module['_r_flares'] = 16937292;
var _fboTextureType = Module['_fboTextureType'] = 16756304;
var _fboTextureFormat = Module['_fboTextureFormat'] = 16756300;
var _r_ext_multisample = Module['_r_ext_multisample'] = 16937268;
var _qglRenderbufferStorageMultisample = Module['_qglRenderbufferStorageMultisample'] = 16937752;
var _qglGenRenderbuffers = Module['_qglGenRenderbuffers'] = 16937708;
var _qglFramebufferRenderbuffer = Module['_qglFramebufferRenderbuffer'] = 16937740;
var _qglCheckFramebufferStatus = Module['_qglCheckFramebufferStatus'] = 16937732;
var _qglGenTextures = Module['_qglGenTextures'] = 16937544;
var _qglTexParameteri = Module['_qglTexParameteri'] = 16937620;
var _gl_clamp_mode = Module['_gl_clamp_mode'] = 16936984;
var _qglTexImage2D = Module['_qglTexImage2D'] = 16937616;
var _qglGetInternalformativ = Module['_qglGetInternalformativ'] = 16937756;
var _r_paletteMode = Module['_r_paletteMode'] = 16937448;
var _shouldUseAlternate = Module['_shouldUseAlternate'] = 16756720;
var _r_nobind = Module['_r_nobind'] = 16937296;
var _glState = Module['_glState'] = 16925352;
var _qglBindTexture = Module['_qglBindTexture'] = 16937460;
var _qglCullFace = Module['_qglCullFace'] = 16937492;
var _qglTexEnvi = Module['_qglTexEnvi'] = 16937612;
var _qglDepthFunc = Module['_qglDepthFunc'] = 16937500;
var _qglBlendFunc = Module['_qglBlendFunc'] = 16937464;
var _qglDepthMask = Module['_qglDepthMask'] = 16937504;
var _qglPolygonMode = Module['_qglPolygonMode'] = 16937576;
var _qglAlphaFunc = Module['_qglAlphaFunc'] = 16937456;
var _qglDisableClientState = Module['_qglDisableClientState'] = 16937516;
var _qglEnableClientState = Module['_qglEnableClientState'] = 16937536;
var _qglClientActiveTextureARB = Module['_qglClientActiveTextureARB'] = 16937644;
var _r_speeds = Module['_r_speeds'] = 16937208;
var _qglTexSubImage2D = Module['_qglTexSubImage2D'] = 16937624;
var _qglFinish = Module['_qglFinish'] = 16937540;
var _r_showImages = Module['_r_showImages'] = 16937404;
var _r_drawSun = Module['_r_drawSun'] = 16937088;
var _r_clear = Module['_r_clear'] = 16937340;
var _r_finish = Module['_r_finish'] = 16937336;
var _qglDepthRange = Module['_qglDepthRange'] = 16937508;
var _r_dlightMode = Module['_r_dlightMode'] = 16937100;
var _r_znear = Module['_r_znear'] = 16937040;
var _rb_surfaceTable = Module['_rb_surfaceTable'] = 295616;
var _r_debugSurface = Module['_r_debugSurface'] = 16937396;
var _backEndData = Module['_backEndData'] = 16770544;
var _r_mapOverBrightBits = Module['_r_mapOverBrightBits'] = 16937388;
var _r_mapGreyScale = Module['_r_mapGreyScale'] = 16937392;
var _r_vertexLight = Module['_r_vertexLight'] = 16937284;
var _r_scale = Module['_r_scale'] = 16771392;
var _r_autoTerrain = Module['_r_autoTerrain'] = 16937452;
var _r_fullbright = Module['_r_fullbright'] = 16937212;
var _r_singleShader = Module['_r_singleShader'] = 16937300;
var _r_skipBackEnd = Module['_r_skipBackEnd'] = 16937052;
var _r_drawBuffer = Module['_r_drawBuffer'] = 16937276;
var _r_fastsky = Module['_r_fastsky'] = 16937080;
var _r_textureMode = Module['_r_textureMode'] = 16937344;
var _r_subdivisions = Module['_r_subdivisions'] = 16937376;
var _r_flareStructs = Module['_r_flareStructs'] = 16771408;
var _r_activeFlares = Module['_r_activeFlares'] = 16790864;
var _r_inactiveFlares = Module['_r_inactiveFlares'] = 16790868;
var _qglPushMatrix = Module['_qglPushMatrix'] = 16937588;
var _qglPopMatrix = Module['_qglPopMatrix'] = 16937584;
var _qglReadPixels = Module['_qglReadPixels'] = 16925344;
var _r_flareFade = Module['_r_flareFade'] = 16937016;
var _r_flareSize = Module['_r_flareSize'] = 16937012;
var _r_flareCoeff = Module['_r_flareCoeff'] = 16937020;
var _gl_filter_max = Module['_gl_filter_max'] = 294252;
var _gl_filter_min = Module['_gl_filter_min'] = 294248;
var _r_roundImagesDown = Module['_r_roundImagesDown'] = 16937304;
var _r_nomip = Module['_r_nomip'] = 16937316;
var _r_picmip = Module['_r_picmip'] = 16937312;
var _r_colorMipLevels = Module['_r_colorMipLevels'] = 16937308;
var _textureFilterAnisotropic = Module['_textureFilterAnisotropic'] = 16936972;
var _maxAnisotropy = Module['_maxAnisotropy'] = 16936976;
var _r_berserk = Module['_r_berserk'] = 16937076;
var _r_rainbow = Module['_r_rainbow'] = 16937072;
var _r_edgy = Module['_r_edgy'] = 16937064;
var _r_invert = Module['_r_invert'] = 16937068;
var _r_overBrightBits = Module['_r_overBrightBits'] = 16937384;
var _r_texturebits = Module['_r_texturebits'] = 16937264;
var _r_simpleMipMaps = Module['_r_simpleMipMaps'] = 16937400;
var _r_defaultImage = Module['_r_defaultImage'] = 16937408;
var _stderr = Module['_stderr'] = 269872;
var _r_ignoreGLErrors = Module['_r_ignoreGLErrors'] = 16925332;
var _r_screenshotJpegQuality = Module['_r_screenshotJpegQuality'] = 16925336;
var _r_aviMotionJpegQuality = Module['_r_aviMotionJpegQuality'] = 16925348;
var _r_maxpolys = Module['_r_maxpolys'] = 16925444;
var _max_polys = Module['_max_polys'] = 16925448;
var _r_maxpolyverts = Module['_r_maxpolyverts'] = 16925452;
var _max_polyverts = Module['_max_polyverts'] = 16925456;
var _r_maxpolybuffers = Module['_r_maxpolybuffers'] = 16925460;
var _max_polybuffers = Module['_max_polybuffers'] = 16925464;
var _r_neatsky = Module['_r_neatsky'] = 16937084;
var _r_detailTextures = Module['_r_detailTextures'] = 16937036;
var _r_mergeLightmaps = Module['_r_mergeLightmaps'] = 16937096;
var _r_vbo = Module['_r_vbo'] = 16937124;
var _r_lodCurveError = Module['_r_lodCurveError'] = 16937380;
var _r_lodbias = Module['_r_lodbias'] = 16937188;
var _r_zproj = Module['_r_zproj'] = 16937044;
var _r_stereoSeparation = Module['_r_stereoSeparation'] = 16937048;
var _r_dynamiclight = Module['_r_dynamiclight'] = 16937092;
var _r_dlightScale = Module['_r_dlightScale'] = 16937112;
var _r_dlightIntensity = Module['_r_dlightIntensity'] = 16937116;
var _r_dlightSaturation = Module['_r_dlightSaturation'] = 16937120;
var _r_dlightBacks = Module['_r_dlightBacks'] = 16937184;
var _r_facePlaneCull = Module['_r_facePlaneCull'] = 16937224;
var _r_railWidth = Module['_r_railWidth'] = 16937024;
var _r_railCoreWidth = Module['_r_railCoreWidth'] = 16937028;
var _r_railSegmentLength = Module['_r_railSegmentLength'] = 16937032;
var _r_ambientScale = Module['_r_ambientScale'] = 16937412;
var _r_directedScale = Module['_r_directedScale'] = 16937416;
var _r_debugLight = Module['_r_debugLight'] = 16937420;
var _r_debugSort = Module['_r_debugSort'] = 16937424;
var _r_printShaders = Module['_r_printShaders'] = 16937428;
var _r_saveFontData = Module['_r_saveFontData'] = 16937432;
var _r_nocurves = Module['_r_nocurves'] = 16937232;
var _r_drawworld = Module['_r_drawworld'] = 16937204;
var _r_lightmap = Module['_r_lightmap'] = 16937280;
var _r_portalOnly = Module['_r_portalOnly'] = 16937372;
var _r_lodscale = Module['_r_lodscale'] = 16937192;
var _r_norefresh = Module['_r_norefresh'] = 16937196;
var _r_drawentities = Module['_r_drawentities'] = 16937200;
var _r_nocull = Module['_r_nocull'] = 16937220;
var _r_novis = Module['_r_novis'] = 16937216;
var _r_showcluster = Module['_r_showcluster'] = 16937228;
var _r_showtris = Module['_r_showtris'] = 16937320;
var _r_showverts = Module['_r_showverts'] = 16937324;
var _r_showsky = Module['_r_showsky'] = 16937328;
var _r_shownormals = Module['_r_shownormals'] = 16937332;
var _r_lockpvs = Module['_r_lockpvs'] = 16937364;
var _r_noportals = Module['_r_noportals'] = 16937368;
var _r_marksOnTriangleMeshes = Module['_r_marksOnTriangleMeshes'] = 16937436;
var _r_allowExtensions = Module['_r_allowExtensions'] = 16937236;
var _r_ext_compressed_textures = Module['_r_ext_compressed_textures'] = 16937240;
var _r_ext_multitexture = Module['_r_ext_multitexture'] = 16937244;
var _r_ext_compiled_vertex_array = Module['_r_ext_compiled_vertex_array'] = 16937248;
var _r_ext_texture_env_add = Module['_r_ext_texture_env_add'] = 16937252;
var _r_ext_texture_filter_anisotropic = Module['_r_ext_texture_filter_anisotropic'] = 16937256;
var _r_ext_max_anisotropy = Module['_r_ext_max_anisotropy'] = 16937260;
var _r_renderWidth = Module['_r_renderWidth'] = 16937172;
var _r_renderHeight = Module['_r_renderHeight'] = 16937176;
var _nonPowerOfTwoTextures = Module['_nonPowerOfTwoTextures'] = 16936968;
var _qglMultiTexCoord2fARB = Module['_qglMultiTexCoord2fARB'] = 16937636;
var _qglBindBufferARB = Module['_qglBindBufferARB'] = 16937688;
var _qglClearDepth = Module['_qglClearDepth'] = 16937476;
var _qglShadeModel = Module['_qglShadeModel'] = 16937596;
var _r_fogDepth = Module['_r_fogDepth'] = 16937440;
var _r_fogColor = Module['_r_fogColor'] = 16937444;
var _qglDrawElements = Module['_qglDrawElements'] = 16937528;
var _qglGetBooleanv = Module['_qglGetBooleanv'] = 16937548;
var _qglLineWidth = Module['_qglLineWidth'] = 16937556;
var _qglStencilFunc = Module['_qglStencilFunc'] = 16937600;
var _qglStencilOp = Module['_qglStencilOp'] = 16937604;
var _qglGenBuffersARB = Module['_qglGenBuffersARB'] = 16937680;
var _qglDeleteBuffersARB = Module['_qglDeleteBuffersARB'] = 16937684;
var _qglBufferDataARB = Module['_qglBufferDataARB'] = 16937692;
var _qglRenderbufferStorage = Module['_qglRenderbufferStorage'] = 16937712;
var _qglGetRenderbufferParameteriv = Module['_qglGetRenderbufferParameteriv'] = 16937716;
var _qglIsFramebuffer = Module['_qglIsFramebuffer'] = 16937720;
var _qglGetFramebufferAttachmentParameteriv = Module['_qglGetFramebufferAttachmentParameteriv'] = 16937744;
var _r_numdlights = Module['_r_numdlights'] = 18246440;
var _parseSurfaces = Module['_parseSurfaces'] = 18210480;
var _skin = Module['_skin'] = 18244276;
var _makeSkin = Module['_makeSkin'] = 18210464;
var _lightOrigin = Module['_lightOrigin'] = 295040;
var _VBO_world_data = Module['_VBO_world_data'] = 21375056;
var _VBO_world_indexes = Module['_VBO_world_indexes'] = 21375060;
var __tp = Module['__tp'] = 21377920;
var _glw_config = Module['_glw_config'] = 21378960;
var _r_stereoEnabled = Module['_r_stereoEnabled'] = 21378964;
var _in_nograb = Module['_in_nograb'] = 21378968;
var _stdout = Module['_stdout'] = 271116;

// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

var missingLibrarySymbols = [
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'convertI32PairToI53',
  'convertU32PairToI53',
  'stackAlloc',
  'getTempRet0',
  'setTempRet0',
  'exitJS',
  'growMemory',
  'arraySum',
  'addDays',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'emscriptenLog',
  'readEmAsmArgs',
  'jstoi_q',
  'getExecutableName',
  'listenOnce',
  'autoResumeAudioContext',
  'dynCallLegacy',
  'getDynCaller',
  'dynCall',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'asmjsMangle',
  'HandleAllocator',
  'getNativeTypeSize',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'getCFunc',
  'ccall',
  'cwrap',
  'uleb128Encode',
  'sigToWasmTypes',
  'generateFuncType',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'reallyNegative',
  'unSign',
  'strLen',
  'reSign',
  'formatString',
  'intArrayToString',
  'AsciiToString',
  'stringToAscii',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToUTF8OnStack',
  'writeArrayToMemory',
  'registerKeyEventCallback',
  'maybeCStringToJsString',
  'findEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'battery',
  'registerBatteryEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'jsStackTrace',
  'getCallstack',
  'convertPCtoSourceLocation',
  'getEnvStrings',
  'checkWasiClock',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'createDyncallWrapper',
  'setImmediateWrapped',
  'clearImmediateWrapped',
  'polyfillSetImmediate',
  'getPromise',
  'makePromise',
  'idsToPromises',
  'makePromiseCallback',
  'ExceptionInfo',
  'findMatchingCatch',
  'Browser_asyncPrepareDataCounter',
  'getSocketFromFD',
  'getSocketAddress',
  'FS_unlink',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'emscriptenWebGLGetUniform',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'emulGlGenVertexArrays',
  'emulGlDeleteVertexArrays',
  'emulGlIsVertexArray',
  'emulGlBindVertexArray',
  'ALLOC_NORMAL',
  'ALLOC_STACK',
  'allocate',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'setErrNo',
  'demangle',
  'stackTrace',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

var unexportedSymbols = [
  'run',
  'addOnPreRun',
  'addOnInit',
  'addOnPreMain',
  'addOnExit',
  'addOnPostRun',
  'addRunDependency',
  'removeRunDependency',
  'out',
  'err',
  'callMain',
  'abort',
  'wasmMemory',
  'wasmExports',
  'writeStackCookie',
  'checkStackCookie',
  'writeI53ToI64',
  'readI53FromI64',
  'readI53FromU64',
  'convertI32PairToI53Checked',
  'stackSave',
  'stackRestore',
  'ptrToString',
  'zeroMemory',
  'getHeapMax',
  'abortOnCannotGrowMemory',
  'ENV',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'isLeapYear',
  'ydayFromDate',
  'ERRNO_CODES',
  'strError',
  'DNS',
  'Protocols',
  'Sockets',
  'initRandomFill',
  'randomFill',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'jstoi_s',
  'handleException',
  'keepRuntimeAlive',
  'callUserCallback',
  'maybeExit',
  'asyncLoad',
  'alignMemory',
  'mmapAlloc',
  'wasmTable',
  'noExitRuntime',
  'freeTableIndexes',
  'functionsInTableMap',
  'setValue',
  'getValue',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'stringToUTF8Array',
  'stringToUTF8',
  'lengthBytesUTF8',
  'intArrayFromString',
  'UTF16Decoder',
  'stringToNewUTF8',
  'JSEvents',
  'specialHTMLTargets',
  'findCanvasEventTarget',
  'currentFullscreenStrategy',
  'restoreOldWindowedStyle',
  'UNWIND_CACHE',
  'ExitStatus',
  'doReadv',
  'doWritev',
  'safeSetTimeout',
  'promiseMap',
  'uncaughtExceptionCount',
  'exceptionLast',
  'exceptionCaught',
  'Browser',
  'setMainLoop',
  'getPreloadedImageData__data',
  'wget',
  'SYSCALLS',
  'preloadPlugins',
  'FS_createPreloadedFile',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS_createPath',
  'FS_createDevice',
  'FS_readFile',
  'FS',
  'FS_createDataFile',
  'FS_createLazyFile',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'GL',
  'emscriptenWebGLGet',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'SDL',
  'SDL_gfx',
  'GLEmulation',
  'GLImmediate',
  'GLImmediateSetup',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'print',
  'printErr',
  'SYSC',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);



var calledRun;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
};

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

function run() {

  if (runDependencies > 0) {
    return;
  }

    stackCheckInit();

  preRun();

  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    return;
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;
    Module['calledRun'] = true;

    if (ABORT) return;

    initRuntime();

    Module['onRuntimeInitialized']?.();

    assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else
  {
    doRun();
  }
  checkStackCookie();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    ['stdout', 'stderr'].forEach(function(name) {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    });
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
  }
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

run();

// end include: postamble.js

