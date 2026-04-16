/**
 * Unit tests for src/rw_session.js — normalize_path() and read_code().
 * Run with:  deno test --allow-read --allow-write --allow-env --allow-sys tests/rw_session_test.js
 */

import { assertEquals, assertThrows } from "jsr:@std/assert";
import { normalize_path, read_code } from "../src/rw_session.js";
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

Deno.test("normalize_path: '~/...' expands relative to home", () => {
    // Use the home dir itself to avoid creating a real subdir
    const home = os.homedir();
    const result = normalize_path("~");
    assertEquals(result, home);
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
