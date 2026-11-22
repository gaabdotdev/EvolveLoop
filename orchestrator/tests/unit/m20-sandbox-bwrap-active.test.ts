/**
 * M20 — Sandbox ativo: bwrap ON; workers sem acesso fora do repositório.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isBwrapAvailable } from "../../src/v3/sandbox/bwrap-wrapper.js";
import { DefaultExecutionRunner } from "../../src/v3/execution-runner/index.js";
import { SandboxManager } from "../../src/v3/sandbox/index.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";
import { probeHudEnvironment } from "../../src/v3/evolve-shell/hud-probes.js";

const hasBwrap = isBwrapAvailable();

describe("M20 Sandbox bwrap ON", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "m20-sb-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("host probe: bwrap binary present → HUD sandbox ON", () => {
    expect(hasBwrap, "host must have /usr/bin/bwrap for M20 proof").toBe(true);
    const probe = probeHudEnvironment(tmp);
    expect(probe.sandbox).toBe("ON");
    expect(probe.footer.sandbox).toBe("ON");
  });

  it("agent workspace profile requires OS sandbox (fail-closed)", () => {
    const profile = agentWorkspaceProfile(tmp);
    expect(profile.require_os_sandbox).toBe(true);
  });

  it.runIf(hasBwrap)(
    "ExecutionRunner os_sandbox=require blocks read/write outside workspace",
    async () => {
      writeFileSync(path.join(tmp, "in-repo.txt"), "inside");
      const outside = path.join(os.tmpdir(), `m20-outside-${Date.now()}.txt`);
      writeFileSync(outside, "SECRET_OUTSIDE");

      const runner = new DefaultExecutionRunner();
      const result = await runner.run({
        argv: [
          "/bin/sh",
          "-c",
          [
            `cat "${path.join(tmp, "in-repo.txt")}"`,
            `cat "${outside}" 2>err.txt; echo OUT_EC=$?`,
            `echo pwned > "${outside}.w" 2>>err.txt; echo WRITE_EC=$?`,
            `cat err.txt`,
            `echo WORKSPACE_OK`,
          ].join("; "),
        ],
        cwd: tmp,
        workspace_root: tmp,
        os_sandbox: "require",
        timeout_ms: 10_000,
      });

      expect(result.status).toBe("ok");
      expect(result.os_sandbox?.used).toBe(true);
      expect(result.os_sandbox?.backend).toBe("bubblewrap");
      expect(result.stdout).toContain("inside");
      expect(result.stdout).toContain("WORKSPACE_OK");
      expect(result.stdout).toMatch(/OUT_EC=[1-9]/);
      // Outside write must not land on host
      expect(existsSync(`${outside}.w`)).toBe(false);
      expect(readFileSync(outside, "utf-8")).toBe("SECRET_OUTSIDE");
    },
  );

  it.runIf(hasBwrap)("SandboxManager + agent profile blocks path outside repo", async () => {
    const outside = path.join(os.homedir(), `m20-home-escape-${Date.now()}.txt`);
    const profile = agentWorkspaceProfile(tmp);
    expect(profile.require_os_sandbox).toBe(true);
    const res = await new SandboxManager().exec({
      argv: ["/bin/sh", "-c", `echo pwned > "${outside}"; cat "${outside}" 2>/dev/null || echo DENIED`],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    expect(res.blocked).not.toBe(true);
    let created = false;
    try {
      created = readFileSync(outside, "utf-8").includes("pwned");
    } catch {
      created = false;
    }
    expect(created).toBe(false);
    expect(`${res.stdout ?? ""}\n${res.stderr ?? ""}`).toMatch(/DENIED|No such file|Permission denied|pwned/i);
    // If "pwned" appears it must be from the failed echo path, not a successful host write.
    if (existsSync(outside)) {
      await fs.rm(outside, { force: true });
      expect.fail("outside home path must not be writable from sandbox");
    }
  });

  it.skipIf(hasBwrap)("FAIL honest: bwrap missing — cannot claim sandbox ON", () => {
    expect(hasBwrap).toBe(true);
  });
});
