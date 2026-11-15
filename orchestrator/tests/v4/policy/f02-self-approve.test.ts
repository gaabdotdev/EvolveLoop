import { describe, expect, it, vi } from "vitest";
import {
  applyCliApprovalStoreFallback,
  F02_STORE_FALLBACK_REFUSED,
  V37PolicyAdapter,
  V4_CLI_STORE_FALLBACK,
  v3StoreApproveFallbackForbidden,
  v4CliStoreFallbackAllowed,
} from "../../../src/v4/adapters/v37/policy.js";
import { CALLER_ASSERTED_IDENTITY_KEYS, InMemoryOperatorAuthn } from "../../../src/v4/policy/authn.js";
import { DenyByDefaultPolicyEngine, InMemoryWorkContext } from "../../../src/v4/policy/engine.js";
import { PolicyStore } from "../../../src/v4/policy/store.js";
import { readDecidedBy } from "../../../src/v4/policy/types.js";
import { allowRule, basePolicy, FakeClock, request, workCtx } from "./fixtures.js";

function setup() {
  const store = new PolicyStore();
  store.put(
    basePolicy({
      autonomy_ceiling: "L2_SUPERVISED",
      rules: [
        allowRule({
          rule_id: "rule_deploy",
          actions: ["deploy.publish"],
          resources: ["prod"],
        }),
      ],
    }),
  );
  const contexts = new InMemoryWorkContext();
  contexts.set(workCtx({ autonomy: "L2_SUPERVISED" }));
  const engine = new DenyByDefaultPolicyEngine({ store, policy_id: "pol_default0001", contexts, clock: new FakeClock() });
  const authn = new InMemoryOperatorAuthn();
  const human = authn.issue("operator-gaab");
  const adapter = new V37PolicyAdapter(engine, authn);
  return { engine, authn, human, adapter };
}

