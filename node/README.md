# rw: CLI for webR with Sandboxing Features

## TL;DR

The `rw` tools is an Rscript-like command-line-interface (CLI) tool
for running R code in a sandboxed WebAssembly environment via Node.js
and **[webR]**, e.g.

```sh
$ rw --r-libs=~/R/webR --prologue=trusted.R untrusted.R
```

This can be useful when we need to evaluate arbitrary, untrusted R
code in a secure manner isolated from the host system. It is also
useful for making sure R code and R packages work in **webR** without
having to go the extra mile to upload packages online and then testing
it in the web browser at <https://webr.sh/>.


## Installation

```sh
npm install -g @henrikbengtsson/rw
```

## Command-line Interface

```sh
$ rw --help

rw: CLI for webR with Sandboxing Features

Usage:

  rw [rwasm options] <script.R> [args]
  
RWasm options:

  --help                        Show this help
  --version                     Show version
  --webr-version                Show webR version
  --r-version                   Show R version
  --debug                       Show debug output
  --vanilla                     Run webR with --vanilla
  --config                      Show R information
  --r-libs=<host-dir>           Bind R user library to host directory
                                (default: '$RW_R_LIBS_USER')
  --bind=<host-dir>:<rwasm-dir> Bind host directory as a webR directory
                                (may be specified multiple times)
  --shared=<host-dir>           Bind host directory available to prologue and
                                epilogue code at '/host/shared', but not
                                the main code (default: '$RW_SHARED')
  --prologue=<R script>         R script evaluated before main R code
  --epilogue=<R script>         R script evaluated after main R code
  --prologue-expr=<R code>      R code evaluated before main R code
  --epilogue-expr=<R code>      R code evaluated after main R code
  --expr=<R code>               R code to evaluate (multiple okay)
                                Alternative to specifying 'script.R'

Examples:

  rw --expr='sum(1:100)'

  rw main.R

  rw --expr='cat(Sys.getenv("R_LIBS_USER"))'

  ## An R session with the R user library on host
  rw --r-libs=~/R/wasm32-unknown-emscripten-library/4.5 main.R
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw main.R

  ## An R session with data loaded from host by prologue code and
  ## with results saved by the epilogue code, without giving the main
  ## R code acccess to the host file system
  export RW_SHARED=shared
  mkdir -p "${RW_SHARED}"
  Rscript -e "saveRDS(list(a=1, b=2), file.path(Sys.getenv('RW_SHARED'), '/in.rds'))"
  rw \
    --prologue-expr="data_in <- readRDS('/host/shared/in.rds')" \
    --epilogue-expr="saveRDS(data_out, '/host/shared/out.rds')" \
    --expr="data_out <- lapply(data_in, sqrt)"

  ## Install a package (non-persistent)
  rw --expr='webr::install("curl")'

  ## Install a package, if not already installed (persistently on host)
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr='webr::install("curl")'

  ## Force re-install of a package (persistently on host)
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr='pkgs <- "curl"; utils::remove.packages(pkgs, lib = .libPaths()); webr::install(pkgs, mount = FALSE)'

Version: 0.0.5
License: MIT
Author: Henrik Bengtsson
```


[webR]: https://github.com/r-wasm/webr/