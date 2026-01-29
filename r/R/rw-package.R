#' rw: R API to the 'rw' Node.js CLI for webR
#'
#' The **rw** package provides an R interface to run R code in a sandboxed
#' WebAssembly (Wasm) environment via Node.js and webR. The package wraps
#' the `rw` CLI tool, enabling secure evaluation of untrusted R code
#' isolated from the host system.
#'
#' @section Main Functions:
#' \describe{
#'   \item{[rw()]}{Run R code with full control over prologue/epilogue,
#'     bindings, and sandboxing}
#'   \item{[rw_eval()]}{Evaluate R expressions}
#'   \item{[rw_source()]}{Source R scripts}
#'   \item{[rw_do_call()]}{Call an R function and return the result}
#' }
#'
#' @section Utility Functions:
#' \describe{
#'   \item{[rw_r_libs_user()]}{Get the R package library path for webR}
#'   \item{[rw_version()], [rw_webr_version()],
#'         [rw_r_version()]}{Version information}
#'   \item{[rw_config()]}{Get detailed webR configuration}
#'   \item{[rw_available()]}{Check if the `rw` CLI is available}
#' }
#'
#' @section Sandboxing Model:
#' The security model uses webR's isolation with controlled host directory
#' access:
#' \itemize{
#'   \item **Main code**: Runs without access to the `stage` directory
#'   \item **Prologue/Epilogue code**: Has access to `stage` for data transfer
#'   \item **binds**: Host directories mounted and available to all phases
#'   \item **r_libs**: Mounted R package library available to all phases
#' }
#'
#' @section Environment Variables:
#' \describe{
#'   \item{RW_BIN}{Path to the `rw` CLI executable}
#'   \item{RW_R_LIBS_USER}{Default R library path for webR}
#'   \item{RW_STAGE}{Default staging directory}
#' }
#'
#' @docType package
#' @name rw-package
#' @aliases rw-package
"_PACKAGE"
