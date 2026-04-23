/**
 * Unit tests for src/cli.js — parse_args() and rwconfig helpers.
 * Run with:  deno test --allow-all --allow-read --allow-write --allow-env --allow-sys tests/cli_test.js
 */

import { assertArrayIncludes, assertEquals, assertThrows } from "jsr:@std/assert";
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
  assertArrayIncludes(options.webr_args, ["--vanilla"]);
});

// ---------------------------------------------------------------------------
// parse_args — early-exit flags
// ---------------------------------------------------------------------------

Deno.test("parse_args: --version flag", () => {
  const { flags } = parse_clean(["--no-config", "--version"]);
  assertEquals(flags.version, true);
});

Deno.test("parse_args: --help flag", () => {
  const { flags } = parse_clean(["--no-config", "--help"]);
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
// parse_args — env
// ---------------------------------------------------------------------------

Deno.test("parse_args: --env=VAR=value", () => {
  const { options } = parse_clean(["--no-config", "--env=FOO=bar", "--expr=1"]);
  assertEquals(options.env_vars, { FOO: "bar" });
});

Deno.test("parse_args: --env=VAR (from environment)", () => {
  const key = "RW_TEST_ENV_VAR";
  Deno.env.set(key, "baz");
  try {
    const { options } = parse_clean(["--no-config", `--env=${key}`, "--expr=1"]);
    assertEquals(options.env_vars[key], "baz");
  } finally {
    Deno.env.delete(key);
  }
});

Deno.test("parse_args: --env=VAR (missing) throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "--env=RW_MISSING_VAR", "--expr=1"]),
    Error,
    "Environment variable 'RW_MISSING_VAR' not found",
  );
});

Deno.test("parse_args: multiple --env flags", () => {
  const { options } = parse_clean([
    "--no-config",
    "--env=A=1",
    "--env=B=2",
    "--expr=1",
  ]);
  assertEquals(options.env_vars, { A: "1", B: "2" });
});

// ---------------------------------------------------------------------------
// parse_args — allow-net
// ---------------------------------------------------------------------------

Deno.test("parse_args: --allow-net sets flag", () => {
  const { options } = parse_clean(["--no-config", "--allow-net", "--expr=1"]);
  assertArrayIncludes(options.allow_net, [""]);
});

Deno.test("parse_args: --allow-net=host sets flag", () => {
  const { options } = parse_clean(["--no-config", "--allow-net=google.com", "--expr=1"]);
  assertArrayIncludes(options.allow_net, ["google.com"]);
});

Deno.test("parse_args: --allow-net=host1,host2 accumulates", () => {
  const { options } = parse_clean(["--no-config", "--allow-net=a.com,b.com", "--allow-net=c.com", "--expr=1"]);
  assertArrayIncludes(options.allow_net, ["a.com", "b.com", "c.com"]);
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
    () =>
      parse_clean(["--no-config", "--runtime-opt=invalid", "--expr=1"]),
    Error,
    "Expected key=value",
  );
});

Deno.test("parse_args: --runtime-opt unknown key throws", () => {
  assertThrows(
    () =>
      parse_clean(["--no-config", "--runtime-opt=unknown=val", "--expr=1"]),
    Error,
    "Unknown --runtime-opt key",
  );
});

Deno.test("parse_args: default shims include install.packages", () => {
  const { options } = parse_clean(["--no-config", "--expr=1"]);
  assertArrayIncludes(options.shims, ["install.packages"]);
});

// ---------------------------------------------------------------------------
// parse_args — bind
// ---------------------------------------------------------------------------

