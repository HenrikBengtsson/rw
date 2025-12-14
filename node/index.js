#! /usr/bin/env node

import { WebR } from "webr";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// reconstruct __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = packageJson.version;

function show_help() {
    console.log(`
USAGE:

  rw [rwasm options] <script.R> [args]
  
RWASM OPTIONS:

  --help                        Show this help
  --version                     Show version
  --webr-version                Show webR version
  --r-version                   Show R version
  --debug                       Show debug output
  --vanilla                     Run webR with --vanilla
  --config                      Show R information
  --r-libs=<host-dir>           Bind R user library to host directory
                                (default: '$RW_R_LIBS_USER')
  --bind=<host-dir>:<rwasm-dir> Bind host directory as a webR directory
                                (may be specified multiple times)
  --prologue=<R script>         R script evaluated before main R script
  --epilogue=<R script>         R script evaluated after main R script
  --shared=<host-dir>           Bind host directory available to prologue and
                                epilogue scripts at '/host/shared', but not
                                the main script (default: '$RW_SHARED')
  --expr=<R code>               R code to evaluate (multiple okay).
                                Alternative to specifying 'script.R'

EXAMPLES:

  rw --expr='sum(1:100)'

  rw main.R

  rw --expr='cat(Sys.getenv("R_LIBS_USER"))'

  ## An R session with the R user library on host
  rw --r-libs=~/R/wasm32-unknown-emscripten-library/4.5 main.R
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw main.R

  ## An R session with data loaded by the prologue script
  export RW_SHARED=shared
  Rscript -e "saveRDS(list(a=1, b=2), file = file.path(Sys.getenv('RW_SHARED'), '/in.rds'))"
  rw --prologue=prologue.R main.R

  ## Install a package (non-persistent)
  rw --expr='webr::install("curl")'

  ## Install a package, if not already installed (persistently on host)
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr='webr::install("curl")'

  ## Force re-install of a package (persistently on host)
  RW_R_LIBS_USER=~/R/wasm32-unknown-emscripten-library/4.5 rw --expr='pkgs <- "curl"; utils::remove.packages(pkgs, lib = .libPaths()); webr::install(pkgs, mount = FALSE)'
`);
}    

async function show_webr_version() {
    const webR = new WebR();
    console.log(webR.version);
}

async function show_r_version() {
    const webR = new WebR({
        RArgs: ["--vanilla"]
    });
    await webR.init();
    const result = await webR.evalR(`cat(as.character(getRversion()))`);
}

async function show_r_info() {
    const webR = new WebR({
        RArgs: ["--vanilla"]
    });
    await webR.init();
    const code = [
        'lines <- c()',
        'values <- Sys.getenv()',
        'values <- values[grepl("^R_", names(values))]',
        'lines <- c(lines, sprintf("envs:%s=%s", names(values), values))',
        'values <- vapply(.LC.categories, FUN = Sys.getlocale, FUN.VALUE = "")',
        'lines <- c(lines, sprintf("locale:%s=%s", names(values), values))',
        'values <- Sys.info()',
        'values["osVersion"] <- osVersion',
        'lines <- c(lines, sprintf("sys_info:%s=%s", names(values), values))',
        'values <- .Platform',
        'lines <- c(lines, sprintf("platform:%s=%s", names(values), values))',
        'values <- capabilities()',
        'lines <- c(lines, sprintf("capabilities:%s=%s", names(values), values))',
        'values <- R.version',
        'values["x"] <- paste(unlist(getRversion())[1], collapse = ".")',
        'values["y"] <- paste(unlist(getRversion())[2], collapse = ".")',
        'values["z"] <- paste(unlist(getRversion())[3], collapse = ".")',
        'values["x_y"] <- paste(unlist(getRversion())[1:2], collapse = ".")',
        'values["x_y_z"] <- as.character(getRversion())',
        'lines <- c(lines, sprintf("r_version:%s=%s", names(values), values))',
        'values <- .Machine',
        'lines <- c(lines, sprintf("machine:%s=%s", names(values), values))',
        'values <- extSoftVersion()',
        'lines <- c(lines, sprintf("ext_soft_version:%s=%s", names(values), values))',
        'components <- c("home", "bin", "doc", "etc", "include", "modules", "share")',
        'values <- vapply(components, FUN = R.home, FUN.VALUE = "")',
        'lines <- c(lines, sprintf("r_home:%s=%s", names(values), values))',
        'values <- rc.options()',
        'lines <- c(lines, sprintf("readline_options:%s=%s", names(values), values))',
        'values <- rc.settings()',
        'lines <- c(lines, sprintf("readline_settings:%s=%s", names(values), values))',
        'values <- c(interactive = interactive(), home = normalizePath("~"), pwd = getwd(), tempdir = tempdir())',
        'values <- c(values, rng_kind = paste(RNGkind(), collapse = " "), timezone = Sys.timezone())',
        'values <- c(values, lib_paths = paste(shQuote(.libPaths()), collapse = " "))',
        'values <- c(values, loaded_packages = paste(loadedNamespaces(), collapse = " "))',
        'lines <- c(lines, sprintf("session:%s=%s", names(values), values))',
        'values <- commandArgs()',
        'names(values) <- sprintf("%d", seq_along(values))',
        'lines <- c(lines, sprintf("command_args:%s=%s", names(values), values))',
        'values <- c(La_library = La_library(), La_version = La_version())',
        'lines <- c(lines, sprintf("lapack:%s=%s", names(values), values))',
        'values <- l10n_info()',
        'lines <- c(lines, sprintf("localization:%s=%s", names(values), values))',
        'values <- strsplit(Sys.getenv("R_LIBS_USER"), split = ":", fixed = TRUE)[[1]]',
        'values <- gsub(sprintf("^%s", normalizePath("~")), "~", values)',
        'values <- c(RW_R_LIBS_USER = paste(values, collapse = ":"))',
        'lines <- c(lines, sprintf("rw_suggestions:%s=%s", names(values), values))',
        'lines <- sort(lines)',
        'writeLines(lines)'
    ];
    const result = await webR.evalR(code);
}


