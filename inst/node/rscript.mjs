#! /usr/bin/env node
/*
USAGE:

  rscript.mjs [rwasm options] [options] file [args]
  rscript.mjs [rwasm options] [options] --expr=expr [args]
  
RWASM OPTIONS:

  --debug              Display debug output
  --r-libs=<host-dir>  Bind R user library to host directory.
  --shared=<host-dir>  Bind ~/shared to a host directory.

EXAMPLES:

  rscript.mjs --expr="1+2"
  rscript.mjs hello.R

  ## Install R package to persistent storage
  rscript.mjs --r-libs=r-libs/emscripten/4.5 --expr="install.packages('cli')"
*/


import { WebR } from "webr";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// reconstruct __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse node CLI arguments
const args = process.argv.slice(2);

// crude parser
let debug = false;
let r_libs_host = null;
let r_shared_host = null;
let r_file = null;
let r_expr = null;
let r_args = [];

for (const arg of args) {
  if (arg.startsWith("--debug")) {
    debug = true;        
  } else if (arg.startsWith("--r-libs=")) {
    r_libs_host = arg.split("=")[1];
    if (!path.isAbsolute(r_libs_host)) {
      r_libs_host = path.join(__dirname, r_libs_host);
    }
    if (!fs.existsSync(r_libs_host)) {
      console.error("ERROR: No such directory:", r_libs_host);
      process.exit(1);
    }
  } else if (arg.startsWith("--shared=")) {
    r_shared_host = arg.split("=")[1];
    if (!path.isAbsolute(r_libs_host)) {
      r_shared_host = path.join(__dirname, r_shared_host);
    }
    if (!fs.existsSync(r_shared_host)) {
      console.error("ERROR: No such directory:", r_shared_host);
      process.exit(1);
    }
  } else if (arg.startsWith("--expr=")) {
    r_expr = arg.split("=")[1];
  } else {
    if (r_file == null) {
      r_file = arg
      if (!fs.existsSync(r_file)) {
        console.error("ERROR: No such file:", r_file);
        process.exit(1);
      }        
    } else {
      r_args.push(arg);
    }
  }
}

// Launch webR instance
const webR = new WebR({
  RArgs: ["--vanilla", "--args", ...r_args]
});
await webR.init();

// Bind R user library to the R library path on host?
if (r_libs_host !== null) {
  const r_libs = "/home/web_user/r-libs"
  if (debug) console.log(`Binding '${r_libs}' to '${r_libs_host}' on host`)

  // Create local R user library
  await webR.FS.mkdir(r_libs);

  // Mount it
  await webR.FS.mount(
    "NODEFS",
    { root: r_libs_host },
    r_libs
  )
  
  // Set as R user library
  await webR.evalRVoid(`.libPaths("${r_libs}")`)
}


// Bind /shared to folder on host?
if (r_shared_host !== null) {
  let r_shared = "/home/web_user/shared"
  if (debug) console.log(`Binding '${r_shared}' to '${r_shared_host}' on host`)
    
  // Create R user library
  await webR.FS.mkdir(r_shared);

  // Mount it
  await webR.FS.mount(
    "NODEFS",
    { root: r_shared_host },
    r_shared
  )
}


// Source R script?
let code = []
if (r_file !== null) {
  code = fs.readFileSync(r_file, 'utf8').split(/\r?\n/)
} else if (r_expr !== null) {
  code = r_expr
} else {
  console.error("ERROR: Neither a R script nor an R expression was specified")
  process.exit(1)
}


if (debug) {
  console.log("R code to be parsed and evaluated:")
  console.log(code)
}    

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

shelter.purge()

process.exit(0)
