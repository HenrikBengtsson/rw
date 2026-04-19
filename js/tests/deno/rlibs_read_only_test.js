/**
 * Integration test: verify that --r-libs-user is read-only without --persistent
 * when running under Deno (which enforces this via --allow-write).
 */

import { assert, assertEquals } from "jsr:@std/assert";
import * as fs from "node:fs";
import * as path from "node:path";

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

async function rw(args = []) {
  const proc = new Deno.Command("deno", {
    args: [...DENO_ARGS, ...args],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const out = await proc.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
}

Deno.test({
  name: "--r-libs-user is read-only without --persistent",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_rlibs_ro_" });
    try {
      const { code, stderr } = await rw([

        `--r-libs-user=${tmp}`,
        "--expr=cat('test', file='/host/R_LIBS_USER/test.txt')",
      ]);
      
      // It should fail with a Deno permission error (NotCapable)
      // which results in exit code 1 and a specific error message in stderr.
      assertEquals(code, 1, `Expected exit code 1, got ${code}\nstderr: ${stderr}`);
      assert(
        stderr.includes('Requires write access to') || stderr.includes('PermissionDenied'),
        `Expected permission error in stderr, got:\n${stderr}`
      );
      
      // Verify file was NOT created
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert(!exists, "File should NOT have been created in read-only mount");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "--r-libs-user is writable WITH --persistent",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_rlibs_rw_" });
    try {
      const { code, stderr } = await rw([

        "--persistent",
        `--r-libs-user=${tmp}`,
        "--expr=cat('test', file='/host/R_LIBS_USER/test.txt')",
      ]);
      
      assertEquals(code, 0, `Expected exit code 0, got ${code}\nstderr: ${stderr}`);
      
      // Verify file WAS created
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert(exists, "File should have been created in writable mount");
      assertEquals(fs.readFileSync(path.join(tmp, "test.txt"), "utf8"), "test");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "--bind with :ro is read-only",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_bind_ro_" });
    try {
      const { code, stderr } = await rw([

        `--bind=${tmp}:/data:ro`,
        "--expr=cat('test', file='/data/test.txt')",
      ]);
      
      assertEquals(code, 1, `Expected exit code 1, got ${code}\nstderr: ${stderr}`);
      assert(
        stderr.includes('Requires write access to') || stderr.includes('PermissionDenied'),
        `Expected permission error in stderr, got:\n${stderr}`
      );
      
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert(!exists, "File should NOT have been created in read-only bind");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "--bind with :rw is writable",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_bind_rw_" });
    try {
      const { code, stderr } = await rw([

        `--bind=${tmp}:/data:rw`,
        "--expr=cat('test', file='/data/test.txt')",
      ]);
      
      assertEquals(code, 0, `Expected exit code 0, got ${code}\nstderr: ${stderr}`);
      
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert(exists, "File should have been created in writable bind");
      assertEquals(fs.readFileSync(path.join(tmp, "test.txt"), "utf8"), "test");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "--bastion with :ro is read-only",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_bastion_ro_" });
    try {
      // Epilogue attempt to write to read-only bastion
      const { code, stderr } = await rw([

        `--bastion=${tmp}:ro`,
        "--expr=1",
        "--epilogue-expr=cat('test', file='/host/bastion/test.txt')",
      ]);
      
      assertEquals(code, 1, `Expected exit code 1, got ${code}\nstderr: ${stderr}`);
      assert(
        stderr.includes('Requires write access to') || stderr.includes('PermissionDenied'),
        `Expected permission error in stderr, got:\n${stderr}`
      );
      
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert(!exists, "File should NOT have been created in read-only bastion");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "--bastion (default) is writable",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_bastion_rw_" });
    try {
      const { code, stderr } = await rw([

        `--bastion=${tmp}`,
        "--expr=1",
        "--epilogue-expr=cat('test', file='/host/bastion/test.txt')",
      ]);
      
      assertEquals(code, 0, `Expected exit code 0, got ${code}\nstderr: ${stderr}`);
      
      const exists = fs.existsSync(path.join(tmp, "test.txt"));
      assert(exists, "File should have been created in writable bastion");
      assertEquals(fs.readFileSync(path.join(tmp, "test.txt"), "utf8"), "test");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});
