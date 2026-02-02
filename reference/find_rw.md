# Output the absolute pathname of the 'rw' command-line tool

Output the absolute pathname of the 'rw' command-line tool

## Usage

``` r
find_rw(must_work = TRUE)
```

## Arguments

- must_work:

  (logical) If `TRUE`, an error is produced if the `rw` executable could
  not be found.

## Value

The absolute pathname to the `rw` executable, if it exists, otherwise
`NA_character_` or an error (`must_work = TRUE`).

## Usage from POSIX shell

    # Get the pathname of the 'rw' tool part of the 'rw' package
    $ Rscript -e rw::find_rw

    # Call the 'rw' tool
    $ "$(Rscript -e rw::find_rw)" --help

    # Define a Bash rw() function that locates the 'rw' tool and calls
    # it forwarding all command-line arguments as-is
    $ rw() { "$(Rscript -e rw::find_rw)" "$@"; }
    $ rw --help

    # Define a Bash rw() function, where we locate the 'rw' tool once
    # so that the rw() does not have to look up the location each time
    $ eval "rw() { \"$(Rscript -e rw::find_rw)\" \"\$@\"; }"
    $ rw --help
