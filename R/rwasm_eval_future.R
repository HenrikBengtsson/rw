#' Evaluates a future in R WebAssembly (Wasm)
#'
#' @inheritParams rwasm_rscript
#'
#' @param future A [future::Future] object.
#'
#' @return
#' A [future::FutureResult] object.
#'
#' @examplesIf interactive()
#' library(future)
#' f <- future({ sessionInfo() }, lazy = TRUE)
#' r <- rwasm_eval_future(f)
#'
#' @importFrom utils file_test
#' @importFrom tools file_path_sans_ext
#' @export
rwasm_eval_future <- function(future, libs = NULL, shared = NULL, debug = FALSE) {
  ## Argument 'future':
  if (is.character(future)) {
    stopifnot(length(future) == 1L && !is.na(future) && nzchar(future))
    if (!file_test("-f", future)) {
      stop("Argument 'files' specifies a non-existing file: ", sQuote(future))
    }
  } else if (inherits(future, "Future")) {
    if (!isTRUE(future$lazy)) {
      stop(sprintf("Cannot evaluate non-lazy future: %s", class(future)[1]))
    }
  } else {
    stop("Argument 'future' is of an unknown class: ", class(future)[1])
  }

  ## Argument 'shared':
  if (is.null(shared)) {
    if (inherits(future, "Future")) {
      shared <- tempdir()
    } else {
      shared <- dirname(future)
    }
  } else {
    stopifnot(is.character(shared) && length(shared) == 1, !is.na(shared), nzchar(shared))
    if (!file_test("-d", shared)) {
      stop("Argument 'shared' does not specify an existing directory: ", sQuote(shared))
    }
  }

  stopifnot(is.logical(debug), length(debug) == 1L, !is.na(debug))

  files <- c(
    script = tempfile(fileext = ".R", tmpdir = shared),
    future = NA_character_,
    result = NA_character_
  )
  remove <- c("script")
  on.exit({ file.remove(files[remove][file_test("-f", files[remove])]) })

  if (is.character(future)) {
    files["future"] <- future
  } else if (inherits(future, "Future")) {
    files["future"] <- tempfile("future-", fileext = ".rds", tmpdir = shared)
    saveRDS(future, file = files["future"])
    remove <- c(remove, "future", "result")
  }

  name <- file_path_sans_ext(basename(files[["future"]]))
  files[["result"]] <- file.path(shared, sprintf("%s-FutureResult.rds", name))
  
  ## Write R script
  code <- c(
    sprintf('future <- readRDS("shared/%s")', basename(files["future"])),
    'print(future)',
    'result <- future::result(future)',
    'print(result)',
    sprintf('saveRDS(result, file = "shared/%s")', basename(files["result"])),
    'cat("done\\n")'
  )
  
  if (debug) {
    cat("R code to be evaluated by RWasm:\n")
    writeLines(code)
  }
  
  writeLines(code, con = files["script"])

  out <- rwasm_rscript(file = files["script"], libs = libs, shared = shared, debug = debug)

  if (debug) {
    cat("RWasm output:\n")
    writeLines(out)
  }

  if (inherits(future, "Future")) {
    result <- readRDS(files["result"])
  } else {
    result <- files[["result"]]
  }
  
  result
}
