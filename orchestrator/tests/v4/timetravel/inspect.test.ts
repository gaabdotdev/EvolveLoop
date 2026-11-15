import { afterEach, describe, expect, it } from "vitest";
import { TIMETRAVEL_ERROR, TimeTravelError } from "../../../src/v4/timetravel/index.js";
import { cleanupRoots, openWorld, seedRunnableWork } from "./helpers.js";

afterEach(() => cleanupRoots());

describe("M05 time-travel inspect (ADR-V4-0007)", () => {
  it("reads the M02 log and checkpoint without appending", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const headBefore = await world.m02.ledger.head(seeded.work_id);
    const eventsBefore = await world.m02.ledger.read(seeded.work_id);

    const view = await world.tt.inspect({
      work_id: seeded.work_id,
      checkpoint_id: seeded.checkpoint_id,
    });

    expect(view.mutated_log).toBe(false);
    expect(view.order_key).toBe("seq");
    expect(view.work_id).toBe(seeded.work_id);
    expect(view.checkpoint?.checkpoint_id).toBe(seeded.checkpoint_id);
    expect(view.at_seq).toBe(view.checkpoint?.event_seq);
    expect(view.timeline.map((e) => e.seq)).toEqual(view.events.map((e) => e.seq));
    expect(view.events.some((e) => e.type === "work.created")).toBe(true);
    expect(view.referenced_artifacts.some((a) => a.sha256 === seeded.artifact_sha)).toBe(true);
    expect(view.referenced_artifacts.find((a) => a.sha256 === seeded.artifact_sha)?.verify).toBe("VERIFIED");

    const headAfter = await world.m02.ledger.head(seeded.work_id);
    const eventsAfter = await world.m02.ledger.read(seeded.work_id);
    expect(headAfter).toBe(headBefore);
    expect(eventsAfter.map((e) => e.event_id)).toEqual(eventsBefore.map((e) => e.event_id));
  });

  it("inspect at_seq does not include later events", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const view = await world.tt.inspect({ work_id: seeded.work_id, at_seq: 1 });
    expect(view.at_seq).toBe(1);
    expect(view.events).toHaveLength(1);
    expect(view.events[0]?.type).toBe("work.created");
    expect(view.events.every((e) => e.seq <= 1)).toBe(true);
    expect(view.head_seq).toBeGreaterThan(1);
  });

  it("refuses inspect beyond the log head", async () => {
    const world = openWorld();
    const seeded = await seedRunnableWork(world);
    const head = await world.m02.ledger.head(seeded.work_id);
    await expect(world.tt.inspect({ work_id: seeded.work_id, at_seq: head + 5 })).rejects.toMatchObject({
      code: TIMETRAVEL_ERROR.INVALID,
    });
  });

  it("refuses a checkpoint from another work", async () => {
    const world = openWorld();
    const a = await seedRunnableWork(world);
    const b = await seedRunnableWork(world);
    await expect(
      world.tt.inspect({ work_id: a.work_id, checkpoint_id: b.checkpoint_id }),
    ).rejects.toBeInstanceOf(TimeTravelError);
  });
});
