/**
 * Unit tests for cli.js — parse_args() and rwconfig helpers.
 * Run with:  deno test --allow-read --allow-write --allow-env --allow-sys tests/cli_test.js
 */

import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
    parse_args,
    load_rwconfig,
    write_rwconfig,
    unset_rwconfig,
    validate_sandbox,
} from "../cli.js";
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
// parse_args — sandbox
// ---------------------------------------------------------------------------

Deno.test("parse_args: --sandbox=webr", () => {
    const { options } = parse_clean(["--no-config", "--sandbox=webr", "--expr=1"]);
    assertEquals(options.sandbox, "webr");
});

Deno.test("parse_args: default sandbox is webr", () => {
    const { options } = parse_clean(["--no-config", "--expr=1"]);
    assertEquals(options.sandbox, "webr");
});

Deno.test("parse_args: --sandbox-opt shims=webr::install", () => {
    const { options } = parse_clean([
        "--no-config",
        "--sandbox-opt=shims=webr::install",
        "--expr=1",
    ]);
    assertEquals(options.shims, ["webr::install"]);
});

Deno.test("parse_args: --sandbox-opt shims= (empty) disables all shims", () => {
    const { options } = parse_clean([
        "--no-config",
        "--sandbox-opt=shims=",
        "--expr=1",
    ]);
    assertEquals(options.shims, []);
});

Deno.test("parse_args: --sandbox-opt missing '=' throws", () => {
    assertThrows(
        () => parse_clean(["--no-config", "--sandbox-opt=shims", "--expr=1"]),
        Error,
        "Invalid --sandbox-opt format",
    );
});

Deno.test("parse_args: --sandbox-opt unknown key throws", () => {
    assertThrows(
        () => parse_clean(["--no-config", "--sandbox-opt=unknown=val", "--expr=1"]),
        Error,
        "Unknown --sandbox-opt key",
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
// validate_sandbox
// ---------------------------------------------------------------------------

Deno.test("validate_sandbox: 'webr' is valid", () => {
    // Should not throw
    validate_sandbox("webr");
});

Deno.test("validate_sandbox: unknown sandbox throws", () => {
    assertThrows(
        () => validate_sandbox("docker"),
        Error,
        "Unknown sandbox",
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
        fs.writeFileSync(tmp, "r-libs-user=/some/path\nsandbox=webr\n");
        const cfg = load_rwconfig(tmp);
        assertEquals(cfg["r-libs-user"], "/some/path");
        assertEquals(cfg["sandbox"], "webr");
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
        write_rwconfig("sandbox", "webr", tmp);
        const cfg = load_rwconfig(tmp);
        assertEquals(cfg["sandbox"], "webr");
    } finally {
        fs.unlinkSync(tmp);
    }
});

Deno.test("write_rwconfig: updates existing field", () => {
    const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
    fs.writeFileSync(tmp, "sandbox=webr\n");
    try {
        write_rwconfig("sandbox", "docker", tmp);
        const cfg = load_rwconfig(tmp);
        assertEquals(cfg["sandbox"], "docker");
        // Should still be exactly one entry
        assertEquals(Object.keys(cfg).length, 1);
    } finally {
        fs.unlinkSync(tmp);
    }
});

Deno.test("write_rwconfig: preserves existing fields when adding new one", () => {
    const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
    fs.writeFileSync(tmp, "sandbox=webr\n");
    try {
        write_rwconfig("r-libs-user", "/my/lib", tmp);
        const cfg = load_rwconfig(tmp);
        assertEquals(cfg["sandbox"], "webr");
        assertEquals(cfg["r-libs-user"], "/my/lib");
    } finally {
        fs.unlinkSync(tmp);
    }
});

Deno.test("unset_rwconfig: removes an existing field", () => {
    const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
    fs.writeFileSync(tmp, "sandbox=webr\nr-libs-user=/path\n");
    try {
        const removed = unset_rwconfig("sandbox", tmp);
        assertEquals(removed, true);
        const cfg = load_rwconfig(tmp);
        assertEquals(Object.prototype.hasOwnProperty.call(cfg, "sandbox"), false);
        assertEquals(cfg["r-libs-user"], "/path");
    } finally {
        fs.unlinkSync(tmp);
    }
});

Deno.test("unset_rwconfig: returns false for missing field", () => {
    const tmp = Deno.makeTempFileSync({ prefix: "rw_cfg_" });
    fs.writeFileSync(tmp, "sandbox=webr\n");
    try {
        const removed = unset_rwconfig("r-libs-user", tmp);
        assertEquals(removed, false);
    } finally {
        fs.unlinkSync(tmp);
    }
});

Deno.test("unset_rwconfig: returns false when file does not exist", () => {
    const removed = unset_rwconfig("sandbox", "/nonexistent/.rwconfig");
    assertEquals(removed, false);
});
