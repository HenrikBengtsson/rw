# Source an R Script in webR

A convenience wrapper around
[`rw()`](https://rw.futureverse.org/reference/rw.md) for sourcing R
scripts.

## Usage

``` r
rw_source(
  file,
  r_libs = NULL,
  binds = NULL,
  stage = NULL,
  prologue = NULL,
  epilogue = NULL,
  prologue_expr = NULL,
  epilogue_expr = NULL,
  shims = NULL,
  timeout = 0,
  vanilla = FALSE,
  debug = FALSE,
  args = NULL
)
```

## Arguments

- file:

  (character string) Path to an R script file to source. If an `AsIs`
  character vector (created with
  [`I()`](https://rdrr.io/r/base/AsIs.html)), it is treated as R code
  and written to a temporary file.

- r_libs:

  (character string) Path to an R package library on the host to mount
  in webR. The recommended path is
  [`rw_r_libs_user()`](https://rw.futureverse.org/reference/rw_r_libs_user.md).

- binds:

  (named character vector) Host directories to mount in webR. Names are
  the webR mount paths, values are the host paths. For example,
  `c("/host/data" = "/path/to/data")`.

- stage:

  (character string) Path to a staging directory on the host. This
  directory is mounted only during prologue and epilogue execution,
  allowing trusted code to pass data to/from the sandboxed main code.

- prologue, epilogue:

  (character string) Paths to R script files to source before/after the
  main code.

- prologue_expr, epilogue_expr:

  (character vector) R expressions to evaluate before/after the main
  code. These have access to the stage directory if specified.

- shims:

  (character vector) Shims to install in R. Default is
  `"install.packages"`. Set to `character(0)` to disable.

- timeout:

  (numeric) Maximum execution time in seconds. If exceeded, an interrupt
  signal is sent to R. Use 0.0 (default) for no timeout.

- vanilla:

  (logical) If `TRUE`, run R with `--vanilla` flag.

- debug:

  (logical) If `TRUE`, output debug information.

- args:

  (character vector) Additional arguments to pass to the R script
  (accessible via `commandArgs(trailingOnly = TRUE)` in webR).

## Value

A character vector containing the captured output from the R script
execution.

## See also

[`rw()`](https://rw.futureverse.org/reference/rw.md)

## Examples

``` r
if (FALSE) { # \dontrun{
# Source a script file
rw_source("analysis.R")

# Use inline code with I()
rw_source(I("print(Sys.info())"))

# With R library
rw_source("analysis.R", r_libs = "~/R/wasm32-unknown-emscripten-library/4.5")
} # }
```
