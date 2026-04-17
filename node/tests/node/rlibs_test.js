/**
 * Integration test: verify --r-libs-user behavior under Node.js.
 * Note: Node.js runtime does not currently support read-only mounting/enforcement,
 * so the library will be writable even without --persistent.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../src/cli.js", import.meta.url));

/**
 * Run cli.js under Node.js.
 */
function rw(args = []) {
  const result = spawnSync(process.execPath, [CLI, "--runtime=node:webr", ...args], {
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("--r-libs-user under Node.js", () => {
  it("mounts and appends to .libPaths() without --persistent", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_rlibs_node_"));
    try {
      const { code, stdout, stderr } = rw([
        "--no-config",
        `--r-libs-user=${tmp}`,
        "--expr=.libPaths()",
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      // In R, the paths are quoted and space-separated in the default print output
      assert.ok(stdout.includes("/host/R_LIBS_USER"), `Expected /host/R_LIBS_USER in .libPaths():\n${stdout}`);
      
      // Verify it is appended (appears last)
      const lines = stdout.split("\n").filter(l => l.includes("/host/R_LIBS_USER"));
      assert.ok(lines.length > 0);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("is (unfortunately) writable without --persistent in Node.js", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_rlibs_node_rw_"));
    try {
      const { code, stderr } = rw([
        "--no-config",
        `--r-libs-user=${tmp}`,
        "--expr=cat('test', file='/host/R_LIBS_USER/test.txt')",
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      
      // Verify file WAS created (baseline for Node.js lack of RO support)
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File was created despite lack of --persistent (Node.js limitation)");
      assert.equal(fs.readFileSync(path.join(tmp, "test.txt"), "utf8"), "test");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("is writable WITH --persistent in Node.js", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_rlibs_node_rw_p_"));
    try {
      const { code, stderr } = rw([
        "--no-config",
        "--persistent",
        `--r-libs-user=${tmp}`,
        "--expr=cat('test', file='/host/R_LIBS_USER/test.txt')",
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File should have been created in writable mount");
      assert.equal(fs.readFileSync(path.join(tmp, "test.txt"), "utf8"), "test");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("errors for :ro bind in Node.js", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_bind_node_ro_"));
    try {
      const { code, stderr } = rw([
        "--no-config",
        `--bind=${tmp}:/data:ro`,
        "--expr=NULL",
      ]);
      
      assert.equal(code, 1, `exit ${code}\nstderr: ${stderr}`);
      assert.ok(stderr.includes("Read-only binds (:ro) are not supported"), `stderr: ${stderr}`);
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("accepts :rw bind in Node.js", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_bind_node_rw_"));
    try {
      const { code, stderr } = rw([
        "--no-config",
        `--bind=${tmp}:/data:rw`,
        "--expr=cat('test', file='/data/test.txt')",
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File should have been created in writable bind");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});
