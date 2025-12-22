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
const author = packageJson.author.name;
const license = packageJson.license;

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
  --config                      Show R information
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
  mkdir stage
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

async function webr_eval_code(code, timeout = 0, debug = false) {
    if (debug) {
        console.log(`webr_eval_code(..., timeout = ${timeout}):`)
    }
    
    let shelter = await new webR.Shelter()
    
    let timeoutPromise = new Promise((resolve, reject) => {
        if (timeout > 0) {
            code = "tryCatch({ " + code + " }, interrupt = function(int) { \
              msg <- conditionMessage(int); \
              msg <- if (is.null(msg)) '' else sprintf(' (%s)', msg); \
              msg <- sprintf('R exiting, because of %s%s', class(int)[1], msg); \
              stop(msg); \
            })"
            setTimeout(() => {
                // Signal an interrupt to R, which can be caught
                // using tryCatch(..., interrupt = ...)
                webR.interrupt();
//                reject(new Error(`Evaluation timed out after ${timeout} seconds`));
            }, 1000 * timeout);
        }
    });

    if (debug) {
        console.log(code);
    }

    let capturePromise = shelter.captureR(code, {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: false,
        withHandlers: true
    });

    let response;
    try {
        response = await Promise.race([capturePromise, timeoutPromise]);
    } catch (e) {
        shelter.purge();
        throw e;
    }
    
    if (debug) {
	console.log("Response:");
	console.log(response);
	console.log(response.result);
    }
    
    for (const { type, data } of response.output) {
        if (type === "stdout") {
            console.log(data);
        } else if (type === "stderr") {
            console.error(data);
        }
    }
    
    shelter.purge();
    
    return response;
}


// Parse node CLI arguments
const args = process.argv.slice(2);

// crude parser
let debug = false;
let r_libs_host = null;
let r_binds = [];
let r_stage_host = null;
let r_prologue_script = null;
let r_epilogue_script = null;
let r_script = null;
let r_prologue_exprs = [];
let r_epilogue_exprs = [];
let r_exprs = [];
let r_args = [];
let webr_args = [];
let r_shims = [];

let value = null;
let prefix = null;
let timeout = 0;

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
    } else if (arg.startsWith((prefix = "--shims="))) {
        value = arg.slice(prefix.length);
        value = value.split(",");
        r_shims.push(...value);
    } else if (arg.startsWith((prefix = "--prologue-expr="))) {
        value = arg.slice(prefix.length);
        if (debug) console.log(`prologue_expr=${value}`)
        r_prologue_exprs.push(value);
    } else if (arg.startsWith((prefix = "--epilogue-expr="))) {
        value = arg.slice(prefix.length);
        if (debug) console.log(`epilogue_expr=${value}`)
        r_epilogue_exprs.push(value);
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
    } else if (arg.startsWith((prefix = "--stage="))) {
        value = arg.slice(prefix.length);
        r_stage_host = normalize_path(value, "host directory");
        if (debug) console.log(`r_stage_host=${r_stage_host}`)
    } else if (arg.startsWith((prefix = "--prologue="))) {
        value = arg.slice(prefix.length);
        r_prologue_script = normalize_path(value, "host file");
        if (debug) console.log(`r_prologue_script=${r_prologue_script}`)
    } else if (arg.startsWith((prefix = "--epilogue="))) {
        value = arg.slice(prefix.length);
        r_epilogue_script = normalize_path(value, "host file");
        if (debug) console.log(`r_epilogue_script=${r_epilogue_script}`)
    } else if (arg.startsWith((prefix = "--timeout="))) {
        value = arg.slice(prefix.length);
        timeout = parseFloat(value);
        if (isNaN(timeout) || timeout < 0) {
            error("Timeout must be a non-negative number of seconds: " + timeout);
        }
        if (debug) console.log(`timeout=${timeout}`);
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
    error("R script must not be specified when  R expressions are specified");
} else if (r_script !== null) {
    r_exprs = read_code(r_script, "main", debug);
}

// Prologue R script?
if (r_prologue_exprs.length > 0 && r_prologue_script !== null) {
    error("R prologue script must not be specified when R prologue expressions are specified");
} else if (r_prologue_script !== null) {
    r_prologue_exprs = read_code(r_prologue_script, "prologue", debug);
}

// Epilogue R script?
if (r_epilogue_exprs.length > 0 && r_epilogue_script !== null) {
    error("R epilogue script must not be specified when R epilogue expressions are specified");
} else if (r_epilogue_script !== null) {
    r_epilogue_exprs = read_code(r_epilogue_script, "epilogue", debug);
}


// Apply RW_NNN environment variables
if (r_libs_host == null) {
    r_libs_host = process.env.RW_R_LIBS_USER || null;
}

