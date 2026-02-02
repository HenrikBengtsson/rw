# Get the R Package Library Path for webR

Returns the conventional path for the R user package library for webR on
the host file system.

## Usage

``` r
rw_r_libs_user(path = "~/R/%p-library/%v")
```

## Arguments

- path:

  (character string) A path template with optional conversion specifiers
  `%p` (platform) and `%v` (R version). These are expanded based on the
  webR R version.

## Value

A character string with the expanded library path, e.g.
`~/R/wasm32-unknown-emscripten-library/4.5`.

## Environment Variables

If the `RW_R_LIBS_USER` environment variable is set, it is returned
instead of the default path.
