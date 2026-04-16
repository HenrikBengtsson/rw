/**
 * Integration tests: sandbox escape attempts via webr::eval_js() must be
 * blocked when rw runs under Deno with restricted --allow-* permissions.
 *
 * Each test spawns a full `rw` process (webR startup included), so these are
 * intentionally slow (~10-30 s each).  Run separately:
 *
 *   deno task deno-escape-tests
 *   make deno-escape-tests
 *
 * Requires `rw` to be installed:  make deno-install
 */

import { assert } from "jsr:@std/assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

// Always invoke the local cli.js via `deno run` so the Deno sandbox is active
// regardless of which `rw` binary is first on PATH (the Node.js install would
// have no sandbox restrictions and the tests would give false negatives).
const CLI      = new URL("../../src/cli.js",   import.meta.url).pathname;
const DENO_CFG = new URL("../deno.json", import.meta.url).pathname;

/**
 * Run cli.js under Deno (with full supervisor permissions) with R code on
 * stdin.  The supervisor then spawns the worker with restricted permissions,
 * which is the sandbox boundary under test.
 * @param {string} r_code
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function rw(r_code) {
    const proc = new Deno.Command("deno", {
        args: [
            "run",
            "--allow-read",
            "--allow-write",
            "--allow-net",
            "--allow-env",
            "--allow-run",
            "--allow-sys",
            "--config", DENO_CFG,
            CLI,
        ],
        stdin:  "piped",
        stdout: "piped",
        stderr: "piped",
    }).spawn();

    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(r_code));
    await writer.close();

    const out = await proc.output();
    return {
        code:   out.code,
        stdout: new TextDecoder().decode(out.stdout),
        stderr: new TextDecoder().decode(out.stderr),
    };
}

// ---------------------------------------------------------------------------
// Escape tests
// ---------------------------------------------------------------------------

Deno.test({
    name: "escape: webr::eval_js cannot read arbitrary host files (fs.readFileSync)",
    sanitizeResources: false,
    sanitizeOps: false,
    timeout: 120_000,
    async fn() {
        // /etc/hostname is a real file outside rw's --allow-read paths.
        const hostname = fs.readFileSync("/etc/hostname", "utf8").trim();
        assert(hostname.length > 0, "Could not read /etc/hostname for test setup");

        const { code, stdout, stderr } = await rw(
            `webr::eval_js('import("fs").then(m => m.readFileSync("/etc/hostname", "utf8"))', await = TRUE)\n`
        );

        assert(code !== 0, `Expected non-zero exit code, got ${code}`);
        assert(
            !stdout.includes(hostname),
            `Hostname "${hostname}" leaked into stdout:\n${stdout}`,
        );
        assert(
            !stderr.includes(hostname),
            `Hostname "${hostname}" leaked into stderr:\n${stderr}`,
        );
    },
});

Deno.test({
    name: "escape: webr::eval_js cannot write to arbitrary host paths (fs.writeFileSync)",
    sanitizeResources: false,
    sanitizeOps: false,
    timeout: 120_000,
    async fn() {
        // /tmp is not in rw's --allow-write paths for a basic (non-persistent) run.
        const target = path.join(os.tmpdir(), `rw_escape_write_${Date.now()}.txt`);
        if (fs.existsSync(target)) fs.unlinkSync(target);

        try {
            const { code } = await rw(
                `webr::eval_js('import("fs").then(m => { m.writeFileSync(${JSON.stringify(target)}, "written from webR"); return "ok"; })', await = TRUE)\n`
            );

            assert(code !== 0, `Expected non-zero exit code, got ${code}`);
            assert(
                !fs.existsSync(target),
                `Escape wrote file to ${target}`,
            );
        } finally {
            if (fs.existsSync(target)) fs.unlinkSync(target);
        }
    },
});

Deno.test({
    name: "escape: webr::eval_js cannot exec host commands (child_process.execSync)",
    sanitizeResources: false,
    sanitizeOps: false,
    timeout: 120_000,
    async fn() {
        // --allow-run is not granted for basic runs; child_process.execSync must fail.
        // `id` output is recognisable: uid=NNN(name) gid=...
        const { code, stdout, stderr } = await rw(
            `webr::eval_js('import("child_process").then(m => m.execSync("id").toString())', await = TRUE)\n`
        );

        assert(code !== 0, `Expected non-zero exit code, got ${code}`);
        assert(
            !stdout.includes("uid="),
            `exec output leaked into stdout:\n${stdout}`,
        );
        assert(
            !stderr.includes("uid="),
            `exec output leaked into stderr:\n${stderr}`,
        );
    },
});
