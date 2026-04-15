#! /usr/bin/env node

/**
 * rw worker — Stage 2 of the rw two-stage architecture.
 *
 * Receives a JSON work spec on stdin from the supervisor (cli.js) and
 * executes the requested R/WASM/webR task.  This is the process that will
 * eventually be launched with restricted sandbox capabilities (e.g. under
 * Deno with limited --allow-* permissions).
 *
 * Work spec shapes:
 *
 *   { "task": "run",  "options": { debug, verbose, webr_args, r_libs_user,
 *                                  binds, bastion_host, shims,
 *                                  prologue_exprs, exprs, epilogue_exprs,
 *                                  timeout } }
 *
 *   { "task": "env",  "field": null | "webr-version" | "r-version" | "js-runtime" | "<field>" }
 */

// Under Deno, node:worker_threads.Worker instances do NOT inherit the parent's
// Deno permissions.  webR spawns its own internal Worker to run the R/WASM
// runtime, so that worker gets no --allow-net etc. even if this process does.
// Patch the constructor to forward permissions before webR ever imports it.
if (typeof globalThis.Deno !== "undefined") {
    // ESM namespace objects are sealed, so we go through createRequire to get
    // the mutable CJS exports object that npm packages (like webR) also use.
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const wt = req("node:worker_threads");
    const OrigWorker = wt.Worker;
    wt.Worker = class extends OrigWorker {
        constructor(filename, options = {}) {
            super(filename, { ...options, deno: { permissions: "inherit" } });
        }
    };
}

import { run, get_webr_version, get_r_version, get_r_info } from "./rw_session.js";

async function main() {
    // Read the entire work spec from stdin
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    const spec = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (spec.task === "run") {
        await run(spec.options);
    } else if (spec.task === "env") {
        if (spec.field === "webr-version") {
            console.log(await get_webr_version());
        } else if (spec.field === "r-version") {
            await get_r_version();
        } else if (spec.field === "js-runtime") {
            console.log(typeof globalThis.Deno !== "undefined" ? "deno" : "node");
        } else {
            // null → list all fields; any other string → get that field
            await get_r_info(spec.field);
        }
    } else {
        console.error(`ERROR: Unknown worker task: '${spec.task}'`);
        process.exit(1);
    }
}

main().then(() => {
    process.exit(0);
}).catch(e => {
    if (!e.r_error) console.error("ERROR: " + e.message);
    process.exit(1);
});
