/**
 * Unit tests for src/cli.js — parse_args() and rwconfig helpers.
 * Run with:  deno test --allow-read --allow-write --allow-env --allow-sys tests/cli_test.js
 */

import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  load_rwconfig,
  parse_args,
  unset_rwconfig,
  validate_runtime,
  write_rwconfig,
} from "../src/cli.js";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run parse_args from a clean temp directory so the ./bastion fallback and
 *  any local .rwconfig do not affect results. */
function parse_clean(args) {
  const orig = Deno.cwd();
  const tmp = Deno.makeTempDirSync({ prefix: "rw_test_" });
  try {
    Deno.chdir(tmp);
    return parse_args(args);
  } finally {
    Deno.chdir(orig);
    fs.rmSync(tmp, { recursive: true });
  }
}

/** Like parse_clean but also captures console.log output.
 *  Returns { options, flags, command, logged } where logged is string[]. */
function parse_clean_log(args) {
  const orig = Deno.cwd();
  const tmp = Deno.makeTempDirSync({ prefix: "rw_test_" });
  const logged = [];
  const orig_log = console.log;
  console.log = (...a) => logged.push(a.join(" "));
  try {
    Deno.chdir(tmp);
    const result = parse_args(args);
    return { ...result, logged };
  } finally {
    console.log = orig_log;
    Deno.chdir(orig);
    fs.rmSync(tmp, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// parse_args — basic expression flags
// ---------------------------------------------------------------------------

Deno.test("parse_args: single --expr", () => {
  const { options } = parse_clean(["--no-config", "--expr=sum(1:100)"]);
  assertEquals(options.exprs, ["sum(1:100)"]);
  assertEquals(options.bastion_host, null);
});

Deno.test("parse_args: multiple --expr flags", () => {
  const { options } = parse_clean([
    "--no-config",
    "--expr=x <- 1",
    "--expr=x + 1",
  ]);
  assertEquals(options.exprs, ["x <- 1", "x + 1"]);
});

Deno.test("parse_args: --prologue-expr and --epilogue-expr", () => {
  const { options } = parse_clean([
    "--no-config",
    "--prologue-expr=cat('before\\n')",
    "--expr=42L",
    "--epilogue-expr=cat('after\\n')",
  ]);
  assertEquals(options.prologue_exprs, ["cat('before\\n')"]);
  assertEquals(options.exprs, ["42L"]);
  assertEquals(options.epilogue_exprs, ["cat('after\\n')"]);
});

// ---------------------------------------------------------------------------
// parse_args — boolean flags
// ---------------------------------------------------------------------------

Deno.test("parse_args: --persistent sets flag", () => {
  const { options } = parse_clean(["--no-config", "--persistent", "--expr=1"]);
  assertEquals(options.persistent, true);
});

Deno.test("parse_args: --debug sets flag", () => {
  const { options } = parse_clean(["--no-config", "--debug", "--expr=1"]);
  assertEquals(options.debug, true);
});

Deno.test("parse_args: --verbose sets flag", () => {
  const { options } = parse_clean(["--no-config", "--verbose", "--expr=1"]);
  assertEquals(options.verbose, true);
});

Deno.test("parse_args: --no-config sets flag", () => {
  const { options } = parse_clean(["--no-config", "--expr=1"]);
  assertEquals(options.no_config, true);
});

Deno.test("parse_args: --vanilla forwarded to webr_args", () => {
  const { options } = parse_clean(["--no-config", "--vanilla", "--expr=1"]);
  assertEquals(options.webr_args.includes("--vanilla"), true);
});

// ---------------------------------------------------------------------------
// parse_args — early-exit flags
// ---------------------------------------------------------------------------

Deno.test("parse_args: --version flag", () => {
  const { flags } = parse_clean(["--version"]);
  assertEquals(flags.version, true);
});

Deno.test("parse_args: --help flag", () => {
  const { flags } = parse_clean(["--help"]);
  assertEquals(flags.help, true);
});

// ---------------------------------------------------------------------------
// parse_args — timeout
// ---------------------------------------------------------------------------

Deno.test("parse_args: --timeout parses float", () => {
  const { options } = parse_clean(["--no-config", "--timeout=3.5", "--expr=1"]);
  assertEquals(options.timeout, 3.5);
});

Deno.test("parse_args: --timeout=0 is valid", () => {
  const { options } = parse_clean(["--no-config", "--timeout=0", "--expr=1"]);
  assertEquals(options.timeout, 0);
});

Deno.test("parse_args: negative --timeout throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "--timeout=-1", "--expr=1"]),
    Error,
    "Timeout must be a non-negative",
  );
});

Deno.test("parse_args: non-numeric --timeout throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "--timeout=fast", "--expr=1"]),
    Error,
    "Timeout must be a non-negative",
  );
});

