/**
 * @module @henrikbengtsson/rw
 * @description Run R code in a sandboxed WebAssembly environment via webR
 */

export {
  author,
  get_install_packages_shim,
  get_r_info,
  get_webr_install_shim,
  license,
  // Utility functions
  normalize_path,
  read_code,
  // High-level API
  run,
  // Session class
  RwSession,
  // Metadata
  version,
} from "./src/rw_session.js";
