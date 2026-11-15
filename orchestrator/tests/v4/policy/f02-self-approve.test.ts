import { describe, expect, it } from "vitest";
import { V37PolicyAdapter, V4_CLI_STORE_FALLBACK, v3StoreApproveFallbackForbidden } from "../../../src/v4/adapters/v37/policy.js";
import { InMemoryOperatorAuthn } from "../../../src/v4/policy/authn.js";
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
    expect(() => v3StoreApproveFallbackForbidden("apr1", "cli")).toThrow(/must not fall back/);
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
