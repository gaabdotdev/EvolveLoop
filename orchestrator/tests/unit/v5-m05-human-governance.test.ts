/**
 * V5-M05 — Human Governance.
 * Policy deny blocks tools; budget fail-closed; approvals Work/Attempt bridge; audit append-only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  ApprovalWorkAttemptBridge,
  authorizeToolUnderPolicy,
  GOVERNANCE_POLICY_PRECEDENCE,
  LIFECYCLE_GOVERNANCE_NOTES,
  openHumanGovernance,
  pauseOwnedRuns,
} from "../../src/v3/human-governance/index.js";
import { openToolFreedom } from "../../src/v3/tool-registry/index.js";

describe("V5-M05 Human Governance", () => {
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
    const ws = mkdtempSync(join(tmpdir(), `v5-m05-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("paths.governanceDir additive; policy precedence work > workspace", () => {
    const paths = resolveV3DataPaths(join(freshRoot("paths"), "v3"));
    expect(paths.governanceDir).toContain("governance");
    expect(GOVERNANCE_POLICY_PRECEDENCE).toEqual(["work", "workspace"]);
  });

  it("policy deny_tool_ids blocks tool even when M04-assigned", () => {
    const root = freshRoot("policy-deny");
    const { policy, audit } = openHumanGovernance(join(root, "gov"));
    const { registry, assignments } = openToolFreedom(join(root, "tools"));
    registry.seed();
    assignments.assignToolsToAgent("agent-a", ["shell.exec"]);

    policy.upsert({
      scope: "work",
      work_id: "w-1",
      deny_tool_ids: ["shell.exec"],
    });

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

  it("approvals bridge persists work_id + attempt_id", () => {
    const root = freshRoot("apr");
    const store = new ApprovalStore(join(root, "approvals"));
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

    const byAttempt = bridge.listForAttempt("att-1");
    expect(byAttempt).toHaveLength(1);
    expect(byAttempt[0].approval_id).toBe(created.approval_id);

    const byWork = bridge.listForWork("w-bridge", { attempt_id: "att-1" });
    expect(byWork).toHaveLength(1);
  });

  it("budget tokens/attempts fail-closed when exceeded", () => {
    const { budgets, audit } = openHumanGovernance(freshRoot("budget"));
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
    const { policy, budgets, audit } = openHumanGovernance(join(root, "gov"));
    const { registry, assignments } = openToolFreedom(join(root, "tools"));
    registry.seed();
    assignments.assignToolsToAgent("agent-a", ["fs.read"]);
    budgets.upsertLimit({
      scope: "work",
      work_id: "w-bt",
      agent_id: "agent-a",
      max_attempts: 0,
    });
    // consumed_attempts starts 0; max_attempts 0 → 0 > 0 is false.
    // exceed by recording one attempt.
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
    const { audit } = openHumanGovernance(freshRoot("audit"));
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

  it("lifecycle governance notes + REMED pause export present (no_live_targets honest)", () => {
    expect(LIFECYCLE_GOVERNANCE_NOTES.some((n) => /lifecycle\/run-controls/.test(n))).toBe(
      true,
    );
    const ws = freshRoot("life");
    const result = pauseOwnedRuns({ workspace: ws, work_id: "w-none" });
    expect(result.kind).toBe("RunControlResult");
    expect(result.action).toBe("pause");
    expect(result.no_live_targets).toBe(true);
  });
});
