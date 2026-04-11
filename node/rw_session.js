import { WebR } from "webr";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Reconstruct __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const package_json = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

/** Package version */
export const version = package_json.version;

/** Package author */
export const author = package_json.author.name;

/** Package license */
export const license = package_json.license;

/**
 * Normalize a path, ensuring it exists and is absolute
 * @param {string} file - Path to normalize
 * @param {string} type - Description for error messages
 * @returns {string} Normalized absolute path
 * @throws {Error} If path does not exist
 */
export function normalize_path(file, type = "host directory") {
    // Expand leading ~ to home directory
    if (file === "~") {
        file = os.homedir();
    } else if (file.startsWith("~/")) {
        file = path.join(os.homedir(), file.slice(2));
    }
    if (!fs.existsSync(file)) {
        throw new Error(`No such ${type}: ${file}`);
    }
    if (!path.isAbsolute(file)) {
        file = path.join(process.cwd(), file);
    }
    if (!fs.existsSync(file)) {
        throw new Error(`No such ${type}: ${file}`);
    }
    return file;
}

/**
 * Read R code from a file
 * @param {string} file - Path to R script
 * @param {string} type - Code type for debug messages
 * @param {boolean} debug - Enable debug output
 * @returns {string[]} Array of code lines
 */
export function read_code(file, type = "main", debug = false) {
    let code = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    code = code.filter(str => str !== "");
    if (debug) {
        console.log(`R ${type} code to be parsed and evaluated:`);
        console.log(code);
    }
    return code;
}

/**
 * Get the install.packages shim code
 * @returns {string} R code for the install.packages shim
 */
export function get_install_packages_shim() {
    return `
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
`;
}

/**
 * Get the webr::install shim code
 * @returns {string} R code for the webr::install shim
 */
export function get_webr_install_shim() {
    return `
attach(list(install.packages = function(..., mount = FALSE) {
    webr::install(..., mount = mount)
}), name = "rw_shims", warn.conflicts = FALSE)
`;
}

/**
 * A session wrapping a webR instance with utility methods
 */
export class RwSession {
    /**
     * Create a new RwSession
     * @param {Object} options - Session options
     * @param {boolean} options.debug - Enable debug output
     */
    constructor(options = {}) {
        this.webR = null;
        this.debug = options.debug || false;
        this._initialized = false;
    }

    /**
     * Initialize the webR instance
     * @param {Object} options - Initialization options
     * @param {string[]} options.r_args - Arguments to pass to R
     * @returns {Promise<RwSession>} This session instance
     */
    async init(options = {}) {
        if (this._initialized) {
            throw new Error("Session already initialized");
        }
        const r_args = options.r_args || [];
        this.webR = new WebR({ RArgs: r_args });
        await this.webR.init();
        this._initialized = true;
        return this;
    }

