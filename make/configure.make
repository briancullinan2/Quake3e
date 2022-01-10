
ifndef NO_MAKE_LOCAL
include Makefile.local
endif

include make/config-defaults.make
include make/config-libs.make

#help:
#	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

#.DEFAULT_GOAL := release
#.RECIPEPREFIX +=