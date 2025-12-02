#' Source R script in R WebAssembly (Wasm)
#' 
#' @param main,prologue,epilogue (character string)
#' The main R script, and optional R scripts that are sourced before and
#' after to the main Rscript.
#' If `AsIs` string vectors, then they are interpreted as R code, which is
#' then written to temporary R scripts, and sourced that way.
#'
#' @param shared (character string; optional) A folder shared in webR with
#' pro- and epilogue scripts as `/host/shared/`. The folder is _not_ mounted
#' when the main R script is sourced.
#'
#' @param binds (character vector) A named vector of directories on the
#' host system, where the names are the paths to be mounted in webR.
#' These folders are available throughout the full call, i.e. during the
#' prologue, the main, and the epilogue steps.
#' Due to limitations in WebAssembly, it is _not_ possible to mount
#' directories as being read-only.
#'
#' @param libs (character string; optional) The path to an R user library
#' of Emscripten packages binary mounted as read-write in Rwasm.
#'
#' @param debug (logical) If TRUE, RWasm outputs debug messages.
#'
#' @return
#' The captured output (standard output and standard error) as a
#' character string.
#'
#' @section Sandboxed evaluation of the main R code:
#' Note that webR, and therefore the main, the prologue and the epilogue R
#' code, has access to the internet. Because webR runs within WebAssembly,
#' such access is limited to certain protocols. See the webR and WebAssembly
#' documentations for further details.
#'
#' The R instance running in webR does not have access to the hosts file
#' system, unless some directories are explicitly shared via the `binds`
#' argument.
#'
#' The prologue and epilogue R codes that are run in webR before and after
#' the main R code do have access, while evaluated, to host directory
#' `shared`, if specified. The main R script does _not_ have to this
#' directory. Because of this, you can use _trusted_ prologue and epilogue
#' code to share data files between R on the host and webR, without giving
#' the main R code, which you might not trust, access.
#'
#'
#' @examplesIf interactive()
#' # Prove that we are running within R Wasm
#' code <- 'sessionInfo()'
#' out <- rwasm_source(I(code))
#' writeLines(out)
#'
#' # Bind host's temporary folder
#' code <- 'cat("hello from webR\n", file = "/host/tmp/hello.txt")'
#' out <- rwasm_source(I(code), binds = c("/host/tmp" = tempdir()))
#' msg <- readLines(file.path(tempdir(), "hello.txt"))
#' writeLines(msg)
#'
#' # Pass shared data files via pro- and epilogue scripts
#' saveRDS(list(a = 1, b = 2), file.path(tempdir(), "in.rds"))
#' prologue <- 'data_in <- readRDS("/host/shared/in.rds")'
#' epilogue <- 'saveRDS(data_out, "/host/shared/out.rds")'
#' code <- c(
#'   'data_out <- lengths(data_in)',
#'   'stopifnot(length(dir("/host/shared")) == 0)' ## empty => not mounted
#' )
#' output <- rwasm_source(I(code), prologue = I(prologue), epilogue = I(epilogue), shared = tempdir())
#' out <- readRDS(file.path(tempdir(), "out.rds"))
#' print(out)
#'
#' # Note that R Wasm has internet access by default
#' code <- 'writeLines(readLines("https://ipinfo.io/json", warn = FALSE))'
#' out <- rwasm_source(I(code))
#' writeLines(out)
#'
#' @importFrom utils file_test
#' @export
rwasm_source <- function(main, prologue = NULL, epilogue = NULL, shared = NULL, binds = character(0L), libs = r_libs_user(), debug = FALSE) {
  stopifnot(is.character(main))
  stopifnot(is.null(prologue) || is.character(prologue))
  stopifnot(is.null(epilogue) || is.character(epilogue))
  stopifnot(is.null(shared) || file_test("-d", shared))
  stopifnot(is.character(binds) && !anyNA(binds))
  if (length(binds) > 0) stopifnot(!is.null(names(binds)))
  stopifnot(is.null(libs) || is.character(libs) && length(libs) == 1L)
  stopifnot(is.logical(debug), length(debug) == 1L, !is.na(debug))

  bin <- rwasm_mjs_script("rwasm_source", must_work = FALSE)
  if (!file_test("-x", bin)) bin <- rwasm_install_mjs_script("rwasm_source")

  args <- character(0L)
  
  if (isTRUE(debug)) {
    args <- c(args, "--debug")
  }
  
  if (is.character(libs)) {
    if (!file_test("-d", libs)) {
      stop("Argument 'libs' specifies a non-existing directory: ", sQuote(libs))
    }
    libs <- normalizePath(libs, mustWork = TRUE)
    args <- c(args, sprintf("--r-libs=%s", shQuote(libs)))
  }
  
  for (name in names(binds)) {
    src <- binds[name]
    if (!file_test("-d", src)) {
      stop("Argument 'binds' specifies a non-existing host directory: ", sQuote(bind))
    }
    bind <- paste(src, names(src), sep = ":")
    args <- c(args, sprintf("--bind=%s", shQuote(bind)))
  }
  
  if (!is.null(prologue)) {
    if (inherits(prologue, "AsIs")) {
      prologue <- code_to_file(prologue)
      on.exit(file.remove(prologue), add = TRUE)
    }
    prologue <- normalizePath(prologue, mustWork = TRUE)
    void <- parse(file = prologue) ## Validate syntax
    args <- c(args, sprintf("--prologue=%s", shQuote(prologue)))
  }
  
  if (!is.null(epilogue)) {
    if (inherits(epilogue, "AsIs")) {
      epilogue <- code_to_file(epilogue)
      on.exit(file.remove(epilogue), add = TRUE)
    }
    epilogue <- normalizePath(epilogue, mustWork = TRUE)
    void <- parse(file = epilogue) ## Validate syntax
    args <- c(args, sprintf("--epilogue=%s", shQuote(epilogue)))
  }
  
  if (!is.null(shared)) {
    shared <- normalizePath(shared, mustWork = TRUE)
    stopifnot(file_test("-d", shared))
    args <- c(args, sprintf("--shared=%s", shQuote(shared)))
  }
  
  if (inherits(main, "AsIs")) {
    main <- code_to_file(main)
    on.exit(file.remove(main), add = TRUE)
  }
  void <- parse(file = main) ## Validate syntax
  args <- c(args, main)

  ## Call MJS script explicitly via 'node'
  out <- node(bin, args = args)
  status <- attr(out, "status")
  if (!is.null(status)) {
    msg <- sprintf("'rwasm_source' failed with exit code %d. The capture output was:\n%s\n", paste(args, collapse = " "), status, paste(out, collapse = "\n"))
    stop(msg)
  }

  out
}
