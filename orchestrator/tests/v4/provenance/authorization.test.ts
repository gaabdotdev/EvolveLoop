import { describe, expect, it } from "vitest";
import {
  APPROVAL,
  EFF,
  GRANT,
  PDEC,
  POL,
  WORK,
  appendAll,
  createWorld,
  draft,
  seedWorkCreated,
  validEffect,
  validPolicyDecision,
} from "./helpers.js";

async function seedAuthorized(decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" = "ALLOW") {
  const world = createWorld();
  world.effects.seed(validEffect());
  world.policy.seed(validPolicyDecision({ decision }));
  await seedWorkCreated(world.ledger);
  await appendAll(world.ledger, [
    draft("evt_policydec01", "policy.decided", {
      decision_id: PDEC,
      work_id: WORK,
      action: "git.push",
      resource: "origin/main",
      decision,
      policy_ref: { policy_id: POL, version: 1, epoch: 1 },
      reason: "pdp",
    }),
    draft("evt_effplan001", "effect.planned", {
      effect_id: EFF,
      work_id: WORK,
      task_id: "task_abc123def",
      execution_id: "exec_abc123def",
      effect_class: "EXTERNAL",
      intent_action: "git.push",
      target_resource: "origin/main",
      parameters_digest: "aa".repeat(32),
      executor_id: "executor_worker01",
      authorization_policy_decision_id: PDEC,
    }),
    draft("evt_effauth001", "effect.state_changed", {
      effect_id: EFF,
      from: "PLANNED",
      to: "AUTHORIZED",
      evidence_ids: [],
      observed_result: "authorized",
      authorization_policy_decision_id: PDEC,
    }),
  ]);
  return world;
}

describe("authorizationFor", () => {
  it("returns the policy decision and its ledger event for an ALLOW", async () => {
    const world = await seedAuthorized("ALLOW");
    const refs = await world.graph.authorizationFor(EFF);
    expect(refs).toContain(PDEC);
    expect(refs).toContain("evt_policydec01");
    expect(refs).toContain(POL);
    expect(refs).toContain("evt_effauth001");
  });

  it("REQUIRE_APPROVAL needs an approval.decided APPROVED in the same chain", async () => {
    const world = await seedAuthorized("REQUIRE_APPROVAL");
    world.effects.seed(validEffect({ authorization: { policy_decision_id: PDEC, approval_id: APPROVAL } }));

    const pending = await world.graph.inspectAuthorizationFor(EFF);
    expect(pending.refs).toEqual([]);
    expect(pending.closed).toBe("approval_missing");

    await appendAll(world.ledger, [
      draft("evt_approval01", "approval.decided", {
        approval_id: APPROVAL,
        decision_id: PDEC,
        state: "APPROVED",
        decided_by: { kind: "HUMAN", id: "operator" },
        grant_id: GRANT,
      }),
    ]);

    const refs = await world.graph.authorizationFor(EFF);
    expect(refs).toContain(PDEC);
    expect(refs).toContain(APPROVAL);
    expect(refs).toContain(GRANT);
    expect(refs).toContain("evt_approval01");
  });

  it("fail-closed: DENY cannot authorize", async () => {
    const world = await seedAuthorized("DENY");
    const answer = await world.graph.inspectAuthorizationFor(EFF);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("deny_cannot_authorize");
  });

  it("fail-closed: effect authorization not present in the hash-chained log", async () => {
    const world = createWorld();
    world.effects.seed(validEffect());
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_effplan001", "effect.planned", {
        effect_id: EFF,
        work_id: WORK,
        intent_action: "git.push",
        target_resource: "origin/main",
        parameters_digest: "aa".repeat(32),
        executor_id: "executor_worker01",
        effect_class: "EXTERNAL",
        task_id: "task_abc123def",
        execution_id: "exec_abc123def",
      }),
    ]);

    const answer = await world.graph.inspectAuthorizationFor(EFF);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("decision_not_in_ledger");
    expect(answer.refs).not.toContain(PDEC);
  });

  it("fail-closed: missing effect, invalid id, missing authorization field", async () => {
    const world = createWorld();
    expect(await world.graph.inspectAuthorizationFor("eff_doesnotexist1")).toMatchObject({
      refs: [],
      closed: "missing_ref",
    });
    expect(await world.graph.inspectAuthorizationFor("nope")).toMatchObject({
      refs: [],
      closed: "invalid_id",
    });

    world.effects.seed(validEffect({ authorization: undefined, state: "PLANNED" }));
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_effplan001", "effect.planned", { effect_id: EFF, work_id: WORK }),
    ]);
    expect(await world.graph.inspectAuthorizationFor(EFF)).toMatchObject({
      refs: [],
      closed: "missing_ref",
    });
  });

  it("fail-closed: fork_inherited EXTERNAL without a fresh policy.decided after plan", async () => {
    const world = createWorld();
    world.effects.seed(validEffect({ fork_inherited: true }));
    world.policy.seed(validPolicyDecision());
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        work_id: WORK,
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
      }),
      draft("evt_effplan001", "effect.planned", {
        effect_id: EFF,
        work_id: WORK,
        authorization_policy_decision_id: PDEC,
        effect_class: "EXTERNAL",
      }),
    ]);

    const answer = await world.graph.inspectAuthorizationFor(EFF);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("decision_not_in_ledger");
  });

  it("fail-closed: policy lookup that names a different work is not authorization", async () => {
    const world = await seedAuthorized("ALLOW");
    world.policy.seed(
      validPolicyDecision({
        request: {
          ...validPolicyDecision().request,
          work_id: "work_otherstream1",
        },
      }),
    );
    const answer = await world.graph.inspectAuthorizationFor(EFF);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("uncorroborated_origin");
  });
});
