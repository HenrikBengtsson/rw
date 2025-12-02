is_webr_installed <- function() {
  esm_code <- c(
    'try {',
    '  require.resolve("webr");',
    '  console.log("true");',
    '} catch (e) {',
    '  console.log("false");',
    '}'
  )
  esm_code <- paste(esm_code, collapse = "\n")
  out <- node("-e", shQuote(esm_code))
  grepl("true", out)
}

install_webr <- function(path = node_path()) {
  opwd <- setwd(path)
  on.exit(setwd(opwd))
  if (is_webr_installed()) {
    out <- character(0L)
  } else {
    out <- npm("install", "--silent", "webr")
  }
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
#' @keywords internal
webr_version <- local({
  version <- NULL
  function() {
    if (is.null(version)) {
      void <- install_webr()
      esm_code <- c(
        'import { WebR } from "webr";',
        'const webr = new WebR();',
        'console.log(webr.version);',
        'process.exit(0);'
      );
      esm_code <- paste(esm_code, collapse = "\n")
      out <- node("--input-type=module", "-e", shQuote(esm_code))
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
#' @keywords internal
r_info <- local({
  info <- NULL
  function(template = NULL) {
    if (is.null(info)) {
      void <- install_webr()
      esm_code <- 'import { WebR } from "webr"; const webr = new WebR(); await webr.init(); await webr.evalR("cat(deparse1(R.version))"); process.exit(0);'
      out <- node("--input-type=module", "-e", shQuote(esm_code))
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


#' @importFrom utils file_test
rwasm_mjs_script <- function(name, path = node_path(), must_work = TRUE) {
  file <- sprintf("%s.mjs", name)
  pathname <- file.path(path, file)
  if (must_work) {
    if (!file_test("-f", pathname)) {
      stop("File not found: ", pathname)
    } else if (!file_test("-x", pathname)) {
      stop("Executable not found: ", pathname)
    }
  }
  pathname
}


#' @importFrom utils file_test
rwasm_install_mjs_script <- function(name, path = node_path()) {
  install_webr(path = path)
  
  pathname <- rwasm_mjs_script(name, must_work = FALSE)
  if (!file_test("-f", pathname)) {
    filename <- basename(pathname)
    src <- system.file(package = .packageName, "node", filename, mustWork = TRUE)
    file.copy(src, pathname)
    if (!file_test("-f", pathname)) {
      stop(sprintf("Failed to install %s", sQuote(pathname)))
    }
  }
  
  pathname
}
