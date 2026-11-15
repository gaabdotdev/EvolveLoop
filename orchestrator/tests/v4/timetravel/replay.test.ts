import { afterEach, describe, expect, it } from "vitest";
import { decideRetry } from "../../../src/v4/contracts/index.js";
import { allocateId } from "../../../src/v4/goal/index.js";
import {
  EXACTLY_ONCE_CLAIMED,
  REPLAY_DETERMINISM_CLAIM,
  REPLAY_IS_ABSOLUTE_DETERMINISM,
  TIMETRAVEL_ERROR,
} from "../../../src/v4/timetravel/index.js";
import { cleanupRoots, openWorld, seedRunnableWork } from "./helpers.js";

afterEach(() => cleanupRoots());

describe("M05 replay (ADR-V4-0007, constitution §14)", () => {
  it("RECORDED reuses captured I/O and never auto-reapplies EXTERNAL effects", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });
    const inheritedId = forked.inherited_effects[0]!.fork_effect_id;
    const baseHead = await world.m02.ledger.head(seeded.work_id);
    const inheritedBefore = await world.effects.get(inheritedId);

    const result = await world.tt.replay({
      work_id: forked.work.work_id,
      mode: "RECORDED",
      effect_id: inheritedId,
    });

    expect(result.mode).toBe("RECORDED");
    expect(result.auto_reapplied_external).toBe(false);
    expect(result.determinism_claim).toBe("none");
    expect(result.determinism_claim).toBe(REPLAY_DETERMINISM_CLAIM);
    expect(REPLAY_IS_ABSOLUTE_DETERMINISM).toBe(false);
    expect(EXACTLY_ONCE_CLAIMED).toBe(false);
    expect(result.new_effect).toBeUndefined();
    expect(result.captured.effect_id).toBe(inheritedId);
    expect(result.captured.effect_class).toBe("EXTERNAL");
    expect(result.captured.state).toBe(inheritedBefore?.state);

    const inheritedAfter = await world.effects.get(inheritedId);
    expect(inheritedAfter?.state).toBe(inheritedBefore?.state);
    expect(await world.effects.retryDecision(inheritedId)).toEqual({
      action: "FORBIDDEN",
      reason: "fork_inherited_external_effect_requires_new_effect_and_authorization",
    });
    expect(await world.m02.ledger.head(seeded.work_id)).toBe(baseHead);

    const forkEvents = await world.m02.ledger.read(forked.work.work_id);
    expect(forkEvents.some((e) => e.type === "replay.started" && e.event_id === result.replay_event_id)).toBe(true);
    const started = forkEvents.find((e) => e.event_id === result.replay_event_id);
    expect(started?.payload.auto_reapplied_external).toBe(false);
    expect(started?.payload.determinism_claim).toBe("none");
    expect(started?.payload.mode).toBe("RECORDED");
  });

  it("REEXECUTE of EXTERNAL creates a new EffectRecord with fresh authorization and does not dispatch", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });
    const inheritedId = forked.inherited_effects[0]!.fork_effect_id;
    const freshDecision = allocateId("policy_decision");

    const result = await world.tt.replay({
      work_id: forked.work.work_id,
      mode: "REEXECUTE",
      effect_id: inheritedId,
      authorization: { policy_decision_id: freshDecision },
    });

    expect(result.mode).toBe("REEXECUTE");
    expect(result.auto_reapplied_external).toBe(false);
    expect(result.determinism_claim).toBe("none");
    expect(result.new_effect).toBeDefined();
    expect(result.new_effect!.effect_id).not.toBe(inheritedId);
    expect(result.new_effect!.effect_id).not.toBe(seeded.effect.effect_id);
    expect(result.new_effect!.fork_inherited).toBe(false);
    expect(result.new_effect!.state).toBe("AUTHORIZED");
    expect(result.new_effect!.authorization?.policy_decision_id).toBe(freshDecision);
    expect(result.new_effect!.authorization?.policy_decision_id).not.toBe(
      (await world.effects.get(inheritedId))?.authorization?.policy_decision_id,
    );
    expect(decideRetry(result.new_effect!).action).toBe("DISPATCH_ALLOWED");

    // Replay itself did not send the side effect.
    expect(result.new_effect!.state).not.toBe("DISPATCHED");
    expect(result.new_effect!.state).not.toBe("COMMITTED");

    const inherited = await world.effects.get(inheritedId);
    expect(inherited?.fork_inherited).toBe(true);
    expect(await world.effects.retryDecision(inheritedId)).toMatchObject({ action: "FORBIDDEN" });
  });

  it("REEXECUTE of inherited EXTERNAL without new authorization is rejected", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });
    await expect(
      world.tt.replay({
        work_id: forked.work.work_id,
        mode: "REEXECUTE",
        effect_id: forked.inherited_effects[0]!.fork_effect_id,
      }),
    ).rejects.toMatchObject({ code: TIMETRAVEL_ERROR.AUTHORIZATION_REQUIRED });
  });

  it("REEXECUTE refuses to reuse the inherited policy_decision_id", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });
    const inherited = await world.effects.get(forked.inherited_effects[0]!.fork_effect_id);
    await expect(
      world.tt.replay({
        work_id: forked.work.work_id,
        mode: "REEXECUTE",
        effect_id: inherited!.effect_id,
        authorization: inherited!.authorization,
      }),
    ).rejects.toMatchObject({ code: TIMETRAVEL_ERROR.AUTHORIZATION_REQUIRED });
  });

  it("REEXECUTE INTERNAL without a callback reports NEED_EXECUTOR and does not invent determinism", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const internal = await world.effects.plan({
      kind: "EffectRecord",
      schema_version: "1.0.0",
      tenant_id: "local",
      effect_id: allocateId("effect"),
      work_id: seeded.work_id,
      task_id: seeded.task_id,
      execution_id: allocateId("execution"),
      executor_ref: { executor_id: "executor_worker01", executor_version: "1.0.0" },
      effect_class: "INTERNAL",
      intent: {
        action: "workspace.fold",
        target_resource: "/workspace",
        parameters_digest: seeded.artifact_sha,
        description: "rebuild projection",
      },
      integration: {
        integration_id: "workspace",
        capabilities: { supports_idempotency_key: false, supports_status_query: false, supports_compensation: false },
      },
      fork_inherited: false,
    });

    const result = await world.tt.replay({
      work_id: seeded.work_id,
      mode: "REEXECUTE",
      effect_id: internal.effect_id,
    });
    expect(result.internal_reexecution).toEqual({ status: "NEED_EXECUTOR" });
    expect(result.auto_reapplied_external).toBe(false);
    expect(result.determinism_claim).toBe("none");
    expect(result.new_effect).toBeUndefined();
  });
});
