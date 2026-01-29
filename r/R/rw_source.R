#' Source an R Script in webR
#'
#' A convenience wrapper around [rw()] for sourcing R scripts.
#'
#' @param file (character string) Path to an R script file to source.
#'   If an `AsIs` character vector (created with [I()]), it is treated as
#'   R code and written to a temporary file.
#'
#' @inheritParams rw
#'
#' @return
#' A character vector containing the captured output from the R script
#' execution.
#'
#' @examples
#' \dontrun{
#' # Source a script file
#' rw_source("analysis.R")
#'
#' # Use inline code with I()
#' rw_source(I("print(Sys.info())"))
#'
#' # With R library
#' rw_source("analysis.R", r_libs = "~/R/wasm32-unknown-emscripten-library/4.5")
#' }
#'
#' @seealso [rw()], [rw_eval()], [rw_do_call()]
#'
#' @importFrom utils file_test
#' @export
rw_source <- function(file,
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
                      args = NULL) {
  stopifnot(is.character(file))

  ## Handle AsIs code
  cleanup_file <- NULL
  if (inherits(file, "AsIs")) {
    file <- code_to_file(file, pattern = "rw-source-")
    cleanup_file <- file
  }

  on.exit({
    if (!is.null(cleanup_file) && file_test("-f", cleanup_file)) {
      file.remove(cleanup_file)
    }
  }, add = TRUE)

  rw(
    file = file,
    r_libs = r_libs,
    binds = binds,
    stage = stage,
    prologue = prologue,
    epilogue = epilogue,
    prologue_expr = prologue_expr,
    epilogue_expr = epilogue_expr,
    shims = shims,
    timeout = timeout,
    vanilla = vanilla,
    debug = debug,
    args = args
  )
}
