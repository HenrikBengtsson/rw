/**
 * Integration tests: verify the examples shown in `rw --help` work correctly
 * when running under Deno.
 *
 * Each test that evaluates R code spawns a full process (webR startup
 * included), so these are intentionally slow (~10-30 s each).  Run separately:
 *
 *   deno task deno-examples-tests
 *   make deno-examples-tests
 */

import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const CLI = new URL("../../src/cli.js", import.meta.url).pathname;
const DENO_CFG = new URL("../../deno.json", import.meta.url).pathname;

const DENO_ARGS = [
  "run",
  "--allow-read",
  "--allow-write",
  "--allow-net",
  "--allow-env",
  "--allow-run",
  "--allow-sys",
  "--config",
  DENO_CFG,
  CLI,
  "--no-config",
  "--runtime=deno:webr",
];

/**
 * Run cli.js under Deno.
 * @param {string[]} args  CLI arguments
 * @param {Object}   opts
 * @param {string}   [opts.stdin]  Data written to stdin
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function rw(args = [], opts = {}) {
  const proc = new Deno.Command("deno", {
    args: [...DENO_ARGS, ...args],
    stdin: opts.stdin !== undefined ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  if (opts.stdin !== undefined) {
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(opts.stdin));
    await writer.close();
  }

  const out = await proc.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
}

// ---------------------------------------------------------------------------
// Examples from `rw --help`
// ---------------------------------------------------------------------------

Deno.test({
  name: 'rw --expr="sum(1:100)"',
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([
      "--expr=sum(1:100)",
    ]);
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  },
});

Deno.test({
  name: 'rw <<< "1 + 2" (stdin herestring)',
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([], {
      stdin: "1 + 2\n",
    });
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert(stdout.includes("3"), `Expected 3 in stdout:\n${stdout}`);
  },
});

Deno.test({
  name: 'echo "sum(1:100)" | rw (stdin pipe)',
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([], {
      stdin: "sum(1:100)\n",
    });
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  },
});

Deno.test({
  name: "rw main.R (script file argument)",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_ex_" });
    const script = path.join(tmp, "main.R");
    try {
      fs.writeFileSync(script, "sum(1:100)\n");
      const { code, stdout, stderr } = await rw([script]);
      assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
      assert(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "rw < main.R (stdin redirect)",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([], {
      stdin: "sum(1:100)\n",
    });
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  },
});

Deno.test({
  name: 'rw --expr="message(...)" main.R (script path as R arg)',
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_ex_" });
    const script = path.join(tmp, "main.R");
    try {
      fs.writeFileSync(script, "print(sum(1:100))\n");
      // The script path is passed as a command-line argument to R
      // (commandArgs(trailingOnly=TRUE)), not executed.  --expr is the main code.
      const { code, stdout, stderr } = await rw([
        "--expr=message('running script ...')",
        script,
      ]);
      assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
      assert(
        stderr.includes("running script ...") ||
          stdout.includes("running script ..."),
        `Expected message() output, stdout: ${stdout}\nstderr: ${stderr}`,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "rw --timeout interrupts a slow expression",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const t0 = Date.now();
    const { code } = await rw([
      "--timeout=1.0",
      "--expr=slow <- function() { Sys.sleep(20); 42 }",
      "--expr=tryCatch(slow(), interrupt = identity)",
    ]);
    const elapsed = (Date.now() - t0) / 1000;
    // The 20-second sleep must have been interrupted before it completes.
    // Allow up to 12 s to account for Deno subprocess startup overhead.
    assert(
      elapsed < 12,
      `Expected process to finish in <12 s (interrupted), took ${
        elapsed.toFixed(1)
      } s`,
    );
    // tryCatch catches the interrupt, so R exits cleanly
    assertEquals(
      code,
      0,
      "Expected exit code 0 when interrupt is caught by tryCatch",
    );
  },
});

Deno.test({
  name: "rw env get js-runtime",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([
      "env",
      "get",
      "js-runtime",
    ]);
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assertEquals(
      stdout.trim(),
      "deno",
      `Expected 'deno', got: ${stdout.trim()}`,
    );
  },
});

Deno.test({
  name: "rw env get webr-version",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([
      "env",
      "get",
      "webr-version",
    ]);
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assertMatch(
      stdout.trim(),
      /^\d+\.\d+\.\d+$/,
      `Expected semver string, got: ${stdout.trim()}`,
    );
  },
});

Deno.test({
  name: "rw env get r-version",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([
      "env",
      "get",
      "r-version",
    ]);
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assertMatch(
      stdout.trim(),
      /^\d+\.\d+\.\d+$/,
      `Expected semver string, got: ${stdout.trim()}`,
    );
  },
});

Deno.test({
  name: 'rw --allow-run=deno readLines("https://...") succeeds',
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw([
      "--allow-run=deno",
      "--expr=x <- readLines('https://www.r-project.org')",
      "--expr=cat(length(x) > 0)",
    ]);
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert(stdout.includes("TRUE"), `Expected TRUE in stdout:\n${stdout}`);
  },
});

// ---------------------------------------------------------------------------
// Stdin error detection
// ---------------------------------------------------------------------------

Deno.test({
  name: "rw --expr=... with piped stdin exits 1 with informative error",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 10_000,
  async fn() {
    const { code, stderr } = await rw(["--expr=1+1"], { stdin: "hello\n" });
    assertEquals(code, 1, `Expected exit 1, got ${code}`);
    assert(
      stderr.includes("R cannot read from stdin"),
      `Expected stdin error in stderr:\n${stderr}`,
    );
  },
});

Deno.test({
  name: "rw script.R with piped stdin exits 1 with informative error",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 10_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_ex_" });
    const script = path.join(tmp, "main.R");
    try {
      fs.writeFileSync(script, "1+1\n");
      const { code, stderr } = await rw([script], { stdin: "hello\n" });
      assertEquals(code, 1, `Expected exit 1, got ${code}`);
      assert(
        stderr.includes("R cannot read from stdin"),
        `Expected stdin error in stderr:\n${stderr}`,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "rw env list",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 200_000,
  async fn() {
    const { code, stdout, stderr } = await rw(["env", "list"]);
    assertEquals(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert(
      stdout.includes("\n"),
      `Expected newlines in output:\n${stdout}`,
    );
    assert(
      stdout.includes("r_version:x_y_z="),
      `Expected r_version in output:\n${stdout}`,
    );
    assert(
      stdout.includes("session:"),
      `Expected session fields in output:\n${stdout}`,
    );
  },
});
