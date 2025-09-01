#' @importFrom utils file_test
find_npm <- local({
  bin <- NULL
  function() {
    if (!is.null(bin)) return(bin)
    
    file <- Sys.getenv("NPM", NA_character_)
    if (is.na(file)) {
      file <- Sys.which("npm")
      if (!nzchar(file)) file <- NA_character_
    }
    if (is.na(file)) {
      stop("Failed to locate 'npm' executable")
    }
    if (!file_test("-f", file)) {
      stop("No such 'npm' executable: ", sQuote(file))
    }
    if (!file_test("-x", file)) {
      stop("'npm' file is not an executable: ", sQuote(file))
    }
    bin <<- file
    bin
  }
})


npm <- function(...) {
  args <- c(...)
  bin <- find_npm()
  out <- system2(bin, args = args, stdout = TRUE, stderr = TRUE)
  status <- attr(out, "status")
  if (!is.null(status)) {
    msg <- sprintf("'npm %s' failed with exit code %d. The capture output was:\n%s\n", paste(args, collapse = " "), status, paste(out, collapse = "\n"))
    stop(msg)
  }
  out
}


#' @importFrom utils file_test
node_path <- function() {
  path <- tools::R_user_dir(.packageName, "data")
  if (!file_test("-d", path)) dir.create(path, recursive = TRUE)
  path
}


#' @importFrom utils file_test
install_node_package <- function(path = node_path()) {
  file <- "package.json"
  pathname <- file.path(path, file)
  if (!file_test("-f", pathname)) {
    src <- system.file(package = .packageName, "node", file, mustWork = TRUE)
    file.copy(src, pathname)
    if (!file_test("-f", pathname)) {
      stop(sprintf("Failed to install %s", sQuote(pathname)))
    }
  }
  
  pathname
}


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


#' Execute code in R WebAssembly (WASM)
#' 
#' @param file (character string) An R script.
#'
#' @param code (character vector) R code.
#'
#' @return
#' The captured output (standard output and standard error).
#'
#' @examplesIf interactive()
#' out <- rwasm_rscript(code = "sessionInfo()")
#' writeLines(out)
#'
#' @importFrom utils file_test
#' @export
rwasm_rscript <- function(file = NULL, code = NULL) {
  if (is.null(file) && is.null(code)) {
    stop("Either argument 'file' or 'code' must be specified")
  } else if (!is.null(file) && !file_test("-f", file)) {
    stop("Argument 'file' specified a non-existing file: ", sQuote(file))
  }
  
  bin <- get_rwasm_rscript(must_work = FALSE)
  if (!file_test("-x", bin)) bin <- install_rwasm_rscript()

  if (is.null(file)) {
    file <- tempfile(pattern = "rwasm_extras_", fileext = ".R")
    on.exit(file.remove(file))
    writeLines(code, con = file)
  }
  
  out <- system2(bin, args = c(file), stdout = TRUE, stderr = TRUE)
  status <- attr(out, "status")
  if (!is.null(status)) {
    msg <- sprintf("'rwasm_rscript' failed with exit code %d. The capture output was:\n%s\n", paste(args, collapse = " "), status, paste(out, collapse = "\n"))
    stop(msg)
  }
  out
}