function error(msg, exit_code = 1) {
    console.error("ERROR: " + msg);
    process.exit(exit_code);
}

function normalize_path(file, type = "host directory") {
    if (!fs.existsSync(file)) {
        error(`No such ${type}: ${file}`);
    }
    if (!path.isAbsolute(file)) {
        file = path.join(process.cwd(), file);
    }
    if (!fs.existsSync(file)) {
        error(`No such ${type}: ${file}`);
    }
    return file;
}

async function webr_mkdirs(path, debug = false) {
    if (debug) console.log(`webr_mkdirs('${path}') ...`);
    const parts = path.split("/").filter(Boolean); // split and drop empties
    let current = "";
    for (const part of parts) {
        current += "/" + part; 
        try { await webR.FS.mkdir(current); } catch (err) { }
    }
    if (debug) console.log(`webr_mkdirs('${path}') ... done`);
}

async function webr_mount(host, webr, debug = false) {
    if (debug) console.log(`Mounting '${webr}' to '${host}' on host`);
    await webr_mkdirs(webr, debug = debug);
    await webR.FS.mount("NODEFS", { root: host }, webr);
}

async function webr_unmount(webr, debug = false) {
    if (debug) console.log(`Unmounting '${webr}'`);
    await webR.FS.unmount(webr);
}

function read_code(file, type = "main", debug = false) {
    let code = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    code = code.filter(str => str !== "");
    if (debug) {
        console.log(`R ${type} code to be parsed and evaluated:`);
        console.log(code);
    }
    return code;
}    

async function webr_eval_code(code, debug = false) {
    let shelter = await new webR.Shelter()
    
    let result = await shelter.captureR(code, {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: false
    })
    
    if (debug) console.log(result);
    
    for (const { type, data } of result.output) {
        if (type === "stdout") {
            console.log(data);
        } else if (type === "stderr") {
            console.error(data);
        }
    }
    
    shelter.purge();
    
    return result;
}


// Parse node CLI arguments
const args = process.argv.slice(2);

// crude parser
let debug = false;
let r_libs_host = null;
let r_binds = [];
let r_shared_host = null;
let r_prologue = null;
let r_script = null;
let r_epilogue = null;
let r_args = [];
let r_exprs = [];
let webr_args = [];

