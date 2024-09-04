## Build Instructions

### web assembly

Download and install Node.Js https://nodejs.org/en/download/package-manager/current

Download https://github.com/WebAssembly/wasi-sdk/releases

Also download https://github.com/WebAssembly/binaryen/releases

Put it in you /code/wasm/`os` folder where os is replaced with either linux, mingw, or darwin.

The paths should match /code/darwin/binaryen-version_111 and /code/wasm/darwin/wasi-sdk-22.00

These settings are found in the MAKEFILE under: 
```
WASISDK        := $(lastword $(wildcard code/wasm/$(COMPILE_PLATFORM)/wasi-sdk-*))
WASI-BUILTINS  := $(lastword $(wildcard $(WASISDK)/lib/clang/*))
WASM-OPT       ?= $(lastword $(wildcard code/wasm/$(COMPILE_PLATFORM)/binaryen-version_*/bin/wasm-opt))
```

Build per OS instructions.

Extract a directory of pk3s, flattened on top of each other, to /docs/`mod`/pak0.pk3dir

Run `npm run repack` command with image magick and ffmpeg and oggvorbis installed. This will convert assets to web compatible format and make some quality adjustments for download performance. This creates a files /docs/maps/`mod`/pak0.pk3 that will be served to clients. You may also add the original pk3 files to a folder named /docs/original/`mod`/pak0.pk3 and then use sv_dlURL and direct native clients to the original mod while hosting a server within a browser window game. Repack also generates a /docs/`mod`/pak0.pk3dir/scripts/palette.shader file that contains a list of all the images detected with their RGBA average values. The engine loads this to determine which files to attempt to load from the server to speed up image loading.

Run `npm start` to start the proxy/repack conjoined server.

Open a browser and direct it to http://localhost:8080/ to see the engine try to load. Use the debug console. Contact the original developer when it fails and report common issues to list here:

Error: ENOENT: no such file or directory, rename '...'

Set the MODNAME const in /code/wasm/repack.js to your mod name

Uncaught (in promise) ReferenceError: malloc is not defined

Make sure engine is exporting symbols with `-Wl,--export=malloc`

wasm-ld: error: symbol exported via --export not found: R_FindPalette

Make sure C++ files wrap public/export/visible functions in:
```
#ifdef __cplusplus
extern "C" {
#endif // __cplusplus
```

error: declaration of 'SCR_DebugGraph' has a different language linkage

Same as above but more annoying.

### windows/msvc

Install Visual Studio Community Edition 2017 or later and compile `quake3e` project from solution

`code/win32/msvc2017/quake3e.sln`

Copy resulting exe from `code/win32/msvc2017/output` directory

To compile with Vulkan backend - clean solution, right click on `quake3e` project, find `Project Dependencies` and select `renderervk` instead of `renderer`

---

### windows/mingw

All build dependencies (libraries, headers) are bundled-in

Build with either `make ARCH=x86` or `make ARCH=x86_64` commands depending on your target system, then copy resulting binaries from created `build` directory or use command:

`make install DESTDIR=<path_to_game_files>`

---

### generic/ubuntu linux/bsd

You may need to run the following commands to install packages (using fresh ubuntu-18.04 installation as example):

* sudo apt install make gcc libcurl4-openssl-dev mesa-common-dev
* sudo apt install libxxf86dga-dev libxrandr-dev libxxf86vm-dev libasound-dev
* sudo apt install libsdl2-dev

Build with: `make`

Copy the resulting binaries from created `build` directory or use command:

`make install DESTDIR=<path_to_game_files>`

---

### Arch Linux

The package `quake3e-git` can either be installed through your favourite AUR helper, or manually using these commands:

Download the snapshot from AUR:

`curl -O https://aur.archlinux.org/cgit/aur.git/snapshot/quake3e-git.tar.gz`

Extract the snapshot:

`tar xfz quake3e-git.tar.gz`

Enter the extracted directory:

`cd quake3e-git`

Build and install `quake3e-git`:

`makepkg -risc`

---

### raspberry pi os

Install the build dependencies:

* apt install libsdl2-dev libxxf86dga-dev libcurl4-openssl-dev

Build with: `make`

Copy the resulting binaries from created `build` directory or use command:

`make install DESTDIR=<path_to_game_files>`

---

### macos

* install the official SDL2 framework to /Library/Frameworks
* `brew install molten-vk` or install Vulkan SDK to use MoltenVK library

Build with: `make`

Copy the resulting binaries from created `build` directory

---

Several Makefile options are available for linux/mingw/macos builds:

`BUILD_CLIENT=1` - build unified client/server executable, enabled by default

`BUILD_SERVER=1` - build dedicated server executable, enabled by default

`USE_SDL=0`- use SDL2 backend for video, audio, input subsystems, enabled by default, enforced for macos

`USE_VULKAN=1` - build vulkan modular renderer, enabled by default

`USE_OPENGL=1` - build opengl modular renderer, enabled by default

`USE_OPENGL2=0` - build opengl2 modular renderer, disabled by default

`USE_RENDERER_DLOPEN=1` - do not link single renderer into client binary, compile all enabled renderers as dynamic libraries and allow to switch them on the fly via `\cl_renderer` cvar, enabled by default

`RENDERER_DEFAULT=opengl` - set default value for `\cl_renderer` cvar or use selected renderer for static build for `USE_RENDERER_DLOPEN=0`, valid options are `opengl`, `opengl2`, `vulkan`

`USE_SYSTEM_JPEG=0` - use current system JPEG library, disabled by default

Example:

`make BUILD_SERVER=0 USE_RENDERER_DLOPEN=0 RENDERER_DEFAULT=vulkan` - which means do not build dedicated binary, build client with single static vulkan renderer
