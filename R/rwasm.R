#' @importFrom utils file_test
install_webr <- function(path = node_path()) {
  opwd <- setwd(path)
  on.exit(setwd(opwd))
  install_node_package(path = path)
  out <- npm("install", "--silent", "webr")
  invisible(out)
}


#' Get the webR version
#'
#' @return
#' `webr_version()` returns the webR version.
#'
#' @details
#' `r_version()` takes 2-3 seconds the first time it is called. This
#' is because it queries `getRversion()` in webR.
#'
#' @examplesIf interactive()
#' webr_version()
#' r_version()
#' r_version("x.y")
#'
#' @export
webr_version <- local({
  version <- NULL
  function() {
    if (is.null(version)) {
      esm_code <- 'import { WebR } from "webr"; const webr = new WebR(); console.log(webr.version); process.exit(0);'
      out <- node(args = c("--input-type=module", "-e", shQuote(esm_code)))
      version <<- numeric_version(out)
    }
    version
  }
})


#' Get the R version that webR provides
#'
#' @param format (optional; character string) If `"x.y"`, then the
#' 'x.y' component of the R version 'x.y.z' is returned.
#'
#' @return
#' `r_version()` returns the version of R that webR implements.
#'
#' @rdname webr_version
#' @export
r_version <- local({
  version <- NULL
  function(format = NULL) {
    if (is.null(version)) {
      esm_code <- 'import { WebR } from "webr"; const webr = new WebR(); await webr.init(); await webr.evalR("cat(as.character(getRversion()))"); process.exit(0);'
      out <- node(args = c("--input-type=module", "-e", shQuote(esm_code)))
      version <<- R_system_version(out)
    }

    if (!is.null(format)) {
      if (format == "x.y") {
        version <- paste(unlist(version)[1:2], collapse = ".")
        version <- package_version(version)
      }
    }
    version
  }
})


webr_version <- function() {
  ver <- node(args = c("--input-type=module", "-e", shQuote('import { WebR } from "webr"; const webr = new WebR(); console.log(webr.version); process.exit(0);')))
  numeric_version(ver)
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