    /**
     * Create directories in the webR filesystem
     * @param {string} dir_path - Path to create
     */
    async mkdirs(dir_path) {
        if (this.debug) console.log(`webr_mkdirs('${dir_path}') ...`);
        const parts = dir_path.split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
            current += "/" + part;
            try { await this.webR.FS.mkdir(current); } catch (err) { }
        }
        if (this.debug) console.log(`webr_mkdirs('${dir_path}') ... done`);
    }

    /**
     * Mount a host directory to the webR filesystem
     * @param {string} host_path - Path on the host
     * @param {string} webr_path - Path in webR filesystem
     */
    async mount(host_path, webr_path) {
        if (this.debug) console.log(`Mounting '${host_path}' on host to '${webr_path}' in R WebAssembly`);
        await this.mkdirs(webr_path);
        await this.webR.FS.mount("NODEFS", { root: host_path }, webr_path);
    }

    /**
     * Unmount a path from the webR filesystem
     * @param {string} webr_path - Path to unmount
     */
    async unmount(webr_path) {
        if (this.debug) console.log(`Unmounting '${webr_path}'`);
        await this.webR.FS.unmount(webr_path);
    }

    /**
     * Evaluate R code
     * @param {string|string[]} code - R code to evaluate
     * @param {Object} options - Evaluation options
     * @param {number} options.timeout - Timeout in seconds (0 for no timeout)
     * @param {boolean} options.capture_output - Whether to capture and print output (default: true)
     * @returns {Promise<Object>} Response from webR
     */
    async eval_code(code, options = {}) {
        const timeout = options.timeout || 0;
        const capture_output = options.capture_output !== false;

        if (this.debug) {
            console.log(`eval_code(..., timeout = ${timeout}):`);
        }

        if (Array.isArray(code)) {
            code = code.join("\n");
        }

        let shelter = await new this.webR.Shelter();

        let timeout_id = null;
        let timeout_promise = new Promise((resolve, reject) => {
            if (timeout > 0) {
                code = "tryCatch({ " + code + " }, interrupt = function(int) { \
                  msg <- conditionMessage(int); \
                  msg <- if (is.null(msg)) '' else sprintf(' (%s)', msg); \
                  msg <- sprintf('R exiting, because of %s%s', class(int)[1], msg); \
                  stop(msg); \
                })";
                timeout_id = setTimeout(() => {
                    this.webR.interrupt();
                }, 1000 * timeout);
            }
        });

        if (this.debug) {
            console.log(code);
        }

        let capture_promise = shelter.captureR(code, {
            withAutoprint: true,
            captureStreams: true,
            captureConditions: false,
            withHandlers: true
        });

        let response;
        try {
            response = await Promise.race([capture_promise, timeout_promise]);
        } catch (e) {
            if (timeout_id !== null) clearTimeout(timeout_id);
            shelter.purge();
            throw e;
        }

        if (timeout_id !== null) clearTimeout(timeout_id);

        if (this.debug) {
            console.log("Response:");
            console.log(response);
            console.log(response.result);
        }

        if (capture_output) {
            for (const { type, data } of response.output) {
                if (type === "stdout") {
                    console.log(data);
                } else if (type === "stderr") {
                    console.error(data);
                }
            }
        }

        shelter.purge();

        return response;
    }

    /**
     * Evaluate R code silently (return value only, no console output)
     * @param {string|string[]} code - R code to evaluate
     * @returns {Promise<void>}
     */
    async eval_code_void(code) {
        if (Array.isArray(code)) {
            code = code.join("\n");
        }
        await this.webR.evalRVoid(code);
    }

    /**
     * Install shims into the R environment
     * @param {string[]} shims - Array of shim names to install
     */
    async install_shims(shims) {
        if (this.debug) console.log("Install R shims: ", shims);

        const code = [];
        for (const shim of shims) {
            if (shim === "install.packages") {
                code.push(get_install_packages_shim());
            } else if (shim === "webr::install") {
                code.push(get_webr_install_shim());
            } else {
                throw new Error("Unknown shim: '" + shim + "'");
            }
        }

        if (code.length > 0) {
            if (this.debug) {
                console.log(`Shim code: [n=${code.length}]`);
                for (const code0 of code) console.log(`${code0}`);
            }
            await this.webR.evalRVoid(code);
        }
    }

    /**
     * Set the R library paths
     * @param {string} lib_path - Path to add to .libPaths()
     */
    async set_lib_paths(lib_path) {
        await this.webR.evalRVoid(`.libPaths("${lib_path}")`);
    }

    /**
     * Get the webR version
     * @returns {string} webR version
     */
    get_webr_version() {
        return this.webR.version;
    }

    /**
     * Close the session (cleanup)
     */
    async close() {
        // WebR doesn't have an explicit close, but we can mark as uninitialized
        this._initialized = false;
        this.webR = null;
    }
}

/**
 * Options for running R code
 * @typedef {Object} RunOptions
 * @property {boolean} debug - Enable debug output
 * @property {string[]} webr_args - Arguments to pass to webR/R
 * @property {string} r_libs_user - Host path for R library
 * @property {Array<{host: string, webr: string}>} binds - Directory bindings
 * @property {string} bastion_host - Host path for bastion directory
 * @property {string[]} shims - Shims to install
 * @property {string[]} prologue_exprs - R expressions to run before main code
 * @property {string[]} exprs - Main R expressions to run
 * @property {string[]} epilogue_exprs - R expressions to run after main code
 * @property {number} timeout - Timeout in seconds
 */

