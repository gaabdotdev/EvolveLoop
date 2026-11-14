import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalBroker } from "../../src/v3/approvals/broker.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { SandboxManager } from "../../src/v3/sandbox/manager.js";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import { assertAllowed, SecurityPolicyError } from "../../src/v3/security/enforcer.js";
import { agentWorkspaceProfile } from "../../src/v3/security/profiles.js";

describe("ISSUE-SEC-C01 ApprovalBroker production wiring", () => {
  it("assertAllowed fail-closes require_approval", () => {
    const ws = mkdtempSync(join(tmpdir(), "el-c01-"));
    const profile = agentWorkspaceProfile(ws);
    expect(() => assertAllowed(profile, "package.install")).toThrow(SecurityPolicyError);
    try {
      assertAllowed(profile, "package.install");
    } catch (e) {
      expect((e as SecurityPolicyError).code).toBe("REQUIRES_APPROVAL");
    }
  });

  it("SandboxManager.gateAction denies without grant and authorizes with grant", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-c01-broker-"));
    const store = new ApprovalStore(join(dir, "approvals"));
    const broker = new ApprovalBroker(store);
    const mgr = new SandboxManager(undefined, broker);
    const profile = agentWorkspaceProfile(dir);

    const pending = mgr.gateAction(profile, "package.install", {
      work_id: "w1",
      resource: "npm:lodash",
      justification: "test",
    });
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") return;

    store.approve(pending.approval_id, "tester");
    const denied = mgr.gateAction(profile, "package.install", {
      work_id: "w1",
      resource: "npm:lodash",
      justification: "test",
      // wrong id
      approval_id: "nope",
    });
    expect(denied.status).toBe("deny");

    const ok = mgr.gateAction(profile, "package.install", {
      work_id: "w1",
      resource: "npm:lodash",
      justification: "test",
      approval_id: pending.approval_id,
    });
    expect(ok.status).toBe("authorized");
  });

  it("SandboxManager without broker fail-closes require_approval", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-c01-unwired-"));
    const mgr = new SandboxManager();
    const profile = agentWorkspaceProfile(dir);
    const r = mgr.gateAction(profile, "git.mutate", {
      work_id: "w1",
      resource: "git:commit",
      justification: "x",
    });
    expect(r.status).toBe("deny");
    if (r.status === "deny") {
      expect(r.reason).toContain("broker_unwired");
    }
  });

  it("CoordinatorDaemon exposes production broker", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-c01-daemon-"));
    const daemon = new CoordinatorDaemon(dir);
    expect(daemon.broker).toBeInstanceOf(ApprovalBroker);
    expect(daemon.sandbox.status().approval_broker_wired).toBe(true);
  });
});
