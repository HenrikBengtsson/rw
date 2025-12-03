code_to_file <- function(code) {
  file <- tempfile(fileext = ".R")
  writeLines(code, con = file)
  file
}
