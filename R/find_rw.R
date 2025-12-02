#' Output the absolute pathname of the 'rw' command-line tool
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
#' @export
find_rw <- function() {
  pathname <- system.file(package = .packageName, "node", "rw", mustWork = TRUE)
  cat(pathname, "\n", sep = "")
  invisible(pathname)
}

## Expose function on the CLI
cli_fcn(find_rw) <- character(0L)


