# Install R packages to the R user package library path in webR

Install R packages to the R user package library path in webR

## Usage

``` r
rw_install_packages(
  pkgs,
  lib = rw_r_libs_user(),
  repos = rw_repos(),
  contriburl = rw_contriburl(repos = repos),
  available = available.packages(contriburl = contriburl),
  dependencies = NA
)
```

## Arguments

- pkgs:

  (character vector) Names of packages to install.

- lib:

  character vector giving the library directories where to install the
  packages. Recycled as needed. If missing, defaults to the first
  element of [`.libPaths()`](https://rdrr.io/r/base/libPaths.html).

- repos:

  character vector, the base URL(s) of the repositories to use, e.g.,
  the URL of a CRAN mirror such as `"https://cloud.r-project.org"`. For
  more details on supported URL schemes see
  [`url`](https://rdrr.io/r/base/connections.html).

  Can be `NULL` to install from local files, directories or URLs: this
  will be inferred by extension from `pkgs` if of length one.

- contriburl:

  URL(s) of the contrib sections of the repositories. Use this argument
  if your repository mirror is incomplete, e.g., because you mirrored
  only the `contrib` section, or only have binary packages. Overrides
  argument `repos`. Incompatible with `type = "both"`.

- available:

  a matrix as returned by
  [`available.packages`](https://rdrr.io/r/utils/available.packages.html)
  listing packages available at the repositories, or `NULL` when the
  function makes an internal call to `available.packages`. Incompatible
  with `type = "both"`.

- dependencies:

  logical indicating whether to also install uninstalled packages which
  these packages depend on/link to/import/suggest (and so on
  recursively). Not used if `repos = NULL`. Can also be a character
  vector, a subset of
  `c("Depends", "Imports", "LinkingTo", "Suggests", "Enhances")`.

  Only supported if `lib` is of length one (or missing), so it is
  unambiguous where to install the dependent packages. If this is not
  the case it is ignored, with a warning.

  The default, `NA`, means `c("Depends", "Imports", "LinkingTo")`.

  `TRUE` means to use `c("Depends", "Imports", "LinkingTo", "Suggests")`
  for `pkgs` and `c("Depends", "Imports", "LinkingTo")` for added
  dependencies: this installs all the packages needed to run `pkgs`,
  their examples, tests and vignettes (if the package author specified
  them correctly).

  In all of these, `"LinkingTo"` is omitted for binary packages.

## Value

A named logical vector, where the names correspond to packages installed
and the values whether they installed successfully.

## Examples

``` r
if (FALSE) { # interactive()
# Install the 'future' package
rw_install_packages("future")

# List all installed packages
pkgs <- rw_do_call(utils::installed.packages, r_libs = rw_r_libs_user())
print(rownames(pkgs))
}
```
