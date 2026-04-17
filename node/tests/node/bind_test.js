/**
 * Integration test: verify --bind and --bastion behavior under Node.js.
 * Note: Node.js runtime does not currently support read-only mounting/enforcement,
 * so these will be writable even with :ro.
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

describe("--bind and --bastion under Node.js", () => {
  it("accepts --bind with :ro but does NOT enforce it", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_bind_ro_node_"));
    try {
      const { code, stderr } = rw([
        "--no-config",
        `--bind=${tmp}:/data:ro`,
        "--expr=cat('test', file='/data/test.txt')",
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      
      // Node.js doesn't enforce read-only yet, so this file WILL be created.
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File was created despite :ro (Node.js limitation)");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("accepts --bind with :rw", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_bind_rw_node_"));
    try {
      const { code, stderr } = rw([
        "--no-config",
        `--bind=${tmp}:/data:rw`,
        "--expr=cat('test', file='/data/test.txt')",
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstderr: ${stderr}`);
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File should have been created in :rw bind");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("accepts --bastion with :ro but does NOT enforce it", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_bastion_ro_node_"));
    try {
      const { code, stdout, stderr } = rw([
        "--no-config",
        `--bastion=${tmp}:ro`,
        `--prologue-expr=cat('test', file='/host/bastion/test.txt')`,
        `--expr=NULL`
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstdout: ${stdout}\nstderr: ${stderr}`);
      
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File was created despite :ro (Node.js limitation)");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("accepts --bastion with :rw", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw_bastion_rw_node_"));
    try {
      const { code, stdout, stderr } = rw([
        "--no-config",
        `--bastion=${tmp}:rw`,
        `--prologue-expr=cat('test', file='/host/bastion/test.txt')`,
        `--expr=NULL`
      ]);
      
      assert.equal(code, 0, `exit ${code}\nstdout: ${stdout}\nstderr: ${stderr}`);
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert.ok(exists, "File should have been created in :rw bastion");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});
