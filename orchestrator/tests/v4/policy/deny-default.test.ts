import { describe, expect, it } from "vitest";
import { assertConforms, validatePolicyDecision } from "../../../src/v4/contracts/index.js";
import { DenyByDefaultPolicyEngine, InMemoryWorkContext } from "../../../src/v4/policy/engine.js";
import { PolicyStore } from "../../../src/v4/policy/store.js";
import { readDecidedBy } from "../../../src/v4/policy/types.js";
import { allowRule, basePolicy, FakeClock, request, workCtx } from "./fixtures.js";

function engine(policy = basePolicy(), ctx = workCtx()) {
  const store = new PolicyStore();
  store.put(policy);
  const contexts = new InMemoryWorkContext();
  contexts.set(ctx);
  return new DenyByDefaultPolicyEngine({ store, policy_id: policy.policy_id, contexts, clock: new FakeClock() });
}

describe("M10 deny-by-default PolicyDecisionPort", () => {
  it("denies when no rule matches", async () => {
    const pdp = engine(basePolicy(), workCtx({ autonomy: "L2_SUPERVISED" }));
    const d = await pdp.decide(request({ action: "deploy.publish", resource: "prod" }));
    expect(d.decision).toBe("DENY");
    expect(d.reason).toBe("deny_by_default_no_match");
    expect(d.matched_rule_ids).toEqual([]);
    expect(validatePolicyDecision(d).valid).toBe(true);
    expect(assertConforms(d).valid).toBe(true);
  });

  it("denies when no active policy is loaded", async () => {
    const store = new PolicyStore();
    const pdp = new DenyByDefaultPolicyEngine({
      store,
      policy_id: "pol_default0001",
      contexts: new InMemoryWorkContext(),
      clock: new FakeClock(),
    });
    const d = await pdp.decide(request());
    expect(d.decision).toBe("DENY");
    expect(d.reason).toBe("no_active_policy");
  });

  it("allows an exact least-privilege rule and records versioned audit fields", async () => {
    const pdp = engine(
      basePolicy({
        rules: [allowRule({ resources: ["/workspace/src/*"] })],
        autonomy_ceiling: "L1_EXECUTE",
      }),
    );
    const d = await pdp.decide(request());
    expect(d.decision).toBe("ALLOW");
    expect(d.matched_rule_ids).toEqual(["rule_read_ws"]);
    expect(d.policy_ref).toEqual({ policy_id: "pol_default0001", version: 1, epoch: 0 });
    expect(d.decided_at).toBe("2026-11-15T12:00:00.000Z");
    expect(readDecidedBy(d)).toEqual({ kind: "POLICY_ENGINE", id: "policy-engine-v4" });
    expect(validatePolicyDecision(d).valid).toBe(true);
  });

  it("combineRuleEffects prefers DENY over ALLOW on the same request", async () => {
    const pdp = engine(
      basePolicy({
        rules: [
          allowRule({ resources: ["/workspace/src/*"] }),
          {
            rule_id: "rule_deny_all_read",
            effect: "DENY",
            subjects: ["executor_worker01"],
            actions: ["filesystem.read"],
            resources: ["/workspace/src/*"],
          },
        ],
      }),
    );
    const d = await pdp.decide(request());
    expect(d.decision).toBe("DENY");
  });

  it("invalidates cached ALLOW after policy epoch bump", async () => {
    const store = new PolicyStore();
    store.put(basePolicy({ rules: [allowRule({ resources: ["/workspace/src/*"] })], autonomy_ceiling: "L1_EXECUTE" }));
    const contexts = new InMemoryWorkContext();
    contexts.set(workCtx());
    const clock = new FakeClock();
    const pdp = new DenyByDefaultPolicyEngine({ store, policy_id: "pol_default0001", contexts, clock });
    const first = await pdp.decide(request());
    expect(first.decision).toBe("ALLOW");
    store.revise("pol_default0001", (c) => ({ ...c, rules: [] }));
    const second = await pdp.decide(request());
    expect(second.decision).toBe("DENY");
    expect(second.policy_ref.epoch).toBeGreaterThan(first.policy_ref.epoch);
    expect(pdp.isStillValid(first)).toBe(false);
  });

  it("rejects structurally invalid work_id at the trust boundary", async () => {
    const pdp = engine();
    await expect(pdp.decide(request({ work_id: "work_../etc" }))).rejects.toThrow(/invalid work_id/);
  });
});
