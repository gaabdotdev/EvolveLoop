import { afterEach, describe, expect, it } from "vitest";
import { cleanupRoots, EXECUTOR, HUMAN, openWorld, seedAcceptedWork, stubProfiles } from "./helpers.js";

afterEach(() => cleanupRoots());

describe("M07 dynamic replan", () => {
  it("replans a FAILED task, preserves VERIFIED work, and appends without mutating history", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const initial = await world.planning.plan(work_id, HUMAN);
    expect(initial.status).toBe("OK");
    if (initial.status !== "OK") return;

    const impl = initial.tasks.find((t) => t.task_kind === "IMPLEMENT");
    expect(impl).toBeTruthy();
    if (!impl) return;

    const running = await world.engine.changeTaskState(work_id, HUMAN, { task_id: impl.task_id, to: "RUNNING" });
    expect(running.status).toBe("OK");
    const succeeded = await world.engine.changeTaskState(work_id, HUMAN, {
      task_id: impl.task_id,
      to: "SUCCEEDED_UNVERIFIED",
    });
    expect(succeeded.status).toBe("OK");
    const verified = await world.engine.changeTaskState(work_id, HUMAN, {
      task_id: impl.task_id,
      to: "VERIFIED",
      evidence_ids: ["evd_m07proof01"],
    });
    expect(verified.status).toBe("OK");
    if (verified.status === "OK") {
      expect(verified.task.progress_status).toBe("CONFIRMED");
    }

    const otherImpl = initial.tasks.find((t) => t.task_kind === "IMPLEMENT" && t.task_id !== impl.task_id);
    expect(otherImpl).toBeTruthy();
    if (!otherImpl) return;
    await world.engine.changeTaskState(work_id, HUMAN, { task_id: otherImpl.task_id, to: "RUNNING" });
    const failed = await world.engine.changeTaskState(work_id, HUMAN, { task_id: otherImpl.task_id, to: "FAILED" });
    expect(failed.status).toBe("OK");

    const before = await world.m02.ledger.read(work_id);
    const first = before[0]!;
    const firstDigest = first.event_digest;
    const headBefore = before.length;

    const replanned = await world.planning.replan(work_id, HUMAN, {
      kind: "DEPENDENCY_FAILED",
      justification: "IMPLEMENT failed; replace pending work, keep confirmed progress",
      failed_task_ids: [otherImpl.task_id],
      reported_by: EXECUTOR,
      evidence_ids: ["evd_executorclaim"],
    });
    expect(replanned.status).toBe("OK");
    if (replanned.status !== "OK") return;

    expect(replanned.history_mutated).toBe(false);
    expect(replanned.proposal.preserve_task_ids).toContain(impl.task_id);
    expect(replanned.proposal.obsolete_task_ids).toContain(otherImpl.task_id);
    expect(replanned.proposal.evidence_from_executor).toBe(true);
    expect(replanned.plan_revised_event.payload.trigger).toBe("DEPENDENCY_FAILED");
    expect(replanned.plan_revised_event.payload.justification).toContain("keep confirmed");

    const afterTasks = await world.engine.listTasks(work_id);
    const preserved = afterTasks.find((t) => t.task_id === impl.task_id);
    expect(preserved?.state).toBe("VERIFIED");
    expect(preserved?.progress_status).toBe("CONFIRMED");
    const obsolete = afterTasks.find((t) => t.task_id === otherImpl.task_id);
    expect(obsolete?.state).toBe("OBSOLETE");
    const replacements = afterTasks.filter((t) => t.state !== "OBSOLETE" && t.task_id !== impl.task_id);
    expect(replacements.some((t) => t.task_kind === "IMPLEMENT")).toBe(true);

    const after = await world.m02.ledger.read(work_id);
    expect(after[0]!.event_id).toBe(first.event_id);
    expect(after[0]!.event_digest).toBe(firstDigest);
    expect(after.length).toBeGreaterThan(headBefore);
    expect(after.filter((e) => e.type === "plan.revised")).toHaveLength(2);
  });

  it("records a no-structure NEW_EVIDENCE replan with remaining cost unknown (not invented)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const initial = await world.planning.plan(work_id, HUMAN);
    expect(initial.status).toBe("OK");
    if (initial.status !== "OK") return;

    const liveIds = new Set(initial.tasks.map((t) => t.task_id));
    const replanned = await world.planning.replan(work_id, HUMAN, {
      kind: "NEW_EVIDENCE",
      justification: "New evidence observed; graph still valid",
      evidence_ids: ["evd_newsource1"],
    });
    expect(replanned.status).toBe("OK");
    if (replanned.status !== "OK") return;
    expect(replanned.proposal.obsolete_task_ids).toEqual([]);
    expect(replanned.proposal.proposed_tasks).toEqual([]);
    expect(replanned.plan_revised_event.payload.remaining_cost).toMatchObject({
      amount: null,
      remaining_unknown: true,
    });
    const still = await world.engine.listTasks(work_id);
    expect(new Set(still.map((t) => t.task_id))).toEqual(liveIds);
  });

  it("may request capability profiles but does not rank executors", async () => {
    const calls: { executor_id: string }[] = [];
    const world = openWorld({ profiles: stubProfiles(calls) });
    const { work_id } = await seedAcceptedWork(world);
    const planned = await world.planning.plan(work_id, HUMAN, {
      inspect_executor_ids: ["executor_alpha01", "executor_beta0001"],
    });
    expect(planned.status).toBe("OK");
    if (planned.status !== "OK") return;
    expect(calls.map((c) => c.executor_id).sort()).toEqual(["executor_alpha01", "executor_beta0001"].sort());
    expect(planned.proposal.profiles_requested).toBe(true);
    expect(planned.proposal.profiles_used_for_routing).toBe(false);
    expect(planned.proposal.ranked_executor_ids).toEqual([]);
    expect(planned.plan_revised_event.payload.profiles_used_for_routing).toBe(false);
  });

  it("suggests a RESEARCH unblock task without restarting a healthy BLOCKED task", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const initial = await world.planning.plan(work_id, HUMAN);
    expect(initial.status).toBe("OK");
    if (initial.status !== "OK") return;
    const ready = initial.tasks.find((t) => t.state === "READY");
    expect(ready).toBeTruthy();
    if (!ready) return;
    await world.engine.changeTaskState(work_id, HUMAN, { task_id: ready.task_id, to: "RUNNING" });
    await world.engine.changeTaskState(work_id, HUMAN, { task_id: ready.task_id, to: "BLOCKED" });

    const replanned = await world.planning.replan(work_id, HUMAN, {
      kind: "TASK_BLOCKED",
      justification: "Blocked on external dependency; investigate without restarting",
    });
    expect(replanned.status).toBe("OK");
    if (replanned.status !== "OK") return;
    expect(replanned.proposal.preserve_task_ids).toContain(ready.task_id);
    expect(replanned.proposal.proposed_tasks.some((t) => t.task_kind === "RESEARCH")).toBe(true);
    const blocked = (await world.engine.listTasks(work_id)).find((t) => t.task_id === ready.task_id);
    expect(blocked?.state).toBe("BLOCKED");
  });
});
