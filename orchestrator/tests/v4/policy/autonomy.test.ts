import { describe, expect, it } from "vitest";
import { applyAutonomyOverlay } from "../../../src/v4/policy/autonomy.js";
import { DenyByDefaultPolicyEngine, InMemoryWorkContext } from "../../../src/v4/policy/engine.js";
import { PolicyStore } from "../../../src/v4/policy/store.js";
import { allowRule, basePolicy, FakeClock, LATER, request, workCtx } from "./fixtures.js";

function make(opts: { ceiling: "L0_OBSERVE" | "L1_EXECUTE" | "L2_SUPERVISED" | "L3_AUTONOMOUS"; work: "L0_OBSERVE" | "L1_EXECUTE" | "L2_SUPERVISED" | "L3_AUTONOMOUS"; rules?: ReturnType<typeof allowRule>[] }) {
  const limits = opts.ceiling === "L3_AUTONOMOUS" ? { max_cost: { currency: "USD" as const, amount: 5 }, valid_until: LATER } : undefined;
  const store = new PolicyStore();
  store.put(
    basePolicy({
      autonomy_ceiling: opts.ceiling,
      rules: opts.rules ?? [
        allowRule({ resources: ["/workspace/src/*"], conditions: limits }),
        allowRule({
          rule_id: "rule_write",
          actions: ["filesystem.write"],
          resources: ["/workspace/src/*"],
          conditions: limits,
        }),
        allowRule({
          rule_id: "rule_deploy",
          actions: ["deploy.publish"],
          resources: ["prod"],
          conditions: limits,
        }),
      ],
    }),
  );
  const contexts = new InMemoryWorkContext();
  contexts.set(workCtx({ autonomy: opts.work }));
  return new DenyByDefaultPolicyEngine({ store, policy_id: "pol_default0001", contexts, clock: new FakeClock() });
}

describe("M10 L0–L3 contextual autonomy (not a global agent permission)", () => {
  it("L0 forbids write even when an ALLOW rule matches", async () => {
    const pdp = make({ ceiling: "L0_OBSERVE", work: "L0_OBSERVE" });
    const read = await pdp.decide(request());
    expect(read.decision).toBe("ALLOW");
    const write = await pdp.decide(request({ action: "filesystem.write" }));
    expect(write.decision).toBe("DENY");
    expect(write.reason).toBe("autonomy_L0_forbids_write");
  });

  it("missing work context fails closed to L0", async () => {
    const store = new PolicyStore();
    store.put(
      basePolicy({
        autonomy_ceiling: "L3_AUTONOMOUS",
        rules: [allowRule({ actions: ["filesystem.write"], resources: ["/workspace/src/*"], conditions: { max_cost: { currency: "USD", amount: 1 }, valid_until: LATER } })],
      }),
    );
    const pdp = new DenyByDefaultPolicyEngine({
      store,
      policy_id: "pol_default0001",
      contexts: new InMemoryWorkContext(),
      clock: new FakeClock(),
    });
    const d = await pdp.decide(request({ action: "filesystem.write" }));
    expect(d.decision).toBe("DENY");
    expect(d.reason).toBe("autonomy_L0_forbids_write");
  });

  it("work autonomy cannot raise the policy ceiling", async () => {
    const pdp = make({ ceiling: "L0_OBSERVE", work: "L3_AUTONOMOUS" });
    const d = await pdp.decide(request({ action: "filesystem.write" }));
    expect(d.decision).toBe("DENY");
  });

  it("L1 does not escalate: high-risk / sensitive stays DENY, not REQUIRE_APPROVAL", async () => {
    const pdp = make({ ceiling: "L1_EXECUTE", work: "L1_EXECUTE" });
    const lowWrite = await pdp.decide(request({ action: "filesystem.write", risk: "low" }));
    expect(lowWrite.decision).toBe("ALLOW");
    const deploy = await pdp.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    expect(deploy.decision).toBe("DENY");
    expect(deploy.reason).toBe("l1_no_autonomy_escalation");
  });

  it("L2 matched sensitive ALLOW becomes REQUIRE_APPROVAL; unmatched sensitive is still DENY", async () => {
    const pdp = make({ ceiling: "L2_SUPERVISED", work: "L2_SUPERVISED" });
    const deploy = await pdp.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    expect(deploy.decision).toBe("REQUIRE_APPROVAL");
    expect(deploy.reason).toBe("l2_sensitive_requires_human");
    expect(deploy.matched_rule_ids).toContain("rule_deploy");
    const unknown = await pdp.decide(request({ action: "sandbox.disable", resource: "host", risk: "critical" }));
    expect(unknown.decision).toBe("DENY");
  });

  it("L3 overlay denies ALLOW rules that lack cost/time limits (INV-POL-05 defense in depth)", () => {
    const overlay = applyAutonomyOverlay("ALLOW", {
      level: "L3_AUTONOMOUS",
      action: "filesystem.write",
      risk: "low",
      matchedAllowRules: [allowRule({ rule_id: "rule_write", actions: ["filesystem.write"], resources: ["/workspace/src/*"] })],
    });
    expect(overlay).toEqual({ effect: "DENY", reason: "l3_allow_missing_cost_or_time_limit" });
  });

  it("L3 ALLOW with explicit cost and time limits may pass", async () => {
    const pdp = make({ ceiling: "L3_AUTONOMOUS", work: "L3_AUTONOMOUS" });
    const d = await pdp.decide(request({ action: "filesystem.write" }));
    expect(d.decision).toBe("ALLOW");
  });
});