describe("M10 F02 — no caller-asserted approver, no CLI store fallback", () => {
  it("does not wire the V3 CLI store-write fallback", () => {
    expect(V4_CLI_STORE_FALLBACK).toBe(false);
    expect(v4CliStoreFallbackAllowed()).toBe(false);
    expect(() => v3StoreApproveFallbackForbidden("apr1", "cli")).toThrow(/must not fall back/);
  });

  it("refuses store.approve/reject after IPC failure without invoking the writer (RR-W5-01)", () => {
    const write = vi.fn(() => ({ state: "APPROVED" }));
    expect(() => applyCliApprovalStoreFallback("approve", write)).toThrow(F02_STORE_FALLBACK_REFUSED);
    expect(write).not.toHaveBeenCalled();
    expect(() => applyCliApprovalStoreFallback("reject", write)).toThrow(/ApprovalStore\.reject\(actor\)/);
    expect(write).not.toHaveBeenCalled();
  });

  it("locks v35-commands approve/reject to the V4 fallback gate (narrow CLI F02 path)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../src/cli/v35-commands.ts", import.meta.url), "utf8");
    expect(src).toContain('applyCliApprovalStoreFallback("approve"');
    expect(src).toContain('applyCliApprovalStoreFallback("reject"');
    expect(src).not.toMatch(/print\(\s*store\.approve\(/);
    expect(src).not.toMatch(/print\(\s*store\.reject\(/);
  });

  it("ignores actor/decided_by on the decision request (R4)", async () => {
    const { engine } = setup();
    const forged = {
      ...request({ action: "deploy.publish", resource: "prod", risk: "high" as const }),
      actor: "executor_worker01",
      decided_by: { kind: "HUMAN", id: "executor_worker01" },
      approver: "cli",
    };
    const d = await engine.decide(forged);
    expect(d.decision).toBe("REQUIRE_APPROVAL");
    expect(readDecidedBy(d)).toEqual({ kind: "POLICY_ENGINE", id: "policy-engine-v4" });
    expect(readDecidedBy(d)?.id).not.toBe("executor_worker01");
    expect("actor" in d.request).toBe(false);
  });

  it("rejects approve without an operator token", async () => {
    const { engine, adapter } = setup();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const noToken = adapter.approve({ approval_id: pending.approval_id, operator_token: "" });
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.reason).toBe("AUTH_REQUIRED");
    const garbage = adapter.approve({ approval_id: pending.approval_id, operator_token: "forged-token-value-xxx" });
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.reason).toBe("AUTH_REQUIRED");
  });

  it("rejects caller-asserted actor on the approve payload", async () => {
    const { engine, adapter, human } = setup();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const result = adapter.approve({
      approval_id: pending.approval_id,
      operator_token: human.token,
      actor: "executor_worker01",
    } as { approval_id: string; operator_token: string; actor: string });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("CALLER_ASSERTED_IDENTITY_REJECTED");
  });

  it("rejects every caller-asserted identity key on approve and reject (RR-W5-02)", async () => {
    const { engine, adapter, human } = setup();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    for (const key of CALLER_ASSERTED_IDENTITY_KEYS) {
      const forged = {
        approval_id: pending.approval_id,
        operator_token: human.token,
        [key]: key === "decided_by" ? { kind: "HUMAN", id: "executor_worker01" } : "executor_worker01",
      };
      const approved = adapter.approve(forged as { approval_id: string; operator_token: string });
      expect(approved.ok).toBe(false);
      if (!approved.ok) expect(approved.reason).toBe("CALLER_ASSERTED_IDENTITY_REJECTED");
      const rejected = adapter.reject(forged as { approval_id: string; operator_token: string });
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.reason).toBe("CALLER_ASSERTED_IDENTITY_REJECTED");
    }
    const stillPending = engine.pendingForDecision(d.decision_id);
    expect(stillPending?.state).toBe("PENDING");
  });

  it("does not treat caller-asserted actor as PolicyDecision authority (R4 — no thawed decided_by)", async () => {
    const { engine } = setup();
    const d = await engine.decide({
      ...request({ action: "deploy.publish", resource: "prod", risk: "high" as const }),
      actor: "cli",
    } as ReturnType<typeof request> & { actor: string });
    expect(d).not.toHaveProperty("actor");
    expect(Object.prototype.hasOwnProperty.call(d, "decided_by")).toBe(true);
    expect(readDecidedBy(d)).toEqual({ kind: "POLICY_ENGINE", id: "policy-engine-v4" });
    expect(d.schema_version).toBe("1.0.0");
  });

  it("denies self-approval by executor identity (M18 S2)", async () => {
    const { engine } = setup();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const spoofed = engine.resolveApproval(
      pending.approval_id,
      {
        kind: "HUMAN",
        id: "executor_worker01",
        authn: { method: "operator-token", credential_ref: "spoof" },
      },
      "APPROVED",
    );
    expect(spoofed.ok).toBe(false);
    if (!spoofed.ok) expect(spoofed.reason).toBe("SELF_APPROVAL_DENIED");
  });

  it("denies POLICY_ENGINE/executor principal on the human approval path", async () => {
    const { engine } = setup();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const asEngine = engine.resolveApproval(
      pending.approval_id,
      { kind: "POLICY_ENGINE", id: "policy-engine-v4", authn: { method: "policy-engine", credential_ref: "pdp" } },
      "APPROVED",
    );
    expect(asEngine.ok).toBe(false);
    if (!asEngine.ok) expect(asEngine.reason).toBe("EXECUTOR_PRINCIPAL_DENIED");
  });

  it("records decided_by from the authenticated human, never from the token payload", async () => {
    const { engine, adapter, human } = setup();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const result = adapter.approve({ approval_id: pending.approval_id, operator_token: human.token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.approval.decided_by).toEqual({ kind: "HUMAN", id: "operator-gaab" });
    expect(result.grant?.action).toBe("deploy.publish");
    expect(result.grant?.resource).toBe("prod");
    expect(result.grant?.subject_executor_id).toBe("executor_worker01");
  });

  it("refuses to issue operator tokens bound to an executor id", () => {
    const authn = new InMemoryOperatorAuthn();
    expect(() => authn.issue("executor_worker01")).toThrow(/OPERATOR_MUST_NOT_BE_EXECUTOR/);
  });
});
