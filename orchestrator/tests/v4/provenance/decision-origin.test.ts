import { describe, expect, it } from "vitest";
import {
  ART,
  ARTIFACT_SHA,
  PDEC,
  POL,
  WORK,
  appendAll,
  createWorld,
  draft,
  seedWorkCreated,
} from "./helpers.js";

describe("decisionOrigin", () => {
  it("returns ledger event + policy decision refs for a chained policy.decided", async () => {
    const world = createWorld();
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        work_id: WORK,
        action: "git.push",
        resource: "origin/main",
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
        reason: "matched allow",
      }),
    ]);

    const refs = await world.graph.decisionOrigin(PDEC);
    expect(refs).toContain("evt_policydec01");
    expect(refs).toContain(PDEC);
    expect(refs).toContain(POL);
    expect(refs).not.toContain("from-chat-memory");

    const byEvent = await world.graph.decisionOrigin("evt_policydec01");
    expect(byEvent).toEqual(refs);
  });

  it("follows causation_id when the cause is in the same trusted stream", async () => {
    const world = createWorld();
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        work_id: WORK,
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
      }),
      draft(
        "evt_recovery01",
        "recovery.decided",
        { outcome: "continue" },
        { causation_id: "evt_policydec01" },
      ),
    ]);

    const refs = await world.graph.decisionOrigin("evt_recovery01");
    expect(refs).toContain("evt_recovery01");
    expect(refs).toContain("evt_policydec01");
  });

  it("fail-closed: missing ref, chat memory, and fabricated ids return empty", async () => {
    const world = createWorld();
    await seedWorkCreated(world.ledger);

    expect(await world.graph.decisionOrigin("pdec_doesnotexist1")).toEqual([]);
    expect(await world.graph.inspectDecisionOrigin("pdec_doesnotexist1")).toMatchObject({
      refs: [],
      closed: "missing_ref",
    });
    expect(await world.graph.decisionOrigin("chat:last-assistant-turn")).toEqual([]);
    expect(await world.graph.inspectDecisionOrigin("chat:last-assistant-turn").then((a) => a.closed)).toBe(
      "uncorroborated_origin",
    );
    expect(await world.graph.decisionOrigin("")).toEqual([]);
    const fabricated = await world.graph.decisionOrigin("pdec_doesnotexist1");
    expect(fabricated).not.toContain("pdec_doesnotexist1");
  });

  it("fail-closed: broken hash chain yields empty, never the dangling decision id", async () => {
    const world = createWorld();
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
      }),
    ]);
    world.ledger.tamperChain(WORK);

    const answer = await world.graph.inspectDecisionOrigin(PDEC);
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("chain_broken");
  });

  it("fail-closed: payload digest mismatch is not origin", async () => {
    const world = createWorld();
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
      }),
    ]);
    world.ledger.tamperPayload(WORK);

    const answer = await world.graph.inspectDecisionOrigin("evt_workcreate1");
    expect(answer.refs).toEqual([]);
    expect(answer.closed).toBe("hash_mismatch");
  });

  it("D17: free-text skill/provider names are not refs; unpinned skill_artifact_id fails closed", async () => {
    const world = createWorld();
    await seedWorkCreated(world.ledger);
    await appendAll(world.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
        provider: "evil-skill",
        skill: "unsigned.yaml",
      }),
    ]);
    const named = await world.graph.decisionOrigin(PDEC);
    expect(named).not.toContain("evil-skill");
    expect(named).not.toContain("unsigned.yaml");

    const world2 = createWorld();
    await seedWorkCreated(world2.ledger);
    await appendAll(world2.ledger, [
      draft("evt_policydec01", "policy.decided", {
        decision_id: PDEC,
        decision: "ALLOW",
        policy_ref: { policy_id: POL, version: 1, epoch: 1 },
        skill_artifact_id: ART,
        origin_pin: { artifact_id: ART, sha256: ARTIFACT_SHA },
      }),
    ]);
    const unpinned = await world2.graph.inspectDecisionOrigin(PDEC);
    expect(unpinned.refs).toEqual([]);
    expect(unpinned.closed).toBe("unpinned_supply_chain");
  });
});
