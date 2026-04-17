# @henrikbengtsson/rw - Design and Implementation

This document provides a high-level overview of the `rw` project architecture,
API, and implementation details to assist future development and extensions.

## 1. Project Overview

`rw` is a CLI and JS library for evaluating R code in isolated environments,
primarily using **webR** (R compiled to WebAssembly) running under Node.js or
Deno.

### Core Philosophy

- **Privilege Separation**: The "Supervisor" (CLI) is responsible for
  orchestration, while the "Worker" actually runs the R environment.
- **Multi-Runtime**: Support for different host runtimes (Deno, Node.js) and
  engines (webR, and eventually Rscript, Docker).
- **Isolation by Default**: When running under Deno, the worker is spawned with
  minimal permissions (`--allow-read`, `--allow-write`, etc.) to provide high
  isolation.

---

## 2. Architecture

### Supervisor vs. Worker

- **Supervisor (`src/cli.js`)**:
  - Parses command-line arguments.
  - Validates the requested runtime format (`<host>:<engine>`).
  - Spawns the worker process using `node:child_process` (`spawn` or
    `spawnSync`).
  - Passes a "work specification" (JSON) to the worker via standard input or
    environment variables.
- **Worker (`src/rw_worker.js`)**:
  - Receives the work specification.
  - Initializes the R engine (e.g., `webR`).
  - Executes the requested R code.
  - Reports results back to the supervisor via standard output/error.

### File Structure

- `index.js`: Minimal public entry point (currently only exports `version`).
- `src/cli.js`: CLI implementation (Supervisor).
- `src/rw_session.js`: High-level JavaScript API (`RwSession` class).
- `src/rw_worker.js`: R execution engine (Worker).
- `deno.json`: Deno-specific configuration and task definitions.
- `package.json`: Node.js-specific configuration and dependencies.

---

## 3. Core APIs

### CLI Syntax

```bash
rw [options] [script.R] [-- args]
```

- `--runtime=<host>:<engine>`: (Default: `deno:webr`). Valid hosts: `deno`,
  `node`. Valid engines: `webr`.
- `--runtime-opt=<key>=<value>`: Runtime-specific configuration.
- `--expr="<R code>"`: Evaluate R code provided as a string.

### JS API (`RwSession`)

Located in `src/rw_session.js`. Although the public API is minimized in
`index.js`, the `RwSession` class provides the programmatic interface:

```javascript
import { RwSession } from "./src/rw_session.js";
const session = new RwSession();
await session.init();
const result = await session.eval_code("sum(1:100)");
console.log(result.output); // Array of {type: 'stdout'|'stderr', data: '...'}
```

---

## 4. Implementation Details

### Runtime Validation

The supervisor validates that the requested host is available on the `PATH`
before attempting to spawn the worker. Host-specific versions are standardizing
in verbose mode.

### Permission Mapping (Deno)

When using the `deno` host, `src/cli.js` maps the requested task (e.g., a simple
run vs. a persistent install) to the minimal set of Deno permissions:

- `deno_read_paths()`: Determines which host directories should be readable.
  - Includes all `--bind` and `--bastion` paths, and `r-libs-user`.
- `deno_write_paths()`: Determines which host directories should be writable.
  - Honors `:ro` (read-only) and `:rw` (read-write) suffixes on `--bind` and
    `--bastion`.
  - Only allows writing to `r-libs-user` if the `--persistent` flag is set.

### Shims

`rw` injects R shims (like `install.packages`) into the webR environment to make
it behave more like a standard R installation. These shims are defined in
`src/rw_session.js` and can be customized via `--runtime-opt shims=...`.

---

## 5. Extension Guidelines

### Adding a New Engine

1. Update `validate_runtime` in `src/cli.js` to recognize the new engine name.
2. Update `src/rw_worker.js` to handle initialization and execution for the new
   engine.
3. Add any necessary shims or environment setup in `src/rw_session.js`.

### Adding a New Host

1. Update `validate_runtime` in `src/cli.js` to recognize the new host name.
2. Implement a `[host]_spawn_worker` function in `src/cli.js` (e.g.,
   `docker_spawn_worker`).
3. Ensure the new host correctly handles the standard I/O communication protocol
   with the worker.

### Testing

- **CLI Tests**: `tests/cli_test.js` (unit tests for argument parsing and
  validation).
- **Integration Tests**:
  - `tests/node/`: Node.js-specific integration tests.
  - `tests/deno/`: Deno-specific integration tests.
- **JS API Tests**: `tests/deno/r_eval_test.js` (direct testing of `RwSession`).

Always add a reproduction test case when fixing a bug or adding a new feature.

---

## 6. Markdown Standards

- **README.md**: Never edit `README.md` directly. Always edit `_README.md.tmpl`
  and then run `make README.md` to regenerate it.
- **Consistency**: When editing documentation (`*.md`), use `markdownlint` to
  ensure consistency:

```bash
markdownlint --fix <file.md>
```
