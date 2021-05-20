MKFILE   := $(lastword $(MAKEFILE_LIST)) 

include make/platform.make
include make/configure.make
include make/platform_os.make

TARGET	    := libjpeg
SOURCES     := libs/jpeg-9d
INCLUDES    := 

#LIBS = -l

COMOBJECTS    = jaricom.o jcomapi.o jutils.o jerror.o jmemmgr.o jmemnobs.o $(SYSDEPMEM)
# compression library object files
CLIBOBJECTS   = jcapimin.o jcapistd.o jcarith.o jctrans.o jcparam.o \
				        jdatadst.o jcinit.o jcmaster.o jcmarker.o jcmainct.o jcprepct.o \
				        jccoefct.o jccolor.o jcsample.o jchuff.o jcdctmgr.o jfdctfst.o \
				        jfdctflt.o jfdctint.o
# decompression library object files
DLIBOBJECTS   = jdapimin.o jdapistd.o jdarith.o jdtrans.o jdatasrc.o \
				        jdmaster.o jdinput.o jdmarker.o jdhuff.o jdmainct.o \
				        jdcoefct.o jdpostct.o jddctmgr.o jidctfst.o jidctflt.o \
				        jidctint.o jdsample.o jdcolor.o jquant1.o jquant2.o jdmerge.o
# SYSDEPOBJECTS = jmemansi.o jmemname.o jmemdos.o jmemmac.o
# These objectfiles are included in libjpeg.a
LIBOBJECTS= $(CLIBOBJECTS) $(DLIBOBJECTS) $(COMOBJECTS) $(SYSDEPOBJECTS)

Q3OBJ    := $(addprefix $(B)/libjpeg/,$(notdir $(LIBOBJECTS)))

export INCLUDE	:= $(foreach dir,$(INCLUDES),-I$(dir))

PREFIX  := 
CC      := gcc
CFLAGS  := $(INCLUDE) -fsigned-char -MMD \
          -O2 -ftree-vectorize -g -ffast-math -fno-short-enums

SHLIBCFLAGS  := -fPIC -fno-common
SHLIBLDFLAGS := -dynamiclib $(LDFLAGS)
SHLIBNAME    := $(ARCH).$(SHLIBEXT)

define DO_JPEG_CC
	@echo "DO_JPEG_CC $<"
	@$(CC) $(SHLIBCFLAGS) $(CFLAGS) -o $@ -c $<
endef

mkdirs:
	@if [ ! -d $(BUILD_DIR) ];then $(MKDIR) $(BUILD_DIR);fi
	@if [ ! -d $(B) ];then $(MKDIR) $(B);fi
	@if [ ! -d $(B)/libjpeg ];then $(MKDIR) $(B)/libjpeg;fi

default:
	$(MAKE) -f $(MKFILE) B=$(BD) mkdirs
	$(MAKE) -f $(MKFILE) B=$(BD) $(BD)/$(TARGET)$(SHLIBNAME)

clean:
	@rm -rf $(BD)/libjpeg $(BD)/$(TARGET)$(SHLIBNAME)
	@rm -rf $(BR)/libjpeg $(BR)/$(TARGET)$(SHLIBNAME)

ifdef B
$(B)/libjpeg/%.o: libs/jpeg-9d/%.c
	$(DO_JPEG_CC)

$(B)/$(TARGET)$(SHLIBNAME): $(Q3OBJ) 
	$(echo_cmd) "LD $@"
	@$(CC) $(CFLAGS) $^ $(LIBS) $(SHLIBLDFLAGS) -o $@

D_FILES=$(shell find $(B)/libjpeg -name '*.d')
endif

ifneq ($(strip $(D_FILES)),)
include $(D_FILES)
endif

.PHONY: all clean clean2 clean-debug clean-release copyfiles \
	debug default dist distclean makedirs release \
  targets tools toolsclean mkdirs \
	$(D_FILES)

.DEFAULT_GOAL := default
