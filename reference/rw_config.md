# Get webR Configuration Information

Returns detailed configuration information about the R environment
running in webR.

## Usage

``` r
rw_config(raw = FALSE)
```

## Arguments

- raw:

  (logical) If `TRUE`, returns the raw output as a character vector. If
  `FALSE` (default), parses the output into a named list.

## Value

If `raw = FALSE`, a named list with configuration categories as
top-level elements, each containing named values. Categories include:

- envs:

  R-related environment variables

- locale:

  Locale settings

- sys_info:

  System information from
  [`base::Sys.info()`](https://rdrr.io/r/base/Sys.info.html)

- platform:

  Platform information from
  [base::.Platform](https://rdrr.io/r/base/base-defunct.html)

- capabilities:

  R capabilities from
  [`base::capabilities()`](https://rdrr.io/r/base/capabilities.html)

- r_version:

  R version information from
  [base::R.version](https://rdrr.io/r/base/base-defunct.html)

- machine:

  Machine-specific information from base::.Machine

- ext_soft_version:

  External software versions

- r_home:

  R home directory paths

- session:

  Session information

- command_args:

  Command-line arguments

- lapack:

  LAPACK library information

- localization:

  Localization information

If `raw = TRUE`, the raw output as a character vector.

## Examples

``` r
if (FALSE) { # \dontrun{
# Get parsed configuration
config <- rw_config()
config$r_version

# Get raw output
rw_config(raw = TRUE)
} # }
```
