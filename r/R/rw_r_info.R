#' Get R version information on the R instance that webR provides
#'
#' @param template (optional; character string) A template with conversion
#' specifiers as described in [base::R_LIBS_USER] that are expanded.
#'
#' @return
#' `rw_r_info()` returns `R.Version()` in webR and `rw_r_info(template)`
#' returns a character string based on the format in webR.
#'
#' @examplesIf interactive()
#' rw_r_info()
#' rw_r_info("~/R/%p-library/%v")
#'
#' @rdname version-functions
#' @keywords internal
rw_r_info <- local({
  info <- NULL
  function(template = NULL) {
    if (is.null(info)) {
      info <<- rw_do_call(R.Version)
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
