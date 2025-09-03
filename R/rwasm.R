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
#' r_version()
#' r_version("x.y")
#'
#' @export
webr_version <- local({
  version <- NULL
  function() {
    if (is.null(version)) {
      esm_code <- 'import { WebR } from "webr"; const webr = new WebR(); console[lo.log(webr.version); process.exit(0);'
      out <- node(args = c("--input-type=module", "-e", shQuote(esm_code)))
      version <<- numeric_version(out)
    }
    version
  }
})


#' Get R version information on the R instance that webR provides
#'
#' @param template (optional; character string) A template with conversion
#' specifiers as described in [base::R_LIBS_USER] that are expanded.
#'
#' @return
#' `r_version()` returns `R.version()` in webR and `r_version(template)`
#' returns a character string based on the format in webR.
#'
#' @examplesIf interactive()
#' r_info()
#' r_info("~/R/%p-library/%v")
#'
#' @rdname webr_version
#' @export
r_info <- local({
  info <- NULL
  function(template = NULL) {
    if (is.null(info)) {
      esm_code <- 'import { WebR } from "webr"; const webr = new WebR(); await webr.init(); await webr.evalR("cat(deparse1(R.version))"); process.exit(0);'
      out <- node(args = c("--input-type=module", "-e", shQuote(esm_code)))
      info <<- eval(parse(text = out))
    }

    if (is.null(template)) return(info)
    
    stopifnot(is.character(template), length(template) == 1L)
    res <- template
    for (spec in c("%V", "%v", "%p", "%o", "%a")) {
      if (!grepl(spec, res)) next
      value <- switch(spec,
        "%V" = paste(info[["major"]], info[["minor"]], sep = "."),
        "%v" = paste(info[["major"]], sub("[.].*", "", info[["minor"]]), sep = "."),
        "%p" = info[["platform"]],
        "%o" = info[["os"]],
        "%a" = info[["arch"]],
               stop("Unknown specifier: ", spec)
      )
      res <- gsub(spec, value, res, fixed = TRUE)
    }
    res
  }
})



#' Manage the R package library for webR
#'
#' @param path (character string) The path to the R package library
#' on the host file system to be mounted as the R user package library
#' in webR. The path supports some of the 
#'
#' @return
#' `r_libs_user()` returns the package library path for webR in
#' `~/R/%p-library/%v`, where `%p` is the R platform and `%v` is the
#' R 'x.y' version R  in webR as extracted by [r_info()], e.g.
#' `~/R/wasm32-unknown-emscripten-library/4.5`.
#' 
#' @export
r_libs_user <- function(path = "~/R/%p-library/%v") {
  if (grepl("%.", path)) path <- r_info(path)
  path
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
