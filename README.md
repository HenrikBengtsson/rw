# rw: CLI for webR with Sandboxing Features

_This is work in-progress - it only works partially. Please come back later._


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


## Command-line Interface

```sh
$ rw --help

USAGE:

  rw [options] script [args]
  
OPTIONS:

  --vanilla                     Run webR with --vanilla
  --config                      Show R information
  --r-libs=<host-dir>           Bind R user library to host directory
                                (default: '$RW_R_LIBS_USER')
  --bind=<host-dir>:<rwasm-dir> Bind host directory as a webR directory
                                (may be specified multiple times)
  --prologue=<R script>         Script evaluated before main R script
  --epilogue=<R script>         Script evaluated after main R script
  --shared=<host-dir>           Bind host directory available to prologue and
                                epilogue scripts at '/host/shared', but not
                                the main script (default: '$RW_SHARED')

EXAMPLES:

  rw --expr='sum(1:100)'

  rw main.R

  ## An R session with the R user library on host
  rw --r-libs=~/R/wasm32-unknown-emscripten-library/4.5 main.R
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw main.R

  # An R session with data loaded by the prologue script
  Rscript -e 'saveRDS(list(a=1, b=2), file = "shared/in.rds")'
  export RW_SHARED=shared
  rw --prologue=prologue.R main.R

  ## Install a package (non-persistent)
  rw --expr='webr::install("curl")'

  ## Install a package (persistent)
  export RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5
  rw --expr='webr::install("curl")'
```


[webR]: https://github.com/r-wasm/webr/
