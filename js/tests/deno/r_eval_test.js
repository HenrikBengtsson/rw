/**
 * Tests that execute R code via the RwSession JS API.
 *
 * Covers the examples shown in `rw --help` without spawning CLI subprocesses.
 * webR is initialised once and shared across all tests in this file to keep
 * total runtime manageable (~10-30 s for the first test, < 1 s for the rest).
 *
 * Run with:  deno test --allow-all tests/deno/r_eval_test.js
 */

import { assert, assertEquals } from "jsr:@std/assert";
import { RwSession } from "../../src/rw_session.js";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Shared webR session
// ---------------------------------------------------------------------------

/** Lazy singleton — webR is started once and reused across all tests. */
let _session = null;
async function get_session() {
  if (!_session) {
    _session = new RwSession();
    await _session.init({ r_args: ["--vanilla"] });
  }
  return _session;
}

/**
 * Evaluate R code in the shared session and return captured output.
 * @param {string|string[]} code
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function eval_r(code) {
  const s = await get_session();
  const resp = await s.eval_code(code, { capture_output: false });
  const stdout = resp.output
    .filter((o) => o.type === "stdout")
    .map((o) => o.data)
    .join("\n");
  const stderr = resp.output
    .filter((o) => o.type === "stderr")
    .map((o) => o.data)
    .join("\n");
  return { stdout, stderr };
}

// Disable resource / op sanitizers: webR keeps internal Worker handles open
// for the life of the process, which would otherwise fail the sanitizer.
const T = { sanitizeResources: false, sanitizeOps: false, timeout: 120_000 };

// ---------------------------------------------------------------------------
// rw --expr="sum(1:100)"
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: 'rw --expr="sum(1:100)"',
  async fn() {
    const { stdout } = await eval_r("sum(1:100)");
    assert(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  },
});

// ---------------------------------------------------------------------------
// rw <<< "1 + 2"
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: 'rw <<< "1 + 2"',
  async fn() {
    const { stdout } = await eval_r("1 + 2");
    assert(stdout.includes("3"), `Expected 3 in stdout:\n${stdout}`);
  },
});

// ---------------------------------------------------------------------------
// rw main.R  (script file → lines array → eval)
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "rw main.R (multi-line script)",
  async fn() {
    const tmp = Deno.makeTempFileSync({ prefix: "rw_eval_", suffix: ".R" });
    try {
      fs.writeFileSync(tmp, "x_main <- 6L\ny_main <- 7L\nx_main * y_main\n");
      // Simulate what parse_args + read_code produce before passing to run()
      const lines = fs.readFileSync(tmp, "utf8")
        .split(/\r?\n/)
        .filter((l) => l !== "");
      const { stdout } = await eval_r(lines);
      assert(stdout.includes("42"), `Expected 42 in stdout:\n${stdout}`);
    } finally {
      fs.unlinkSync(tmp);
    }
  },
});

// ---------------------------------------------------------------------------
// rw --expr="message('running script ...')" main.R
// message() output lands on stderr
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: 'rw --expr="message(\'running script ...\')"',
  async fn() {
    const { stderr } = await eval_r("message('running script ...')");
    assert(
      stderr.includes("running script"),
      `Expected message() in stderr:\n${stderr}`,
    );
  },
});

// ---------------------------------------------------------------------------
// Multiple --expr flags (joined and evaluated together)
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "rw --expr=... --expr=... (multiple expressions)",
  async fn() {
    const exprs = ["x_multi <- 100L", "x_multi + 1L"];
    const { stdout } = await eval_r(exprs);
    assert(stdout.includes("101"), `Expected 101 in stdout:\n${stdout}`);
  },
});

// ---------------------------------------------------------------------------
// --prologue-expr + --expr: data produced by prologue is visible in main
// Corresponds to:
//   rw --prologue-expr="data_in <- c(1, 4, 9, 16)" \
//      --expr="data_out <- lapply(data_in, sqrt)"
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "--prologue-expr sets up data consumed by --expr",
  async fn() {
    const s = await get_session();
    // Prologue: assign data_in (unique name to avoid clobbering other tests)
    await s.eval_code("data_in_prologue_test <- c(1, 4, 9, 16)", {
      capture_output: false,
    });
    // Main: transform
    const { stdout } = await eval_r(
      "unlist(lapply(data_in_prologue_test, sqrt))",
    );
    // sqrt(1)=1, sqrt(4)=2, sqrt(9)=3, sqrt(16)=4
    assert(stdout.includes("1"), `Expected 1 in stdout:\n${stdout}`);
    assert(stdout.includes("2"), `Expected 2 in stdout:\n${stdout}`);
    assert(stdout.includes("4"), `Expected 4 in stdout:\n${stdout}`);
  },
});

// ---------------------------------------------------------------------------
// --epilogue-expr: runs after main, can read variables set by main
// Corresponds to:
//   rw --expr="data_out <- lapply(data_in, sqrt)" \
//      --epilogue-expr="cat(length(data_out), '\\n')"
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "--epilogue-expr reads variables written by --expr",
  async fn() {
    const s = await get_session();
    // Main
    await s.eval_code("result_epilogue_test <- 42L", { capture_output: false });
    // Epilogue
    const { stdout } = await eval_r(
      "cat(result_epilogue_test, '\\n')",
    );
    assert(
      stdout.includes("42"),
      `Expected 42 in epilogue stdout:\n${stdout}`,
    );
  },
});

// ---------------------------------------------------------------------------
// rw --timeout=3.5 ... tryCatch(slow(), interrupt = identity)
//
// The slow function sleeps 5 s; the timeout fires at 3.5 s.  Because the
// user code catches the interrupt with identity(), eval_code completes
// cleanly.  The whole thing must finish well under 5 s.
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "rw --timeout interrupts a slow expression (caught by tryCatch)",
  async fn() {
    const s = await get_session();
    const code = [
      "slow_timeout_test <- function() { Sys.sleep(5); 42 }",
      "tryCatch(slow_timeout_test(), interrupt = identity)",
    ];
    const t0 = Date.now();
    await s.eval_code(code, { timeout: 3.5, capture_output: false });
    const elapsed = (Date.now() - t0) / 1000;
    assert(
      elapsed < 5,
      `Expected interrupt in < 5 s, took ${elapsed.toFixed(1)} s`,
    );
  },
});

// ---------------------------------------------------------------------------
// R errors propagate as JS errors
// eval_code throws when R raises an unhandled error
// ---------------------------------------------------------------------------

Deno.test({
  ...T,
  name: "R error propagates as a JS error",
  async fn() {
    const s = await get_session();
    let threw = false;
    try {
      await s.eval_code('stop("deliberate test error")', {
        capture_output: false,
      });
    } catch (e) {
      threw = true;
      assertEquals(e.r_error, true);
    }
    assert(threw, "Expected eval_code to throw for an R error");
  },
});
