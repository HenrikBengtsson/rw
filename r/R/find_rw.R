#' Output the absolute pathname of the 'rw' command-line tool
#'
#' @param must_work (logical) If `TRUE`, an error is produced if the `rw`
#' executable could not be found.
#'
#' @return
#' The absolute pathname to the `rw` executable, if it exists,
#' otherwise `NA_character_` or an error (`must_work = TRUE`).
#'
#' @section Usage from POSIX shell:
#'
#' ```sh
#' # Get the pathname of the 'rw' tool part of the 'rw' package
#' $ Rscript -e rw::find_rw
#'
#' # Call the 'rw' tool
#' $ "$(Rscript -e rw::find_rw)" --help
#'
#' # Define a Bash rw() function that locates the 'rw' tool and calls
#' # it forwarding all command-line arguments as-is
#' $ rw() { "$(Rscript -e rw::find_rw)" "$@"; }
#' $ rw --help
#'
#' # Define a Bash rw() function, where we locate the 'rw' tool once
#' # so that the rw() does not have to look up the location each time
#' $ eval "rw() { \"$(Rscript -e rw::find_rw)\" \"\$@\"; }"
#' $ rw --help
#' ```
#'
#' @importFrom utils file_test
#' @export
find_rw <- local({
  bin <- NULL
  function(must_work = TRUE) {
    if (!is.null(bin)) return(bin)

    ## Try RW_BIN environment variable first
    file <- Sys.getenv("RW_BIN", NA_character_)
    if (!is.na(file) && nzchar(file)) {
      if (file_test("-x", file)) {
        bin <<- normalizePath(file, mustWork = TRUE)
        return(bin)
      }
    }

    ## Try PATH
    file <- Sys.which("rw")
    if (nzchar(file) && file_test("-x", file)) {
      bin <<- normalizePath(file, mustWork = TRUE)
      return(bin)
    }

    if (must_work) {
      stop("Cannot find 'rw' CLI tool. ",
           "Install it via 'npm install -g @henrikbengtsson/rw' or ",
           "set the 'RW_BIN' environment variable",
           call. = FALSE)
    }

    NA_character_
  }
})

## Expose function on the CLI
cli_fcn(find_rw) <- character(0L)
attr(find_rw, "output") <- function(x) cat(x, sep = "\n")
