import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentWorkspaceProfile,
  evaluateCapability,
  assertAllowed,
  SecurityPolicyError,
  narrowProfileByAuthority,
} from "../../src/v3/security/index.js";

describe("V3.5 security policy", () => {
  const ws = mkdtempSync(join(tmpdir(), "el-sec-"));
  const profile = agentWorkspaceProfile(ws, "/tmp/primary-checkout-fake");

  it("allows workspace write and denies network by default", () => {
    expect(evaluateCapability(profile, "filesystem.write").decision).toBe("allow");
    expect(evaluateCapability(profile, "network.egress").decision).toBe("deny");
  });

  it("requires approval for package install", () => {
    expect(evaluateCapability(profile, "package.install").decision).toBe("require_approval");
  });

  it("fail-closes unknown actions", () => {
    const p = { ...profile, capabilities: [] };
    expect(evaluateCapability(p, "deploy.publish").decision).toBe("deny");
  });

  it("denies path escape", () => {
    const d = evaluateCapability(profile, "filesystem.read", {
      targetPath: "/etc/shadow",
    });
    expect(d.decision).toBe("deny");
  });

  it("narrows by authority (cannot widen)", () => {
    const narrowed = narrowProfileByAuthority(profile, { allowShell: false, allowWrite: true });
    expect(evaluateCapability(narrowed, "shell.execute").decision).toBe("deny");
    expect(() => assertAllowed(narrowed, "shell.execute")).toThrow(SecurityPolicyError);
  });
});
