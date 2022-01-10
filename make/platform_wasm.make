HAVE_VM_COMPILED := false
BUILD_CLIENT     := 1
BUILD_SERVER     := 0
BUILD_STANDALONE := 1
USE_SYSTEM_JPEG  := 0
USE_SYSTEM_LIBC  := 0
USE_ABS_MOUSE    := 1
USE_LOCAL_DED    := 1
USE_LAZY_LOAD    := 1
USE_LAZY_MEMORY  := 1
USE_MASTER_LAN   := 1
USE_CURL         := 0

include make/configure.make

LD               := libs/$(COMPILE_PLATFORM)/wasi-sdk-14.0/bin/wasm-ld
CC               := libs/$(COMPILE_PLATFORM)/wasi-sdk-14.0/bin/clang
CXX              := libs/$(COMPILE_PLATFORM)/wasi-sdk-14.0/bin/clang++
BINEXT           := .wasm

SHLIBEXT         := wasm
SHLIBCFLAGS      := 
SHLIBLDFLAGS     := --import-memory -error-limit=0 --export-dynamic --no-entry --strip-all
LDFLAGS          := --import-memory -error-limit=0

CLIENT_LDFLAGS   := code/wasm/include/wasi/libclang_rt.builtins-wasm32.a \
                    --export-dynamic --no-entry

BASE_CFLAGS      += -Wall -Ofast --target=wasm32 \
                    -Wimplicit -fstrict-aliasing \
                    -Wno-bitwise-op-parentheses \
                    -Wno-shift-op-parentheses \
                    -DGL_GLEXT_PROTOTYPES=1 -DGL_ARB_ES2_compatibility=1 \
                    -DGL_EXT_direct_state_access=1 \
                    -DUSE_Q3KEY -DUSE_MD5 \
                    -DUSE_ABS_MOUSE -DUSE_LOCAL_DED \
                    -DUSE_LAZY_LOAD -DUSE_LAZY_MEMORY -DUSE_MASTER_LAN \
                    -fvisibility=hidden \
                    -D_XOPEN_SOURCE=700 \
                    -D__WASM__ \
                    --no-standard-libraries \
                    -Icode/wasm/include \
                    -Ilibs/musl-1.2.2/include \
                    -Ilibs/musl-1.2.2/arch/generic \

DEBUG_CFLAGS     := $(BASE_CFLAGS) \
                    -std=c11 -DDEBUG -D_DEBUG -frtti -fPIC -O0 -g

RELEASE_CFLAGS   := $(BASE_CFLAGS) \
                    -std=c11 -DNDEBUG -O3 -Oz -flto -fPIC

export INCLUDE   := -Icode/wasm/include \
                    -Ilibs/musl-1.2.2/include \
                    -Ilibs/musl-1.2.2/arch/generic

ifdef B
pre-build:
	@:
endif