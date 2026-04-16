/**
 * @module @henrikbengtsson/rw
 * @description Run R code in a sandboxed WebAssembly environment via webR
 */

export {
  // High-level API
  run,
  // Session class
  RwSession,
  // Metadata
  version,
} from "./src/rw_session.js";
