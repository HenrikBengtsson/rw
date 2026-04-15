#! /usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    version,
    author,
    license,
    normalize_path,
    read_code
} from "./rw_session.js";

// Reconstruct __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_RWCONFIG_PATH = path.join(os.homedir(), ".rwconfig");

/**
 * Walk up from CWD looking for .rwconfig. Returns the path if found,
 * otherwise falls back to ./.rwconfig (for write operations that create it).
 * @returns {string}
 */
function find_project_rwconfig() {
    let dir = process.cwd();
    while (true) {
        const candidate = path.join(dir, ".rwconfig");
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break; // filesystem root
        dir = parent;
    }
    return path.join(process.cwd(), ".rwconfig");
}

const RWCONFIG_PATH = find_project_rwconfig();

/**
 * Load a rwconfig file (key=value). Lines starting with '#' and blank lines
 * are ignored. Returns an empty object if the file does not exist.
 * @param {string} file_path
 * @returns {Object} Parsed config fields
 */
function load_rwconfig(file_path) {
    if (!fs.existsSync(file_path)) return {};
    const config = {};
    for (const line of fs.readFileSync(file_path, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        config[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return config;
}

/**
 * Load and merge ~/.rwconfig (user) and ./.rwconfig (project), with project
 * taking precedence. Returns merged config and per-key provenance labels.
 * @returns {{ config: Object, provenance: Object }}
 */
function load_all_rwconfigs() {
    const user    = load_rwconfig(USER_RWCONFIG_PATH);
    const project = load_rwconfig(RWCONFIG_PATH);
    const config = {};
    const provenance = {};
    for (const [k, v] of Object.entries(user))    { config[k] = v; provenance[k] = "~/.rwconfig"; }
    for (const [k, v] of Object.entries(project)) { config[k] = v; provenance[k] = "./.rwconfig"; }
    return { config, provenance };
}

/**
 * Write (or update) a single field in a rwconfig file.
 * @param {string} field
 * @param {string} value
 * @param {string} file_path
 */
function write_rwconfig(field, value, file_path = RWCONFIG_PATH) {
    let content = fs.existsSync(file_path)
        ? fs.readFileSync(file_path, "utf8")
        : "";
    const lines = content.split("\n");
    let found = false;
    const updated = lines.map(line => {
        const trimmed = line.trim();
        const eq = trimmed.indexOf("=");
        if (eq !== -1 && trimmed.slice(0, eq).trim() === field) {
            found = true;
            return `${field}=${value}`;
        }
        return line;
    });
    if (found) {
        fs.writeFileSync(file_path, updated.join("\n"), "utf8");
    } else {
        if (content && !content.endsWith("\n")) content += "\n";
        fs.writeFileSync(file_path, content + `${field}=${value}\n`, "utf8");
    }
}

/**
 * Remove a field from a rwconfig file. Returns true if the field was found.
 * @param {string} field
 * @param {string} file_path
 * @returns {boolean}
 */
function unset_rwconfig(field, file_path = RWCONFIG_PATH) {
    if (!fs.existsSync(file_path)) return false;
    const lines = fs.readFileSync(file_path, "utf8").split("\n");
    let found = false;
    const updated = lines.filter(line => {
        const trimmed = line.trim();
        const eq = trimmed.indexOf("=");
        if (eq !== -1 && trimmed.slice(0, eq).trim() === field) {
            found = true;
            return false;
        }
        return true;
    });
    if (found) fs.writeFileSync(file_path, updated.join("\n"), "utf8");
    return found;
}

/**
 * Validate a sandbox value, throwing if unsupported.
 * @param {string} value
 */
function validate_sandbox(value) {
    if (value !== "webr") {
        throw new Error(`Unknown sandbox: '${value}'. Only 'webr' is supported.`);
    }
}

/**
 * Spawn the worker under Node.js.
 * The child inherits the parent process's capabilities — no privilege
 * separation, but correct for plain Node usage.
 * @param {string} worker_path
 * @param {Object} spec
 * @returns {Promise<number>} Worker exit code
 */
async function node_spawn_worker(worker_path, spec) {
    return new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, [worker_path], {
            stdio: ["pipe", "inherit", "inherit"]
        });
        proc.stdin.write(JSON.stringify(spec), "utf8");
        proc.stdin.end();
        proc.on("error", reject);
        proc.on("close", code => resolve(code ?? 0));
    });
}