Deno.test("parse_args: --bind=host:webr", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bind=${tmpDir}:/home/webR/data`,
      "--expr=1",
    ]);
    assertEquals(options.binds, [
      { host: fs.realpathSync(tmpDir), webr: "/home/webR/data", readonly: false },
    ]);
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: --bind=dir (single arg duplicates to webr path)", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bind=${tmpDir}`,
      "--expr=1",
    ]);
    assertEquals(options.binds, [
      { host: fs.realpathSync(tmpDir), webr: tmpDir, readonly: false },
    ]);
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: multiple --bind flags", () => {
  const tmpDirA = Deno.makeTempDirSync();
  const tmpDirB = Deno.makeTempDirSync();
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bind=${tmpDirA}:/webr/a`,
      `--bind=${tmpDirB}:/webr/b:ro`,
      "--expr=1",
    ]);
    assertEquals(options.binds, [
      { host: fs.realpathSync(tmpDirA), webr: "/webr/a", readonly: false },
      { host: fs.realpathSync(tmpDirB), webr: "/webr/b", readonly: true },
    ]);
  } finally {
    Deno.removeSync(tmpDirA);
    Deno.removeSync(tmpDirB);
  }
});

// ---------------------------------------------------------------------------
// parse_args — bastion
// ---------------------------------------------------------------------------

Deno.test("parse_args: --bastion=<dir> sets bastion_host", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { options } = parse_clean([
      "--no-config",
      `--bastion=${tmpDir}`,
      "--expr=1",
    ]);
    assertEquals(options.bastion_host, fs.realpathSync(tmpDir));
    assertEquals(options.bastion_readonly, false);
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: bastion auto-detected when ./bastion exists", () => {
  const tmp = Deno.makeTempDirSync();
  const orig = Deno.cwd();
  try {
    Deno.chdir(tmp);
    Deno.mkdirSync("bastion");
    const { options } = parse_args(["--no-config", "--expr=1"]);
    assertEquals(options.bastion_host, path.join(tmp, "bastion"));
  } finally {
    Deno.chdir(orig);
    Deno.removeSync(tmp, { recursive: true });
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
  const { command } = parse_clean(["--no-config", "env", "get", "r-version"]);
  assertEquals(command.type, "env");
  assertEquals(command.action, "get");
  assertEquals(command.field, "r-version");
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
    "/tmp/libs",
  ]);
  assertEquals(command.type, "config");
  assertEquals(command.action, "set");
  assertEquals(command.field, "r-libs-user");
  assertEquals(command.value, "/tmp/libs");
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
  assertEquals(command.type, "config");
  assertEquals(command.scope, "local");
  assertEquals(command.action, "list");
});

Deno.test("parse_args: 'config --global list'", () => {
  const { command } = parse_clean(["--no-config", "config", "--global", "list"]);
  assertEquals(command.type, "config");
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
  assertEquals(options.persistent, true);
  assertEquals(command.type, "install");
  assertEquals(command.install_packages, ["praise"]);
});

Deno.test("parse_args: '--persistent install --docker pkg'", () => {
  const { command } = parse_clean([
    "--no-config",
    "--persistent",
    "install",
    "--docker",
    "pkg",
  ]);
  assertEquals(command.type, "install");
  assertEquals(command.install_docker, true);
  assertEquals(command.install_packages, ["pkg"]);
});

Deno.test("parse_args: '--persistent uninstall pkg'", () => {
  const { command } = parse_clean([
    "--no-config",
    "--persistent",
    "uninstall",
    "pkg",
  ]);
  assertEquals(command.type, "uninstall");
  assertEquals(command.uninstall_packages, ["pkg"]);
});

Deno.test("parse_args: 'build --docker'", () => {
  const { command } = parse_clean(["--no-config", "build", "--docker"]);
  assertEquals(command.type, "build");
  assertEquals(command.build_docker, true);
});

Deno.test("parse_args: 'build --docker <path>'", () => {
  const { command } = parse_clean([
    "--no-config",
    "build",
    "--docker",
    "/tmp/pkg",
  ]);
  assertEquals(command.type, "build");
  assertEquals(command.build_docker, true);
  assertEquals(command.build_path, "/tmp/pkg");
});

// ---------------------------------------------------------------------------
// parse_args — error cases
// ---------------------------------------------------------------------------

Deno.test("parse_args: script and --expr together throws", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    assertThrows(
      () => parse_clean(["--no-config", tmp, "--expr=1"]),
      Error,
      "R script must not be specified when R expressions are specified",
    );
  } finally {
    Deno.removeSync(tmp);
  }
});

// ---------------------------------------------------------------------------
// validate_runtime
// ---------------------------------------------------------------------------

Deno.test("validate_runtime: 'deno:webr' is valid", () => {
  // Should not throw
  validate_runtime("deno:webr");
});

Deno.test("validate_runtime: 'node:webr' is valid", () => {
  // Should not throw
  validate_runtime("node:webr");
});

Deno.test("validate_runtime: invalid format throws", () => {
  assertThrows(() => validate_runtime("invalid"), Error, "Invalid runtime format");
});

Deno.test("validate_runtime: unknown engine throws", () => {
  assertThrows(() => validate_runtime("deno:unknown"), Error, "Unknown runtime engine");
});

Deno.test("validate_runtime: unknown host throws", () => {
  assertThrows(() => validate_runtime("unknown:webr"), Error, "Unknown runtime host");
});

// ---------------------------------------------------------------------------
// load_rwconfig, write_rwconfig, unset_rwconfig
// ---------------------------------------------------------------------------

Deno.test("load_rwconfig: missing file returns empty object", () => {
  const tmp = Deno.makeTempFileSync();
  Deno.removeSync(tmp);
  assertEquals(load_rwconfig(tmp), {});
});

Deno.test("load_rwconfig: parses key=value pairs", () => {
  const tmp = Deno.makeTempFileSync();
  try {
    Deno.writeTextFileSync(tmp, "a=1\nb = 2 \n");
    assertEquals(load_rwconfig(tmp), { a: "1", b: "2" });
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("load_rwconfig: skips comments and blank lines", () => {
  const tmp = Deno.makeTempFileSync();
  try {
    Deno.writeTextFileSync(tmp, "# comment\n\na=1\n");
    assertEquals(load_rwconfig(tmp), { a: "1" });
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("write_rwconfig: creates file with new field", () => {
  const tmp = Deno.makeTempFileSync();
  Deno.removeSync(tmp);
  try {
    write_rwconfig("a", "1", tmp);
    assertEquals(load_rwconfig(tmp), { a: "1" });
  } finally {
    if (fs.existsSync(tmp)) Deno.removeSync(tmp);
  }
});

Deno.test("write_rwconfig: updates existing field", () => {
  const tmp = Deno.makeTempFileSync();
  try {
    Deno.writeTextFileSync(tmp, "a=1\n");
    write_rwconfig("a", "2", tmp);
    assertEquals(load_rwconfig(tmp), { a: "2" });
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("write_rwconfig: preserves existing fields when adding new one", () => {
  const tmp = Deno.makeTempFileSync();
  try {
    Deno.writeTextFileSync(tmp, "a=1\n");
    write_rwconfig("b", "2", tmp);
    assertEquals(load_rwconfig(tmp), { a: "1", b: "2" });
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("unset_rwconfig: removes an existing field", () => {
  const tmp = Deno.makeTempFileSync();
  try {
    Deno.writeTextFileSync(tmp, "a=1\nb=2\n");
    const found = unset_rwconfig("a", tmp);
    assertEquals(found, true);
    assertEquals(load_rwconfig(tmp), { b: "2" });
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("unset_rwconfig: returns false for missing field", () => {
  const tmp = Deno.makeTempFileSync();
  try {
    Deno.writeTextFileSync(tmp, "a=1\n");
    const found = unset_rwconfig("b", tmp);
    assertEquals(found, false);
    assertEquals(load_rwconfig(tmp), { a: "1" });
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("unset_rwconfig: returns false when file does not exist", () => {
  const tmp = Deno.makeTempFileSync();
  Deno.removeSync(tmp);
  assertEquals(unset_rwconfig("a", tmp), false);
});

// ---------------------------------------------------------------------------
// parse_args — r-libs-user
// ---------------------------------------------------------------------------

Deno.test("parse_args: --r-libs-user with --persistent sets r_libs_user", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { options } = parse_clean([
      "--no-config",
      "--persistent",
      `--r-libs-user=${tmpDir}`,
      "--expr=1",
    ]);
    assertEquals(options.r_libs_user, fs.realpathSync(tmpDir));
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: --r-libs-user without --persistent is NOT null", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { options } = parse_clean([
      "--no-config",
      `--r-libs-user=${tmpDir}`,
      "--expr=1",
    ]);
    assertEquals(options.r_libs_user, fs.realpathSync(tmpDir));
  } finally {
    Deno.removeSync(tmpDir);
  }
});

// ---------------------------------------------------------------------------
// parse_args — prologue/epilogue script files
// ---------------------------------------------------------------------------

Deno.test("parse_args: --prologue=<file> reads script into prologue_exprs", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    Deno.writeTextFileSync(tmp, "cat('hello\\n')\n");
    const { options } = parse_clean(["--no-config", `--prologue=${tmp}`, "--expr=1"]);
    assertEquals(options.prologue_exprs, ["cat('hello\\n')"]);
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("parse_args: --epilogue=<file> reads script into epilogue_exprs", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    Deno.writeTextFileSync(tmp, "cat('bye\\n')\n");
    const { options } = parse_clean(["--no-config", `--epilogue=${tmp}`, "--expr=1"]);
    assertEquals(options.epilogue_exprs, ["cat('bye\\n')"]);
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("parse_args: prologue-expr and prologue script conflict throws", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    assertThrows(
      () =>
        parse_clean([
          "--no-config",
          "--prologue-expr=1",
          `--prologue=${tmp}`,
          "--expr=1",
        ]),
      Error,
      "R prologue script must not be specified when R prologue expressions are specified",
    );
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("parse_args: epilogue-expr and epilogue script conflict throws", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    assertThrows(
      () =>
        parse_clean([
          "--no-config",
          "--epilogue-expr=1",
          `--epilogue=${tmp}`,
          "--expr=1",
        ]),
      Error,
      "R epilogue script must not be specified when R epilogue expressions are specified",
    );
  } finally {
    Deno.removeSync(tmp);
  }
});

// ---------------------------------------------------------------------------
// parse_args — /dev/stdin
// ---------------------------------------------------------------------------

Deno.test("parse_args: /dev/stdin treated as stdin (exprs stays empty)", () => {
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
    "--",
    "arg1",
    "arg2",
  ]);
  assertEquals(options.webr_args, ["--args", "--", "arg1", "arg2"]);
});

// ---------------------------------------------------------------------------
// parse_args — subcommand error cases
// ---------------------------------------------------------------------------

Deno.test("parse_args: 'env get <field> extra' throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "env", "get", "field", "extra"]),
    Error,
    "Unexpected argument",
  );
});

Deno.test("parse_args: 'config set <field> <value> extra' throws", () => {
  assertThrows(
    () =>
      parse_clean(["--no-config", "config", "set", "field", "value", "extra"]),
    Error,
    "Unexpected argument",
  );
});

Deno.test("parse_args: 'build --docker <path> extra' throws", () => {
  assertThrows(
    () => parse_clean(["--no-config", "build", "--docker", "path", "extra"]),
    Error,
    "Unexpected argument",
  );
});

// ---------------------------------------------------------------------------
// parse_args — runtime-opt shims: empty strings filtered out
// ---------------------------------------------------------------------------

Deno.test("parse_args: --runtime-opt shims trailing comma filters empty", () => {
  const { options } = parse_clean([
    "--no-config",
    "--runtime-opt=shims=a,b,",
    "--expr=1",
  ]);
  assertEquals(options.shims, ["a", "b"]);
});

// ---------------------------------------------------------------------------
// parse_args — --debug logging
// ---------------------------------------------------------------------------

Deno.test("parse_args: --debug logs --expr value", () => {
  const { logged } = parse_clean_log(["--no-config", "--debug", "--expr=1+1"]);
  assertEquals(logged.some((l) => l.includes("expr=1+1")), true);
});

Deno.test("parse_args: --debug logs --prologue-expr value", () => {
  const { logged } = parse_clean_log([
    "--no-config",
    "--debug",
    "--prologue-expr=1+1",
    "--expr=1",
  ]);
  assertEquals(logged.some((l) => l.includes("prologue_expr=1+1")), true);
});

Deno.test("parse_args: --debug logs --epilogue-expr value", () => {
  const { logged } = parse_clean_log([
    "--no-config",
    "--debug",
    "--epilogue-expr=1+1",
    "--expr=1",
  ]);
  assertEquals(logged.some((l) => l.includes("epilogue_expr=1+1")), true);
});

Deno.test("parse_args: --debug logs --r-libs-user with --persistent", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { logged } = parse_clean_log([
      "--no-config",
      "--debug",
      "--persistent",
      `--r-libs-user=${tmpDir}`,
      "--expr=1",
    ]);
    const real = fs.realpathSync(tmpDir);
    assertEquals(logged.some((l) => l.includes(`r_libs_user=${real}`)), true);
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: --debug logs --bind value", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { logged } = parse_clean_log([
      "--no-config",
      "--debug",
      `--bind=${tmpDir}:/b:ro`,
      "--expr=1",
    ]);
    const real = fs.realpathSync(tmpDir);
    assertEquals(logged.some((l) => l.includes(`Add bind=${real}:/b:ro`)), true);
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: --debug logs --bastion value", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { logged } = parse_clean_log([
      "--no-config",
      "--debug",
      `--bastion=${tmpDir}:ro`,
      "--expr=1",
    ]);
    const real = fs.realpathSync(tmpDir);
    assertEquals(
      logged.some((l) => l.includes(`bastion_host=${real} (readonly=true)`)),
      true,
    );
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: --debug logs --prologue script path", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    const { logged } = parse_clean_log([
      "--no-config",
      "--debug",
      `--prologue=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(logged.some((l) => l.includes(`r_prologue_script=${tmp}`)), true);
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("parse_args: --debug logs --epilogue script path", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    const { logged } = parse_clean_log([
      "--no-config",
      "--debug",
      `--epilogue=${tmp}`,
      "--expr=1",
    ]);
    assertEquals(logged.some((l) => l.includes(`r_epilogue_script=${tmp}`)), true);
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("parse_args: --debug logs --timeout value", () => {
  const { logged } = parse_clean_log([
    "--no-config",
    "--debug",
    "--timeout=5",
    "--expr=1",
  ]);
  assertEquals(logged.some((l) => l.includes("timeout=5")), true);
});

Deno.test("parse_args: --debug logs r_script when positional .R file given", () => {
  const tmp = Deno.makeTempFileSync({ suffix: ".R" });
  try {
    const { logged } = parse_clean_log(["--no-config", "--debug", tmp]);
    const real = fs.realpathSync(tmp);
    assertEquals(logged.some((l) => l.includes(`r_script=${real}`)), true);
  } finally {
    Deno.removeSync(tmp);
  }
});

Deno.test("parse_args: --debug logs 'Allowing r-libs-user' without --persistent", () => {
  const tmpDir = Deno.makeTempDirSync();
  try {
    const { logged } = parse_clean_log([
      "--no-config",
      "--debug",
      `--r-libs-user=${tmpDir}`,
      "--expr=1",
    ]);
    const real = fs.realpathSync(tmpDir);
    assertEquals(logged.some((l) => l.includes(`r_libs_user=${real}`)), true);
  } finally {
    Deno.removeSync(tmpDir);
  }
});

Deno.test("parse_args: --debug logs 'Using default R shims'", () => {
  const { logged } = parse_clean_log(["--no-config", "--debug", "--expr=1"]);
  assertEquals(logged.some((l) => l.includes("Using default R shims")), true);
});

// ---------------------------------------------------------------------------
// parse_args — --input
// ---------------------------------------------------------------------------

Deno.test("parse_args: --input=<value> sets options.input", () => {
  const { options } = parse_clean(["--no-config", "--input=hello", "--expr=1"]);
  assertEquals(options.input, "hello");
});

Deno.test("parse_args: no --input leaves options.input null", () => {
  const { options } = parse_clean(["--no-config", "--expr=1"]);
  assertEquals(options.input, null);
});

Deno.test("parse_args: multiple --input flags joined with newline", () => {
  const { options } = parse_clean([
    "--no-config",
    "--input=line1",
    "--input=line2",
    "--expr=1",
  ]);
  assertEquals(options.input, "line1\nline2");
});

Deno.test("parse_args: --input='' is empty string", () => {
  const { options } = parse_clean(["--no-config", "--input=", "--expr=1"]);
  assertEquals(options.input, "");
});

Deno.test("parse_args: --debug logs --input value", () => {
  const { logged } = parse_clean_log([
    "--no-config",
    "--debug",
    "--input=hello",
    "--expr=1",
  ]);
  assertEquals(logged.some((l) => l.includes("input=")), true);
});
