#' Install R packages to the R user package library path in webR
#'
#' @inheritParams utils::install.packages
#'
#' @param pkgs (character vector) Names of packages to install.
#'
#' @return
#' A named logical vector, where the names correspond to packages installed
#' and the values whether they installed successfully.
#'
#' @examplesIf interactive()
#' # Install the 'future' package
#' rw_install_packages("future")
#' 
#' # List all installed packages
#' pkgs <- rw_do_call(utils::installed.packages)
#' print(rownames(pkgs))
#'
#' @importFrom utils available.packages installed.packages file_test download.file untar
#' @importFrom tools package_dependencies
#' @export
rw_install_packages <- function(pkgs, lib = rw_r_libs_user(), repos = rw_repos(), contriburl = rw_contriburl(repos = repos), available = available.packages(contriburl = contriburl), dependencies = NA) {
  stopifnot(is.character(pkgs), !anyNA(pkgs), all(nzchar(pkgs)))

  if (!file_test("-d", lib)) dir.create(lib, recursive = TRUE)

  ## Skip dependencies already installed
  installed <- installed.packages(lib.loc = lib)
  installed <- as.data.frame(installed)

  which <- if (is.na(dependencies)) {
    c("Depends", "Imports", "LinkingTo")
  } else if (isTRUE(dependencies)) {
    c("Depends", "Imports", "LinkingTo", "Suggests")
  } else {
    c("Depends", "Imports", "LinkingTo", "Suggests", "Enhances")
  }
  deps <- package_dependencies(pkgs, db = available, which = which)
  deps <- sort(unique(unlist(deps, use.names = FALSE)))
  deps <- setdiff(deps, base_pkgs())            ## skip 'base' packages
  deps <- setdiff(deps, installed[["Package"]]) ## already a installed?

  ## Find all recursive dependencies on the dependencies
  deps_r <- package_dependencies(deps, recursive = TRUE, db = available, which = c("Depends", "Imports", "LinkingTo"))
  deps_r <- sort(unique(unlist(deps_r, use.names = FALSE)))
  deps_r <- setdiff(deps_r, base_pkgs())            ## skip 'base' packages
  deps_r <- setdiff(deps_r, installed[["Package"]]) ## already a installed?
  deps <- unique(sort(c(deps, deps_r)))

  ## All packages to be installed
  todo <- unique(c(deps, pkgs))
  Package <- NULL ## To please R CMD check
  todo <- subset(as.data.frame(available), Package %in% todo, select = c("Repository", "Package", "Version"))
  filenames <- sprintf("%s_%s.tgz", todo[["Package"]], todo[["Version"]])
  urls <- paste(todo[["Repository"]], filenames, sep = "/")

  res <- apply(todo, MARGIN = 1L, FUN = function(info, lib) {
    filename <- sprintf("%s_%s.tgz", info[["Package"]], info[["Version"]])
    url <- paste(info[["Repository"]], filename, sep = "/")
    tf <- file.path(tempdir(), filename)
    on.exit(file.remove(tf))
    res <- download.file(url, destfile = tf, mode = "wb", quiet = FALSE)
    if (res == 0) {
      res <- untar(tf, exdir = normalizePath(lib))
    }
    if (res != 0) {
      warning(sprintf("Failed to download %s", url))
    }
    res
  }, lib = lib)
  res <- (res == 0)
  res
}



base_pkgs <- local({
  pkgs <- NULL
  function() {
    if (is.null(pkgs)) {
      db <- installed.packages(lib.loc = rev(.libPaths())[1], priority = "base")
      pkgs <<- unique(db[, "Package"])
    }
    pkgs
  }
})


rw_repos <- function(default = "https://cran.r-universe.dev") {
  repo <- getOption("repos")["RW"]
  if (is.na(repo)) repo <- default
  repo  
}


rw_contriburl <- function(repos = rw_repos(), r_version = rw_r_info("%v")) {
  sprintf("%s/bin/emscripten/contrib/%s", repos, r_version)
}
