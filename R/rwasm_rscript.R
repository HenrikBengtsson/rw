#' Execute code in R WebAssembly (Wasm)
#' 
#' @param file (character string) An R script.
#'
#' @param code (character vector) R code.
#'
#' @param libs (character string; optional) The path to an R user library
#' of Emscripten packages binary mounted as read-write in Rwasm.
#
#' @param shared (character string; optional) The path to a directory
#' mounted read-write as `./shared/` to Rwasm.
#
#' @return
#' The captured output (standard output and standard error) as a
#' character string.
#'
#' @examplesIf interactive()
#' # Prove that we are running within R Wasm
#' out <- rwasm_rscript(code = 'sessionInfo()')
#' writeLines(out)
#'
#' # Note that R Wasm has internet access by default
#' out <- rwasm_rscript(code = 'writeLines(readLines("https://ipinfo.io/json", warn = FALSE))')
#' writeLines(out)
#'
#' @importFrom utils file_test
#' @export
rwasm_rscript <- function(file = NULL, code = NULL, libs = NULL, shared = NULL) {
  if (is.null(file) && is.null(code)) {
    stop("Either argument 'file' or 'code' must be specified")
  } else if (!is.null(file) && !file_test("-f", file)) {
    stop("Argument 'file' specifies a non-existing file: ", sQuote(file))
  }

  stopifnot(is.null(libs) || is.character(libs) && length(libs) == 1L)
  if (is.character(libs)) {
    if (!file_test("-d", libs)) {
      stop("Argument 'libs' specifies a non-existing directory: ", sQuote(libs))
    }
    libs <- normalizePath(libs, mustWork = TRUE)
  }

  stopifnot(is.null(shared) || is.character(shared) && length(shared) == 1L)
  if (is.character(shared)) {
    if (!file_test("-d", shared)) {
      stop("Argument 'shared' specifies a non-existing directory: ", sQuote(shared))
    }
    shared <- normalizePath(shared, mustWork = TRUE)
  }

  bin <- get_rwasm_rscript(must_work = FALSE)
  if (!file_test("-x", bin)) bin <- install_rwasm_rscript()

  if (is.null(file)) {
    file <- tempfile(pattern = "rwasm_extras_", fileext = ".R")
    on.exit(file.remove(file))
    writeLines(code, con = file)
  }

  args <- c(file)
  if (is.character(libs)) {
    args <- c(args, sprintf("--r-libs=%s", shQuote(libs)))
  }
  if (is.character(shared)) {
    args <- c(args, sprintf("--shared=%s", shQuote(shared)))
  }

  out <- system2(bin, args = args, stdout = TRUE, stderr = TRUE)
  out <- paste(out, collapse = "\n")
  status <- attr(out, "status")
  if (!is.null(status)) {
    msg <- sprintf("'rwasm_rscript' failed with exit code %d. The capture output was:\n%s\n", paste(args, collapse = " "), status, out)
    stop(msg)
  }

  out
}
