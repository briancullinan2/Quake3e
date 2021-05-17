
BUILD_CLIENT     = 1
BUILD_SERVER     = 1
BUILD_GAMES      = 0
BUILD_LIBS       = 0

USE_SDL          = 1
USE_CURL         = 1
USE_LOCAL_HEADERS= 0
USE_VULKAN       = 0
USE_SYSTEM_JPEG  = 0
USE_VULKAN_API   = 1

USE_RENDERER_DLOPEN = 1

ifndef COPYDIR
COPYDIR="/usr/local/games/quake3"
endif

ifndef DESTDIR
DESTDIR=/usr/local/games/quake3
endif

ifndef MOUNT_DIR
MOUNT_DIR=code
endif

ifndef BUILD_DIR
BUILD_DIR=build
endif

ifndef GENERATE_DEPENDENCIES
GENERATE_DEPENDENCIES=1
endif

ifndef USE_CCACHE
USE_CCACHE=0
endif
export USE_CCACHE

ifndef USE_CODEC_VORBIS
USE_CODEC_VORBIS=0
endif

ifndef USE_CODEC_OPUS
USE_CODEC_OPUS=0
endif

ifndef USE_CIN_THEORA
USE_CIN_THEORA=0
endif

ifndef USE_CIN_XVID
USE_CIN_THEORA=0
endif

ifndef USE_CIN_VPX
USE_CIN_THEORA=0
endif

ifndef USE_LOCAL_HEADERS
USE_LOCAL_HEADERS=1
endif

ifndef USE_CURL
USE_CURL=1
endif

ifndef USE_CURL_DLOPEN
ifdef MINGW
  USE_CURL_DLOPEN=0
else
  USE_CURL_DLOPEN=1
endif
endif

ifneq ($(USE_RENDERER_DLOPEN),0)
  USE_VULKAN=1
endif

ifneq ($(USE_VULKAN),0)
  USE_VULKAN_API=1
endif


#############################################################################

BD=$(BUILD_DIR)/debug-$(PLATFORM)-$(ARCH)
BR=$(BUILD_DIR)/release-$(PLATFORM)-$(ARCH)
ADIR=$(MOUNT_DIR)/asm
CDIR=$(MOUNT_DIR)/client
SDIR=$(MOUNT_DIR)/server
TDIR=$(MOUNT_DIR)/tools
RCDIR=$(MOUNT_DIR)/renderercommon
R1DIR=$(MOUNT_DIR)/renderer
R2DIR=$(MOUNT_DIR)/renderer2
RVDIR=$(MOUNT_DIR)/renderervk
SDLDIR=$(MOUNT_DIR)/sdl

OGGDIR=$(MOUNT_DIR)/ogg
VORBISDIR=$(MOUNT_DIR)/vorbis
OPUSDIR=$(MOUNT_DIR)/opus-1.2.1
OPUSFILEDIR=$(MOUNT_DIR)/opusfile-0.9
CMDIR=$(MOUNT_DIR)/qcommon
UDIR=$(MOUNT_DIR)/unix
W32DIR=$(MOUNT_DIR)/win32
QUAKEJS=$(MOUNT_DIR)/xquakejs
BLIBDIR=$(MOUNT_DIR)/botlib
UIDIR=$(MOUNT_DIR)/ui
JPDIR=$(MOUNT_DIR)/libjpeg

bin_path=$(shell which $(1) 2> /dev/null)

STRIP ?= strip
PKG_CONFIG ?= pkg-config

ifneq ($(call bin_path, $(PKG_CONFIG)),)
  SDL_INCLUDE ?= $(shell $(PKG_CONFIG) --silence-errors --cflags-only-I sdl2)
  SDL_LIBS ?= $(shell $(PKG_CONFIG) --silence-errors --libs sdl2)
  X11_INCLUDE ?= $(shell $(PKG_CONFIG) --silence-errors --cflags-only-I x11)
  X11_LIBS ?= $(shell $(PKG_CONFIG) --silence-errors --libs x11)
  FREETYPE_CFLAGS ?= $(shell $(PKG_CONFIG) --silence-errors --cflags freetype2 || true)
  FREETYPE_LIBS ?= $(shell $(PKG_CONFIG) --silence-errors --libs freetype2 || echo -lfreetype)
