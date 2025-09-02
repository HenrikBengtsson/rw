#' Evaluates a future in R WebAssembly (Wasm)
#' 
#' @param future A [future::Future] object.
#'
#' @return
#' A [future::FutureResult] object.
#'
#' @examplesIf interactive()
#' library(future)
#' f <- future({ sessionInfo() }, lazy = TRUE)
#' r <- rwasm_eval_future(f)
#'
#' @importFrom utils file_test
#' @export
rwasm_eval_future <- function(future, libs = NULL, shared = tempdir()) {
  stopifnot(inherits(future, "Future"), isTRUE(future$lazy))
  stopifnot(requireNamespace("future", quietly = TRUE))
  stopifnot(file_test("-d", shared))

  files <- c(
    tempfile(fileext = ".R"),
    file.path(shared, c("future.rds", "future-result.rds"))
  )
  on.exit({
    file.remove(files[file_test("-f", files)])
  })

  code <- c(
    'future <- readRDS("shared/future.rds")',
    'result <- future::result(future)',
    'saveRDS(result, "shared/future-result.rds")'
  )
  writeLines(code, con = files[1])
  saveRDS(future, file = files[2])
  out <- rwasm_rscript(file = files[1], libs = libs, shared = shared)
  results <- readRDS(files[3])
  results
}
