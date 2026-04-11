/**
 * @module @henrikbengtsson/rw
 * @description Run R code in a sandboxed WebAssembly environment via webR
 */

export {
    // Metadata
    version,
    author,
    license,

    // Utility functions
    normalize_path,
    read_code,
    get_install_packages_shim,
    get_webr_install_shim,

    // Session class
    RwSession,

    // High-level API
    run,
    get_r_info
} from "./rw_session.js";