/**
 * Run R code with full prologue/main/epilogue support
 * @param {RunOptions} options - Run options
 * @returns {Promise<RwSession>} The session used for execution
 */
export async function run(options = {}) {
    const {
        debug = false,
        webr_args = [],
        r_libs_user = null,
        binds = [],
        bastion_host = null,
        shims = ["install.packages"],
        prologue_exprs = [],
        exprs = [],
        epilogue_exprs = [],
        timeout = 0
    } = options;

    const session = new RwSession({ debug });
    await session.init({ r_args: webr_args });

    // Mount R library if specified
    if (r_libs_user) {
        const normalized_libs = normalize_path(r_libs_user);
        const r_libs_webr = "/host/R_LIBS_USER";
        await session.mount(normalized_libs, r_libs_webr);
        await session.set_lib_paths(r_libs_webr);
    }

    // Bind host directories
    for (const bind of binds) {
        await session.mount(bind.host, bind.webr);
    }

    // Install shims
    const filtered_shims = shims.filter(str => str !== "");
    if (filtered_shims.length > 0) {
        await session.install_shims(filtered_shims);
    }

    const r_bastion_webr = "/host/bastion";

    // Prologue
    if (prologue_exprs.length > 0) {
        if (debug) console.log("Evaluating prologue R code ...");

        if (bastion_host) {
            await session.mount(bastion_host, r_bastion_webr);
        }

        await session.eval_code(prologue_exprs, { timeout });

        if (bastion_host) {
            await session.unmount(r_bastion_webr);
        }

        if (debug) console.log("Evaluating prologue R code ... done");
    }

    // Main
    if (exprs.length > 0) {
        if (debug) console.log("Evaluate main R code ...");
        await session.eval_code(exprs, { timeout });
        if (debug) console.log("Evaluate main R code ... done");
    }

    // Epilogue
    if (epilogue_exprs.length > 0) {
        if (debug) console.log("Evaluating epilogue R code ...");

        if (bastion_host) {
            await session.mount(bastion_host, r_bastion_webr);
        }

        await session.eval_code(epilogue_exprs, { timeout });

        if (bastion_host) {
            await session.unmount(r_bastion_webr);
        }

        if (debug) console.log("Evaluating epilogue R code ... done");
    }

    return session;
}

/**
 * Get the webR version without initializing a full session
 * @returns {Promise<string>} webR version
 */
export async function get_webr_version() {
    const webR = new WebR();
    return webR.version;
}

/**
 * Get the R version
 * @returns {Promise<string>} R version
 */
export async function get_r_version() {
    const webR = new WebR({ RArgs: ["--vanilla"] });
    await webR.init();
    await webR.evalR(`cat(as.character(getRversion()))`);
}

/**
 * Get detailed R configuration info
 * @returns {Promise<void>} Prints configuration to stdout
 */
export async function get_r_info(field = null) {
    const webR = new WebR({ RArgs: ["--vanilla"] });
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
        'lines <- c(lines, sprintf("rw_suggestions:%s=%s", names(values), values))',
        'lines <- sort(lines)'
    ];
    if (field !== null) {
        code.push(
            `field <- ${JSON.stringify(field)}`,
            'prefix <- paste0(field, "=")',
            'idx <- which(startsWith(lines, prefix))',
            'if (length(idx) == 0L) {',
            '    message(sprintf("Unknown --config field: %s", field))',
            '    message("Available fields:")',
            '    fields <- sub("=.*", "", lines)',
            '    message(paste(sprintf("  %s", fields), collapse = "\\n"))',
            '} else {',
            '    values <- substring(lines[idx], nchar(prefix) + 1L)',
            '    writeLines(values)',
            '}'
        );
    } else {
        code.push('writeLines(lines)');
    }
    await webR.evalR(code);
}
