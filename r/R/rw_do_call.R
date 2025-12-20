#' Call an R Function in R WASM
#'
#' @param fcn A function.
#'
#' @param args A list of arguments passed to `fcn`.
#'
#' @param r_libs (optional) The R package library used by `rw`.
#'
#' @return
#' The object from call `do.call(fcn, args = args)` in R WASM.
#'
#' @examples
#' # Evaluate Sys.info() in R WASM
#' info <- rw_do_call(Sys.info)
#' print(info)
#'
#' @importFrom utils file_test
#' @export
rw_do_call <- function(fcn, args = list(), r_libs = Sys.getenv("RW_R_LIBS_USER", NA_character_)) {
  stopifnot(
    is.function(fcn),
    is.list(args)
  )
  if (!is.na(r_libs)) {
    r_libs <- normalizePath(r_libs)
    if (!file_test("-d", r_libs)) {
      stop("Argument 'r_libs' does not specify a directory: ", r_libs)
    }
  }
  
  bin <- Sys.which("rw")
  stopifnot(file_test("-f", bin))

  data <- list(fcn = fcn, args = args)
  
  td <- tempdir()
  tf <- tempfile(pattern = "data-", fileext = ".rds", tmpdir = td)
  tr <- tempfile(pattern = "res-", fileext = ".rds", tmpdir = td)
  on.exit(file.remove(c(tf, tr)))

  prologue_expr <- sprintf("data <- readRDS('/host/stage/%s')", basename(tf))
  epilogue_expr <- sprintf("saveRDS(result, file = '/host/stage/%s')", basename(tr))
  expr <- 'result <- base::do.call(data[["fcn"]], args = data[["args"]])'
  args <- c(
    if (!is.na(r_libs)) sprintf("--r-libs=%s", shQuote(r_libs)),
    sprintf("--stage=%s", shQuote(td)),
    sprintf("--prologue-expr=%s", shQuote(prologue_expr)),
    sprintf("--epilogue-expr=%s", shQuote(epilogue_expr)),
    sprintf("--expr=%s", shQuote(expr))
  )

  saveRDS(data, file = tf)
  res <- system2(bin, args = args, stdout = TRUE, stderr = TRUE)
  status <- attr(res, "status")
  if (!is.null(status)) {
    stop(sprintf("'rw' failed to evaluate expression:\n%s", paste(res, collapse = "\n")))
  }
  
  result <- readRDS(tr)
  result
} ## rw_eval()
