#' Get webR Configuration Information
#'
#' Returns detailed configuration information about the R environment
#' running in webR.
#'
#' @param raw (logical) If `TRUE`, returns the raw output as a character
#'   vector. If `FALSE` (default), parses the output into a named list.
#'
#' @return
#' If `raw = FALSE`, a named list with configuration categories as top-level
#' elements, each containing named values. Categories include:
#' \describe{
#'   \item{envs}{R-related environment variables}
#'   \item{locale}{Locale settings}
#'   \item{sys_info}{System information from [base::Sys.info()]}
#'   \item{platform}{Platform information from [base::.Platform]}
#'   \item{capabilities}{R capabilities from [base::capabilities()]}
#'   \item{r_version}{R version information from [base::R.version]}
#'   \item{machine}{Machine-specific information from [base::.Machine]}
#'   \item{ext_soft_version}{External software versions}
#'   \item{r_home}{R home directory paths}
#'   \item{session}{Session information}
#'   \item{command_args}{Command-line arguments}
#'   \item{lapack}{LAPACK library information}
#'   \item{localization}{Localization information}
#' }
#'
#' If `raw = TRUE`, the raw output as a character vector.
#'
#' @examples
#' \dontrun{
#' # Get parsed configuration
#' config <- rw_config()
#' config$r_version
#'
#' # Get raw output
#' rw_config(raw = TRUE)
#' }
#'
#' @export
rw_config <- function(raw = FALSE) {
  stopifnot(is.logical(raw), length(raw) == 1L, !is.na(raw))

  out <- run_rw("--config")

  if (raw) {
    return(out)
  }

  ## Parse output into structured list
  config <- list()

  for (line in out) {
    ## Skip empty lines
    if (!nzchar(trimws(line))) next

    ## Parse "category:key=value" format
    match <- regmatches(line, regexec("^([^:]+):([^=]+)=(.*)$", line))[[1]]
    if (length(match) == 4) {
      category <- match[2]
      key <- match[3]
      value <- match[4]

      if (is.null(config[[category]])) {
        config[[category]] <- list()
      }
      config[[category]][[key]] <- value
    }
  }

  config
}


#' Check if rw CLI is Available
#'
#' Tests whether the `rw` CLI tool is installed and accessible.
#'
#' @return `TRUE` if the `rw` CLI is available, otherwise `FALSE`.
#'
#' @examples
#' if (rw_available()) {
#'   message("rw CLI is available")
#' } else {
#'   message("rw CLI is not available")
#' }
#'
#' @export
rw_available <- function() {
  bin <- find_rw(must_work = FALSE)
  !is.na(bin) && file.exists(bin)
}
