import { assert, assertEquals } from "jsr:@std/assert";

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
  name: "--persistent does NOT automatically set --allow-net",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { stderr } = await rw([
      "--no-config",
      "--debug",
      "--persistent",
      "--r-libs-user=/tmp/rlibs",
      "--expr=1",
    ]);
    
    assert(!stderr.includes("--allow-net"), "Should NOT include --allow-net even with --persistent");
  },
});

Deno.test({
  name: "--persistent WITH --allow-net DOES set --allow-net",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { stderr } = await rw([
      "--no-config",
      "--debug",
      "--persistent",
      "--allow-net",
      "--r-libs-user=/tmp/rlibs",
      "--expr=1",
    ]);
    
    assert(stderr.includes("--allow-net"), "Should include --allow-net when explicitly requested");
  },
});

Deno.test({
  name: "'install' command DOES automatically set --allow-net",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // We use a non-existent package to avoid actual install but we want to see the deno command
    const { stderr } = await rw([
      "--no-config",
      "--debug",
      "--persistent",
      "--r-libs-user=/tmp/rlibs",
      "install",
      "nonexistentpackage",
    ]);
    
    assert(stderr.includes("--allow-net"), "Should include --allow-net for 'install' command");
  },
});

Deno.test({
  name: "'uninstall' command does NOT automatically set --allow-net",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { stderr } = await rw([
      "--no-config",
      "--debug",
      "--persistent",
      "--r-libs-user=/tmp/rlibs",
      "uninstall",
      "somepackage",
    ]);
    
    assert(!stderr.includes("--allow-net"), "Should NOT include --allow-net for 'uninstall' command");
  },
});