/**
 * Derive the minimal Deno --allow-read paths needed by the worker.
 * Always includes the package directory (worker + session scripts,
 * node_modules/webr).  Adds any host paths referenced in the spec.
 * @param {Object} spec
 * @returns {string[]}
 */
function deno_read_paths(spec) {
    // /dev is needed by webR's Emscripten runtime for stdio setup (/dev/stdin etc.)
    const paths = [__dirname, "/dev"];
    if (spec.task === "run") {
        const o = spec.options;
        if (o.r_libs_user)  paths.push(o.r_libs_user);
        if (o.bastion_host) paths.push(o.bastion_host);
        for (const bind of (o.binds ?? [])) paths.push(bind.host);
    }
    return paths;
}

/**
 * Derive the minimal Deno --allow-write paths needed by the worker.
 * __dirname is always required: webR's WASM runtime writes to the package dir.
 * r_libs_user (and /tmp) are added for persistent package installs.
 * @param {Object} spec
 * @returns {string[]}
 */
function deno_write_paths(spec) {
    // webR's internal worker_threads.Worker writes to the package directory
    // even for basic R evaluation (e.g. compiled WASM module caches).
    // /dev is needed by webR's Emscripten runtime for stdio setup (/dev/stdin etc.)
    const paths = [__dirname, "/dev"];
    if (spec.task === "run" && spec.options.r_libs_user) {
        paths.push(spec.options.r_libs_user);
        paths.push("/tmp");  // webR writes temp files during package download/extraction
    }
    return paths;
}

/**
 * Spawn the worker under Deno using Deno.Command with explicit, minimal
 * permissions derived from the work spec.  The child does NOT inherit the
 * supervisor's permission set — this is the privilege-separation boundary.
 * @param {string} worker_path
 * @param {Object} spec
 * @returns {Promise<number>} Worker exit code
 */
async function deno_spawn_worker(worker_path, spec) {
    const read_paths  = deno_read_paths(spec);
    const write_paths = deno_write_paths(spec);
    const needs_net   = spec.task === "run" && !!spec.options?.r_libs_user;

    const args = [
        "run",
        "--allow-env",
        "--allow-sys",
        `--allow-read=${read_paths.join(",")}`,
        `--allow-write=${write_paths.join(",")}`,
    ];
    if (needs_net) {
        args.push("--allow-net");  // needed to download packages when --persistent
        args.push("--allow-run");  // needed to spawn tar for package extraction
    }
    args.push(worker_path);

    // Use globalThis.Deno so this file remains parseable under Node.js
    if (spec.options?.debug) process.stderr.write(`[deno_spawn_worker] ${[globalThis.Deno.execPath(), ...args].join(" ")}\n`);
    const cmd = new globalThis.Deno.Command(globalThis.Deno.execPath(), {
        args,
        stdin:  "piped",
        stdout: "inherit",
        stderr: "inherit"
    });

    const proc   = cmd.spawn();
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(spec)));
    await writer.close();
    const { code } = await proc.status;
    return code;
}

/**
 * Spawn the worker (Stage 2) with a JSON work spec on its stdin.
 * Dispatches to deno_spawn_worker (privilege-separated) when running under
 * Deno, and node_spawn_worker (inherited capabilities) under Node.js.
 * @param {Object} spec - Work spec for the worker
 * @returns {Promise<number>} Worker exit code
 */
async function spawn_worker(spec) {
    const worker_path = path.join(__dirname, "rw_worker.js");
    if (typeof globalThis.Deno !== "undefined") {
        return deno_spawn_worker(worker_path, spec);
    }
    return node_spawn_worker(worker_path, spec);
}

/**
 * Extract only the fields that the worker's run() needs from parsed options.
 * @param {Object} options - Full parsed options from parse_args()
 * @returns {Object} Minimal run spec for the worker
 */
function make_run_spec(options) {
    return {
        debug:          options.debug,
        verbose:        options.verbose,
        webr_args:      options.webr_args,
        r_libs_user:    options.r_libs_user,
        binds:          options.binds,
        bastion_host:   options.bastion_host,
        shims:          options.shims,
        prologue_exprs: options.prologue_exprs,
        exprs:          options.exprs,
        epilogue_exprs: options.epilogue_exprs,
        timeout:        options.timeout
    };
}

