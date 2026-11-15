import { afterEach, describe, expect, it } from "vitest";
import { decideRetry } from "../../../src/v4/contracts/index.js";
import { EFFECT_ERROR } from "../../../src/v4/effects/index.js";
import {
  FORK_INHERITS,
  HASH_CHAIN_IS_NON_REPUDIATION,
  TIMETRAVEL_ERROR,
} from "../../../src/v4/timetravel/index.js";
import { cleanupRoots, openWorld, seedRunnableWork, WORKER_ID } from "./helpers.js";

afterEach(() => cleanupRoots());

describe("M05 fork (ADR-V4-0007 / D08)", () => {
  it("creates a new work_id and does not mutate the base log", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const baseBefore = await world.m02.ledger.read(seeded.work_id);
    const baseHead = await world.m02.ledger.head(seeded.work_id);

    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });

    expect(forked.work.work_id).not.toBe(seeded.work_id);
    expect(forked.work.owner).toBe("platform");
    expect(forked.work.forked_from).toEqual({
      work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
      event_seq: expect.any(Number),
    });
    expect(forked.work.forked_from!.event_seq).toBeGreaterThanOrEqual(1);
    expect(forked.referenced_history.copied_as_live_events).toBe(false);
    expect(forked.referenced_history.to_seq).toBe(forked.work.forked_from!.event_seq);

    const baseAfter = await world.m02.ledger.read(seeded.work_id);
    expect(await world.m02.ledger.head(seeded.work_id)).toBe(baseHead);
    expect(baseAfter.map((e) => e.event_id)).toEqual(baseBefore.map((e) => e.event_id));

    const forkEvents = await world.m02.ledger.read(forked.work.work_id);
    expect(forkEvents.some((e) => e.type === "work.created")).toBe(true);
    expect(forkEvents.some((e) => e.type === "work.forked")).toBe(true);
    expect(forkEvents.every((e) => e.work_id === forked.work.work_id)).toBe(true);
    expect(forkEvents.every((e) => e.fencing === undefined)).toBe(true);
    expect(HASH_CHAIN_IS_NON_REPUDIATION).toBe(false);
    expect(FORK_INHERITS.grants).toBe("not_inherited");
  });

  it("references artifacts by hash and does not copy grants/leases", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });

    expect(forked.authorization).toEqual({
      grants_copied: false,
      credentials_copied: false,
      leases_copied: false,
    });
    expect(forked.referenced_artifacts.some((a) => a.sha256 === seeded.artifact_sha)).toBe(true);
    expect(forked.referenced_artifacts.find((a) => a.sha256 === seeded.artifact_sha)?.verify).toBe("VERIFIED");

    const consume = world.grants.consume({
      grant_id: seeded.grant_id,
      effect_id: seeded.effect.effect_id,
      work_id: forked.work.work_id,
      action: "git.push",
      resource: "origin/main",
      current_epoch: 0,
    });
    expect(consume).toEqual({ ok: false, reason: "work_mismatch" });
    expect(world.grants.get(seeded.grant_id)?.work_id).toBe(seeded.work_id);
    expect(world.grants.get(seeded.grant_id)?.work_id).not.toBe(forked.work.work_id);
    void WORKER_ID;
  });

  it("marks base EXTERNAL effects fork_inherited so decideRetry is FORBIDDEN", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });

    expect(forked.inherited_effects.length).toBeGreaterThanOrEqual(1);
    const inherited = forked.inherited_effects[0]!;
    expect(inherited.fork_inherited).toBe(true);
    expect(inherited.effect_class).toBe("EXTERNAL");
    expect(inherited.fork_effect_id).not.toBe(seeded.effect.effect_id);
    expect(inherited.retry).toEqual({
      action: "FORBIDDEN",
      reason: "fork_inherited_external_effect_requires_new_effect_and_authorization",
    });

    const stored = await world.effects.get(inherited.fork_effect_id);
    expect(stored?.fork_inherited).toBe(true);
    expect(stored?.work_id).toBe(forked.work.work_id);
    expect(await world.effects.retryDecision(inherited.fork_effect_id)).toEqual(
      decideRetry(stored!),
    );
    expect((await world.effects.get(seeded.effect.effect_id))?.fork_inherited).toBe(false);

    await expect(world.effects.beginDispatch(inherited.fork_effect_id)).rejects.toMatchObject({
      code: EFFECT_ERROR.BLIND_RETRY_BLOCKED,
    });
  });

  it("first checkpoint of the fork is a new id that cites the base seq as origin", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });

    expect(forked.first_checkpoint).toBeDefined();
    expect(forked.first_checkpoint!.checkpoint.checkpoint_id).not.toBe(seeded.checkpoint_id);
    expect(forked.first_checkpoint!.checkpoint.work_id).toBe(forked.work.work_id);
    expect(forked.first_checkpoint!.origin).toEqual({
      work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
      event_seq: forked.forked_from.event_seq,
    });
    expect(forked.work_snapshot.tasks.length).toBeGreaterThanOrEqual(1);
    expect(forked.work_snapshot.tasks.every((t) => t.work_id === forked.work.work_id)).toBe(true);
  });

  it("compare reports distinct identities", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const forked = await world.tt.fork({
      from_work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });
    const cmp = await world.tt.compare(seeded.work_id, forked.work.work_id);
    expect(cmp.identity_distinct).toBe(true);
    expect(cmp.base_work_id).toBe(seeded.work_id);
    expect(cmp.fork_work_id).toBe(forked.work.work_id);
  });

  it("refuses to fork from a missing checkpoint", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    await expect(
      world.tt.fork({ from_work_id: seeded.work_id, checkpoint_id: "ckpt_missingxx" }),
    ).rejects.toMatchObject({ code: TIMETRAVEL_ERROR.NOT_FOUND });
  });
});
