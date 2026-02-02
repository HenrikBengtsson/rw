#' Get the R Package Library Path for webR
#'
#' Returns the conventional path for the R user package library for webR
#' on the host file system.
#'
#' @param path (character string) A path template with optional conversion
#'   specifiers `%p` (platform) and `%v` (R version). These are expanded
#'   based on the webR R version.
#'
#' @return
#' A character string with the expanded library path, e.g.
#' `~/R/wasm32-unknown-emscripten-library/4.5`.
#'
#' @section Environment Variables:
#' If the `RW_R_LIBS_USER` environment variable is set, it is returned
#' instead of the default path.
#'
#' @export
rw_r_libs_user <- function(path = "~/R/%p-library/%v") {
  ## Check environment variable first
  env_path <- Sys.getenv("RW_R_LIBS_USER", NA_character_)
  if (!is.na(env_path) && nzchar(env_path)) return(env_path)

  ## Expand conversion specifiers if present
  if (grepl("%[pv]", path)) {
    info <- rw_r_version_info()
    path <- gsub("%p", info$platform, path, fixed = TRUE)
    path <- gsub("%v", info$x_y, path, fixed = TRUE)
  }

  path.expand(path)
}
