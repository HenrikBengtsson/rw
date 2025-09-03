#' @importFrom utils file_test
find_node <- local({
  bin <- NULL
  function() {
    if (!is.null(bin)) return(bin)
    
    file <- Sys.getenv("NODE", NA_character_)
    if (is.na(file)) {
      file <- Sys.which("node")
      if (!nzchar(file)) file <- NA_character_
    }
    if (is.na(file)) {
      stop("Failed to locate 'node' executable")
    }
    if (!file_test("-f", file)) {
      stop("No such 'node' executable: ", sQuote(file))
    }
    if (!file_test("-x", file)) {
      stop("'node' file is not an executable: ", sQuote(file))
    }
    bin <<- file
    bin
  }
})


node <- function(...) {
  args <- c(...)
  bin <- find_node()
  out <- system2(bin, args = args, stdout = TRUE, stderr = TRUE)
  status <- attr(out, "status")
  if (!is.null(status)) {
    msg <- sprintf("'node %s' failed with exit code %d. The capture output was:\n%s\n", paste(args, collapse = " "), status, paste(out, collapse = "\n"))
    stop(msg)
  }
  out
}


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
