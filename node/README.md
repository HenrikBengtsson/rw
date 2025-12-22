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
  --shims=<shims>               Comma-separated set of shims
                                (default: '$RW_SHIMS'; 'install.packages')
  --stage=<host-dir>            Bind host directory available to prologue and
                                epilogue code at '/host/stage', but not
                                the main code (default: '$RW_STAGE')
  --prologue=<R script>         R script evaluated before main R code
  --epilogue=<R script>         R script evaluated after main R code
  --prologue-expr=<R code>      R code evaluated before main R code
  --epilogue-expr=<R code>      R code evaluated after main R code
  --expr=<R code>               R code to evaluate (multiple okay)
                                Alternative to specifying 'script.R'
  --timeout=<seconds>           Maximum evaluation time in seconds, before
                                signaling an interrupt to R.

Examples:

  rw --expr="sum(1:100)"

  rw main.R

  ## Time out after 3.5 seconds
  rw --timeout=3.5 --expr="slow <- function() { Sys.sleep(5); 42 }" \
                   --expr="tryCatch(slow(), interrupt = identity)"

  ## An R session with the R user library on host
  rw --r-libs=~/R/wasm32-unknown-emscripten-library/4.5 main.R
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw main.R

  ## Install a package (non-persistent)
  rw --expr="install.packages('praise')" --expr="message(praise::praise())"

  ## Install a package (persistently on host)
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr="install.packages('praise')"
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr="message(praise::praise())"


  ## Evaluate parts of the R code that is untrusted in R WASM, with
  ## data passed in and out via a stage folder that trusted prologue
  ## and epilogue code has access to, but not the main code
  mkdir stage
  Rscript -e "saveRDS(list(a=1, b=2), 'stage/in.rds')"
  rw \
    --stage=stage \
    --prologue-expr="data_in <- readRDS('/host/stage/in.rds')" \
    --epilogue-expr="saveRDS(data_out, '/host/stage/out.rds')" \
    --expr="data_out <- lapply(data_in, sqrt)"
  Rscript -e "data_out <- readRDS('stage/out.rds')" -e "utils::str(data_out)"

Version: 0.0.10
License: MIT
Author: Henrik Bengtsson
```


[webR]: https://github.com/r-wasm/webr/