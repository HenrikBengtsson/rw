[![Check](https://github.com/futureverse/rw/actions/workflows/check.yml/badge.svg)](https://github.com/futureverse/rw/actions/workflows/check.yml)

# rw: CLI for R with Multi-Runtime Support

_WARNING: This is work under development. I strongly recommend that
you do not depend on it at this time. Please do not publish a package
to NPM that depends on it._

## TL;DR

The `rw` tool is an Rscript-like command-line-interface (CLI) for running
R code in a variety of environments (runtimes), with two main purposes:

1. **Local webR Development:** Simplify running R code in **[webR]**
   locally, including building and testing R packages for webR
   compliance (via **[Node.js]** or **[Deno]**), e.g. `rw main.R`.

2. **Sandboxed Evaluation:** Run potentially untrusted R code in
   an isolated, **sandboxed** environment (via **[Deno]**), e.g. `rw
   --prologue=trusted.R untrusted.R`.


## Installation

The `rw` tool supports running **webR** via JavaScript runtimes
**Node.js** (`--runtime="node:webr"`) and **Deno**
(`--runtime="deno:webr"`), but it is only the latter that provides a
sandboxed environment.

### Recommended (Deno)

If you already have **Deno** installed (try `deno --version`), we
recommend to install `rw` that way:

```sh
deno install --global --allow-all npm:@henrikbengtsson/rw
```

The `rw` executable is installed to `~/.deno/bin/`. Prepend that to
your `PATH`, e.g. add `export PATH=~/.deno/bin:$PATH` to the end of
your `~/.bashrc` file.

### Alternative (Node.js)

If you don't have, or don't want to install, Deno, but have
**Node.js** installed (try `node --version`), install `rw` as:

```sh
npm install --global @henrikbengtsson/rw
```

The `rw` executable is installed to the `bin/` subfolder under `npm
config get prefix`. Prepend that to your `PATH`, e.g. add `export
PATH=$(npm config get prefix)/bin:$PATH` to the end of your
`~/.bashrc` file.

**Important 1**: When using `rw` without Deno, you have to specify
command-line option `--runtime="node:webr"` in each `rw` call.

**Important 2**: The Node.js runtime does **not** provide a
sandboxed environment. It should only be used with trusted code.


## Getting started ("Hello world")

First, make sure you have the `rw` tool on your search path - see
above installation on setting up `PATH` - it'll make your life
easier. To verify it works, open a terminal and call:

```bash
rw --version
```

It will output the version of the install **rw** tool. When that
works, verify that the following works:

```bash
$ rw --expr="sum(1:100)"
[1] 5050
```


## Local webR Development

The `rw` tool simplifies running R code in **[webR]** locally without
a browser. This is useful for building, installing, and testing R code
and packages for webR compliance, especially in CI/CD pipelines.

```bash
$ rw --runtime="node:webr" \
     --expr='install.packages("praise")' \
     --expr='message(praise::praise())'
Downloading webR package: praise
You are kickass!
```

Note that the **webR** environment is _ephemeral_, which means that it
has no memory across session. The default is that packages are only
installed to this temporary environment to be used for the life time
of the **webR** session (i.e. a single `rw` call). It is possible to
install packages permanently on the host file system such that you
don't have to re-install packages each time. This can be done by using
`rw --persistent --r-libs-user=<path> ...`.


## Sandboxed Evaluation

`rw` leverages the [sandboxing and isolation
features](https://docs.deno.com/runtime/fundamentals/security/) of
**[Deno]** to provide a robust **sandbox** for R code. This is the
recommended way to run potentially untrusted R code that might attempt
to access your local files, your secrets, use your internet
connection, impersonate you, and so on.

```sh
rw --runtime="deno:webr" \
   --prologue=trusted.R \
   untrusted.R
```

If left out, the default is `--runtime="deno:webr"`.


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
  --allow-net[=host[,...]]      Allow network access (Deno runtime only)
                                (default: none, unless 'install' is used)
  --allow-run[=bin[,...]]       Allow running subprocesses (Deno runtime only)
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
  --env=VAR                     Set environment variable VAR from current environment
  --env=VAR=value               Set environment variable VAR to value

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

Version: 0.0.400
JS Runtime: deno 2.7.12
webR: 0.5.9
License: MIT
Author: Henrik Bengtsson
```

[webR]: https://github.com/r-wasm/webr/
[Node.js]: https://nodejs.org/en/
[Deno]: https://deno.com/
