#' @importFrom utils file_test
install_webr <- function(path = node_path()) {
  opwd <- setwd(path)
  on.exit(setwd(opwd))
  install_node_package(path = path)
  out <- npm("install", "--silent", "webr")
  invisible(out)
}


get_rwasm_rscript <- function(path = node_path(), must_work = TRUE) {
  file <- "rscript.mjs"
  pathname <- file.path(path, file)
  if (must_work && !file_test("-x", pathname)) {
    stop("Executable not found: ", pathname)
  }
  pathname
}


#' @importFrom utils file_test
install_rwasm_rscript <- function(path = node_path()) {
  install_webr(path = path)
  
  pathname <- get_rwasm_rscript(must_work = FALSE)
  if (!file_test("-f", pathname)) {
    file <- basename(pathname)
    src <- system.file(package = .packageName, "node", file, mustWork = TRUE)
    file.copy(src, pathname)
    if (!file_test("-f", pathname)) {
      stop(sprintf("Failed to install %s", sQuote(pathname)))
    }
  }
  
  pathname
}
