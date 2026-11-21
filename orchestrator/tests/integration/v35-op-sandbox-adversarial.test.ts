/**
 * Gate S — real bubblewrap isolation & escape attempts on disposable fixtures only.
 */
import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager, which, BubblewrapBackend } from "../../src/v3/sandbox/index.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";
import {
  cancelProcessTree,
  identifyProcess,
  spawnSupervised,
} from "../../src/v3/sandbox/process-supervisor.js";

const hasBwrap = !!which("bwrap");

describe("V3.5 OP Gate S — sandbox adversarial", () => {
  it("fail-closed when backend unavailable and sandbox required", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-sb-"));
    const mgr = new SandboxManager([
      {
        backend_id: "unavailable",
        probe: () => ({
          available: false,
          backend_id: "unavailable",
          reason: "forced_missing",
          notes: [],
        }),
        exec: async () => {
          throw new Error("must_not_host_fallback");
        },
      },
    ]);
    const res = await mgr.exec({
      argv: ["/bin/echo", "host"],
      profile: agentWorkspaceProfile(ws),
    });
    expect(res.blocked).toBe(true);
    expect(res.block_reason).toMatch(/sandbox_required|unavailable|forced/);
  });

  it.runIf(hasBwrap)("preserves exit codes inside sandbox", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-ex-"));
    const profile = agentWorkspaceProfile(ws);
    const ok = await new SandboxManager().exec({
      argv: ["/bin/true"],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    const bad = await new SandboxManager().exec({
      argv: ["/bin/false"],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(ok.exit_code).toBe(0);
    expect(bad.exit_code).not.toBe(0);
  });

  it.runIf(hasBwrap)("blocks path traversal and outside write", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-trav-"));
    const outside = join(tmpdir(), `el-secret-target-${Date.now()}.txt`);
    writeFileSync(outside, "SECRET_FIXTURE_ONLY\n");
    const profile = agentWorkspaceProfile(ws);
    const read = await new SandboxManager().exec({
      argv: ["/bin/cat", outside],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(read.stdout.includes("SECRET_FIXTURE_ONLY")).toBe(false);

    const write = await new SandboxManager().exec({
      argv: ["/bin/sh", "-c", `echo PWNED > '${outside}.pwn'`],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(existsSync(`${outside}.pwn`)).toBe(false);
    void write;
    rmSync(outside, { force: true });
  });

  it.runIf(hasBwrap)("blocks symlink escape to fixture secret", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-sym-"));
    const secretDir = mkdtempSync(join(tmpdir(), "el-op-sec-"));
    const secretFile = join(secretDir, "secret.txt");
    writeFileSync(secretFile, "SYMLINK_SECRET\n");
    symlinkSync(secretFile, join(ws, "link.txt"));
    const profile = agentWorkspaceProfile(ws);
    const res = await new SandboxManager().exec({
      argv: ["/bin/cat", join(ws, "link.txt")],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.stdout.includes("SYMLINK_SECRET")).toBe(false);
    rmSync(secretDir, { recursive: true, force: true });
  });

  it.runIf(hasBwrap)("runtime-created symlink cannot read outside", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-rtsym-"));
    const secretDir = mkdtempSync(join(tmpdir(), "el-op-sec2-"));
    const secretFile = join(secretDir, "secret2.txt");
    writeFileSync(secretFile, "RUNTIME_SECRET\n");
    const profile = agentWorkspaceProfile(ws);
    const res = await new SandboxManager().exec({
      argv: [
        "/bin/sh",
        "-c",
        `ln -sf '${secretFile}' link2.txt; cat link2.txt || true; echo DONE`,
      ],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.stdout.includes("RUNTIME_SECRET")).toBe(false);
    expect(res.stdout).toContain("DONE");
    rmSync(secretDir, { recursive: true, force: true });
  });

  it.runIf(hasBwrap)("network deny — no successful DNS resolution payload", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-net-"));
    const profile = agentWorkspaceProfile(ws);
    const res = await new SandboxManager().exec({
      argv: ["/bin/sh", "-c", "getent hosts example.com; echo RC:$?"],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.blocked).not.toBe(true);
    expect(/\b\d+\.\d+\.\d+\.\d+\b/.test(res.stdout)).toBe(false);
  });

  it.runIf(hasBwrap)("timeout kills process tree descendants", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-to-"));
    const base = agentWorkspaceProfile(ws);
    const profile = {
      ...base,
      process: { ...base.process, timeout_ms: 800, memory_bytes: undefined, max_pids: undefined, cpu_seconds: undefined },
    };
    const res = await new SandboxManager().exec({
      argv: ["/bin/sh", "-c", "sleep 30"],
      profile,
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(res.timed_out).toBe(true);
  }, 10000);

  it.runIf(hasBwrap && !!which("prlimit"))("applies memory rlimit via prlimit wrapper", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-op-mem-"));
    const profile = agentWorkspaceProfile(ws);
    profile.process.memory_bytes = 512 * 1024 * 1024;
    profile.process.max_pids = undefined;
    const built = (
      await import("../../src/v3/sandbox/backends/bubblewrap.js")
    ).buildBubblewrapArgvForTest({
      argv: ["/usr/bin/true"],
      profile,
    });
    expect(built[0]).toContain("prlimit");
    expect(built.some((a) => a.startsWith("--as="))).toBe(true);
    expect(built.some((a) => a.startsWith("--nproc="))).toBe(false);
    const res = await new SandboxManager().exec({
      argv: ["/usr/bin/true"],
      profile,
      env: { PATH: "/usr/bin:/bin" },
    });
    expect(res.blocked).not.toBe(true);
    expect(res.exit_code).toBe(0);
    expect(res.stderr).not.toMatch(/Resource temporarily unavailable/);
  });

  it("cancelProcessTree kills grandchildren of Core-owned spawn", async () => {
    const script = mkdtempSync(join(tmpdir(), "el-op-tree-"));
    const marker = join(script, "alive");
    writeFileSync(
      join(script, "run.sh"),
      `#!/bin/sh\n(sleep 60 & echo $! > '${marker}.child')\nsleep 60\n`,
    );
    const { child, identity } = spawnSupervised({
      argv: ["/bin/sh", join(script, "run.sh")],
    });
    expect(identity).toBeTruthy();
    for (let i = 0; i < 50; i++) {
      if (existsSync(`${marker}.child`)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(existsSync(`${marker}.child`)).toBe(true);
    const childPid = Number(readFileSync(`${marker}.child`, "utf-8").trim());
    expect(Number.isFinite(childPid)).toBe(true);
    const result = cancelProcessTree(identity!, "SIGKILL");
    expect(result.signalled).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(`/proc/${childPid}`)).toBe(false);
    await Promise.race([
      new Promise<void>((resolve) => child.on("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
    rmSync(script, { recursive: true, force: true });
  }, 10000);

  it("invalid workspace bind fails closed (setup/exec error)", async () => {
    const missing = join(tmpdir(), `el-missing-ws-${Date.now()}`);
    const profile = agentWorkspaceProfile(missing);
    // Ensure path does not exist
    rmSync(missing, { recursive: true, force: true });
    const res = await new SandboxManager().exec({
      argv: ["/bin/true"],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    // Either blocked at setup or bwrap non-zero — must not silently succeed on host
    const silentlyOk = res.blocked !== true && res.exit_code === 0 && !res.timed_out;
    expect(silentlyOk).toBe(false);
  });
});
