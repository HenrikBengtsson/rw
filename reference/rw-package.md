# rw: R API to the 'rw' Node.js CLI for webR

The **rw** package provides an R interface to run R code in a sandboxed
WebAssembly (Wasm) environment via Node.js and webR. The package wraps
the `rw` CLI tool, enabling secure evaluation of untrusted R code
isolated from the host system.

## Main R functions

- [`rw_do_call()`](rw_do_call.md):

  Call an R function with argument in webR and return the result. Works
  similarly to [`do.call()`](https://rdrr.io/r/base/do.call.html).

## Low-level functions for calling 'rw'

- [`rw()`](rw.md):

  Run R code with full control over prologue/epilogue, bindings, and
  sandboxing

- [`rw_source()`](rw_source.md):

  Source R scripts

## Utility functions

- [`rw_r_libs_user()`](rw_r_libs_user.md):

  Get the R package library path for webR

- [`rw_version()`](version-functions.md),
  [`rw_webr_version()`](version-functions.md),
  [`rw_r_version()`](version-functions.md):

  Version information

- [`rw_config()`](rw_config.md):

  Get detailed webR configuration

- [`rw_available()`](rw_available.md):

  Check if the `rw` CLI is available

## Sandboxing model

The security model uses webR's isolation with controlled host directory
access:

- **Main code**: Runs without access to the `stage` directory

- **Prologue/Epilogue code**: Has access to `stage` for data transfer

- **binds**: Host directories mounted and available to all phases

- **r_libs**: Mounted R package library available to all phases

## Environment variables

- RW_BIN:

  Path to the `rw` CLI executable

- RW_R_LIBS_USER:

  Default R library path for webR

- RW_STAGE:

  Default staging directory

## See also

Useful links:

- <https://github.com/HenrikBengtsson/rw/tree/develop/r>

- Report bugs at <https://github.com/HenrikBengtsson/rw/issues>

## Author

**Maintainer**: Henrik Bengtsson <henrikb@braju.com> \[copyright
holder\]
