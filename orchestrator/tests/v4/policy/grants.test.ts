import { describe, expect, it } from "vitest";
import { DenyByDefaultPolicyEngine, InMemoryWorkContext } from "../../../src/v4/policy/engine.js";
import { InMemoryOperatorAuthn } from "../../../src/v4/policy/authn.js";
import { isLocalGrantId, isLocalApprovalId } from "../../../src/v4/policy/ids.js";
import { PolicyStore } from "../../../src/v4/policy/store.js";
import { allowRule, basePolicy, FakeClock, request, workCtx } from "./fixtures.js";

function setup(clock = new FakeClock()) {
  const store = new PolicyStore();
  store.put(
    basePolicy({
      autonomy_ceiling: "L2_SUPERVISED",
      rules: [allowRule({ rule_id: "rule_deploy", actions: ["deploy.publish"], resources: ["prod"] })],
    }),
  );
  const contexts = new InMemoryWorkContext();
  contexts.set(workCtx({ autonomy: "L2_SUPERVISED" }));
  const engine = new DenyByDefaultPolicyEngine({ store, policy_id: "pol_default0001", contexts, clock });
  const authn = new InMemoryOperatorAuthn();
  const human = authn.issue("operator-gaab");
  return { engine, store, human, clock };
}

async function approvedGrant(engine: DenyByDefaultPolicyEngine, tokenPrincipal: ReturnType<InMemoryOperatorAuthn["issue"]>) {
  const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
  const pending = engine.pendingForDecision(d.decision_id)!;
  const result = engine.resolveApproval(pending.approval_id, tokenPrincipal.principal, "APPROVED");
  if (!result.ok || !result.grant) throw new Error("expected grant");
  return result.grant;
}

describe("M10 grants — expiry, revoke, atomic consume (F03/F04); not V37 records (R8)", () => {
  it("issues local grant/approval ids that are not catalog kinds and not path components", async () => {
    const { engine, human } = setup();
    const grant = await approvedGrant(engine, human);
    expect(isLocalGrantId(grant.grant_id)).toBe(true);
    expect(grant.grant_id.includes("/")).toBe(false);
    expect(grant.grant_id.includes("..")).toBe(false);
    const pending = engine.approvals.list({ state: "APPROVED" })[0];
    expect(isLocalApprovalId(pending.approval_id)).toBe(true);
  });

  it("does not treat the grant as a V37 ApprovalRequest", async () => {
    const { engine, human } = setup();
    const grant = await approvedGrant(engine, human);
    expect("kind" in grant).toBe(false);
    expect("permissions_requested" in grant).toBe(false);
    expect("decided_by" in grant).toBe(false);
  });

  it("refuses consume after expiry", async () => {
    const clock = new FakeClock();
    const { engine, human } = setup(clock);
    const grant = await approvedGrant(engine, human);
    clock.advance(4 * 3_600_000);
    const used = engine.consumeGrant({
      grant_id: grant.grant_id,
      effect_id: "eff_abc123def",
      work_id: grant.work_id,
      action: grant.action,
      resource: grant.resource,
    });
    expect(used).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses consume after revoke", async () => {
    const { engine, human } = setup();
    const grant = await approvedGrant(engine, human);
    engine.revokeGrant(grant.grant_id);
    const used = engine.consumeGrant({
      grant_id: grant.grant_id,
      effect_id: "eff_abc123def",
      work_id: grant.work_id,
      action: grant.action,
      resource: grant.resource,
    });
    expect(used).toEqual({ ok: false, reason: "revoked" });
  });

  it("refuses consume after policy epoch change (D14)", async () => {
    const { engine, human, store } = setup();
    const grant = await approvedGrant(engine, human);
    store.bumpEpoch("pol_default0001");
    const used = engine.consumeGrant({
      grant_id: grant.grant_id,
      effect_id: "eff_abc123def",
      work_id: grant.work_id,
      action: grant.action,
      resource: grant.resource,
    });
    expect(used).toEqual({ ok: false, reason: "stale_epoch" });
  });

  it("consumes a single-use grant once and links the effect_id (F04)", async () => {
    const { engine, human } = setup();
    const grant = await approvedGrant(engine, human);
    const first = engine.consumeGrant({
      grant_id: grant.grant_id,
      effect_id: "eff_abc123def",
      work_id: grant.work_id,
      action: grant.action,
      resource: grant.resource,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.grant.state).toBe("CONSUMED");
      expect(first.grant.consumed_effect_ids).toEqual(["eff_abc123def"]);
    }
    const second = engine.consumeGrant({
      grant_id: grant.grant_id,
      effect_id: "eff_second0001",
      work_id: grant.work_id,
      action: grant.action,
      resource: grant.resource,
    });
    expect(second).toEqual({ ok: false, reason: "consumed" });
  });

  it("does not consume against a mismatched resource or action (F14)", async () => {
    const { engine, human } = setup();
    const grant = await approvedGrant(engine, human);
    const wrong = engine.consumeGrant({
      grant_id: grant.grant_id,
      effect_id: "eff_abc123def",
      work_id: grant.work_id,
      action: grant.action,
      resource: "/etc/passwd",
    });
    expect(wrong).toEqual({ ok: false, reason: "resource_mismatch" });
  });
});
