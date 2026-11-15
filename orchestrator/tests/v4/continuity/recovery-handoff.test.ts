import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { validEffect } from "../contracts/fixtures.js";
import {
  CONTINUITY_ERROR,
  FileReplayStore,
  handoffAccept,
  recoverAtVerifiedCheckpoint,
} from "../../../src/v4/continuity/index.js";
import { EFFECT, NOW, POLICY_ID, TASK, WORK, emptyTombs, seededWorld, stubEffects } from "./helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M04 recovery / handoff", () => {
  it("resumes from a VERIFIED checkpoint without inventing CONFIRMED state", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const dispatched = validEffect({ state: "DISPATCHED", work_id: WORK, task_id: TASK, effect_id: EFFECT });
    const effects = stubEffects([dispatched]);
    const recovery = await recoverAtVerifiedCheckpoint({
      work_id: WORK,
      ledger: world.rt.ledger,
      checkpoints: world.rt.checkpoints,
      effects,
      tombstones: emptyTombs(),
    });

    expect(recovery.checkpoint.consistency).toBe("VERIFIED");
    expect(recovery.checkpoint.context_hint).toBeUndefined();
    expect(recovery.recovered_without_context_hint).toBe(true);
    expect(recovery.recovered_without_invented_confirmed_state).toBe(true);
    expect(recovery.confirmed_task_ids).toEqual([]);
    expect(recovery.projection.task_states).toEqual([{ task_id: TASK, state: "RUNNING" }]);
    expect(recovery.open_effects.map((e) => e.effect_id)).toEqual([EFFECT]);
    expect(recovery.open_effects.every((e) => e.state !== "COMMITTED")).toBe(true);
    expect(recovery.retry_decisions[0]?.decision.action).toBe("RECONCILE_FIRST");
  });

  it("tombstones hide consumed grants and terminal effects (D19)", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const dispatched = validEffect({ state: "DISPATCHED", work_id: WORK, effect_id: EFFECT });
    const recovery = await recoverAtVerifiedCheckpoint({
      work_id: WORK,
      ledger: world.rt.ledger,
      checkpoints: world.rt.checkpoints,
      effects: stubEffects([dispatched]),
      tombstones: {
        consumedGrants: async () => ["grn" + "aa".repeat(12)],
        terminalEffects: async () => [{ effect_id: EFFECT, state: "COMMITTED" }],
      },
    });
    expect(recovery.consumed_grants).toEqual(["grn" + "aa".repeat(12)]);
    expect(recovery.open_effects).toEqual([]);
    expect(recovery.terminal_effects).toEqual([{ effect_id: EFFECT, state: "COMMITTED" }]);
  });

  it("handoff accept returns allowlisted executor context and ledger-bound work", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    const result = await handoffAccept({
      capsule: sealed,
      now: NOW,
      policy_id: POLICY_ID,
      service: world.service,
      ledger: world.rt.ledger,
      checkpoints: world.rt.checkpoints,
      effects: world.effects,
      tombstones: emptyTombs(),
    });
    expect(result.acceptance.work_state_source).toBe("EVENT_LEDGER");
    expect(result.bound_work.source).toBe("EVENT_LEDGER");
    expect(result.bound_work.tasks).toEqual([{ task_id: TASK, state: "RUNNING" }]);
    expect("permissions" in result.executor_context).toBe(false);
    expect("next_action" in result.executor_context).toBe(false);
    expect(result.recovery.checkpoint.checkpoint_id).toBe(world.checkpoint.checkpoint_id);
  });

  it("handoff to a named executor below C2 fails closed", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    await expect(
      handoffAccept({
        capsule: sealed,
        now: NOW,
        policy_id: POLICY_ID,
        service: world.service,
        ledger: world.rt.ledger,
        checkpoints: world.rt.checkpoints,
        effects: world.effects,
        for_executor: "executor_worker01",
        conformance: { levelOf: async () => "C1_TASK" },
      }),
    ).rejects.toMatchObject({ code: CONTINUITY_ERROR.CONFORMANCE });
  });

  it("FileReplayStore persists single-use tokens under work_id paths only", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const store = new FileReplayStore(world.root);
    const rec = await store.consume({ capsule_id: "capsule_abc123def", work_id: WORK, now: NOW });
    expect(rec.replay_id).toBe("capsule_abc123def");
    expect(await store.peek("capsule_abc123def")).toEqual(rec);
    await expect(store.consume({ capsule_id: "capsule_abc123def", work_id: WORK, now: NOW })).rejects.toMatchObject({
      code: CONTINUITY_ERROR.REPLAY_REUSED,
    });
  });
});
