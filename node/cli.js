#! /usr/bin/env node

import fs from "fs";
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

const RWCONFIG_PATH = "./.rwconfig";

/**
 * Load ./.rwconfig key=value pairs. Lines starting with '#' and blank lines
 * are ignored. Returns an empty object if the file does not exist.
 * @returns {Object} Parsed config fields
 */
function load_rwconfig() {
    if (!fs.existsSync(RWCONFIG_PATH)) return {};
    const config = {};
    for (const line of fs.readFileSync(RWCONFIG_PATH, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        config[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return config;
}

/**
 * Write (or update) a single field in ./.rwconfig.
 * @param {string} field
 * @param {string} value
 */
function write_rwconfig(field, value) {
    let content = fs.existsSync(RWCONFIG_PATH)
        ? fs.readFileSync(RWCONFIG_PATH, "utf8")
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
        fs.writeFileSync(RWCONFIG_PATH, updated.join("\n"), "utf8");
    } else {
        if (content && !content.endsWith("\n")) content += "\n";
        fs.writeFileSync(RWCONFIG_PATH, content + `${field}=${value}\n`, "utf8");
    }
}

/**
 * Remove a field from ./.rwconfig. Returns true if the field was found.
 * @param {string} field
 * @returns {boolean}
 */
function unset_rwconfig(field) {
    if (!fs.existsSync(RWCONFIG_PATH)) return false;
    const lines = fs.readFileSync(RWCONFIG_PATH, "utf8").split("\n");
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
    if (found) fs.writeFileSync(RWCONFIG_PATH, updated.join("\n"), "utf8");
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

function show_help() {
    console.log(`
rw: CLI for Sandboxed R Execution

Usage:

  rw [options] <script.R> [args]
  rw [options] --expr="..."
  rw [options] --persistent install <pkg> [pkg ...]
  rw env list
  rw env get <field>
  rw config list
  rw config get <field>
  rw config set <field> <value>
  rw config unset <field>

Options (general):
  --help                        Show this help
  --version                     Show version
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
                                (default: r-libs-user in ./.rwconfig)
  --bind=<host-dir>:<rwasm-dir> Bind host directory as a webR directory
                                (may be specified multiple times)
  --bastion=<host-dir>          Bind host directory available to prologue and
                                epilogue code at '/host/bastion', but not
                                the main code (default: bastion in ./.rwconfig,
                                or './bastion/' if it exists)
  --prologue=<R script>         R script evaluated before main R code
  --epilogue=<R script>         R script evaluated after main R code
  --prologue-expr=<R code>      R code evaluated before main R code
  --epilogue-expr=<R code>      R code evaluated after main R code
  --persistent                  Persist changes to host (required for 'install')

Options (evaluation):
  --expr=<R code>               R code to evaluate (multiple okay)
                                Alternative to specifying 'script.R'
  --timeout=<seconds>           Maximum evaluation time in seconds

Examples:

  rw --expr="sum(1:100)"
  rw main.R
  rw --expr="message('running script ...')" main.R

  ## Interrupt after 3.5 seconds, if not completed
  rw --timeout=3.5 --expr="slow <- function() { Sys.sleep(5); 42 }" \\
                   --expr="tryCatch(slow(), interrupt = identity)"

  ## Install a package persistently on host
  rw --persistent --r-libs-user=~/R/wasm32-unknown-emscripten-library/4.5 install praise
  rw --expr="message(praise::praise())"

  ## An R session with the R user library on host
  rw --r-libs-user=~/R/wasm32-unknown-emscripten-library/4.5 main.R

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
  rw env list
  rw env get r-version
  rw env get webr-version

  ## Show and manage ./.rwconfig settings
  rw config list
  rw config get r-libs-user
  rw config set r-libs-user ~/R/wasm32-unknown-emscripten-library/4.5

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
        type: null,    // null | "env" | "config" | "install"
        action: null,  // "list" | "get" | "set"
        field: null,
        value: null,
        install_packages: []
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
            options.r_libs_user = normalize_path(value, "host directory");
            if (options.debug) console.log(`r_libs_user=${options.r_libs_user}`);
        } else if (arg.startsWith((prefix = "--bind="))) {
            value = arg.slice(prefix.length);
            const parts = value.split(":");
            if (parts.length === 1) parts.push(parts[0]);
            normalize_path(parts[0], "host directory");
            options.binds.push({ host: parts[0], webr: parts[1] });
            if (options.debug) console.log(`Add bind=${value}`);
        } else if (arg.startsWith((prefix = "--bastion="))) {
            value = arg.slice(prefix.length);
            options.bastion_host = normalize_path(value, "host directory");
            if (options.debug) console.log(`bastion_host=${options.bastion_host}`);
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
            if (command.type === "install") {
                // After "install", all non-option args are package names
                command.install_packages.push(arg);
            } else if (command.type === null && options.exprs.length === 0 && r_script === null) {
                if (arg === "env") {
                    command.type = "env";
                } else if (arg === "config") {
                    command.type = "config";
                } else if (arg === "install") {
                    command.type = "install";
                } else {
                    r_script = normalize_path(arg, "host file");
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
                if (arg === "list") {
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

    // Apply ./.rwconfig defaults (lower precedence than CLI flags, higher than env vars)
    const rwconfig = options.no_config ? {} : load_rwconfig();
    if (!options.no_config) {
        if (options.sandbox === null && rwconfig["sandbox"]) {
            options.sandbox = rwconfig["sandbox"];
            if (options.debug) console.log(`sandbox=${options.sandbox} (from .rwconfig)`);
        }
        if (options.r_libs_user === null && rwconfig["r-libs-user"]) {
            options.r_libs_user = normalize_path(rwconfig["r-libs-user"], "host directory");
            if (options.debug) console.log(`r_libs_user=${options.r_libs_user} (from .rwconfig)`);
        }
        if (options.bastion_host === null && rwconfig["bastion"]) {
            options.bastion_host = normalize_path(rwconfig["bastion"], "host directory");
            if (options.debug) console.log(`bastion_host=${options.bastion_host} (from .rwconfig)`);
        }
    }
    if (options.sandbox === null) options.sandbox = "webr";

    // Apply environment variables
    if (options.bastion_host === null && fs.existsSync("bastion")) {
        options.bastion_host = normalize_path("bastion", "host directory");
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
        if (command.action === "list") {
            await get_r_info();
        } else if (command.action === "get") {
            if (command.field === null) {
                console.error("ERROR: 'rw env get' requires a field name");
                process.exit(1);
            }
            if (command.field === "webr-version") {
                console.log(await get_webr_version());
            } else if (command.field === "r-version") {
                await get_r_version();
            } else {
                await get_r_info(command.field);
            }
        } else {
            console.error("ERROR: Unknown env action. Use 'rw env list' or 'rw env get <field>'");
            process.exit(1);
        }
        process.exit(0);
    }

    if (command.type === "config") {
        if (command.action === "list") {
            const rwconfig = load_rwconfig();
            const entries = Object.entries(rwconfig);
            if (entries.length === 0) {
                console.log("(no settings in .rwconfig)");
            } else {
                for (const [k, v] of entries) console.log(`${k}=${v}`);
            }
        } else if (command.action === "get") {
            if (command.field === null) {
                console.error("ERROR: 'rw config get' requires a field name");
                process.exit(1);
            }
            const rwconfig = load_rwconfig();
            if (Object.prototype.hasOwnProperty.call(rwconfig, command.field)) {
                console.log(rwconfig[command.field]);
            } else {
                console.error(`ERROR: '${command.field}' is not set in .rwconfig`);
                process.exit(1);
            }
        } else if (command.action === "set") {
            if (!command.field || command.value === null) {
                console.error("ERROR: 'rw config set' requires a field name and a value");
                process.exit(1);
            }
            write_rwconfig(command.field, command.value);
            console.log(`${command.field}=${command.value}`);
        } else if (command.action === "unset") {
            if (!command.field) {
                console.error("ERROR: 'rw config unset' requires a field name");
                process.exit(1);
            }
            if (!unset_rwconfig(command.field)) {
                console.error(`ERROR: '${command.field}' is not set in .rwconfig`);
                process.exit(1);
            }
        } else {
            console.error("ERROR: Unknown config action. Use 'rw config list', 'rw config get <field>', 'rw config set <field> <value>', or 'rw config unset <field>'");
            process.exit(1);
        }
        process.exit(0);
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
            console.error("ERROR: 'rw install' requires at least one package name");
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

        // Build install expressions
        const install_exprs = command.install_packages.map(
            pkg => `install.packages(${JSON.stringify(pkg)})`
        );
        options.exprs = install_exprs;

        try {
            await run(options);
        } catch (e) {
            console.error("ERROR: " + e.message);
            process.exit(1);
        }
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
