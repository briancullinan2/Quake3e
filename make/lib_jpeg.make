TARGET		:= libjpeg
GIT_VERSION := $(shell git describe --abbrev=6 --dirty --always --tags)

SOURCES  := code/libjpeg
INCLUDES := code/libjpeg

#LIBS = -l

CFILES   := $(foreach dir,$(SOURCES), $(wildcard $(dir)/*.c))
CPPFILES   := $(foreach dir,$(CPPSOURCES), $(wildcard $(dir)/*.cpp))
BINFILES := $(foreach dir,$(DATA), $(wildcard $(dir)/*.bin))
OBJS     := $(addsuffix .o,$(BINFILES)) $(CFILES:.c=.o) $(CPPFILES:.cpp=.o)

export INCLUDE	:= $(foreach dir,$(INCLUDES),-I$(dir))

PREFIX  = libjpeg
CC      = $(PREFIX)-gcc
CFLAGS  = $(INCLUDE) -fsigned-char \
        -Wl,-q -O2 -ftree-vectorize -g -ffast-math -fno-short-enums

clean:
	@rm -rf $(TARGET).velf $(TARGET).elf $(OBJS) $(TARGET).elf.unstripped.elf $(TARGET).vpk build/$(TARGET).bin
