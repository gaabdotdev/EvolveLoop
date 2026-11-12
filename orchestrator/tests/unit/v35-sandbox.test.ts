import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager, BubblewrapBackend, which } from "../../src/v3/sandbox/index.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";

const hasBwrap = !!which("bwrap");

describe("V3.5 sandbox", () => {
  it("reports bubblewrap availability honestly", () => {
    const status = new SandboxManager().status();
    expect(status.backends.length).toBeGreaterThan(0);
    if (hasBwrap) {
      expect(status.preferred?.available).toBe(true);
    }
  });

  it("blocks when sandbox required and backend forced unavailable", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-sb-"));
    const profile = agentWorkspaceProfile(ws);
    const mgr = new SandboxManager([
      {
        backend_id: "unavailable",
        probe: () => ({
          available: false,
          backend_id: "unavailable",
          reason: "forced",
          notes: [],
        }),
        exec: async () => {
          throw new Error("should_not_run");
        },
      },
    ]);
    const res = await mgr.exec({
      argv: ["/bin/echo", "hi"],
      profile,
    });
    expect(res.blocked).toBe(true);
    expect(res.block_reason).toMatch(/sandbox_required|unavailable|forced/);
  });

  it.runIf(hasBwrap)("executes echo inside workspace bind", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-sb-"));
    writeFileSync(join(ws, "marker.txt"), "ok");
    const profile = agentWorkspaceProfile(ws);
    const res = await new SandboxManager().exec({
      argv: ["/bin/cat", join(ws, "marker.txt")],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.blocked).not.toBe(true);
    expect(res.exit_code).toBe(0);
    expect(res.stdout.trim()).toBe("ok");
  });

  it.runIf(hasBwrap)("denies network with unshare-net", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-sb-net-"));
    const profile = agentWorkspaceProfile(ws);
    // /bin/sh trying to use /dev/tcp should fail under unshare-net, or getent may fail.
    const res = await new SandboxManager().exec({
      argv: ["/bin/sh", "-c", "getent hosts example.com || true; echo NETDONE"],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.blocked).not.toBe(true);
    expect(res.stdout).toContain("NETDONE");
    // With --unshare-net, getent typically returns empty / fails — not a successful resolve payload.
    expect(res.stdout.includes("93.") || res.stdout.includes("2606:")).toBe(false);
  });

  it.runIf(hasBwrap)("blocks write outside workspace (no home bind)", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-sb-esc-"));
    const outside = join(tmpdir(), `el-outside-${Date.now()}.txt`);
    const profile = agentWorkspaceProfile(ws);
    const res = await new SandboxManager().exec({
      argv: ["/bin/sh", "-c", `echo pwned > ${outside}`],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    // Either command fails or file not created on host
    let created = false;
    try {
      created = readFileSync(outside, "utf-8").includes("pwned");
    } catch {
      created = false;
    }
    expect(created).toBe(false);
    void res;
  });

  it.runIf(hasBwrap)("symlink escape to denied path does not expose content", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-sb-sym-"));
    try {
      symlinkSync("/etc/shadow", join(ws, "shadow-link"));
    } catch {
      // may lack permission to create symlink in some envs
      return;
    }
    const profile = agentWorkspaceProfile(ws);
    const res = await new SandboxManager().exec({
      argv: ["/bin/cat", join(ws, "shadow-link")],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.stdout.includes("root:")).toBe(false);
  });

  it("build args include unshare-net for deny profile", async () => {
    const ws = mkdtempSync(join(tmpdir(), "el-sb-args-"));
    mkdirSync(ws, { recursive: true });
    const profile = agentWorkspaceProfile(ws);
    const { buildBubblewrapArgvForTest } = await import("../../src/v3/sandbox/backends/bubblewrap.js");
    const args = buildBubblewrapArgvForTest({
      argv: ["/bin/true"],
      profile,
    });
    expect(args).toContain("--unshare-net");
    expect(args).toContain("--clearenv");
  });

  it("BubblewrapBackend probe matches which(bwrap)", () => {
    const p = new BubblewrapBackend().probe();
    expect(p.available).toBe(hasBwrap);
  });
});
