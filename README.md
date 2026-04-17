[![Check](https://github.com/futureverse/rw/actions/workflows/check.yml/badge.svg)](https://github.com/futureverse/rw/actions/workflows/check.yml)

# rw: CLI for webR with Sandboxing Features

_This is work in-progress - it only works partially. Please come back later._


## TL;DR

The `rw` tool is an Rscript-like command-line-interface (CLI)
for running R code in a sandboxed WebAssembly environment via **[webR]**
using **[Deno]** (for high isolation) or **[Node.js]** (for partial isolation), e.g.

```sh
$ rw --r-libs=~/R/webR --prologue=trusted.R untrusted.R
```

This can be useful when we need to evaluate arbitrary, untrusted R
code in a secure manner isolated from the host system. It is also
useful for making sure R code and R packages work in **webR** without
having to go the extra mile to upload packages online and then testing
it in the web browser at <https://webr.sh/>.

See [js/README.md](./js/README.md) for further details.

See [r/README.md](./r/README.md) for an R package API.

[webR]: https://github.com/r-wasm/webr/
[Deno]: https://deno.com/
[Node.js]: https://nodejs.org/en/