// ---------------------------------------------------------------------------
// parse_args — runtime
// ---------------------------------------------------------------------------

Deno.test("parse_args: --runtime=deno:webr", () => {
  const { options } = parse_clean([
    "--no-config",
    "--runtime=deno:webr",
    "--expr=1",
  ]);
  assertEquals(options.runtime, "deno:webr");
});

Deno.test("parse_args: default runtime is deno:webr", () => {
  const { options } = parse_clean(["--no-config", "--expr=1"]);
  assertEquals(options.runtime, "deno:webr");
});

Deno.test("parse_args: --runtime-opt shims=webr::install", () => {
  const { options } = parse_clean([
    "--no-config",
    "--runtime-opt=shims=webr::install",
    "--expr=1",
  ]);
  assertEquals(options.shims, ["webr::install"]);
});

Deno.test("parse_args: --runtime-opt shims= (empty) disables all shims", () => {
  const { options } = parse_clean([
    "--no-config",
    "--runtime-opt=shims=",
    "--expr=1",
  ]);
  assertEquals(options.shims, []);
});

Deno.test("parse_args: --runtime-opt missing '=' throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "--runtime-opt=shims", "--expr=1"]),
    Error,
    "Invalid --runtime-opt format",
  );
});

Deno.test("parse_args: --runtime-opt unknown key throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "--runtime-opt=unknown=val", "--expr=1"]),
    Error,
    "Unknown --runtime-opt key",
  );
});

Deno.test("parse_args: default shims include install.packages", () => {
  const { options } = parse_clean(["--no-config", "--expr=1"]);
  assertEquals(options.shims, ["install.packages"]);
});

// ---------------------------------------------------------------------------
// parse_args — bind
// ---------------------------------------------------------------------------

