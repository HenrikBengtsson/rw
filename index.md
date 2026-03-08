# rw: Evaluate R Expressions withing R WebAssembly

## TL;DR

The **rw** R package allows you to evaluate R code within R WebAssembly
as implemented by **[webR](https://github.com/r-wasm/webr/)**, e.g.

``` sh
> rw::rw_do_call(Sys.info)
       sysname        release        version       nodename        machine 
  "Emscripten"        "4.0.8"           "#1"   "emscripten"       "wasm32" 
         login           user effective_user 
    "web_user"      "unknown"      "unknown" 
```

This can be useful when we need to evaluate arbitrary, untrusted R code
in a secure manner isolated from the host system. It is also useful for
making sure R code and R packages work in **webR** without having to go
the extra mile to upload packages online and then testing it in the web
browser at <https://webr.sh/>.

## Installation

``` sh
remotes::install_github("futureverse/rw", subdir = "r")
```

The package requires the `rw` command-line tool, which can be installed
as:

``` sh
npm install -g @henrikbengtsson/rw
```
