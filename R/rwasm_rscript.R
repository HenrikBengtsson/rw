#' Execute code in R WebAssembly (Wasm)
#' 
#' @param file (character string) An R script.
#'
#' @param code (character vector) R code.
#'
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
rwasm_rscript <- function(file = NULL, code = NULL) {
  if (is.null(file) && is.null(code)) {
    stop("Either argument 'file' or 'code' must be specified")
  } else if (!is.null(file) && !file_test("-f", file)) {
    stop("Argument 'file' specified a non-existing file: ", sQuote(file))
  }
  
  bin <- get_rwasm_rscript(must_work = FALSE)
  if (!file_test("-x", bin)) bin <- install_rwasm_rscript()

  if (is.null(file)) {
    file <- tempfile(pattern = "rwasm_extras_", fileext = ".R")
    on.exit(file.remove(file))
    writeLines(code, con = file)
  }
  
  out <- system2(bin, args = c(file), stdout = TRUE, stderr = TRUE)
  out <- paste(out, collapse = "\n")
  status <- attr(out, "status")
  if (!is.null(status)) {
    msg <- sprintf("'rwasm_rscript' failed with exit code %d. The capture output was:\n%s\n", paste(args, collapse = " "), status, out)
    stop(msg)
  }

  out
}
