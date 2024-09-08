
const MATCH_ADDRESS = /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\:[0-9]+/gi
const MODNAME = 'demoq3';


function getQueryCommands() {
	// Wow, look at all the unfuckery I don't have to do with startup options because
	//   I'm not using emscripten anymore.
	let startup = [
		'quake3e_web',
		'+set', 'fs_basepath', '/base',
		'+set', 'fs_homepath', '/home',
		'+set', 'sv_pure', '0', // require for now, TODO: server side zips
		'+set', 'r_mode', '-2',
		'+set', 'net_socksServer', window.location.hostname || '',
		'+set', 'net_socksPort', window.location.port 
			|| (window.location.protocol == 'https:' ? '443' : '80'),
		'+set', 'sv_fps', '60',
		'+set', 'com_hunkMegs', '256',
		'+set', 'snaps', '60',
		// ISN'T HELPING STUPID NETWORK CRASH BUG
		//'+set', 'cl_nodelta', '1',
		'+set', 'r_fastsky', '0',
		// use high pic mip because images are displayed at the initial quality
		//   they are loaded by the browser, so even the highest picmip (worst quality)
		//   will have the same image but backend won't spend so much time on it.
		'+set', 'r_picmip', '16',
		//'+set', 's_initsound', '0',
		// it doesn't make sense to display a CD key in this client because it doesn't
		//   come with any game content
		'+set', 'ui_cdkeychecked', '1',
		// TURN OFF UDP DOWNLOADS, TURN ON REDIRECT
		'+set', 'cl_allowDownload', '5',
		// each one of the following has a special meaning
		//'+set', 'r_ext_multitexture', '0',
		// not implemented in javascript?
		'+set', 'r_ignorehwgamma', '1',
		// FBO shows up all black and textures don't bind, 
		//   but this should work in theory with WebGL
		'+set', 'r_ext_framebuffer_object', '0',
		'+set', 'r_ext_direct_state_access', '0',
		// Cause of FBO bug above?
		'+set', 'r_overBrightBits', '0',
		// this was replaced in QuakeJS, instead of replacing, just change cvar
		'+set', 'r_drawBuffer', 'GL_NONE',
		'+set', 'r_ext_texture_filter_anisotropic', '1',
		//'+set', 'r_finish', '1',
		// save time loading???
		'+set', 'r_vertexLight', '0',
		'+set', 'r_dynamiclight', '1',
		
		//'+set', 'r_ext_framebuffer_multisample', '0',
		// this prevents lightmap from being wrong when switching maps
		//   renderer doesn't restart between maps, but BSP loading updates
		//   textures with lightmap by default, so this keeps them separate
		'+set', 'r_mergeLightmaps', '0',
		//'+set', 'r_deluxeMapping', '0',
		//'+set', 'r_normalMapping', '0',
		//'+set', 'r_specularMapping', '0',
	]
	startup.push.apply(startup, window.preStart)
	// TODO: full screen by default? I suppose someone might 
	//   want to embed in the center of a page, edit CSS instead of JS?
	startup.push.apply(startup, [
		'+set', 'r_fullscreen', window.fullscreen ? '1' : '0',
		'+set', 'r_customHeight', '' + GL.canvas.clientHeight || 0,
		'+set', 'r_customWidth', '' + GL.canvas.clientWidth || 0,
		'+set', 'r_customAspect', '' + (GL.canvas.clientWidth / GL.canvas.clientHeight) || 0,
	])
	// meant to do this a lot sooner, with a download, we can just package
	//   whatever pk3/autoexec we want with the game.
	// but with web, we might be serving multiple sources, file:///index.html
	//   http://localhost/ and public quake.games/lvlworld. so i don't have
	//   to repackage for every source, check the domain we're on.
	let hostname = (/^(.*?)\./i).exec(window.location.hostname)
	let gamename = false
	if(hostname) {
		gamename = hostname[1]
	} else
	if(window.location.protocol == 'file:') {
		gamename = 'localhost'
	}

	if(gamename) {
		//startup.push.apply(startup, [
		//	'+set', 'fs_game', gamename,
		//])
		if(typeof FS.virtual[gamename] == 'undefined') {
			FS.virtual[gamename] = {
				timestamp: new Date(),
				mode: FS_DIR,
			}
		}
	}

	let search = /([^&=]+)/g
	let query  = window.location.search.substring(1)
	let match
	while (match = search.exec(query)) {
		let val = decodeURIComponent(match[1])
		val = val.split(' ')
		val[0] = (val[0][0] != '+' ? '+' : '') + val[0]
		startup.push.apply(startup, val)
	}


	// TODO: from URL or default.cfg?
	if(!startup.includes('fs_game')) {
		startup.push.apply(startup, [
			'+set', 'fs_basegame', MODNAME,
			'+set', 'fs_game', MODNAME,
		])
		if(typeof FS.virtual[MODNAME] == 'undefined') {
			FS.virtual[MODNAME] = {
				timestamp: new Date(),
				mode: FS_DIR,
			}
		}
	}

	// try to get connect address out of window
	let connectAddr = MATCH_ADDRESS.exec(window.location.pathname)
	if(connectAddr && !startup.includes('map')
		&& !startup.includes('spmap') && !startup.includes('devmap')
		&& !startup.includes('spdevmap')) {
		startup.push.apply(startup, [
			'+connect', connectAddr[0],
		])
	}

	return startup
}