endif

# supply some reasonable defaults for SDL/X11?
ifeq ($(X11_INCLUDE),)
X11_INCLUDE = -I/usr/X11R6/include
endif
ifeq ($(X11_LIBS),)
X11_LIBS = -lX11
endif
ifeq ($(SDL_LIBS),)
SDL_LIBS = -lSDL2
endif

# extract version info
VERSION=$(shell grep "\#define Q3_VERSION" $(CMDIR)/q_shared.h | \
  sed -e 's/.*"[^" ]* \([^" ]*\)\( MV\)*"/\1/')

# common qvm definition
ifeq ($(ARCH),x86_64)
  HAVE_VM_COMPILED = true
else
ifeq ($(ARCH),x86)
  HAVE_VM_COMPILED = true
else
  HAVE_VM_COMPILED = false
endif
endif

ifeq ($(ARCH),arm)
  HAVE_VM_COMPILED = true
endif
ifeq ($(ARCH),aarch64)
  HAVE_VM_COMPILED = true
endif

BASE_CFLAGS =

ifndef USE_MEMORY_MAPS
  USE_MEMORY_MAPS = 1
  BASE_CFLAGS += -DUSE_MEMORY_MAPS
endif

ifeq ($(USE_SYSTEM_JPEG),1)
  BASE_CFLAGS += -DUSE_SYSTEM_JPEG
endif

ifneq ($(HAVE_VM_COMPILED),true)
  BASE_CFLAGS += -DNO_VM_COMPILED
endif

ifneq ($(USE_RENDERER_DLOPEN),0)
  BASE_CFLAGS += -DUSE_RENDERER_DLOPEN
  BASE_CFLAGS += -DRENDERER_PREFIX=\\\"$(RENDERER_PREFIX)\\\"
endif

ifeq ($(USE_CODEC_VORBIS),1)
  BASE_CFLAGS += -DUSE_CODEC_VORBIS=1
endif

ifdef DEFAULT_BASEDIR
  BASE_CFLAGS += -DDEFAULT_BASEDIR=\\\"$(DEFAULT_BASEDIR)\\\"
endif

ifeq ($(USE_LOCAL_HEADERS),1)
  BASE_CFLAGS += -DUSE_LOCAL_HEADERS=1
endif

ifeq ($(USE_VULKAN_API),1)
  BASE_CFLAGS += -DUSE_VULKAN_API
endif

ifeq ($(GENERATE_DEPENDENCIES),1)
  BASE_CFLAGS += -MMD
endif

## Defaults
INSTALL=install
MKDIR=mkdir

ARCHEXT=

CLIENT_EXTRA_FILES=
GIT_VERSION := $(shell git describe --abbrev=6 --dirty --always --tags)

ifneq ($(HAVE_VM_COMPILED),true)
  BASE_CFLAGS += -DNO_VM_COMPILED
endif

ifeq ($(BUILD_STANDALONE),1)
  BASE_CFLAGS += -DSTANDALONE
endif

ifeq ($(USE_Q3KEY),1)
  BASE_CFLAGS += -DUSE_Q3KEY -DUSE_MD5
endif

ifeq ($(NOFPU),1)
  BASE_CFLAGS += -DNOFPU
endif

ifeq ($(USE_CURL),1)
  BASE_CFLAGS += -DUSE_CURL
ifeq ($(USE_CURL_DLOPEN),1)
  BASE_CFLAGS += -DUSE_CURL_DLOPEN
else
ifeq ($(MINGW),1)
  BASE_CFLAGS += -DCURL_STATICLIB
endif
endif
endif

#############################################################################
# DEPENDENCIES
#############################################################################

.PHONY: all clean clean2 clean-debug clean-release copyfiles \
	debug default dist distclean makedirs release \
	targets tools toolsclean mkdirs

.DEFAULT_GOAL := instructions

instructions:
	@echo "make -f make/game_baseq3a"
