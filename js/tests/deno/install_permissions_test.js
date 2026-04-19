/**
 * Integration test: verify that 'rw install' and 'rw uninstall' 
 * have correct Deno permissions for r-libs-user and networking.
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
  name: "'rw install' praise from CRAN",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_install_praise_" });
    try {
      // Install 'praise' from CRAN
      const { code, stderr, stdout } = await rw([
        "--no-config",
        "--verbose",
        "--persistent",
        `--r-libs-user=${tmp}`,
        "install",
        "praise"
      ]);
      
      assertEquals(code, 0, `Expected exit code 0, got ${code}\nstderr: ${stderr}\nstdout: ${stdout}`);
      
      // Verify the package was installed into the library
      // webR installs into a subdirectory named after the package
      const praiseDir = path.join(tmp, "praise");
      assert(fs.existsSync(praiseDir), `Package directory ${praiseDir} should exist`);
      assert(fs.existsSync(path.join(praiseDir, "DESCRIPTION")), "DESCRIPTION file should exist in praise/");
      
      // Verify we can USE the installed package
      const runRes = await rw([
        "--no-config",
        `--r-libs-user=${tmp}`,
        "--expr=cat(praise::praise())"
      ]);
      assertEquals(runRes.code, 0, `Failed to run praise: ${runRes.stderr}`);
      assert(runRes.stdout.length > 0, "praise() should return some text");
      
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "'rw uninstall' praise",
  sanitizeResources: false,
  sanitizeOps: false,
  timeout: 120_000,
  async fn() {
    const tmp = Deno.makeTempDirSync({ prefix: "rw_uninstall_praise_" });
    try {
      // 1. Manually create a dummy package directory to uninstall
      const praiseDir = path.join(tmp, "praise");
      fs.mkdirSync(praiseDir, { recursive: true });
      fs.writeFileSync(path.join(praiseDir, "DESCRIPTION"), "Package: praise\nVersion: 1.0.0\n");

      // 2. Uninstall it
      const { code, stderr } = await rw([
        "--no-config",
        "--verbose",
        "--persistent",
        `--r-libs-user=${tmp}`,
        "uninstall",
        "praise"
      ]);
      
      assertEquals(code, 0, `Expected exit code 0, got ${code}\nstderr: ${stderr}`);
      
      // 3. Verify it's gone
      assert(!fs.existsSync(praiseDir), "praise directory should have been removed");

    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  },
});
