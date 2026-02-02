# Get R version information on the R instance that webR provides

Functions to retrieve version information about the `rw` CLI, webR, and
R.

## Usage

``` r
rw_r_info(template = NULL)

rw_version()

rw_webr_version()

rw_r_version()
```

## Arguments

- template:

  (optional; character string) A template with conversion specifiers as
  described in base::R_LIBS_USER that are expanded.

## Value

`rw_r_info()` returns
[`R.Version()`](https://rdrr.io/r/base/Version.html) in webR and
`rw_r_info(template)` returns a character string based on the format in
webR.

`rw_version()` returns the version of the `rw` CLI tool as a
`numeric_version` object.

`rw_webr_version()` returns the version of webR as a `numeric_version`
object.

`rw_r_version()` returns the R version running in webR as a
`numeric_version` object.

## Examples

``` r
if (FALSE) { # interactive()
rw_r_info()
rw_r_info("~/R/%p-library/%v")
}
if (FALSE) { # \dontrun{
rw_version()
rw_webr_version()
rw_r_version()
} # }
```
