[![Check](https://github.com/futureverse/rw/actions/workflows/check.yml/badge.svg)](https://github.com/futureverse/rw/actions/workflows/check.yml)

# rw: CLI for R with Multi-Runtime Support

_WARNING: This is work under development. I strongly recommend that
you do not depend on it at this time. Please do not publish a package
to NPM that depends on it._

## TL;DR

The \`rw\` tool is an Rscript-like command-line-interface (CLI) for running
R code in a variety of environments (runtimes), including **[webR]**
via [Deno] (for high isolation) or [Node.js] (for partial isolation).

```sh
rw --prologue=trusted.R untrusted.R
```

This is useful for evaluating arbitrary, potentially untrusted R
code in a secure manner, or for testing R code and packages in **webR**
without a browser.

## Run without Installation

### Using Node.js

```sh
npx @henrikbengtsson/rw --expr="sum(1:100)"
```

### Using Deno

```sh
deno run --quiet --allow-all npm:@henrikbengtsson/rw --expr='sum(1:100)'
```

## Installation

### Node.js (npm)

```sh
npm install --global @henrikbengtsson/rw
```

The `rw` executable is installed to the `bin/` subfolder under `npm
config get prefix`. Prepend that to your `PATH`, e.g. `export
PATH=$(npm config get prefix)/bin:$PATH`.

### Deno

```sh
deno install --global --allow-all npm:@henrikbengtsson/rw
```

The `rw` executable is installed to `~/.deno/bin/`. Prepend that to
your `PATH`, e.g. `export PATH=~/.deno/bin:$PATH`.

To install the development version, use:

```sh
deno install --global --name rw-devel --allow-all \
  https://raw.githubusercontent.com/futureverse/rw/refs/heads/develop/node/deno.json
```

## Command-line Interface

```sh
rw --help
```

```text

rw: CLI for R with Multi-Runtime Support

Usage:

  rw [options] [script.R] [args]
  rw [options] --expr="..."
  rw [options] < script.R
  rw [options] --persistent install [pkg] [pkg ...]
  rw [options] --persistent install --docker [dir] [dir ...]
  rw [options] --persistent uninstall [pkg] [pkg ...]
  rw build --docker [[dir]]
  rw env list
  rw env get [field]
  rw config [--local] list
  rw config [--local] get [field]
  rw config [--local] set [field] [value]
  rw config [--local] unset [field]
  rw config --global list
  rw config --global get [field]
  rw config --global set [field] [value]
  rw config --global unset [field]

Options (general):
  --help                        Show this help
  --version                     Show version
  --verbose                     Show progress messages
  --debug                       Show debug output
  --no-config                   Ignore ./.rwconfig
  --vanilla                     Run R with --vanilla

Options (runtime):
  --runtime=[host]:[engine]     Runtime environment (default: 'deno:webr')
  --runtime-opt=[key]=[value]   Runtime-specific option (repeatable)
                                  shims=[shim][,[shim]] - comma-separated shims
                                  (default: runtime-opt in ./.rwconfig,
                                  or 'shims=install.packages')
  --r-libs-user=[host-dir]      Bind R user library to host directory
                                (read-only unless --persistent is set;
                                default: r-libs-user in ./.rwconfig)
  --bind=[host-dir]:[rwasm-dir][:mode] Bind host directory as a webR directory
                                (mode: 'ro' (read-only) or 'rw' (default))
                                (may be specified multiple times)
  --bastion=[host-dir][:mode]  Bind host directory available to prologue and
                                epilogue code at '/host/bastion', but not
                                the main code (mode: 'ro' (read-only) or 'rw')
                                (default: bastion in ./.rwconfig,
                                or './bastion/' if it exists)
  --prologue=[R script]         R script evaluated before main R code
  --epilogue=[R script]         R script evaluated after main R code
  --prologue-expr=[R code]      R code evaluated before main R code
                                (default: prologue-expr in ./.rwconfig)
  --epilogue-expr=[R code]      R code evaluated after main R code
                                (default: epilogue-expr in ./.rwconfig)
  --persistent                  Persist changes to host (required for 'install')

Options (evaluation):
  --expr=[R code]               R code to evaluate (multiple okay)
                                Alternative to specifying 'script.R'
  --timeout=[seconds]           Maximum evaluation time in seconds

Examples:

  rw --expr="sum(1:100)"
  rw <<< "1 + 2"
  echo "sum(1:100)" | rw
  rw main.R
  rw < main.R
  rw --expr="message('running script ...')" main.R

  # Interrupt after 3.5 seconds, if not completed
  rw --timeout=3.5 --expr="slow <- function() { Sys.sleep(5); 42 }" \
                   --expr="tryCatch(slow(), interrupt = identity)"

  # Configure R package library on host
  mkdir -p ~/R/wasm32-unknown-emscripten-library/4.5
  rw config set r-libs-user ~/R/wasm32-unknown-emscripten-library/4.5
  rw config get r-libs-user

  # Install a package persistently to package library on host
  rw --persistent install praise
  rw --persistent --expr="message(praise::praise())"

  # An R session with the R user library on host
  rw --persistent main.R

  # Evaluate untrusted R code in a runtime, with data passed in
  # and out via a bastion folder accessible only to prologue/epilogue
  mkdir -p bastion
  Rscript -e "saveRDS(list(a=1, b=2), 'bastion/in.rds')"
  rw \
    --prologue-expr="data_in <- readRDS('/host/bastion/in.rds')" \
    --epilogue-expr="saveRDS(data_out, '/host/bastion/out.rds')" \
    --expr="data_out <- lapply(data_in, sqrt)"
  Rscript -e "data_out <- readRDS('bastion/out.rds')" -e "utils::str(data_out)"

  # Show runtime environment (R/webR versions, resolved paths, etc.)
  rw env get webr-version
  rw env get r-version
  rw env list

  # Build a webR binary of an R package via Docker
  rw build --docker .
  rw build --docker .
  rw build --docker path/to/mypkg

Version: 0.0.300
JS Runtime: node 24.12.0
webR: 0.5.8
License: MIT
Author: Henrik Bengtsson
```

[webR]: https://github.com/r-wasm/webr/
[Node.js]: https://nodejs.org/en/
[Deno]: https://deno.com/