function show_help() {
    console.log(`
rw: CLI for Sandboxed R Execution

Usage:

  rw [options] <script.R> [args]
  rw [options] --expr="..."
  rw [options] < script.R
  rw [options] --persistent install <pkg> [pkg ...]
  rw [options] --persistent install --docker <dir> [dir ...]
  rw [options] --persistent uninstall <pkg> [pkg ...]
  rw build --docker [<dir>]
  rw env list
  rw env get <field>
  rw config [--local] list
  rw config [--local] get <field>
  rw config [--local] set <field> <value>
  rw config [--local] unset <field>
  rw config --global list
  rw config --global get <field>
  rw config --global set <field> <value>
  rw config --global unset <field>

Options (general):
  --help                        Show this help
  --version                     Show version
  --verbose                     Show progress messages
  --debug                       Show debug output
  --no-config                   Ignore ./.rwconfig
  --vanilla                     Run R with --vanilla

Options (sandboxing):
  --sandbox=<sandbox>           Sandbox runtime (default: 'webr')
  --sandbox-opt=<key>=<value>   Sandbox-specific option (repeatable)
                                  shims=<shim>[,<shim>] — comma-separated shims
                                  (default: sandbox-opt in ./.rwconfig,
                                  or 'shims=install.packages')
  --r-libs-user=<host-dir>      Bind R user library to host directory
                                (only active with --persistent;
                                default: r-libs-user in ./.rwconfig)
  --bind=<host-dir>:<rwasm-dir> Bind host directory as a webR directory
                                (may be specified multiple times)
  --bastion=<host-dir>          Bind host directory available to prologue and
                                epilogue code at '/host/bastion', but not
                                the main code (default: bastion in ./.rwconfig,
                                or './bastion/' if it exists)
  --prologue=<R script>         R script evaluated before main R code
  --epilogue=<R script>         R script evaluated after main R code
  --prologue-expr=<R code>      R code evaluated before main R code
                                (default: prologue-expr in ./.rwconfig)
  --epilogue-expr=<R code>      R code evaluated after main R code
                                (default: epilogue-expr in ./.rwconfig)
  --persistent                  Persist changes to host (required for 'install')

Options (evaluation):
  --expr=<R code>               R code to evaluate (multiple okay)
                                Alternative to specifying 'script.R'
  --timeout=<seconds>           Maximum evaluation time in seconds

Examples:

  rw --expr="sum(1:100)"
  rw <<< "1 + 2"
  echo "sum(1:100)" | rw
  rw main.R
  rw < main.R
  rw --expr="message('running script ...')" main.R

  ## Interrupt after 3.5 seconds, if not completed
  rw --timeout=3.5 --expr="slow <- function() { Sys.sleep(5); 42 }" \\
                   --expr="tryCatch(slow(), interrupt = identity)"

  ## Configure R package library on host
  mkdir -p ~/R/wasm32-unknown-emscripten-library/4.5
  rw config set r-libs-user ~/R/wasm32-unknown-emscripten-library/4.5
  rw config get r-libs-user

  ## Install a package persistently to package library on host
  rw --persistent install praise
  rw --persistent --expr="message(praise::praise())"

  ## An R session with the R user library on host
  rw --persistent main.R

  ## Evaluate untrusted R code in sandbox, with data passed in
  ## and out via a bastion folder accessible only to prologue/epilogue
  mkdir -p bastion
  Rscript -e "saveRDS(list(a=1, b=2), 'bastion/in.rds')"
  rw \\
    --prologue-expr="data_in <- readRDS('/host/bastion/in.rds')" \\
    --epilogue-expr="saveRDS(data_out, '/host/bastion/out.rds')" \\
    --expr="data_out <- lapply(data_in, sqrt)"
  Rscript -e "data_out <- readRDS('bastion/out.rds')" -e "utils::str(data_out)"

  ## Show runtime environment (R/webR versions, resolved paths, etc.)
  rw env get webr-version
  rw env get r-version
  rw env list

  ## Build a webR binary of an R package via Docker
  rw build --docker .
  rw build --docker path/to/mypkg

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
        verbose: false,
        no_config: false,
        sandbox: null,
        webr_args: [],
        r_libs_user: null,
        binds: [],
        bastion_host: null,
        persistent: false,
        shims: [],
        prologue_exprs: [],
        exprs: [],
        epilogue_exprs: [],
        timeout: 0,
        r_args: []
    };

    const flags = {
        help: false,
        version: false
    };

    const command = {
        type: null,      // null | "env" | "config" | "install" | "uninstall" | "build"
        action: null,    // "list" | "get" | "set" | "unset"
        scope: null,     // null (unset) | "local" (./.rwconfig) | "global" (~/.rwconfig)
        field: null,
        value: null,
        install_packages: [],
        install_docker: false,
        uninstall_packages: [],
        build_path: null,
        build_docker: false
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
        } else if (arg === "--persistent") {
            options.persistent = true;
        } else if (arg === "--debug") {
            options.debug = true;
        } else if (arg === "--verbose") {
            options.verbose = true;
        } else if (arg === "--no-config") {
            options.no_config = true;
        } else if (arg === "--vanilla") {
            options.webr_args.push(arg);
        } else if (arg.startsWith((prefix = "--expr="))) {
            value = arg.slice(prefix.length);
            if (options.debug) console.log(`expr=${value}`);
            options.exprs.push(value);
        } else if (arg.startsWith((prefix = "--sandbox="))) {
            value = arg.slice(prefix.length);
            options.sandbox = value;  // explicit CLI flag
        } else if (arg.startsWith((prefix = "--sandbox-opt="))) {
            value = arg.slice(prefix.length);
            const eq = value.indexOf("=");
            if (eq === -1) {
                throw new Error(`Invalid --sandbox-opt format: '${value}'. Expected key=value.`);
            }
            const key = value.slice(0, eq);
            const val = value.slice(eq + 1);
            if (key === "shims") {
                options.shims.push(...val.split(","));
            } else {
                throw new Error(`Unknown --sandbox-opt key: '${key}'`);
            }
        } else if (arg.startsWith((prefix = "--prologue-expr="))) {
            value = arg.slice(prefix.length);
            if (options.debug) console.log(`prologue_expr=${value}`);
            options.prologue_exprs.push(value);
        } else if (arg.startsWith((prefix = "--epilogue-expr="))) {
            value = arg.slice(prefix.length);
            if (options.debug) console.log(`epilogue_expr=${value}`);
            options.epilogue_exprs.push(value);
        } else if (arg.startsWith((prefix = "--r-libs-user="))) {
            value = arg.slice(prefix.length);
            options.r_libs_user = value;
            if (options.debug) console.log(`r_libs_user=${options.r_libs_user}`);
        } else if (arg.startsWith((prefix = "--bind="))) {
            value = arg.slice(prefix.length);
            const parts = value.split(":");
            if (parts.length === 1) parts.push(parts[0]);
            options.binds.push({ host: parts[0], webr: parts[1] });
            if (options.debug) console.log(`Add bind=${value}`);
        } else if (arg.startsWith((prefix = "--bastion="))) {
            value = arg.slice(prefix.length);
            options.bastion_host = value;
            if (options.debug) console.log(`bastion_host=${options.bastion_host}`);
        } else if (arg.startsWith((prefix = "--prologue="))) {
            value = arg.slice(prefix.length);
            r_prologue_script = value;
            if (options.debug) console.log(`r_prologue_script=${r_prologue_script}`);
        } else if (arg.startsWith((prefix = "--epilogue="))) {
            value = arg.slice(prefix.length);
            r_epilogue_script = value;
            if (options.debug) console.log(`r_epilogue_script=${r_epilogue_script}`);
        } else if (arg.startsWith((prefix = "--timeout="))) {
            value = arg.slice(prefix.length);
            options.timeout = parseFloat(value);
            if (isNaN(options.timeout) || options.timeout < 0) {
                throw new Error("Timeout must be a non-negative number of seconds: " + value);
            }
            if (options.debug) console.log(`timeout=${options.timeout}`);
        } else {
            if (command.type === "install") {
                if (arg === "--docker") {
                    command.install_docker = true;
                } else {
                    // package name or local path
                    command.install_packages.push(arg);
                }
            } else if (command.type === "uninstall") {
                command.uninstall_packages.push(arg);
            } else if (command.type === null && options.exprs.length === 0 && r_script === null) {
                if (arg === "env") {
                    command.type = "env";
                } else if (arg === "config") {
                    command.type = "config";
                } else if (arg === "install") {
                    command.type = "install";
                } else if (arg === "uninstall") {
                    command.type = "uninstall";
                } else if (arg === "build") {
                    command.type = "build";
                } else {
                    r_script = arg;
                    if (options.debug) console.log(`r_script=${r_script}`);
                }
            } else if (command.type === "env") {
                if (arg === "list") {
                    command.action = "list";
                } else if (arg === "get") {
                    command.action = "get";
                } else if (command.action === "get" && command.field === null) {
                    command.field = arg;
                } else {
                    throw new Error(`Unexpected argument for 'rw env': ${arg}`);
                }
            } else if (command.type === "config") {
                if (arg === "--local") {
                    command.scope = "local";
                } else if (arg === "--global") {
                    command.scope = "global";
                } else if (arg === "list") {
                    command.action = "list";
                } else if (arg === "get") {
                    command.action = "get";
                } else if (arg === "set") {
                    command.action = "set";
                } else if (arg === "unset") {
                    command.action = "unset";
                } else if (command.action === "get" && command.field === null) {
                    command.field = arg;
                } else if (command.action === "unset" && command.field === null) {
                    command.field = arg;
                } else if (command.action === "set" && command.field === null) {
                    command.field = arg;
                } else if (command.action === "set" && command.value === null) {
                    command.value = arg;
                } else {
                    throw new Error(`Unexpected argument for 'rw config': ${arg}`);
                }
            } else if (command.type === "build") {
                if (arg === "--docker") {
                    command.build_docker = true;
                } else if (command.build_path === null) {
                    command.build_path = arg;
                } else {
                    throw new Error(`Unexpected argument for 'rw build': ${arg}`);
                }
            } else {
                if (options.r_args.length === 0) options.r_args.push("--args");
                options.r_args.push(arg);
            }
        }
    }

    // Add r_args to webr_args
    options.webr_args.push(...options.r_args);

    // Apply rwconfig defaults (raw values; lower precedence than CLI flags)
    const rwconfig = options.no_config ? {} : load_all_rwconfigs().config;
    if (!options.no_config) {
        if (options.sandbox === null && rwconfig["sandbox"]) {
            options.sandbox = rwconfig["sandbox"];
            if (options.debug) console.log(`sandbox=${options.sandbox} (from .rwconfig)`);
        }
        if (options.r_libs_user === null && rwconfig["r-libs-user"]) {
            options.r_libs_user = rwconfig["r-libs-user"];
            if (options.debug) console.log(`r_libs_user=${options.r_libs_user} (from .rwconfig)`);
        }
        if (options.bastion_host === null && rwconfig["bastion"]) {
            options.bastion_host = rwconfig["bastion"];
            if (options.debug) console.log(`bastion_host=${options.bastion_host} (from .rwconfig)`);
        }
        if (options.prologue_exprs.length === 0 && r_prologue_script === null && rwconfig["prologue-expr"]) {
            options.prologue_exprs.push(rwconfig["prologue-expr"]);
            if (options.debug) console.log(`prologue_expr=${rwconfig["prologue-expr"]} (from .rwconfig)`);
        }
        if (options.epilogue_exprs.length === 0 && r_epilogue_script === null && rwconfig["epilogue-expr"]) {
            options.epilogue_exprs.push(rwconfig["epilogue-expr"]);
            if (options.debug) console.log(`epilogue_expr=${rwconfig["epilogue-expr"]} (from .rwconfig)`);
        }
    }
    if (options.sandbox === null) options.sandbox = "webr";

    // Verbose: report which config files are in use
    if (options.verbose && !options.no_config) {
        if (fs.existsSync(USER_RWCONFIG_PATH)) {
            console.error(`Using ${USER_RWCONFIG_PATH}`);
        }
        if (fs.existsSync(RWCONFIG_PATH) && path.resolve(RWCONFIG_PATH) !== path.resolve(USER_RWCONFIG_PATH)) {
            const rel = path.relative(process.cwd(), RWCONFIG_PATH);
            console.error(`Using ${rel}`);
        }
    }

    // r-libs-user is only honoured when --persistent is set
    if (!options.persistent) {
        if (options.r_libs_user !== null && options.debug) {
            console.log("Ignoring r-libs-user (requires --persistent)");
        }
        options.r_libs_user = null;
    }

    // Bastion fallback
    if (options.bastion_host === null && fs.existsSync("bastion")) {
        options.bastion_host = "bastion";
    }

    // /dev/stdin is a special file that Deno cannot open via readFileSync
    // without --allow-all.  Treat it as an alias for stdin (fd 0).
    if (r_script === "/dev/stdin") r_script = null;
    if (r_prologue_script === "/dev/stdin") r_prologue_script = null;
    if (r_epilogue_script === "/dev/stdin") r_epilogue_script = null;

    // Normalize all paths now that all sources have been considered
    if (r_script !== null) r_script = normalize_path(r_script, "host file");
    if (r_prologue_script !== null) r_prologue_script = normalize_path(r_prologue_script, "host file");
    if (r_epilogue_script !== null) r_epilogue_script = normalize_path(r_epilogue_script, "host file");
    if (options.r_libs_user !== null) options.r_libs_user = normalize_path(options.r_libs_user, "host directory");
    if (options.bastion_host !== null) options.bastion_host = normalize_path(options.bastion_host, "host directory");
    for (const bind of options.binds) bind.host = normalize_path(bind.host, "host directory");

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

    // Apply default shims (from .rwconfig, then built-in default)
    if (options.shims.length === 0) {
        if (!options.no_config) {
            const rwconfig_opt = rwconfig["sandbox-opt"];
            if (rwconfig_opt) {
                if (options.debug) console.log(`sandbox-opt=${rwconfig_opt} (from .rwconfig)`);
                const eq = rwconfig_opt.indexOf("=");
                if (eq !== -1 && rwconfig_opt.slice(0, eq).trim() === "shims") {
                    options.shims = rwconfig_opt.slice(eq + 1).split(",").filter(str => str !== "");
                }
            }
        }
        if (options.shims.length === 0) {
            if (options.debug) console.log("Using default R shims ...");
            options.shims = ["install.packages"];
        }
    } else {
        options.shims = options.shims.filter(str => str !== "");
    }

    return { options, flags, command };
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

    const { options, flags, command } = parsed;

    // Handle flags that exit early
    if (flags.help) {
        show_help();
        process.exit(0);
    }

    if (flags.version) {
        console.log(version);
        process.exit(0);
    }

    // Handle subcommands
    if (command.type === "env") {
        let field;
        if (command.action === "list") {
            field = null;
        } else if (command.action === "get") {
            if (command.field === null) {
                console.error("ERROR: 'rw env get' requires a field name");
                process.exit(1);
            }
            field = command.field;
        } else {
            console.error("ERROR: Unknown env action. Use 'rw env list' or 'rw env get <field>'");
            process.exit(1);
        }
        let exit_code;
        try {
            exit_code = await spawn_worker({ task: "env", field });
        } catch (e) {
            console.error("ERROR: " + e.message);
            process.exit(1);
        }
        process.exit(exit_code);
    }

    if (command.type === "config") {
        // scope: null = unset; "local" = ./.rwconfig; "global" = ~/.rwconfig
        // set/unset default to local; list/get default to merged (both files)
        const is_global  = command.scope === "global";
        const is_local   = command.scope === "local";
        const scoped_path  = is_global ? USER_RWCONFIG_PATH : RWCONFIG_PATH;
        const scope_label  = is_global ? "~/.rwconfig" : "./.rwconfig";

        if (command.action === "list") {
            let entries, provenance;
            if (command.scope !== null) {
                // Explicit --local or --global: show only that file
                const config = load_rwconfig(scoped_path);
                entries = Object.entries(config);
                provenance = Object.fromEntries(entries.map(([k]) => [k, scope_label]));
            } else {
                // No scope flag: show merged view with provenance
                const r = load_all_rwconfigs();
                entries = Object.entries(r.config);
                provenance = r.provenance;
            }
            if (entries.length === 0) {
                const where = command.scope !== null ? scope_label : "~/.rwconfig or ./.rwconfig";
                console.log(`(no settings in ${where})`);
            } else {
                for (const [k, v] of entries) console.log(`${k}=${v}  # ${provenance[k]}`);
            }
        } else if (command.action === "get") {
            if (command.field === null) {
                console.error("ERROR: 'rw config get' requires a field name");
                process.exit(1);
            }
            // Explicit scope: read only that file; no scope: read merged (effective value)
            const config = command.scope !== null
                ? load_rwconfig(scoped_path)
                : load_all_rwconfigs().config;
            const where = command.scope !== null ? scope_label : "~/.rwconfig or ./.rwconfig";
            if (Object.prototype.hasOwnProperty.call(config, command.field)) {
                console.log(config[command.field]);
            } else {
                console.error(`ERROR: '${command.field}' is not set in ${where}`);
                process.exit(1);
            }
        } else if (command.action === "set") {
            if (!command.field || command.value === null) {
                console.error("ERROR: 'rw config set' requires a field name and a value");
                process.exit(1);
            }
            // Default scope for set is local
            write_rwconfig(command.field, command.value, scoped_path);
            console.log(`${command.field}=${command.value}`);
        } else if (command.action === "unset") {
            if (!command.field) {
                console.error("ERROR: 'rw config unset' requires a field name");
                process.exit(1);
            }
            // Default scope for unset is local
            if (!unset_rwconfig(command.field, scoped_path)) {
                console.error(`ERROR: '${command.field}' is not set in ${scope_label}`);
                process.exit(1);
            }
        } else {
            console.error("ERROR: Unknown config action. Use 'rw config list', 'rw config get <field>', 'rw config set <field> <value>', or 'rw config unset <field>'");
            process.exit(1);
        }
        process.exit(0);
    }

    if (command.type === "build") {
        if (!command.build_docker) {
            console.error("ERROR: 'rw build' requires --docker (host-native build not yet supported)");
            process.exit(1);
        }
        const pkg_path = normalize_path(command.build_path ?? ".", "package directory");
        const out_path = process.cwd();
        if (options.verbose) console.error(`Building package from '${pkg_path}' using Docker`);
        const uid = process.getuid();
        const gid = process.getgid();
        const docker_args = [
            "run", "--rm",
            "-u", `${uid}:${gid}`,
            "-v", `${pkg_path}:/host/pkg`,
            "-v", `${out_path}:/host/pwd`,
            "-w", "/host/pkg",
            "ghcr.io/r-wasm/webr:main",
            "Rscript", "-e", "rwasm::build('.', out_dir = '/host/pwd')"
        ];
        if (options.debug) console.log("docker " + docker_args.join(" "));

        const tgz_before = new Set(
            fs.readdirSync(out_path).filter(f => f.endsWith(".tgz"))
        );

        const proc = spawn("docker", docker_args, { stdio: "inherit" });
        proc.on("error", e => {
            console.error("ERROR: " + e.message);
            process.exit(1);
        });
        proc.on("close", code => {
            if (code === 0) {
                const built = fs.readdirSync(out_path)
                    .filter(f => f.endsWith(".tgz") && !tgz_before.has(f));
                for (const f of built) console.log(path.join(out_path, f));
            }
            process.exit(code ?? 0);
        });
        return;
    }

    // Validate sandbox before any operation that uses it
    try {
        validate_sandbox(options.sandbox);
    } catch (e) {
        console.error("ERROR: " + e.message);
        process.exit(1);
    }

    if (command.type === "install") {
        if (command.install_packages.length === 0) {
            console.error("ERROR: 'rw install' requires at least one package name or directory");
            process.exit(1);
        }
        if (!options.persistent) {
            console.error("ERROR: 'rw install' requires --persistent flag");
            process.exit(1);
        }
        if (!options.r_libs_user) {
            console.error("ERROR: 'rw install' with --persistent requires --r-libs-user=<dir> or r-libs-user in .rwconfig");
            process.exit(1);
        }

        // Docker build phase: build each package directory, collect tarballs
        if (command.install_docker) {
            const uid = process.getuid();
            const gid = process.getgid();
            const out_path = process.cwd();
            const tarballs = [];

            for (const pkg_dir of command.install_packages) {
                const pkg_path = normalize_path(pkg_dir, "package directory");
                if (options.verbose) console.error(`Building package from '${pkg_path}' using Docker`);
                const docker_args = [
                    "run", "--rm",
                    "-u", `${uid}:${gid}`,
                    "-v", `${pkg_path}:/src`,
                    "-v", `${out_path}:/out`,
                    "-w", "/src",
                    "ghcr.io/r-wasm/webr:main",
                    "Rscript", "-e", "rwasm::build('.', out_dir = '/out')"
                ];
                if (options.debug) console.log("docker " + docker_args.join(" "));
                const tgz_before = new Set(
                    fs.readdirSync(out_path).filter(f => f.endsWith(".tgz"))
                );
                await new Promise((resolve, reject) => {
                    const proc = spawn("docker", docker_args, { stdio: "inherit" });
                    proc.on("error", reject);
                    proc.on("close", code => {
                        if (code !== 0) reject(new Error(`Docker exited with code ${code}`));
                        else resolve();
                    });
                }).catch(e => { console.error("ERROR: " + e.message); process.exit(1); });
                const built = fs.readdirSync(out_path)
                    .filter(f => f.endsWith(".tgz") && !tgz_before.has(f));
                if (options.verbose) {
                    for (const f of built) console.error(`Built tarball '${path.join(out_path, f)}'`);
                }
                tarballs.push(...built);
            }

            if (tarballs.length === 0) {
                console.error("ERROR: Docker build produced no tarballs");
                process.exit(1);
            }
            command.install_packages = tarballs;
        }

        // Build install expressions
        if (options.verbose) {
            for (const pkg of command.install_packages) {
                console.error(`Installing package '${pkg}'`);
            }
        }
        const install_exprs = command.install_packages.map(
            pkg => `install.packages(${JSON.stringify(pkg)})`
        );
        options.exprs = install_exprs;

        let exit_code;
        try {
            exit_code = await spawn_worker({ task: "run", options: make_run_spec(options) });
        } catch (e) {
            console.error("ERROR: " + e.message);
            process.exit(1);
        }
        process.exit(exit_code);
    }

    if (command.type === "uninstall") {
        if (command.uninstall_packages.length === 0) {
            console.error("ERROR: 'rw uninstall' requires at least one package name");
            process.exit(1);
        }
        if (!options.persistent) {
            console.error("ERROR: 'rw uninstall' requires --persistent flag");
            process.exit(1);
        }
        if (!options.r_libs_user) {
            console.error("ERROR: 'rw uninstall' with --persistent requires --r-libs-user=<dir> or r-libs-user in .rwconfig");
            process.exit(1);
        }

        if (options.verbose) {
            for (const pkg of command.uninstall_packages) {
                console.error(`Uninstalling package '${pkg}'`);
            }
        }
        const pkgs_r = `c(${command.uninstall_packages.map(p => JSON.stringify(p)).join(", ")})`;
        options.exprs = [`remove.packages(${pkgs_r}, lib = .libPaths()[1])`];

        let exit_code;
        try {
            exit_code = await spawn_worker({ task: "run", options: make_run_spec(options) });
        } catch (e) {
            console.error("ERROR: " + e.message);
            process.exit(1);
        }
        process.exit(exit_code);
    }

    // Read R code from stdin if piped/redirected and no code was given
    if (options.exprs.length === 0 && !process.stdin.isTTY) {
        const stdin_code = fs.readFileSync(0, "utf8");
        options.exprs = stdin_code.split(/\r?\n/).filter(str => str !== "");
        if (options.debug) {
            console.log("R main code from stdin to be parsed and evaluated:");
            console.log(options.exprs);
        }
    }

    // Show help if no code to run
    if (options.exprs.length === 0) {
        show_help();
        process.exit(0);
    }

    // Run
    let exit_code;
    try {
        exit_code = await spawn_worker({ task: "run", options: make_run_spec(options) });
    } catch (e) {
        console.error("ERROR: " + e.message);
        process.exit(1);
    }
    process.exit(exit_code);
}

// Cross-runtime entry-point guard:
//   Deno  – import.meta.main is true only when this file is the entry point
//   Node  – compare the resolved file URL against process.argv[1], following
//           symlinks on both sides so that a globally installed bin symlink
//           (npm install -g) is recognised as the entry point.
function _realpath(p) {
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}
const isMain = typeof globalThis.Deno !== "undefined"
    ? import.meta.main
    : process.argv[1] != null &&
      fileURLToPath(import.meta.url) === _realpath(process.argv[1]);
if (isMain) main();

export { load_rwconfig, write_rwconfig, unset_rwconfig, validate_sandbox };
