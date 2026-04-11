#! /usr/bin/env node

import {
    version,
    author,
    license,
    normalize_path,
    read_code,
    run,
    get_webr_version,
    get_r_version,
    get_r_info
} from "./rw_session.js";

function show_help() {
    console.log(`
rw: CLI for webR with Sandboxing Features

Usage:

  rw [rwasm options] <script.R> [args]

RWasm options:

  --help                        Show this help
  --version                     Show version
  --webr-version                Show webR version
  --r-version                   Show R version
  --debug                       Show debug output
  --vanilla                     Run webR with --vanilla
  --config                      Show all R configuration settings
  --config=<field>              Show value of a specific configuration field
  --r-libs=<host-dir>           Bind R user library to host directory
                                (default: '$RW_R_LIBS_USER')
  --bind=<host-dir>:<rwasm-dir> Bind host directory as a webR directory
                                (may be specified multiple times)
  --shims=<shims>               Comma-separated set of shims
                                (default: '$RW_SHIMS'; 'install.packages')
  --stage=<host-dir>            Bind host directory available to prologue and
                                epilogue code at '/host/stage', but not
                                the main code (default: '$RW_STAGE')
  --prologue=<R script>         R script evaluated before main R code
  --epilogue=<R script>         R script evaluated after main R code
  --prologue-expr=<R code>      R code evaluated before main R code
  --epilogue-expr=<R code>      R code evaluated after main R code
  --expr=<R code>               R code to evaluate (multiple okay)
                                Alternative to specifying 'script.R'
  --timeout=<seconds>           Maximum evaluation time in seconds, before
                                signaling an interrupt to R.

Examples:

  rw --expr="sum(1:100)"

  rw main.R

  ## Time out after 3.5 seconds
  rw --timeout=3.5 --expr="slow <- function() { Sys.sleep(5); 42 }" \\
                   --expr="tryCatch(slow(), interrupt = identity)"

  ## An R session with the R user library on host
  rw --config=rw_suggestions:RW_R_LIBS_USER  ## display default library path
  rw --r-libs=~/R/wasm32-unknown-emscripten-library/4.5 main.R
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw main.R

  ## Install a package (non-persistent)
  rw --expr="install.packages('praise')" --expr="message(praise::praise())"

  ## Install a package (persistently on host)
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr="install.packages('praise')"
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr="message(praise::praise())"


  ## Evaluate parts of the R code that is untrusted in R WASM, with
  ## data passed in and out via a stage folder that trusted prologue
  ## and epilogue code has access to, but not the main code
  mkdir -p stage
  Rscript -e "saveRDS(list(a=1, b=2), 'stage/in.rds')"
  rw \\
    --stage=stage \\
    --prologue-expr="data_in <- readRDS('/host/stage/in.rds')" \\
    --epilogue-expr="saveRDS(data_out, '/host/stage/out.rds')" \\
    --expr="data_out <- lapply(data_in, sqrt)"
  Rscript -e "data_out <- readRDS('stage/out.rds')" -e "utils::str(data_out)"

Version: ${version}
License: ${license}
Author: ${author}
`);
}

/**
 * Parse CLI arguments into run options
 * @param {string[]} args - CLI arguments
 * @returns {Object} Parsed options and flags
 */
