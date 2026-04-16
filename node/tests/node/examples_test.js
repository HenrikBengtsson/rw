/**
 * Integration tests: verify the examples shown in `rw --help` work correctly
 * when running under Node.js.
 *
 * Each test that evaluates R code spawns a full process (webR startup
 * included), so these are intentionally slow (~10-30 s each).  Run with:
 *
 *   node --test tests/node/examples_test.js
 *   make node-examples-tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const CLI = fileURLToPath(new URL("../../src/cli.js", import.meta.url));

/**
 * Run cli.js under Node.js.
 * @param {string[]} args  CLI arguments
 * @param {Object}   opts
 * @param {string}   [opts.stdin]  Data written to stdin
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function rw(args = [], opts = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    input: opts.stdin,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// Examples from `rw --help`
// ---------------------------------------------------------------------------

describe("rw --help examples", () => {
  // rw --expr="sum(1:100)"
  it('rw --expr="sum(1:100)"', () => {
    const { code, stdout, stderr } = rw(["--no-config", "--expr=sum(1:100)"]);
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.ok(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  });

  // rw <<< "1 + 2"
  it('rw <<< "1 + 2" (stdin herestring)', () => {
    const { code, stdout, stderr } = rw(["--no-config"], { stdin: "1 + 2\n" });
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.ok(stdout.includes("3"), `Expected 3 in stdout:\n${stdout}`);
  });

  // echo "sum(1:100)" | rw
  it('echo "sum(1:100)" | rw (stdin pipe)', () => {
    const { code, stdout, stderr } = rw(["--no-config"], {
      stdin: "sum(1:100)\n",
    });
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.ok(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  });

  // rw main.R
  it("rw main.R (script file argument)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_ex_"));
    const script = path.join(tmp, "main.R");
    try {
      fs.writeFileSync(script, "sum(1:100)\n");
      const { code, stdout, stderr } = rw(["--no-config", script]);
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      assert.ok(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  // rw < main.R
  it("rw < main.R (stdin redirect)", () => {
    const { code, stdout, stderr } = rw(["--no-config"], {
      stdin: "sum(1:100)\n",
    });
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.ok(stdout.includes("5050"), `Expected 5050 in stdout:\n${stdout}`);
  });

  // rw --expr="message('running script ...')" main.R
  it('rw --expr="message(...)" main.R (script path as R arg)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_ex_"));
    const script = path.join(tmp, "main.R");
    try {
      fs.writeFileSync(script, "print(sum(1:100))\n");
      // The script path is passed as a command-line argument to R
      // (commandArgs(trailingOnly=TRUE)), not executed.  --expr is the main code.
      const { code, stdout, stderr } = rw([
        "--no-config",
        "--expr=message('running script ...')",
        script,
      ]);
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      assert.ok(
        stderr.includes("running script ...") ||
          stdout.includes("running script ..."),
        `Expected message() output, stdout: ${stdout}\nstderr: ${stderr}`,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  // rw --timeout=3.5 --expr="slow <- function() { Sys.sleep(5); 42 }" \
  //                  --expr="tryCatch(slow(), interrupt = identity)"
  it("rw --timeout interrupts a slow expression", () => {
    const t0 = Date.now();
    const { code } = rw([
      "--no-config",
      "--timeout=3.5",
      "--expr=slow <- function() { Sys.sleep(5); 42 }",
      "--expr=tryCatch(slow(), interrupt = identity)",
    ]);
    const elapsed = (Date.now() - t0) / 1000;
    // The 5-second sleep must have been interrupted: finish well under 5 s
    assert.ok(
      elapsed < 5,
      `Expected process to finish in <5 s (interrupted), took ${elapsed.toFixed(1)} s`,
    );
    // tryCatch catches the interrupt, so R exits cleanly
    assert.equal(code, 0, "Expected exit code 0 when interrupt is caught by tryCatch");
  });

  // rw env get webr-version
  it("rw env get webr-version", () => {
    const { code, stdout, stderr } = rw([
      "--no-config",
      "env",
      "get",
      "webr-version",
    ]);
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.match(
      stdout.trim(),
      /^\d+\.\d+\.\d+$/,
      `Expected semver string, got: ${stdout.trim()}`,
    );
  });

  // rw env get r-version
  it("rw env get r-version", () => {
    const { code, stdout, stderr } = rw([
      "--no-config",
      "env",
      "get",
      "r-version",
    ]);
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.match(
      stdout.trim(),
      /^\d+\.\d+\.\d+$/,
      `Expected semver string, got: ${stdout.trim()}`,
    );
  });

  // rw env list
  it("rw env list", () => {
    const { code, stdout, stderr } = rw(["--no-config", "env", "list"]);
    assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
    assert.ok(
      stdout.includes("r_version:x_y_z="),
      `Expected r_version in output:\n${stdout}`,
    );
    assert.ok(
      stdout.includes("session:"),
      `Expected session fields in output:\n${stdout}`,
    );
  });
});