let value = null;
let prefix = null;
for (const arg of args) {
    if (arg == "--help") {
        show_help();
        process.exit(0);
    } else if (arg == "--version") {
        console.log(version);
        process.exit(0);
    } else if (arg == "--webr-version") {
        await show_webr_version();
        process.exit(0);
    } else if (arg == "--r-version") {
        await show_r_version();
        process.exit(0);
    } else if (arg == "--config") {
        await show_r_info();
        process.exit(0);
    } else if (arg == "--debug") {
        debug = true;        
    } else if (arg == "--vanilla") {
        webr_args.push(arg);
    } else if (arg.startsWith((prefix = "--expr="))) {
        value = arg.slice(prefix.length);
        if (debug) console.log(`expr=${value}`)
        r_exprs.push(value);
    } else if (arg.startsWith((prefix = "--r-libs="))) {
        value = arg.slice(prefix.length);
        r_libs_host = normalize_path(value, "host directory");
        if (debug) console.log(`r_libs_host=${r_libs_host}`)
    } else if (arg.startsWith((prefix = "--bind="))) {
        value = arg.slice(prefix.length);
        const bind = value;
        normalize_path(bind.split(":")[0], "host directory");
        r_binds.push(bind);
        if (debug) console.log(`Add bind=${bind}`)
    } else if (arg.startsWith((prefix = "--shared="))) {
        value = arg.slice(prefix.length);
        r_shared_host = normalize_path(value, "host directory");
        if (debug) console.log(`r_shared_host=${r_shared_host}`)
    } else if (arg.startsWith((prefix = "--prologue="))) {
        value = arg.slice(prefix.length);
        r_prologue = normalize_path(value, "host file");
        if (debug) console.log(`r_prologue=${r_prologue}`)
    } else if (arg.startsWith((prefix = "--epilogue="))) {
        value = arg.slice(prefix.length);
        r_epilogue = normalize_path(value, "host file");
        if (debug) console.log(`r_epilogue=${r_epilogue}`)
    } else {
        if (r_exprs.length == 0 && r_script == null) {
            r_script = normalize_path(arg, "host file");
            if (debug) console.log(`r_script=${r_script}`)
        } else {
            if (r_args.length == 0) r_args.push("--args");
            r_args.push(arg);
        }
    }
}

// Show help by default
if (r_exprs.length == 0 && r_script == null) {
    show_help();
    process.exit(0);
}

// Main R script?
if (r_exprs.length > 0 && r_script !== null) {
    error("R script must not be specified when an R expression is specified");
} else if (r_script !== null) {
    r_exprs = read_code(r_script, "main", debug);
}


// Apply RW_NNN environment variables
if (r_libs_host == null) {
    r_libs_host = process.env.RW_R_LIBS_USER || null;
}

if (r_shared_host == null) {
    r_shared_host = process.env.RW_SHARED || null;
}


// Launch webR instance
const webR = new WebR({
  RArgs: [...webr_args, ...r_args]
});
await webR.init();


if (r_libs_host !== null) {
    r_libs_host = normalize_path(r_libs_host)
    const r_libs_user = "/host/R_LIBS_USER";
    await webr_mount(r_libs_host, r_libs_user, debug);
    await webR.evalRVoid(`.libPaths("${r_libs_user}")`);
}


// Bind host directories to webR directories
if (r_binds !== null) {
    for (const bind of r_binds) {
        const parts = bind.split(":");
        if (parts.length == 1) parts.push(src);
        await webr_mount(parts[0], parts[1], debug);
    }
}


// Prologue R script?
let code = []
if (r_prologue !== null) {
    if (debug) console.log("Sourcing prologue R script ...")
    
    code = read_code(r_prologue, "prologue", debug);
    
    // Bind R user library to the R library path on host?
    const r_shared_webr = "/host/shared"
    if (r_shared_host !== null) {
        await webr_mount(r_shared_host, r_shared_webr, debug);
    }

    await webr_eval_code(code, debug);

    if (r_shared_host !== null) {
        await webr_unmount(r_shared_webr, debug);
    }

    if (debug) console.log("Sourcing prologue R script ... done")
}


// Main R script
if (debug) console.log("Evaluate main R code ...")
await webr_eval_code(r_exprs, debug);
if (debug) console.log("Evaluate main R code ... done")


// Eiplogue R script?
if (r_epilogue !== null) {
    if (debug) console.log("Sourcing epilogue R script ...")
    
    code = read_code(r_epilogue, "epilogue", debug);

    // Bind R user library to the R library path on host?
    const r_shared_webr = "/host/shared"
    if (r_shared_host !== null) {
        await webr_mount(r_shared_host, r_shared_webr, debug);
    }

    await webr_eval_code(code, debug);

    if (r_shared_host !== null) {
//        await webr_unmount(r_shared_webr, debug);
    }
    
    if (debug) console.log("Sourcing epilogue R script ... done")
}


process.exit(0)
