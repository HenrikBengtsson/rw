# Run R Code in webR (WebAssembly)

Executes R code in a sandboxed WebAssembly environment via the `rw` CLI
tool and webR.

## Usage

``` r
rw(
  expr = NULL,
  file = NULL,
  prologue_expr = NULL,
  epilogue_expr = NULL,
  prologue = NULL,
  epilogue = NULL,
  r_libs = NULL,
  binds = NULL,
  stage = NULL,
  shims = NULL,
  timeout = 0,
  vanilla = FALSE,
  debug = FALSE,
  args = NULL
)
```

## Arguments

- expr:

  (character vector) R expressions to evaluate. Each element is passed
  as a separate `--expr` argument.

- file:

  (character string) Path to an R script file to execute. Cannot be used
  together with `expr`.

- prologue_expr, epilogue_expr:

  (character vector) R expressions to evaluate before/after the main
  code. These have access to the stage directory if specified.

- prologue, epilogue:

  (character string) Paths to R script files to source before/after the
  main code.

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

A character vector containing the captured output (stdout and stderr
combined) from the R code execution.

## Sandboxing Model

The security model uses webR's isolation with controlled host directory
access:

- **Main code**: Runs without access to the `stage` directory

- **Prologue/Epilogue code**: Has access to `stage` for data transfer

- **binds directories**: Available to all phases

- **r_libs**: Mounted R package library available to all phases

## See also

[`rw_source()`](https://rw.futureverse.org/reference/rw_source.md)

## Examples

``` r
if (FALSE) { # \dontrun{
# Evaluate a simple expression
rw(expr = "sum(1:100)")

# Run an R script
rw(file = "analysis.R")

# With timeout
rw(expr = "Sys.sleep(10)", timeout = 3.0)

# Pass data via stage directory
stage_dir <- tempdir()
saveRDS(list(a = 1, b = 2), file.path(stage_dir, "input.rds"))
rw(
  prologue_expr = "data <- readRDS('/host/stage/input.rds')",
  expr = "result <- lapply(data, sqrt)",
  epilogue_expr = "saveRDS(result, '/host/stage/output.rds')",
  stage = stage_dir
)
result <- readRDS(file.path(stage_dir, "output.rds"))
} # }
```