function Sys_UnloadLibrary() {

}

function Sys_LoadLibrary() {
	
}

function Sys_LoadFunction() {
	
}


let messageTime = Date.now()
function Sys_Print(message) {
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

function Sys_Edit() {
	if(typeof window.ace == 'undefined') {
		return
	}

	if(Cmd_Argc() < 2) {
		Com_Printf(stringToAddress('Usage: edit [filename]\n'))
		return
	}

	let basegamedir = addressToString(FS_GetBaseGameDir())
	let gamedir = addressToString(FS_GetCurrentGameDir())
	let filename = Cmd_Argv(1)
	let filenameStr = addressToString(filename)
	if(filenameStr.startsWith('/')) {
		filenameStr = filenameStr.substr(1)
	}
	if(filenameStr.startsWith(gamedir)) {
		filenameStr = filenameStr.substr(gamedir.length)
	}
	if(filenameStr.startsWith(basegamedir)) {
		filenameStr = filenameStr.substr(basegamedir.length)
	}
	if(filenameStr.startsWith('/')) {
		filenameStr = filenameStr.substr(1)
	}
	if(!filenameStr || !filenameStr.length) {
		Com_Printf(stringToAddress('Usage: edit [filename]\n'))
		return
	}
	let openFilename = stringToAddress(filenameStr)

	let buf = stringToAddress('DEADBEEF') // pointer to pointer
	let length
	if ((length = FS_ReadFile(openFilename, buf)) > 0 && HEAPU32[buf >> 2] > 0) {
		let imageView = Array.from(HEAPU8.slice(HEAPU32[buf >> 2], HEAPU32[buf >> 2] + length))
		let utfEncoded = imageView.map(function (c) { return String.fromCharCode(c) }).join('')
		FS_FreeFile(HEAPU32[buf >> 2])
		ace.setValue(utfEncoded)
		// TODO: show relationships in Jarvis, 
		//   one module refers to another module
		//   these are the leaves of change that worry code reviewers
		ACE.filename = filenameStr
	} else {
		let vargs = stringToAddress('DEADBEEF') // pointer to pointer
		HEAPU32[vargs >> 2] = openFilename
		HEAPU32[(vargs >> 2) + 1] = 0
		Com_Printf(stringToAddress('File not found \'%s\'.\nUsage: edit [filename]\n'), vargs)
	}
}


function Sys_Return() {
	let returnUrl = addressToString(Cvar_VariableString(stringToAddress('cl_returnURL')))
	if(returnUrl) {
		window.location = returnUrl
	}
	// brian cullinan added this feature for Tig
	// client mode
	//let reconnect = addressToString(Cvar_VariableString(stringToAddress('cl_reconnectArgs')))
	//if(reconnect) {
	//	window.location = '/games/' + reconnect
	//}
	// single player mode
	//let mapname = addressToString(Cvar_VariableString(stringToAddress('mapname')))
	//if(mapname && mapname != 'nomap') {
	//	window.location = '/maps/' + mapname
	//}
}



function Sys_Exit(code) {
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

function Sys_Error(fmt, args) {
	let len = sprintf(STD.sharedMemory + STD.sharedCounter, fmt, args)
	if(len > 0)
		console.error('Sys_Error: ', addressToString(STD.sharedMemory + STD.sharedCounter))
	Sys_Exit( 1 )
	throw new Error(addressToString(fmt))
}

function Sys_SetStatus(status, replacementStr) {
	// TODO: something like  window.title = , then setTimeout( window.title = 'Quake3e' again)
	console.log(addressToString(status), replacementStr)
	
}

function CL_MenuModified(oldValue, newValue, cvar) {
	if(INPUT.modifyingCrumb) {
		return // called from ourselves below from a user action
	}
	if(window.location.orgin == null) {
		return
	}
	let newValueStr = addressToString(newValue)
	let newLocation = newValueStr.replace(/[^a-z0-9]/gi, '')
	if(!SYS.menuInited) { // keep track of first time the ui.qvm appears
		SYS.menuInited = true
		document.body.className += ' done-loading '
	}
	if(window.location.pathname.toString().includes(newLocation)) {
		// don't add to stack because it creates a lot of annoying back pushes
		return
	}
	history.pushState(
		{location: window.location.pathname}, 
		'Quake III Arena: ' + newValueStr, 
		newLocation)
}

function CL_ModifyMenu(event) {
	let oldLocation = window.location.pathname.toString().substring(1) || 'MAIN MENU'
	Cbuf_AddText( stringToAddress(`set ui_breadCrumb "${oldLocation}"\n`) );
	return true
}

function Sys_Frame() {
	if(SYS.inFrame) {
		return
	}
	if(INPUT.fpsModified != HEAPU32[(INPUT.fps >> 2) + 6]
		|| INPUT.fpsUnfocusedModified != HEAPU32[(INPUT.fpsUnfocused >> 2) + 6]) {
		Com_MaxFPSChanged()
	}
	function doFrame() {
		SYS.inFrame = true
		SYS.running = !SYS.running
		SYS.milliseconds = Date.now()
		try {
			if(typeof ACE != 'undefined') {
				renderFilelist()
			}
			Com_Frame(0 /* SYS.running */)
		} catch (e) {
			if(!SYS.exited && e.message == 'longjmp') {
				// let game Com_Frame handle it, it will restart UIVM
				console.error(e)
				stackRestore(STD.longjumps[e.stackPointer])
				Cbuf_AddText(stringToAddress('vid_restart\n'));
			} else
			if(!SYS.exited || e.message != 'unreachable') {
				Sys_Exit(1)
				throw e
			}
		}
		SYS.inFrame = false
	}
	if(HEAP32[gw_active >> 2]) {
		requestAnimationFrame(doFrame)
	} else {
		doFrame()
	}
}

function Sys_notify(ifile, path, fp) {
	openDatabase().then(function (db) {
		writeStore(ifile, path)
	})
	// TODO: ADD FILESYSTEM WATCHERS API INOTIFY 
	//   THAT READS A LIST GENERATED HERE
	if(typeof window.updateFilelist != 'undefined'
		&& !ACE.filestimer) {
		ACE.filestimer = setTimeout(updateFilelist, 100)
	}
}


function dynCall(ret, func, args) {
	return Module.table.get(func).apply(null, args)
}

function CreateAndCall(code, params, vargs) {
	let func
	if(typeof SYS.evaledFuncs[code] != 'undefined') {
		func = SYS.evaledFuncs[code]
	} else {
		let paramStr = addressToString(params)
		func = SYS.evaledFuncs[code] = eval('(function func'
			+ ++SYS.evaledCount + '($0, $1, $2, $3)'
			+ addressToString(code, 4096) + ')')
		func.paramCount = paramStr.split(',').filter(function (name) {
			return name.length > 0
		}).length
	}
	let args = HEAPU32.slice(vargs >> 2, (vargs >> 2) + func.paramCount)
	return func.apply(func, args)
}

function Sys_RandomBytes (string, len) {
	if(typeof crypto != 'undefined') {
		crypto.getRandomValues((new Int8Array(ENV.memory.buffer)).slice(string, string+(len / 4)))
	} else {
		for(let i = 0; i < (len / 4); i++) {
			ENV.memory.buffer[string] = Math.random() * 255
		}
	}
	return true;
}

function CL_Try_Fail_LoadJPG(fbuffer, filename, pic, width, height, cinfo) {
	try {
		CL_Try_LoadJPG(filename, cinfo, fbuffer, pic, width, height)
	} catch (e) {
		if(e.message == 'unreachable') {
			try {
				CL_Fail_LoadJPG(filename, fbuffer, cinfo)
			} catch (e) {}
		}
	}
}





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





const SYS = {
	evaledFuncs: {},
	evaledCount: 0,
	DebugBreak: function () { debugger },
	DebugTrace: function () { console.log(new Error()) },
	Sys_RandomBytes: Sys_RandomBytes,
	Sys_Exit: Sys_Exit,
	Sys_Edit: Sys_Edit,
	Sys_Return: Sys_Return,
	exit: Sys_Exit,
	Sys_Frame: Sys_Frame,
	Sys_Error: Sys_Error,
	Sys_UnloadLibrary: Sys_UnloadLibrary,
	Sys_LoadLibrary: Sys_LoadLibrary,
	Sys_LoadFunction: Sys_LoadFunction,
	popen: function popen() {},
	Sys_Print: Sys_Print,
	Sys_SetStatus: Sys_SetStatus,
	CL_MenuModified: CL_MenuModified,
	CreateAndCall: CreateAndCall,
	CL_Try_Fail_LoadJPG: CL_Try_Fail_LoadJPG,


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
  exit: _exit,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_read: _fd_read,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_write: _fd_write,

	emscripten_cancel_main_loop: function () {debugger},
	emscripten_force_exit: function () {debugger},
}




