SHELL: bash

install: webr

session-info:
	node --version
	npm --version
	npm list

webr:
	npm install webr --silent

getRversion:
	@node getRversion.R.mjs

hello-world:
	@node hello-world.R.mjs

r-xy:
	@R_XY=$${R_XY:-$$(node getRversion.R.mjs "x.y")}; \
	echo "$${R_XY}"

r-libs-path:
	@r_xy=$$(make --quiet r-xy); \
	lib="r-libs/emscripten/$${r_xy}"; \
	mkdir -p "$${lib}"; \
	echo "$${lib}"

## Download and extract *one* package
## Note, this does not install dependencies
pkg-install/%:
	pkg="$(@F)"; \
	echo "R package to install: $${pkg}"; \
	r_xy=$$(make --quiet r-xy); \
	echo "R version: $${r_xy}"; \
	lib="r-libs/emscripten/$${r_xy}"; \
        contriburl="https://cran.r-universe.dev/bin/emscripten/contrib/$${r_xy}"; \
	echo "R package repository URL: $${contriburl}"; \
	Rscript -e "destdir <- tempdir(); tarball <- utils::download.packages('$${pkg}', contriburl = '$${contriburl}', destdir = destdir)[,2]; utils::untar(tarball, exdir = '$${lib}'); file.remove(tarball)"

test:
	@r_libs="$$(make --quiet r-libs-path)"; \
	echo "webR library path: $${r_libs}"; \
	node local-libs.R.mjs --r-libs="$${r_libs}"
