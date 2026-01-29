## -----------------------------------------------------------------------
## Run 'rw' CLI with arguments
## -----------------------------------------------------------------------
run_rw <- function(args = character(), stdout = TRUE, stderr = TRUE) {
  bin <- find_rw()
  res <- system2(bin, args = args, stdout = stdout, stderr = stderr)
  status <- attr(res, "status")
  if (!is.null(status) && status != 0) {
    output <- if (is.character(res)) paste(res, collapse = "\n") else ""
    stop(sprintf("'rw' failed with exit code %d:\n%s", status, output),
         call. = FALSE)
  }
  res
}


## -----------------------------------------------------------------------
## Write code to a temporary file
## -----------------------------------------------------------------------
code_to_file <- function(code, pattern = "rw-code-", fileext = ".R") {
  stopifnot(is.character(code))
  tf <- tempfile(pattern = pattern, fileext = fileext)
  writeLines(code, con = tf)
  tf
}
