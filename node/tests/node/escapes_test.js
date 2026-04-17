/**
 * Integration tests: escape attempts via webr::eval_js() MUST succeed
 * when rw runs under Node.js, because Node does not support high isolation.
 *
 * Each test spawns a full `node cli.js` process (webR startup included), so
 * these are intentionally slow (~10-30 s each).  Run with:
 *
 *   node --test tests/node/escapes_test.js
 *   make node-escape-tests
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
 * Run cli.js under Node.js with R code supplied on stdin.
 * @param {string} r_code
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function rw(r_code) {
  const result = spawnSync(process.execPath, [CLI, "--runtime=node:webr"], {
    input: r_code,
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
// Escape tests — all three MUST succeed under Node.js (no high isolation)
// ---------------------------------------------------------------------------

describe("Node.js escape tests (no high isolation — escapes expected to succeed)", () => {
  it("escape: webr::eval_js CAN read arbitrary host files (fs.readFileSync)", () => {
    const hostname = fs.readFileSync("/etc/hostname", "utf8").trim();
    assert.ok(
      hostname.length > 0,
      "Could not read /etc/hostname for test setup",
    );

    const { code, stdout, stderr } = rw(
      `webr::eval_js('import("fs").then(m => m.readFileSync("/etc/hostname", "utf8"))', await = TRUE)\n`,
    );

    assert.equal(
      code,
      0,
      `Expected exit code 0 (escape should succeed), got ${code}\nstderr: ${stderr}`,
    );
    assert.ok(
      stdout.includes(hostname) || stderr.includes(hostname),
      `Hostname "${hostname}" was NOT found in output — escape failed unexpectedly.\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
  });

  it("escape: webr::eval_js CAN write to arbitrary host paths (fs.writeFileSync)", () => {
    const target = path.join(
      os.tmpdir(),
      `rw_escape_write_node_${Date.now()}.txt`,
    );
    if (fs.existsSync(target)) fs.unlinkSync(target);

    try {
      const { code, stderr } = rw(
        `webr::eval_js('import("fs").then(m => { m.writeFileSync(${
          JSON.stringify(target)
        }, "written from webR"); return "ok"; })', await = TRUE)\n`,
      );

      assert.equal(
        code,
        0,
        `Expected exit code 0 (escape should succeed), got ${code}\nstderr: ${stderr}`,
      );
      assert.ok(
        fs.existsSync(target),
        `Escape did NOT write file to ${target} — escape failed unexpectedly.`,
      );
    } finally {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  });

  it("escape: webr::eval_js CAN exec host commands (child_process.execSync)", () => {
    const { code, stdout, stderr } = rw(
      `webr::eval_js('import("child_process").then(m => m.execSync("id").toString())', await = TRUE)\n`,
    );

    assert.equal(
      code,
      0,
      `Expected exit code 0 (escape should succeed), got ${code}\nstderr: ${stderr}`,
    );
    assert.ok(
      stdout.includes("uid=") || stderr.includes("uid="),
      `exec output ("uid=...") was NOT found — escape failed unexpectedly.\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
  });
});
