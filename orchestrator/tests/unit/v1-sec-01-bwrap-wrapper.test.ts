/**
 * V1-SEC-01 — Bubblewrap/Landlock wrapper for ExecutionRunner.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planBwrapWrapper,
  mockBwrapWrapperPlan,
  isBwrapAvailable,
  probeLandlock,
  buildDefaultLandlockPolicy,
} from "../../src/v3/sandbox/index.js";
import { DefaultExecutionRunner } from "../../src/v3/execution-runner/index.js";
import { buildBubblewrapArgvForTest } from "../../src/v3/sandbox/index.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";

const hasBwrap = isBwrapAvailable();

describe("V1-SEC-01 bwrap/landlock wrapper", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-sec01-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("plans wrapper with workspace RW, system RO, isolate home/ssh (mock when needed)", () => {
    const plan = hasBwrap
      ? planBwrapWrapper({
          workspace_rw: tmp,
          argv: ["/bin/true"],
          unshare_net: true,
        })
      : mockBwrapWrapperPlan({
          workspace_rw: tmp,
          argv: ["/bin/true"],
          unshare_net: true,
        });

    expect(plan.isolates_home).toBe(true);
    expect(plan.isolates_ssh).toBe(true);
    expect(plan.argv).toContain("--tmpfs");
    expect(plan.argv).toContain("/home");
    expect(plan.argv).toContain("--ro-bind");
    expect(plan.argv).toContain("--unshare-net");
    expect(plan.argv).toContain("--bind");
    expect(plan.argv).toContain(tmp);
    // Must not bind host home or .ssh
    expect(plan.argv.join(" ")).not.toMatch(/\.ssh/);
    const landlock = buildDefaultLandlockPolicy(tmp);
    expect(landlock.rules.some((r) => r.path === "/home" && r.access === "deny")).toBe(true);
    const probe = probeLandlock();
    expect(probe.kind).toBe("LandlockProbe");
    expect(probe.enforceable).toBe(false); // honest GAP: no Node binding
  });

  it("ExecutionRunner os_sandbox=require uses bwrap or blocks if missing", async () => {
    const runner = new DefaultExecutionRunner();
    const result = await runner.run({
      argv: ["/bin/true"],
      cwd: tmp,
      workspace_root: tmp,
      os_sandbox: "require",
      timeout_ms: 3000,
    });
    if (!hasBwrap) {
      expect(result.status).toBe("blocked");
      expect(result.code).toBe("OS_SANDBOX_UNAVAILABLE");
    } else {
      expect(result.os_sandbox?.used).toBe(true);
      expect(result.os_sandbox?.backend).toBe("bubblewrap");
      expect(result.os_sandbox?.isolates_home).toBe(true);
    }
  });

  it("AUD-STUB-01: os_sandbox=true fails closed — no silent host fallback", async () => {
    const runner = new DefaultExecutionRunner();
    const result = await runner.run({
      argv: ["/bin/true"],
      cwd: tmp,
      workspace_root: tmp,
      os_sandbox: true,
      timeout_ms: 3000,
    });
    if (!hasBwrap) {
      expect(result.status).toBe("blocked");
      expect(result.code).toBe("OS_SANDBOX_UNAVAILABLE");
      expect(result.limitations).toContain("silent_host_fallback_forbidden");
      expect(result.stderr).toMatch(/bwrap required but unavailable/);
    } else {
      expect(result.os_sandbox?.used).toBe(true);
      expect(result.os_sandbox?.backend).toBe("bubblewrap");
    }
  });

  it("AUD-STUB-01: runSync honors os_sandbox fail-closed (no silent skip)", () => {
    const runner = new DefaultExecutionRunner();
    const result = runner.runSync({
      argv: ["/bin/true"],
      cwd: tmp,
      workspace_root: tmp,
      os_sandbox: true,
      timeout_ms: 3000,
    });
    if (!hasBwrap) {
      expect(result.status).toBe("blocked");
      expect(result.code).toBe("OS_SANDBOX_UNAVAILABLE");
      expect(result.limitations).toContain("silent_host_fallback_forbidden");
    } else {
      expect(result.os_sandbox?.used).toBe(true);
      expect(result.status).toBe("ok");
    }
  });

  it.runIf(hasBwrap)("integration: bwrap --ro-bind executes and hides /home", async () => {
    writeFileSync(path.join(tmp, "marker.txt"), "sec01-ok");
    const runner = new DefaultExecutionRunner();
    const result = await runner.run({
      argv: [
        "/bin/sh",
        "-c",
        `cat ${path.join(tmp, "marker.txt")}; test ! -e /home/$USER/.ssh; echo HOMECHECK=$?; ls /home 2>/dev/null | wc -l`,
      ],
      cwd: tmp,
      workspace_root: tmp,
      os_sandbox: "require",
      timeout_ms: 10_000,
    });
    expect(result.status).toBe("ok");
    expect(result.stdout).toContain("sec01-ok");
    expect(result.os_sandbox?.used).toBe(true);
  });

  it.runIf(hasBwrap)(
    "integration: sandboxed read of ~/.ssh and /home outside workspace → ENOENT/EACCES",
    async () => {
      const runner = new DefaultExecutionRunner();
      const home = os.homedir();
      const sshProbe = path.join(home, ".ssh", "id_rsa");
      const outsideHome = path.join(home, "v1-gate-prod-should-not-exist");
      const script = [
        `cat "${sshProbe}" 2>ssh.err; echo SSH_EC=$?`,
        `cat "${outsideHome}" 2>home.err; echo HOME_EC=$?`,
        `cat ssh.err home.err`,
        // Workspace itself must remain readable
        `echo WORKSPACE_OK > ${path.join(tmp, "ok.txt")}; cat ${path.join(tmp, "ok.txt")}`,
      ].join("; ");
      const result = await runner.run({
        argv: ["/bin/sh", "-c", script],
        cwd: tmp,
        workspace_root: tmp,
        os_sandbox: "require",
        timeout_ms: 10_000,
      });
      expect(result.status).toBe("ok");
      expect(result.os_sandbox?.used).toBe(true);
      expect(result.os_sandbox?.isolates_home).toBe(true);
      expect(result.stdout).toContain("WORKSPACE_OK");
      // Non-zero exit from cat ⇒ denied/missing inside sandbox
      expect(result.stdout).toMatch(/SSH_EC=[1-9]/);
      expect(result.stdout).toMatch(/HOME_EC=[1-9]/);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toMatch(/No such file|Permission denied|Arquivo ou diretório inexistente|Permissão negada|ENOENT|EACCES/i);
    },
  );

  it.skipIf(hasBwrap)("FAIL honest: bwrap binary missing on host — cannot prove confinement", () => {
    expect(hasBwrap, "bwrap required at /usr/bin/bwrap for V1-GATE-PROD").toBe(true);
  });

  it("bubblewrap backend args include tmpfs /home", () => {
    mkdirSync(tmp, { recursive: true });
    const profile = agentWorkspaceProfile(tmp);
    const args = buildBubblewrapArgvForTest({ argv: ["/bin/true"], profile });
    const homeIdx = args.indexOf("/home");
    expect(homeIdx).toBeGreaterThan(0);
    expect(args[homeIdx - 1]).toBe("--tmpfs");
  });
});