if (r_stage_host == null) {
    r_stage_host = process.env.RW_STAGE || null;
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


// Use default shims?
if (r_shims.length == 0) {
    if (debug) console.log("Using default R shims ...")
    const value = process.env.RW_SHIMS
    if (value) {
        if (debug) console.log("RW_SHIMS: '" + value + "'")
        r_shims = value.split(",");
        r_shims = r_shims.filter(str => str !== "")
    } else {
        r_shims = [ "install.packages" ]
    }
} else {
    r_shims = r_shims.filter(str => str !== "")
}

// Shims?
if (r_shims.length > 0) {
    if (debug) console.log("Install R shims: ", r_shims)

    const code = []
    for (const shim of r_shims) {
        if (shim == "install.packages") {
            code.push(`
attach(list(install.packages = local({
  install <- function(
    packages,
    repos = NULL,
    info = NULL,
    lib = NULL,
    quiet = FALSE,
    mount = TRUE,
    skip = TRUE
  ) {
    if (is.null(lib)) {
      lib <- .libPaths()[[1]]
    }
    if (is.null(repos)) {
      repos <- getOption("webr_pkg_repos")
    }
  
    ver <- as.character(getRversion())
    ver <- gsub("\\\\.[^.]+\$", "", ver)
  
    repos <- gsub("/\$", "", repos)
    contrib <- sprintf("%s/bin/emscripten/contrib/%s", repos, ver)
  
    if (is.null(info)) {
      info <- utils::available.packages(contriburl = contrib)
    }
  
    # Avoid 'recursive' here so that deps of broken packages are not downloaded
    deps <- unlist(
      tools::package_dependencies(packages, info, c("Depends", "Imports")),
      use.names = FALSE
    )
    deps <- unique(deps)
  
    # Search for existing packages in '.libPaths()' and the 'lib' argument
    lib_loc <- c(lib, .libPaths())
  
    for (dep in deps) {
      if (length(find.package(dep, lib.loc = lib_loc, quiet = TRUE))) {
        next
      }
      install(dep, repos, info, lib, quiet, mount)
    }

    for (pkg in packages) {
      if (skip && length(find.package(pkg, lib.loc = lib_loc, quiet = TRUE))) {
        next
      }
  
      if (!pkg %in% rownames(info)) {
        warning(paste("Requested package", pkg, "not found in webR binary repo."))
        next
      }
  
      repo <- info[pkg, "Repository"]
      repo <- sub("file:", "", repo, fixed = TRUE)
  
      pkg_ver <- info[pkg, "Version"]
      if (!quiet) message(paste("Downloading webR package:", pkg))
  
      if (mount) {
        # Try mounting '.tgz' as v2.0 VFS image, fallback to extracting the .tgz
        tryCatch(
          {
            webr:::install_vfs_image(repo, lib, pkg, pkg_ver)
            next
          },
          error = function(cnd) {
            warning(paste(
              cnd\$message,
              "Falling back to traditional '.tgz' extraction."
            ))
          }
        )
      }
  
      webr:::install_tgz(repo, lib, pkg, pkg_ver)
    }
    invisible(NULL)
  }

  function(..., mount = FALSE, skip = FALSE) {
    install(..., mount = mount, skip = skip)
  }
})), name = "rw_shims", warn.conflicts = FALSE)
`);
        } else if (shim == "webr::install") {
            code.push(`
attach(list(install.packages = function(..., mount = FALSE) {
    webr::install(..., mount = mount)
}), name = "rw_shims", warn.conflicts = FALSE)
`);
        } else {
            error("Unknown shim: '" + shim + "'");
        }
    }
    if (code.length > 0) {
        if (debug) {
            console.log(`Shim code: [n=${code.length}]`)
            for (const code0 of code) console.log(`${code0}`)
        }
        await webR.evalRVoid(code);
    }
}


// Prologue R code?
if (r_prologue_exprs.length > 0) {
    if (debug) console.log("Evaluating prologue R code ...")
    
    // Bind R user library to the R library path on host?
    const r_stage_webr = "/host/stage"
    if (r_stage_host !== null) {
        await webr_mount(r_stage_host, r_stage_webr, debug);
    }

    await webr_eval_code(r_prologue_exprs, timeout, debug);

    if (r_stage_host !== null) {
        await webr_unmount(r_stage_webr, debug);
    }

    if (debug) console.log("Evaluating prologue R code ... done")
}


// Main R code
if (debug) console.log("Evaluate main R code ...")
await webr_eval_code(r_exprs, timeout, debug);
if (debug) console.log("Evaluate main R code ... done")


// Epilogue R code?
if (r_epilogue_exprs.length > 0) {
    if (debug) console.log("Evaluating epilogue R code ...")
    
    // Bind R user library to the R library path on host?
    const r_stage_webr = "/host/stage"
    if (r_stage_host !== null) {
        await webr_mount(r_stage_host, r_stage_webr, debug);
    }

    await webr_eval_code(r_epilogue_exprs, timeout, debug);

    if (r_stage_host !== null) {
        await webr_unmount(r_stage_webr, debug);
    }

    if (debug) console.log("Evaluating epilogue R code ... done")
}


process.exit(0)
