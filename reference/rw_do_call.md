# Call an R Function in webR

Executes a function call in webR and returns the result. This is useful
for running R computations in a sandboxed environment while passing data
between the host R session and webR.

## Usage

``` r
rw_do_call(
  what,
  args = list(),
  quote = FALSE,
  r_libs = NULL,
  binds = NULL,
  shims = NULL,
  timeout = 0,
  vanilla = FALSE,
  debug = FALSE
)
```

## Arguments

- what:

  (function) The function to call.

- args:

  (list) A list of arguments to pass to the function.

- quote:

  (logical) If `TRUE`, the arguments in `args` are quoted and not
  evaluated before being passed to webR. Default is `FALSE`.

- r_libs:

  (character string) Path to an R package library on the host to mount
  in webR. The recommended path is
  [`rw_r_libs_user()`](rw_r_libs_user.md).

- binds:

  (named character vector) Host directories to mount in webR. Names are
  the webR mount paths, values are the host paths. For example,
  `c("/host/data" = "/path/to/data")`.

- shims:

  (character vector) Shims to install in R. Default is
  `"install.packages"`. Set to `character(0)` to disable.

- timeout:

  (numeric) Maximum execution time in seconds. If exceeded, an interrupt
  signal is sent to R. Use 0.0 (default) for no timeout.

- vanilla:

  (logical) If `TRUE`, run R with `--vanilla` flag.

- debug:

  (logical) If `TRUE`, output debug information.

## Value

The return value of the function call, as evaluated in webR.

## Details

This function works by:

1.  Saving the function and arguments to an RDS file in a staging
    directory

2.  Using prologue code to load the data in webR

3.  Executing the function call as the main code

4.  Using epilogue code to save the result to an RDS file

5.  Reading the result back into the host R session

## See also

Internally, [`rw()`](rw.md) is used.

## Examples

``` r
if (FALSE) { # \dontrun{
# Call Sys.info() in webR
info <- rw_do_call(Sys.info)
print(info)

# Call a function with arguments
result <- rw_do_call(sum, args = list(1:100))

# Use a custom function
my_func <- function(x, y) x + y
result <- rw_do_call(my_func, args = list(x = 10, y = 20))
} # }
```
