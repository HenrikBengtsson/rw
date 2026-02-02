#' Run R Code in webR (WebAssembly)
#'
#' Executes R code in a sandboxed WebAssembly environment via the `rw` CLI
#' tool and webR.
#'
#' @param expr (character vector) R expressions to evaluate. Each element
#'   is passed as a separate `--expr` argument.
#'
#' @param file (character string) Path to an R script file to execute.
#'   Cannot be used together with `expr`.
#'
#' @param prologue_expr,epilogue_expr (character vector) R expressions to
#'   evaluate before/after the main code. These have access to the stage
#'   directory if specified.
#'
#' @param prologue,epilogue (character string) Paths to R script files to
#'   source before/after the main code.
#'
#' @param r_libs (character string) Path to an R package library on the host
#'   to mount in webR. The recommended path is [rw_r_libs_user()].
#'
#' @param binds (named character vector) Host directories to mount in webR.
#'   Names are the webR mount paths, values are the host paths. For example,
#'   `c("/host/data" = "/path/to/data")`.
#'
#' @param stage (character string) Path to a staging directory on the host.
#'   This directory is mounted only during prologue and epilogue execution,
#'   allowing trusted code to pass data to/from the sandboxed main code.
#'
#' @param shims (character vector) Shims to install in R. Default is
#'   `"install.packages"`. Set to `character(0)` to disable.
#'
#' @param timeout (numeric) Maximum execution time in seconds. If exceeded,
#'   an interrupt signal is sent to R. Use 0.0 (default) for no timeout.
#'
#' @param vanilla (logical) If `TRUE`, run R with `--vanilla` flag.
#'
#' @param debug (logical) If `TRUE`, output debug information.
#'
#' @param args (character vector) Additional arguments to pass to the R
#'   script (accessible via `commandArgs(trailingOnly = TRUE)` in webR).
#'
#' @return
#' A character vector containing the captured output (stdout and stderr
#' combined) from the R code execution.
#'
#' @section Sandboxing Model:
#' The security model uses webR's isolation with controlled host directory
#' access:
#' \itemize{
#'   \item **Main code**: Runs without access to the `stage` directory
#'   \item **Prologue/Epilogue code**: Has access to `stage` for data transfer
#'   \item **binds directories**: Available to all phases
#'   \item **r_libs**: Mounted R package library available to all phases
#' }
#'
#' @examples
#' \dontrun{
#' # Evaluate a simple expression
#' rw(expr = "sum(1:100)")
#'
#' # Run an R script
#' rw(file = "analysis.R")
#'
#' # With timeout
#' rw(expr = "Sys.sleep(10)", timeout = 3.0)
#'
#' # Pass data via stage directory
#' stage_dir <- tempdir()
#' saveRDS(list(a = 1, b = 2), file.path(stage_dir, "input.rds"))
#' rw(
#'   prologue_expr = "data <- readRDS('/host/stage/input.rds')",
#'   expr = "result <- lapply(data, sqrt)",
#'   epilogue_expr = "saveRDS(result, '/host/stage/output.rds')",
#'   stage = stage_dir
#' )
#' result <- readRDS(file.path(stage_dir, "output.rds"))
#' }
#'
#' @seealso [rw_source()]
#'
#' @importFrom utils file_test
#' @export
rw <- function(expr = NULL,
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
               args = NULL) {
  ## Validate inputs
  stopifnot(is.null(expr) || is.character(expr))
  stopifnot(is.null(file) || (is.character(file) && length(file) == 1L))
  stopifnot(is.null(prologue_expr) || is.character(prologue_expr))
  stopifnot(is.null(epilogue_expr) || is.character(epilogue_expr))
  stopifnot(is.null(prologue) || (is.character(prologue) && length(prologue) == 1L))
  stopifnot(is.null(epilogue) || (is.character(epilogue) && length(epilogue) == 1L))
  stopifnot(is.null(r_libs) || (is.character(r_libs) && length(r_libs) == 1L))
  stopifnot(is.null(binds) || is.character(binds))
  stopifnot(is.null(stage) || (is.character(stage) && length(stage) == 1L))
  stopifnot(is.null(shims) || is.character(shims))
  stopifnot(is.numeric(timeout), length(timeout) == 1L, timeout >= 0.0)
  stopifnot(is.logical(vanilla), length(vanilla) == 1L, !is.na(vanilla))
  stopifnot(is.logical(debug), length(debug) == 1L, !is.na(vanilla))
  stopifnot(is.null(args) || is.character(args))

  ## Cannot specify both expr and file
  if (!is.null(expr) && !is.null(file)) {
    stop("Arguments 'expr' and 'file' must not be specified at the same time", call. = FALSE)
  }

  ## Cannot specify both *_expr and * scripts
  if (!is.null(prologue_expr) && !is.null(prologue)) {
    stop("Arguments 'prologue_expr' and 'prologue' must not be specified at the same time", call. = FALSE)
  }
  if (!is.null(epilogue_expr) && !is.null(epilogue)) {
    stop("Arguments 'epilogue_expr' and 'epilogue' must not be specified at the same time", call. = FALSE)
  }

  ## Build CLI arguments
  cli_args <- character()

  if (debug) {
    cli_args <- c(cli_args, "--debug")
  }

  if (vanilla) {
    cli_args <- c(cli_args, "--vanilla")
  }

  if (!is.null(r_libs)) {
    if (!file_test("-d", r_libs)) {
      stop("Directory 'r_libs' does not exist: ", sQuote(r_libs), call. = FALSE)
    }
    cli_args <- c(cli_args, sprintf("--r-libs=%s", shQuote(r_libs)))
  }

  if (!is.null(binds)) {
    if (is.null(names(binds))) {
      stop("Argument 'binds' must be a named vector", call. = FALSE)
    }
    for (ii in seq_along(binds)) {
      webr_path <- names(binds)[ii]
      host_path <- binds[ii]
      if (!file_test("-d", host_path)) {
        stop("Argument 'binds' specifies a non-existing host directory: ", sQuote(host_path), call. = FALSE)
      }
      cli_args <- c(cli_args, sprintf("--bind=%s:%s",
                                       shQuote(host_path),
                                       webr_path))
    }
  }

  if (!is.null(stage)) {
    if (!file_test("-d", stage)) {
      stop("Directory 'stage' does not exist: ", sQuote(stage), call. = FALSE)
    }
    cli_args <- c(cli_args, sprintf("--stage=%s", shQuote(stage)))
  }

  if (!is.null(shims)) {
    if (length(shims) > 0) {
      cli_args <- c(cli_args, sprintf("--shims=%s", paste(shims, collapse = ",")))
    } else {
      cli_args <- c(cli_args, "--shims=")
    }
  }

  if (timeout > 0) {
    cli_args <- c(cli_args, sprintf("--timeout=%g", timeout))
  }

  ## Prologue
  if (!is.null(prologue_expr)) {
    for (e in prologue_expr) {
      cli_args <- c(cli_args, sprintf("--prologue-expr=%s", shQuote(e)))
    }
  } else if (!is.null(prologue)) {
    if (!file.exists(prologue)) {
      stop("Argument 'prologue' specifies a non-existing file: ", sQuote(prologue), call. = FALSE)
    }
    cli_args <- c(cli_args, sprintf("--prologue=%s", shQuote(prologue)))
  }

  ## Epilogue
  if (!is.null(epilogue_expr)) {
    for (e in epilogue_expr) {
      cli_args <- c(cli_args, sprintf("--epilogue-expr=%s", shQuote(e)))
    }
  } else if (!is.null(epilogue)) {
    if (!file.exists(epilogue)) {
      stop("Argument 'epilogue' specifies a non-existing file: ", sQuote(epilogue), call. = FALSE)
    }
    cli_args <- c(cli_args, sprintf("--epilogue=%s", shQuote(epilogue)))
  }

  ## Main code
  if (!is.null(expr)) {
    for (e in expr) {
      cli_args <- c(cli_args, sprintf("--expr=%s", shQuote(e)))
    }
  } else if (!is.null(file)) {
    if (!file.exists(file)) {
      stop("R script file does not exist: ", sQuote(file), call. = FALSE)
    }
    cli_args <- c(cli_args, file)
  }

  ## Additional script arguments
  if (!is.null(args)) {
    cli_args <- c(cli_args, args)
  }

  ## Run
  run_rw(cli_args)
}
