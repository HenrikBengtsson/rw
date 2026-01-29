#' Evaluate R Expressions in webR
#'
#' A convenience wrapper around [rw()] for evaluating R expressions.
#'
#' @param ... R expressions to evaluate. Each expression should be a character
#'   string. Multiple expressions are evaluated in sequence.
#'
#' @param code (character vector) Alternative way to specify R code.
#'   If provided, `...` must be empty.
#'
#' @inheritParams rw
#'
#' @return
#' A character vector containing the captured output from the R code
#' execution.
#'
#' @examples
#' \dontrun{
#' # Evaluate expressions
#' rw_eval("x <- 1:10", "mean(x)")
#'
#' # With a vector of code
#' code <- c("x <- 1:10", "mean(x)")
#' rw_eval(code = code)
#'
#' # With timeout
#' rw_eval("Sys.sleep(10)", timeout = 2.5)
#' }
#'
#' @seealso [rw()], [rw_source()], [rw_do_call()]
#'
#' @export
rw_eval <- function(...,
                    code = NULL,
                    r_libs = NULL,
                    binds = NULL,
                    stage = NULL,
                    prologue_expr = NULL,
                    epilogue_expr = NULL,
                    shims = NULL,
                    timeout = 0.0,
                    vanilla = FALSE,
                    debug = FALSE) {
  dots <- list(...)

  if (length(dots) > 0 && !is.null(code)) {
    stop("Cannot specify both '...' and 'code'", call. = FALSE)
  }

  if (length(dots) > 0) {
    expr <- vapply(dots, FUN = as.character, FUN.VALUE = character(1))
  } else if (!is.null(code)) {
    stopifnot(is.character(code))
    expr <- code
  } else {
    stop("No R code specified", call. = FALSE)
  }

  rw(
    expr = expr,
    r_libs = r_libs,
    binds = binds,
    stage = stage,
    prologue_expr = prologue_expr,
    epilogue_expr = epilogue_expr,
    shims = shims,
    timeout = timeout,
    vanilla = vanilla,
    debug = debug
  )
}
