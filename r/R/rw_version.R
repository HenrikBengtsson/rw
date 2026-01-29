#' Get Version Information
#'
#' Functions to retrieve version information about the `rw` CLI, webR, and R.
#'
#' @return
#' `rw_version()` returns the version of the `rw` CLI tool as a
#' `numeric_version` object.
#'
#' `rw_webr_version()` returns the version of webR as a
#' `numeric_version` object.
#'
#' `rw_r_version()` returns the R version running in webR as a
#' `numeric_version` object.
#'
#' @examples
#' \dontrun{
#' rw_version()
#' rw_webr_version()
#' rw_r_version()
#' }
#'
#' @name version-functions
NULL


#' @rdname version-functions
#' @export
rw_version <- local({
  .cache <- NULL
  function() {
    if (is.null(.cache)) {
      out <- run_rw("--version")
      version <- trimws(out[length(out)])
      .cache <<- numeric_version(version)
    }
    .cache
  }
})


#' @rdname version-functions
#' @export
rw_webr_version <- local({
  .cache <- NULL
  function() {
    if (is.null(.cache)) {
      out <- run_rw("--webr-version")
      version <- trimws(out[length(out)])
      .cache <<- numeric_version(version)
    }
    .cache
  }
})

#' @rdname version-functions
#' @export
rw_r_version <- local({
  .cache <- NULL
  function() {
    if (is.null(.cache)) {
      out <- run_rw("--r-version")
      version <- trimws(out[length(out)])
      .cache <<- numeric_version(version)
    }
    .cache
  }
})


#' Get webR R Version Information
#'
#' @return A list with components, e.g.
#' \describe{
#'   \item{x_y_z}{Full R version string (e.g., "4.5.0")}
#'   \item{x_y}{Major.minor version (e.g., "4.5")}
#'   \item{platform}{Platform string (e.g., "wasm32-unknown-emscripten")}
#' }
#'
#' @keywords internal
rw_r_version_info <- local({
  .cache <- NULL
  function() {
    if (is.null(.cache)) {
      config <- rw_config()
      .cache <<- config$r_version
    }
    .cache
  }
})
