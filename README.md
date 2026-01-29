# rw: CLI for webR with Sandboxing Features

_This is work in-progress - it only works partially. Please come back later._


## TL;DR

The `rw` tools is an Rscript-like command-line-interface (CLI) tool
for running R code in a sandboxed WebAssembly environment via Node.js
and **[webR]**, e.g.

```sh
$ rw --r-libs=~/R/webR --prologue=trusted.R untrusted.R
```

This can be useful when we need to evaluate arbitrary, untrusted R
code in a secure manner isolated from the host system. It is also
useful for making sure R code and R packages work in **webR** without
having to go the extra mile to upload packages online and then testing
it in the web browser at <https://webr.sh/>.

See [node/README.md](./node/README.md) for further details.

See [r/README.md](./r/README.md) for an R package API.

[webR]: https://github.com/r-wasm/webr/