Deno.test("parse_args: --bind=host:webr", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_bind_" });
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bind=${tmp}:/host/data`,
      "--expr=1",
    ]);
    assertEquals(options.binds.length, 1);
    assertEquals(options.binds[0].host, tmp);
    assertEquals(options.binds[0].webr, "/host/data");
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --bind=dir (single arg duplicates to webr path)", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_bind_" });
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bind=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(options.binds[0].host, tmp);
    assertEquals(options.binds[0].webr, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: multiple --bind flags", () => {
  const tmp1 = Deno.makeTempDirSync({ prefix: "rw_b1_" });
  const tmp2 = Deno.makeTempDirSync({ prefix: "rw_b2_" });
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bind=${tmp1}:/a`,
      `--bind=${tmp2}:/b`,
      "--expr=1",
    ]);
    assertEquals(options.binds.length, 2);
    assertEquals(options.binds[0].webr, "/a");
    assertEquals(options.binds[1].webr, "/b");
  } finally {
    fs.rmSync(tmp1, { recursive: true });
    fs.rmSync(tmp2, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// parse_args — bastion
// ---------------------------------------------------------------------------

Deno.test("parse_args: --bastion=<dir> sets bastion_host", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_bastion_" });
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bastion=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(options.bastion_host, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: bastion auto-detected when ./bastion exists", () => {
  const orig = Deno.cwd();
  const tmp = Deno.makeTempDirSync({ prefix: "rw_auto_bastion_" });
  const bastionDir = path.join(tmp, "bastion");
  fs.mkdirSync(bastionDir);
  try {
    Deno.chdir(tmp);
    const { options } = parse_args(["--no-config", "--expr=1"]);
    assertEquals(options.bastion_host, bastionDir);
  } finally {
    Deno.chdir(orig);
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: no bastion dir → bastion_host is null", () => {
  const { options } = parse_clean(["--no-config", "--expr=1"]);
  assertEquals(options.bastion_host, null);
});

// ---------------------------------------------------------------------------
// parse_args — subcommands
// ---------------------------------------------------------------------------

Deno.test("parse_args: 'env list' subcommand", () => {
  const { command } = parse_clean(["--no-config", "env", "list"]);
  assertEquals(command.type, "env");
  assertEquals(command.action, "list");
});

Deno.test("parse_args: 'env get <field>' subcommand", () => {
  const { command } = parse_clean([
    "--no-config",
    "env",
    "get",
    "webr-version",
  ]);
  assertEquals(command.type, "env");
  assertEquals(command.action, "get");
  assertEquals(command.field, "webr-version");
});

Deno.test("parse_args: 'env get js-runtime' subcommand", () => {
  const { command } = parse_clean([
    "--no-config",
    "env",
    "get",
    "js-runtime",
  ]);
  assertEquals(command.type, "env");
  assertEquals(command.action, "get");
  assertEquals(command.field, "js-runtime");
});

Deno.test("parse_args: 'config list' subcommand", () => {
  const { command } = parse_clean(["--no-config", "config", "list"]);
  assertEquals(command.type, "config");
  assertEquals(command.action, "list");
});

Deno.test("parse_args: 'config get <field>' subcommand", () => {
  const { command } = parse_clean([
    "--no-config",
    "config",
    "get",
    "r-libs-user",
  ]);
  assertEquals(command.type, "config");
  assertEquals(command.action, "get");
  assertEquals(command.field, "r-libs-user");
});

Deno.test("parse_args: 'config set <field> <value>' subcommand", () => {
  const { command } = parse_clean([
    "--no-config",
    "config",
    "set",
    "r-libs-user",
    "~/R/wasm",
  ]);
  assertEquals(command.type, "config");
  assertEquals(command.action, "set");
  assertEquals(command.field, "r-libs-user");
  assertEquals(command.value, "~/R/wasm");
});

Deno.test("parse_args: 'config unset <field>' subcommand", () => {
  const { command } = parse_clean([
    "--no-config",
    "config",
    "unset",
    "r-libs-user",
  ]);
  assertEquals(command.type, "config");
  assertEquals(command.action, "unset");
  assertEquals(command.field, "r-libs-user");
});

Deno.test("parse_args: 'config --local list'", () => {
  const { command } = parse_clean(["--no-config", "config", "--local", "list"]);
  assertEquals(command.scope, "local");
  assertEquals(command.action, "list");
});

Deno.test("parse_args: 'config --global list'", () => {
  const { command } = parse_clean([
    "--no-config",
    "config",
    "--global",
    "list",
  ]);
  assertEquals(command.scope, "global");
  assertEquals(command.action, "list");
});

Deno.test("parse_args: '--persistent install praise'", () => {
  const { command, options } = parse_clean([
    "--no-config",
    "--persistent",
    "install",
    "praise",
  ]);
  assertEquals(command.type, "install");
  assertEquals(command.install_packages, ["praise"]);
  assertEquals(options.persistent, true);
});

Deno.test("parse_args: '--persistent install --docker pkg'", () => {
  const { command } = parse_clean([
    "--no-config",
    "--persistent",
    "install",
    "--docker",
    "mypkg",
  ]);
  assertEquals(command.type, "install");
  assertEquals(command.install_docker, true);
  assertEquals(command.install_packages, ["mypkg"]);
});

Deno.test("parse_args: '--persistent uninstall pkg'", () => {
  const { command } = parse_clean([
    "--no-config",
    "--persistent",
    "uninstall",
    "praise",
  ]);
  assertEquals(command.type, "uninstall");
  assertEquals(command.uninstall_packages, ["praise"]);
});

Deno.test("parse_args: 'build --docker'", () => {
  const { command } = parse_clean(["--no-config", "build", "--docker"]);
  assertEquals(command.type, "build");
  assertEquals(command.build_docker, true);
  assertEquals(command.build_path, null);
});

Deno.test("parse_args: 'build --docker <path>'", () => {
  const { command } = parse_clean([
    "--no-config",
    "build",
    "--docker",
    "mypkg",
  ]);
  assertEquals(command.build_path, "mypkg");
});

// ---------------------------------------------------------------------------
// parse_args — error cases
// ---------------------------------------------------------------------------

Deno.test("parse_args: script and --expr together throws", () => {
  // The script must come before --expr for the conflict check to trigger;
  // when --expr appears first the script arg is silently treated as R args.
  const tmp = Deno.makeTempDirSync({ prefix: "rw_err_" });
  const script = path.join(tmp, "main.R");
  fs.writeFileSync(script, "1+1\n");
  try {
    assertThrows(
      () => parse_clean(["--no-config", script, "--expr=1"]),
      Error,
      "R script must not be specified",
    );
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// validate_runtime
// ---------------------------------------------------------------------------

Deno.test("validate_runtime: 'deno:webr' is valid", () => {
  // Should not throw (assuming deno is on PATH)
  validate_runtime("deno:webr");
});

Deno.test("validate_runtime: 'node:webr' is valid", () => {
  // Should not throw (assuming node is on PATH)
  validate_runtime("node:webr");
});

Deno.test("validate_runtime: invalid format throws", () => {
  assertThrows(
    () => validate_runtime("webr"),
    Error,
    "Invalid runtime format",
  );
});

Deno.test("validate_runtime: 'host:rscript' is valid", () => {
  // Should not throw (assuming Rscript is on PATH)
  validate_runtime("host:rscript");
});

Deno.test("validate_runtime: unknown engine 'foo' throws", () => {
  assertThrows(
    () => validate_runtime("deno:foo"),
    Error,
    "Unknown runtime engine",
  );
});

Deno.test("validate_runtime: unknown host 'foo' throws", () => {
  assertThrows(
    () => validate_runtime("foo:webr"),
    Error,
    "Unknown runtime host",
  );
});

// ---------------------------------------------------------------------------
// load_rwconfig / write_rwconfig / unset_rwconfig
// ---------------------------------------------------------------------------

Deno.test("load_rwconfig: missing file returns empty object", () => {
  const cfg = load_rwconfig("/nonexistent/path/.rwconfig");
  assertEquals(cfg, {});
});

Deno.test("load_rwconfig: parses key=value pairs", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  try {
    fs.writeFileSync(tmp, "r-libs-user=/some/path\nruntime=deno:webr\n");
    const cfg = load_rwconfig(tmp);
    assertEquals(cfg["r-libs-user"], "/some/path");
    assertEquals(cfg["runtime"], "deno:webr");
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("load_rwconfig: skips comments and blank lines", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  try {
    fs.writeFileSync(tmp, "# this is a comment\n\nr-libs-user=/path\n");
    const cfg = load_rwconfig(tmp);
    assertEquals(Object.keys(cfg).length, 1);
    assertEquals(cfg["r-libs-user"], "/path");
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("write_rwconfig: creates file with new field", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  fs.writeFileSync(tmp, "");
  try {
    write_rwconfig("runtime", "deno:webr", tmp);
    const cfg = load_rwconfig(tmp);
    assertEquals(cfg["runtime"], "deno:webr");
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("write_rwconfig: updates existing field", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  fs.writeFileSync(tmp, "runtime=deno:webr\n");
  try {
    write_rwconfig("runtime", "node:webr", tmp);
    const cfg = load_rwconfig(tmp);
    assertEquals(cfg["runtime"], "node:webr");
    // Should still be exactly one entry
    assertEquals(Object.keys(cfg).length, 1);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("write_rwconfig: preserves existing fields when adding new one", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  fs.writeFileSync(tmp, "runtime=deno:webr\n");
  try {
    write_rwconfig("r-libs-user", "/my/lib", tmp);
    const cfg = load_rwconfig(tmp);
    assertEquals(cfg["runtime"], "deno:webr");
    assertEquals(cfg["r-libs-user"], "/my/lib");
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("unset_rwconfig: removes an existing field", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  fs.writeFileSync(tmp, "runtime=deno:webr\nr-libs-user=/path\n");
  try {
    const removed = unset_rwconfig("runtime", tmp);
    assertEquals(removed, true);
    const cfg = load_rwconfig(tmp);
    assertEquals(Object.prototype.hasOwnProperty.call(cfg, "runtime"), false);
    assertEquals(cfg["r-libs-user"], "/path");
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("unset_rwconfig: returns false for missing field", () => {
  const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
  fs.writeFileSync(tmp, "runtime=deno:webr\n");
  try {
    const removed = unset_rwconfig("r-libs-user", tmp);
    assertEquals(removed, false);
  } finally {
    fs.unlinkSync(tmp);
  }
});

Deno.test("unset_rwconfig: returns false when file does not exist", () => {
  const removed = unset_rwconfig("runtime", "/nonexistent/.rwconfig");
  assertEquals(removed, false);
});

// ---------------------------------------------------------------------------
// parse_args — r-libs-user
// ---------------------------------------------------------------------------

Deno.test("parse_args: --r-libs-user with --persistent sets r_libs_user", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_rlibs_" });
  try {
    const { options } = parse_clean([
      "--no-config",
      "--persistent",
      `--r-libs-user=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(options.r_libs_user, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --r-libs-user without --persistent is null", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_rlibs_" });
  try {
    const { options } = parse_clean([
      "--no-config",
      `--r-libs-user=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(options.r_libs_user, null);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// parse_args — prologue/epilogue script files
// ---------------------------------------------------------------------------

Deno.test("parse_args: --prologue=<file> reads script into prologue_exprs", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_pr_" });
  const script = path.join(tmp, "prologue.R");
  try {
    fs.writeFileSync(script, "cat('before\\n')\n");
    const { options } = parse_clean([
      "--no-config",
      `--prologue=${script}`,
      "--expr=42L",
    ]);
    assertEquals(options.prologue_exprs, ["cat('before\\n')"]);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --epilogue=<file> reads script into epilogue_exprs", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_ep_" });
  const script = path.join(tmp, "epilogue.R");
  try {
    fs.writeFileSync(script, "cat('after\\n')\n");
    const { options } = parse_clean([
      "--no-config",
      "--expr=42L",
      `--epilogue=${script}`,
    ]);
    assertEquals(options.epilogue_exprs, ["cat('after\\n')"]);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: prologue-expr and prologue script conflict throws", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_pr_" });
  const script = path.join(tmp, "prologue.R");
  fs.writeFileSync(script, "1\n");
  try {
    assertThrows(
      () =>
        parse_clean([
          "--no-config",
          "--prologue-expr=1",
          `--prologue=${script}`,
          "--expr=42L",
        ]),
      Error,
      "R prologue script must not be specified",
    );
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: epilogue-expr and epilogue script conflict throws", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_ep_" });
  const script = path.join(tmp, "epilogue.R");
  fs.writeFileSync(script, "1\n");
  try {
    assertThrows(
      () =>
        parse_clean([
          "--no-config",
          "--expr=42L",
          "--epilogue-expr=1",
          `--epilogue=${script}`,
        ]),
      Error,
      "R epilogue script must not be specified",
    );
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// parse_args — /dev/stdin
// ---------------------------------------------------------------------------

Deno.test("parse_args: /dev/stdin treated as stdin (exprs stays empty)", () => {
  // /dev/stdin is nulled out so that stdin is read later by main(); exprs=[].
  const { options } = parse_clean(["--no-config", "/dev/stdin"]);
  assertEquals(options.exprs, []);
});

// ---------------------------------------------------------------------------
// parse_args — trailing args go into webr_args
// ---------------------------------------------------------------------------

Deno.test("parse_args: trailing args after --expr go into webr_args", () => {
  const { options } = parse_clean([
    "--no-config",
    "--expr=1",
    "foo",
    "bar",
  ]);
  assertEquals(options.webr_args.includes("--args"), true);
  assertEquals(options.webr_args.includes("foo"), true);
  assertEquals(options.webr_args.includes("bar"), true);
});

// ---------------------------------------------------------------------------
// parse_args — subcommand error cases
// ---------------------------------------------------------------------------

Deno.test("parse_args: 'env get <field> extra' throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "env", "get", "webr-version", "extra"]),
    Error,
    "Unexpected argument for 'rw env'",
  );
});

Deno.test("parse_args: 'config set <field> <value> extra' throws", () => {
  assertThrows(
    () =>
      parse_clean([
        "--no-config",
        "config",
        "set",
        "runtime",
        "deno:webr",
        "extra",
      ]),
    Error,
    "Unexpected argument for 'rw config'",
  );
});

Deno.test("parse_args: 'build --docker <path> extra' throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "build", "--docker", "mypkg", "extra"]),
    Error,
    "Unexpected argument for 'rw build'",
  );
});

// ---------------------------------------------------------------------------
// parse_args — runtime-opt shims: empty strings filtered out
// ---------------------------------------------------------------------------

Deno.test("parse_args: --runtime-opt shims trailing comma filters empty", () => {
  const { options } = parse_clean([
    "--no-config",
    "--runtime-opt=shims=webr::install,",
    "--expr=1",
  ]);
  // "webr::install," splits to ["webr::install", ""] — empty entry removed
  assertEquals(options.shims, ["webr::install"]);
});

// ---------------------------------------------------------------------------
// parse_args — --debug logging
// ---------------------------------------------------------------------------

Deno.test("parse_args: --debug logs --expr value", () => {
  const { logged } = parse_clean_log([
    "--debug",
    "--no-config",
    "--expr=sum(1:100)",
  ]);
  assertEquals(logged.some((l) => l.includes("expr=sum(1:100)")), true);
});

Deno.test("parse_args: --debug logs --prologue-expr value", () => {
  const { logged } = parse_clean_log([
    "--debug",
    "--no-config",
    "--prologue-expr=cat('hi')",
    "--expr=1",
  ]);
  assertEquals(logged.some((l) => l.includes("prologue_expr=cat('hi')")), true);
});

Deno.test("parse_args: --debug logs --epilogue-expr value", () => {
  const { logged } = parse_clean_log([
    "--debug",
    "--no-config",
    "--expr=1",
    "--epilogue-expr=cat('bye')",
  ]);
  assertEquals(
    logged.some((l) => l.includes("epilogue_expr=cat('bye')")),
    true,
  );
});

Deno.test("parse_args: --debug logs --r-libs-user with --persistent", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_rlibs_" });
  try {
    const { logged } = parse_clean_log([
      "--debug",
      "--no-config",
      "--persistent",
      `--r-libs-user=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(logged.some((l) => l.includes(`r_libs_user=${tmp}`)), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs --bind value", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_bind_" });
  try {
    const { logged } = parse_clean_log([
      "--debug",
      "--no-config",
      `--bind=${tmp}:/data`,
      "--expr=1",
    ]);
    assertEquals(logged.some((l) => l.includes("Add bind=")), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs --bastion value", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_bastion_" });
  try {
    const { logged } = parse_clean_log([
      "--debug",
      "--no-config",
      `--bastion=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(logged.some((l) => l.includes("bastion_host=")), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs --prologue script path", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_pr_" });
  const script = path.join(tmp, "p.R");
  fs.writeFileSync(script, "1\n");
  try {
    const { logged } = parse_clean_log([
      "--debug",
      "--no-config",
      `--prologue=${script}`,
      "--expr=1",
    ]);
    assertEquals(logged.some((l) => l.includes("r_prologue_script=")), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs --epilogue script path", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_ep_" });
  const script = path.join(tmp, "e.R");
  fs.writeFileSync(script, "1\n");
  try {
    const { logged } = parse_clean_log([
      "--debug",
      "--no-config",
      "--expr=1",
      `--epilogue=${script}`,
    ]);
    assertEquals(logged.some((l) => l.includes("r_epilogue_script=")), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs --timeout value", () => {
  const { logged } = parse_clean_log([
    "--debug",
    "--no-config",
    "--timeout=5",
    "--expr=1",
  ]);
  assertEquals(logged.some((l) => l.includes("timeout=5")), true);
});

Deno.test("parse_args: --debug logs r_script when positional .R file given", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_rs_" });
  const script = path.join(tmp, "main.R");
  fs.writeFileSync(script, "1\n");
  try {
    const { logged } = parse_clean_log(["--debug", "--no-config", script]);
    assertEquals(logged.some((l) => l.includes("r_script=")), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs 'Ignoring r-libs-user' without --persistent", () => {
  const tmp = Deno.makeTempDirSync({ prefix: "rw_rlibs_" });
  try {
    const { logged } = parse_clean_log([
      "--debug",
      "--no-config",
      `--r-libs-user=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(
      logged.some((l) => l.includes("Ignoring r-libs-user")),
      true,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});

Deno.test("parse_args: --debug logs 'Using default R shims'", () => {
  const { logged } = parse_clean_log(["--debug", "--no-config", "--expr=1"]);
  assertEquals(logged.some((l) => l.includes("Using default R shims")), true);
});
