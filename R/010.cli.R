parse_cmd_args <- function(
  patterns = character(0L),
  cmdargs = getOption(
    sprintf("%s.tests.cmdargs", .packageName),
    commandArgs(trailingOnly = TRUE)
  )
) {
  patterns <- sprintf("^%s$", patterns)

  args <- list()
  for (pattern in patterns) {
    idx <- grep(pattern, cmdargs)
    if (length(idx) > 0) {
      cmdarg <- cmdargs[idx]
      cmdargs <- cmdargs[-idx]
      ## Use only last, iff multiple are given
      if (length(cmdarg) > 1) {
        cmdarg <- cmdarg[length(cmdarg)]
      }
      name <- gsub(pattern, "\\1", cmdarg)
      value <- gsub(pattern, "\\2", cmdarg)
      class(value) <- "cmd_arg"
      args[[name]] <- value
    }
  }

  if (length(cmdargs) > 0) {
    stop(sprintf(
      "Unknown '%s' command-line arguments: %s",
        .packageName, paste(cmdargs, collapse = " ")
    ), call. = FALSE)
  }

  args
} # parse_cmd_args()


`cli_fcn<-` <- function(x, value = character(0L)) {
  fcn <- x
  patterns <- value
  stopifnot(
    is.function(fcn),
    is.character(patterns)
  )
  class(fcn) <- c("cli_fcn", class(fcn))
  attr(fcn, "patterns") <- patterns
  invisible(fcn)
}

#' @export
print.cli_fcn <- function(
  x,
  ...,
  call = !interactive(),
  envir = parent.frame()
) {
  if (!call) {
    return(NextMethod())
  }

  # Call function...
  patterns <- attr(x, "patterns")
  res <- withVisible(do.call(
    x,
    args = parse_cmd_args(patterns = patterns),
    envir = envir
  ))

  # Should the result be printed?
  if (res$visible) {
    output <- attr(x, "output")
    if (is.null(output)) {
      output <- print
    }
    output(res$value)
  }

  # Return nothing
  invisible(return())
}
