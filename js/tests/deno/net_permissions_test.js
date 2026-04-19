import { assert, assertEquals } from "jsr:@std/assert";
import * as path from "node:path";
import * as fs from "node:fs";

const CLI = new URL("../../src/cli.js", import.meta.url).pathname;
const DENO_CFG = new URL("../../deno.json", import.meta.url).pathname;
const ROOT = new URL("../..", import.meta.url).pathname;

// Load real r-libs-user from project .rwconfig to ensure curl is available
const realConfig = fs.readFileSync(path.join(ROOT, ".rwconfig"), "utf8");
const rLibsMatch = realConfig.match(/r-libs-user=(.+)/);
const R_LIBS_USER = rLibsMatch ? rLibsMatch[1] : null;

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

async function rw(args = [], opts = {}) {
  // Use explicit --r-libs-user to ensure worker sees it
  const extraArgs = [];
  if (R_LIBS_USER && !args.includes("--no-config") && !args.some(a => a.startsWith("--r-libs-user="))) {
    extraArgs.push(`--r-libs-user=${R_LIBS_USER}`);
  }

  const proc = new Deno.Command("deno", {
    args: [...DENO_ARGS, ...extraArgs, ...args],
    stdout: "piped",
    stderr: "piped",
    stdin: "piped",
  }).spawn();

  if (opts.stdin) {
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

Deno.test({
  name: "ALL_PROXY and curl::has_internet() with --allow-net",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { code, stdout, stderr } = await rw([
      "--allow-net=ws.r-universe.dev:443",
      "--persistent",
    ], {
      stdin: 'Sys.setenv(ALL_PROXY = "socks5h://test:yolo@ws.r-universe.dev:443")\ncurl::has_internet()\n'
    });
    
    assertEquals(code, 0, `Expected exit code 0, got ${code}. Stderr: ${stderr}`);
    assert(stdout.includes("TRUE"), `Expected [1] TRUE in stdout, got: ${stdout}`);
  },
});

Deno.test({
  name: "ALL_PROXY passed via --env flag",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const key = "ALL_PROXY";
    const val = "socks5h://test:yolo@ws.r-universe.dev:443";
    Deno.env.set(key, val);
    try {
      const { code, stdout, stderr } = await rw([
        "--allow-net=ws.r-universe.dev:443",
        "--persistent",
        `--env=${key}`,
        "--expr=curl::has_internet()",
      ]);
      
      assertEquals(code, 0, `Expected exit code 0, got ${code}. Stderr: ${stderr}`);
      assert(stdout.includes("TRUE"), `Expected [1] TRUE in stdout, got: ${stdout}`);
    } finally {
      Deno.env.delete(key);
    }
  },
});

Deno.test({
  name: 'ALL_PROXY passed via --env="VAR=value" flag',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const val = "socks5h://test:yolo@ws.r-universe.dev:443";
    const { code, stdout, stderr } = await rw([
      "--allow-net=ws.r-universe.dev:443",
      "--persistent",
      `--env=ALL_PROXY=${val}`,
      "--expr=curl::has_internet()",
    ]);
    
    assertEquals(code, 0, `Expected exit code 0, got ${code}. Stderr: ${stderr}`);
    assert(stdout.includes("TRUE"), `Expected [1] TRUE in stdout, got: ${stdout}`);
  },
});

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