export function parse_args(args) {
    const options = {
        debug: false,
        webr_args: [],
        r_libs_host: null,
        binds: [],
        stage_host: null,
        shims: [],
        prologue_exprs: [],
        exprs: [],
        epilogue_exprs: [],
        timeout: 0,
        r_args: []
    };

    const flags = {
        help: false,
        version: false,
        webr_version: false,
        r_version: false,
        config: false,
        config_field: null
    };

    let r_script = null;
    let r_prologue_script = null;
    let r_epilogue_script = null;

    for (const arg of args) {
        let prefix, value;

        if (arg === "--help") {
            flags.help = true;
        } else if (arg === "--version") {
            flags.version = true;
        } else if (arg === "--webr-version") {
            flags.webr_version = true;
        } else if (arg === "--r-version") {
            flags.r_version = true;
        } else if (arg === "--config") {
            flags.config = true;
        } else if (arg.startsWith((prefix = "--config="))) {
            flags.config = true;
            flags.config_field = arg.slice(prefix.length);
        } else if (arg === "--debug") {
            options.debug = true;
        } else if (arg === "--vanilla") {
            options.webr_args.push(arg);
        } else if (arg.startsWith((prefix = "--expr="))) {
            value = arg.slice(prefix.length);
            if (options.debug) console.log(`expr=${value}`);
            options.exprs.push(value);
        } else if (arg.startsWith((prefix = "--shims="))) {
            value = arg.slice(prefix.length);
            value = value.split(",");
            options.shims.push(...value);
        } else if (arg.startsWith((prefix = "--prologue-expr="))) {
            value = arg.slice(prefix.length);
            if (options.debug) console.log(`prologue_expr=${value}`);
            options.prologue_exprs.push(value);
        } else if (arg.startsWith((prefix = "--epilogue-expr="))) {
            value = arg.slice(prefix.length);
            if (options.debug) console.log(`epilogue_expr=${value}`);
            options.epilogue_exprs.push(value);
        } else if (arg.startsWith((prefix = "--r-libs="))) {
            value = arg.slice(prefix.length);
            options.r_libs_host = normalize_path(value, "host directory");
            if (options.debug) console.log(`r_libs_host=${options.r_libs_host}`);
        } else if (arg.startsWith((prefix = "--bind="))) {
            value = arg.slice(prefix.length);
            const parts = value.split(":");
            if (parts.length === 1) parts.push(parts[0]);
            normalize_path(parts[0], "host directory");
            options.binds.push({ host: parts[0], webr: parts[1] });
            if (options.debug) console.log(`Add bind=${value}`);
        } else if (arg.startsWith((prefix = "--stage="))) {
            value = arg.slice(prefix.length);
            options.stage_host = normalize_path(value, "host directory");
            if (options.debug) console.log(`stage_host=${options.stage_host}`);
        } else if (arg.startsWith((prefix = "--prologue="))) {
            value = arg.slice(prefix.length);
            r_prologue_script = normalize_path(value, "host file");
            if (options.debug) console.log(`r_prologue_script=${r_prologue_script}`);
        } else if (arg.startsWith((prefix = "--epilogue="))) {
            value = arg.slice(prefix.length);
            r_epilogue_script = normalize_path(value, "host file");
            if (options.debug) console.log(`r_epilogue_script=${r_epilogue_script}`);
        } else if (arg.startsWith((prefix = "--timeout="))) {
            value = arg.slice(prefix.length);
            options.timeout = parseFloat(value);
            if (isNaN(options.timeout) || options.timeout < 0) {
                throw new Error("Timeout must be a non-negative number of seconds: " + value);
            }
            if (options.debug) console.log(`timeout=${options.timeout}`);
        } else {
            if (options.exprs.length === 0 && r_script === null) {
                r_script = normalize_path(arg, "host file");
                if (options.debug) console.log(`r_script=${r_script}`);
            } else {
                if (options.r_args.length === 0) options.r_args.push("--args");
                options.r_args.push(arg);
            }
        }
    }

    // Add r_args to webr_args
    options.webr_args.push(...options.r_args);

    // Process scripts
    if (options.exprs.length > 0 && r_script !== null) {
        throw new Error("R script must not be specified when R expressions are specified");
    } else if (r_script !== null) {
        options.exprs = read_code(r_script, "main", options.debug);
    }

    if (options.prologue_exprs.length > 0 && r_prologue_script !== null) {
        throw new Error("R prologue script must not be specified when R prologue expressions are specified");
    } else if (r_prologue_script !== null) {
        options.prologue_exprs = read_code(r_prologue_script, "prologue", options.debug);
    }

    if (options.epilogue_exprs.length > 0 && r_epilogue_script !== null) {
        throw new Error("R epilogue script must not be specified when R epilogue expressions are specified");
    } else if (r_epilogue_script !== null) {
        options.epilogue_exprs = read_code(r_epilogue_script, "epilogue", options.debug);
    }

    // Apply environment variables
    if (options.r_libs_host === null) {
        options.r_libs_host = process.env.RW_R_LIBS_USER || null;
    }

    if (options.stage_host === null) {
        options.stage_host = process.env.RW_STAGE || null;
    }

    // Apply default shims
    if (options.shims.length === 0) {
        if (options.debug) console.log("Using default R shims ...");
        const env_shims = process.env.RW_SHIMS;
        if (env_shims) {
            if (options.debug) console.log("RW_SHIMS: '" + env_shims + "'");
            options.shims = env_shims.split(",").filter(str => str !== "");
        } else {
            options.shims = ["install.packages"];
        }
    } else {
        options.shims = options.shims.filter(str => str !== "");
    }

    return { options, flags };
}

/**
 * CLI entry point
 */
async function main() {
    const args = process.argv.slice(2);

    let parsed;
    try {
        parsed = parse_args(args);
    } catch (e) {
        console.error("ERROR: " + e.message);
        process.exit(1);
    }

    const { options, flags } = parsed;

    // Handle flags that exit early
    if (flags.help) {
        show_help();
        process.exit(0);
    }

    if (flags.version) {
        console.log(version);
        process.exit(0);
    }

    if (flags.webr_version) {
        console.log(await get_webr_version());
        process.exit(0);
    }

    if (flags.r_version) {
        await get_r_version();
        process.exit(0);
    }

    if (flags.config) {
        await get_r_info(flags.config_field);
        process.exit(0);
    }

    // Show help if no code to run
    if (options.exprs.length === 0) {
        show_help();
        process.exit(0);
    }

    // Run
    try {
        await run(options);
    } catch (e) {
        console.error("ERROR: " + e.message);
        process.exit(1);
    }

    process.exit(0);
}

// Run CLI
main();
