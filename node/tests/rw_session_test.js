/**
 * Unit tests for src/rw_session.js — normalize_path() and read_code().
 * Run with:  deno test --allow-read --allow-write --allow-env --allow-sys tests/rw_session_test.js
 */

import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  author,
  get_webr_install_shim,
  license,
  normalize_path,
  read_code,
  version,
  webr_version,
} from "../src/rw_session.js";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// normalize_path
// ---------------------------------------------------------------------------

Deno.test("normalize_path: absolute path returned as-is", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_np_" });
  try {
    const result = normalize_path(tmp);
    assertEquals(result, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("normalize_path: '~' expands to home directory", () => {
  const result = normalize_path("~");
  assertEquals(result, os.homedir());
});

Deno.test("normalize_path: '~/subdir' expands relative to home", () => {
  const sub = fs.mkdtempSync(path.join(os.homedir(), "rw_np_test_"));
  try {
    const result = normalize_path("~/" + path.basename(sub));
    assertEquals(result, sub);
  } finally {
    fs.rmSync(sub, { recursive: true });
  }
});

Deno.test("normalize_path: relative path resolved to absolute", () => {
  const orig = Deno.cwd();
  const tmp = Deno.makeTempDirSync({ prefix: "rw_relpath_" });
  const subdir = path.join(tmp, "sub");
  fs.mkdirSync(subdir);
  try {
    Deno.chdir(tmp);
    const result = normalize_path("sub");
    assertEquals(result, subdir);
  } finally {
    Deno.chdir(orig);
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("normalize_path: non-existent path throws", () => {
  assertThrows(
    () => normalize_path("/this/path/does/not/exist/at/all"),
    Error,
    "No such",
  );
});

Deno.test("normalize_path: error message includes the path", () => {
  const missing = "/no/such/path/xyz_rw_test";
  let msg = "";
  try {
    normalize_path(missing);
  } catch (e) {
    msg = e.message;
  }
  assertEquals(msg.includes(missing), true);
});

// ---------------------------------------------------------------------------
// read_code
// ---------------------------------------------------------------------------

Deno.test("read_code: reads lines from a file", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_rc_", suffix: ".R" });
  try {
    fs.writeFileSync(tmp, "x <- 1\ny <- 2\nz <- x + y\n");
    const lines = read_code(tmp);
    assertEquals(lines, ["x <- 1", "y <- 2", "z <- x + y"]);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("read_code: filters out empty lines", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_rc_", suffix: ".R" });
  try {
    fs.writeFileSync(tmp, "x <- 1\n\ny <- 2\n\n");
    const lines = read_code(tmp);
    assertEquals(lines, ["x <- 1", "y <- 2"]);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("read_code: handles Windows CRLF line endings", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_rc_", suffix: ".R" });
  try {
    fs.writeFileSync(tmp, "a <- 1\r\nb <- 2\r\n");
    const lines = read_code(tmp);
    assertEquals(lines, ["a <- 1", "b <- 2"]);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("read_code: empty file returns empty array", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_rc_", suffix: ".R" });
  try {
    fs.writeFileSync(tmp, "");
    const lines = read_code(tmp);
    assertEquals(lines, []);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("read_code: file with only blank lines returns empty array", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_rc_", suffix: ".R" });
  try {
    fs.writeFileSync(tmp, "\n\n\n");
    const lines = read_code(tmp);
    assertEquals(lines, []);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("read_code: debug=true logs lines to console", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_rc_", suffix: ".R" });
  try {
    fs.writeFileSync(tmp, "x <- 1\ny <- 2\n");
    // Capture console.log output to verify debug logging fires
    const logged = [];
    const orig = console.log;
    console.log = (...args) => logged.push(args.join(" "));
    try {
      const lines = read_code(tmp, "main", true);
      assertEquals(lines, ["x <- 1", "y <- 2"]);
    } finally {
      console.log = orig;
    }
    assertEquals(logged.length, 2);
    assertEquals(logged[0].includes("R main code"), true);
  } finally {
    fs.unlinkSync(tmp);
  }
});

// ---------------------------------------------------------------------------
// get_webr_install_shim
// ---------------------------------------------------------------------------

Deno.test("get_webr_install_shim: returns a non-empty R code string", () => {
  const shim = get_webr_install_shim();
  assertEquals(typeof shim, "string");
  assertEquals(shim.length > 0, true);
  assertEquals(shim.includes("webr::install"), true);
});

// ---------------------------------------------------------------------------
// metadata exports
// ---------------------------------------------------------------------------

Deno.test("version: is a semver string", () => {
  assertEquals(typeof version, "string");
  assertEquals(/^\d+\.\d+\.\d+/.test(version), true);
});

Deno.test("author: is a non-empty string", () => {
  assertEquals(typeof author, "string");
  assertEquals(author.length > 0, true);
});

Deno.test("license: is a non-empty string", () => {
  assertEquals(typeof license, "string");
  assertEquals(license.length > 0, true);
});

Deno.test("webr_version: is a semver string", () => {
  assertEquals(typeof webr_version, "string");
  assertEquals(/^\d+\.\d+\.\d+/.test(webr_version), true);
});
