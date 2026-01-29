#' Call an R Function in webR
#'
#' Executes a function call in webR and returns the result. This is
#' useful for running R computations in a sandboxed environment while
#' passing data between the host R session and webR.
#'
#' @param what (function) The function to call.
#'
#' @param args (list) A list of arguments to pass to the function.
#'
#' @param quote (logical) If `TRUE`, the arguments in `args` are quoted
#'   and not evaluated before being passed to webR. Default is `FALSE`.
#'
#' @inheritParams rw
#'
#' @return
#' The return value of the function call, as evaluated in webR.
#'
#' @details
#' This function works by:
#' 1. Saving the function and arguments to an RDS file in a staging directory
#' 2. Using prologue code to load the data in webR
#' 3. Executing the function call as the main code
#' 4. Using epilogue code to save the result to an RDS file
#' 5. Reading the result back into the host R session
#'
#' @examples
#' \dontrun{
#' # Call Sys.info() in webR
#' info <- rw_do_call(Sys.info)
#' print(info)
#'
#' # Call a function with arguments
#' result <- rw_do_call(sum, args = list(1:100))
#'
#' # Call a named function
#' result <- rw_do_call("mean", args = list(x = c(1, 2, NA_real_), na.rm = TRUE))
#'
#' # Use a custom function
#' my_func <- function(x, y) x + y
#' result <- rw_do_call(my_func, args = list(x = 10, y = 20))
#' }
#'
#' @seealso [rw()], [rw_eval()], [rw_source()]
#'
#' @importFrom utils file_test
#' @export
rw_do_call <- function(what,
                       args = list(),
                       quote = FALSE,
                       r_libs = NULL,
                       binds = NULL,
                       shims = NULL,
                       timeout = 0,
                       vanilla = FALSE,
                       debug = FALSE) {
  stopifnot(is.function(what))
  stopifnot(is.list(args))
  stopifnot(is.logical(quote), length(quote) == 1L, !is.na(quote))

  ## Create staging directory
  stage_dir <- tempfile(pattern = "rw-stage-")
  dir.create(stage_dir, recursive = TRUE)
  on.exit(unlink(stage_dir, recursive = TRUE), add = TRUE)

  ## Prepare data to pass to webR
  input_file <- file.path(stage_dir, "input.rds")
  output_file <- file.path(stage_dir, "output.rds")

  data <- list(
    what = what,
    args = args,
    quote = quote
  )
  saveRDS(data, file = input_file)

  ## R code for 'rw'
  prologue_code <- sprintf(
    '.rw_data <- readRDS("%s")',
    file.path("/host/stage", basename(input_file))
  )

  main_code <- if (quote) {
    '.rw_result <- do.call(.rw_data$what, args = .rw_data$args, quote = TRUE)'
  } else {
    '.rw_result <- do.call(.rw_data$what, args = .rw_data$args)'
  }

  epilogue_code <- sprintf(
    'saveRDS(.rw_result, file = "%s")',
    file.path("/host/stage", basename(output_file))
  )

  ## Run in webR
  rw(
    expr = main_code,
    prologue_expr = prologue_code,
    epilogue_expr = epilogue_code,
    stage = stage_dir,
    r_libs = r_libs,
    binds = binds,
    shims = shims,
    timeout = timeout,
    vanilla = vanilla,
    debug = debug
  )

  ## Read result
  if (!file_test("-f", output_file)) {
    stop("webR did not produce output. The function call may have failed",
         call. = FALSE)
  }

  readRDS(output_file)
}
