# Check if rw CLI is Available

Tests whether the `rw` CLI tool is installed and accessible.

## Usage

``` r
rw_available()
```

## Value

`TRUE` if the `rw` CLI is available, otherwise `FALSE`.

## Examples

``` r
if (rw_available()) {
  message("rw CLI is available")
} else {
  message("rw CLI is not available")
}
#> rw CLI is available
```
