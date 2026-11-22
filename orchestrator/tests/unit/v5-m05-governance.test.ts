/**
 * V5-M05 — Human Governance (canonical path: src/v3/governance).
 * Policy deny blocks tools; budget fail-closed; approvals Work/Attempt; audit append-only;
 * policy-gated pause wrapper over REMED-M2 lifecycle.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalFacade } from "../../src/v3/approvals/facade.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  ApprovalWorkAttemptBridge,
  authorizeToolUnderPolicy,
  LIFECYCLE_GOVERNANCE_NOTES,
  openGovernance,
  pauseOwnedRunsUnderPolicy,
  POLICY_PRECEDENCE,
} from "../../src/v3/governance/index.js";
import { openToolFreedom } from "../../src/v3/tool-registry/index.js";

describe("V5-M05 Human Governance (governance/)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshRoot(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m05-gov-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("paths.governanceDir additive; policy precedence work > workspace", () => {
    const paths = resolveV3DataPaths(join(freshRoot("paths"), "v3"));
    expect(paths.governanceDir).toContain("governance");
    expect(POLICY_PRECEDENCE).toEqual(["work", "workspace"]);
  });

  it("policy deny blocks tool via tool-registry authorize + audit entry", () => {
    const root = freshRoot("policy-deny");
    const { policy, audit } = openGovernance(join(root, "gov"));
    const { registry, assignments } = openToolFreedom(join(root, "tools"));
    registry.seed();
    assignments.assignToolsToAgent("agent-a", ["shell.exec"]);

    policy.upsert({
      scope: "work",
      work_id: "w-1",
      deny_tool_ids: ["shell.exec"],
    });

    const check = policy.checkPolicy({
      type: "tool_use",
      tool_id: "shell.exec",
      work_id: "w-1",
      agent_id: "agent-a",
    });
    expect(check.allowed).toBe(false);
    expect(check.verdict).toBe("deny");

    const result = authorizeToolUnderPolicy(
      policy,
      registry,
      assignments,
      {
        agent_id: "agent-a",
        tool_id: "shell.exec",
        work_id: "w-1",
      },
      { audit },
    );
    expect(result.verdict).toBe("deny");
    expect(result.reason).toMatch(/policy_denied/);

    const events = audit.read();
    expect(events.some((e) => e.audit_kind === "policy_deny_tool")).toBe(true);
  });

  it("approvals facade + bridge persist work_id + attempt_id", () => {
    const root = freshRoot("apr");
    const store = new ApprovalStore(join(root, "approvals"));
    const facade = new ApprovalFacade(store);
    const card = facade.create({
      work_id: "w-facade",
      attempt_id: "att-facade",
      agent_id: "agent-a",
      operation: "shell.execute",
      resource: "/tmp",
      justification: "M05 facade bridge",
    });
    expect(card.work_id).toBe("w-facade");
    expect(card.attempt_id).toBe("att-facade");

    const bridge = new ApprovalWorkAttemptBridge(store);
    const created = bridge.create({
      work_id: "w-bridge",
      attempt_id: "att-1",
      agent_id: "agent-a",
      operation: "shell.execute",
      resource: "/tmp",
      justification: "M05 bridge test",
    });
    expect(created.work_id).toBe("w-bridge");
    expect(created.attempt_id).toBe("att-1");
    expect(bridge.listForAttempt("att-1")).toHaveLength(1);
  });

  it("budget exceeded fail-closed + audit entry written", () => {
    const { budgets, audit } = openGovernance(freshRoot("budget"));
    budgets.upsertLimit({
      scope: "work",
      work_id: "w-b",
      agent_id: "agent-a",
      max_tokens: 10,
      max_attempts: 2,
    });
    budgets.recordConsumption({
      scope: "work",
      work_id: "w-b",
      agent_id: "agent-a",
      delta_tokens: 11,
      delta_attempts: 1,
    });
    const check = budgets.check({
      scope: "work",
      work_id: "w-b",
      agent_id: "agent-a",
    });
    expect(check.verdict).toBe("exceeded");
    expect(check.fail_closed_block).toBe(true);
    expect(check.reasons.some((r) => r.startsWith("tokens_exceeded"))).toBe(true);

    audit.append({
      work_id: "w-b",
      agent_id: "agent-a",
      audit_kind: "budget_exceeded",
      message: "tokens exceeded",
      payload: { reasons: check.reasons },
    });
    expect(audit.read().length).toBe(1);
  });

  it("budget block overlays tool authorize when work budget exceeded", () => {
    const root = freshRoot("budget-tool");
    const { policy, budgets, audit } = openGovernance(join(root, "gov"));
    const { registry, assignments } = openToolFreedom(join(root, "tools"));
    registry.seed();
    assignments.assignToolsToAgent("agent-a", ["fs.read"]);
    budgets.upsertLimit({
      scope: "work",
      work_id: "w-bt",
      agent_id: "agent-a",
      max_attempts: 0,
    });
    budgets.recordConsumption({
      scope: "work",
      work_id: "w-bt",
      agent_id: "agent-a",
      delta_attempts: 1,
    });

    const result = authorizeToolUnderPolicy(
      policy,
      registry,
      assignments,
      {
        agent_id: "agent-a",
        tool_id: "fs.read",
        work_id: "w-bt",
      },
      { budget: budgets, audit },
    );
    expect(result.verdict).toBe("deny");
    expect(result.reason).toMatch(/budget:/);
  });

  it("audit log is append-only (grows; prior events retained)", () => {
    const { audit } = openGovernance(freshRoot("audit"));
    audit.append({
      audit_kind: "other",
      message: "one",
      work_id: "w",
    });
    audit.append({
      audit_kind: "other",
      message: "two",
      work_id: "w",
    });
    const all = audit.read();
    expect(all.map((e) => e.message)).toEqual(["one", "two"]);
    expect(all[0].event_id).not.toBe(all[1].event_id);
  });

  it("policy forbids pause → thin wrapper does not invoke REMED control", () => {
    expect(LIFECYCLE_GOVERNANCE_NOTES.some((n) => /REMED-M2/.test(n))).toBe(true);
    const root = freshRoot("life");
    const { policy, audit } = openGovernance(join(root, "gov"));
    policy.upsert({
      scope: "work",
      work_id: "w-forbid",
      deny_lifecycle_actions: ["pause"],
    });
    const gated = pauseOwnedRunsUnderPolicy(
      policy,
      { workspace: root, work_id: "w-forbid" },
      audit,
    );
    expect(gated.kind).toBe("PolicyDenied");
    if (gated.kind === "PolicyDenied") {
      expect(gated.action).toBe("pause");
      expect(gated.policy.allowed).toBe(false);
    }
    expect(audit.read().some((e) => e.audit_kind === "policy_deny_lifecycle")).toBe(
      true,
    );
  });

  it("policy allows pause → reuses REMED pause (no_live_targets honest)", () => {
    const root = freshRoot("life-ok");
    const { policy, audit } = openGovernance(join(root, "gov"));
    const gated = pauseOwnedRunsUnderPolicy(
      policy,
      { workspace: root, work_id: "w-none" },
      audit,
    );
    expect(gated.kind).toBe("RunControlResult");
    if (gated.kind === "RunControlResult") {
      expect(gated.result.action).toBe("pause");
      expect(gated.result.no_live_targets).toBe(true);
    }
  });
});
