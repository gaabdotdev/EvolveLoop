import { afterEach, describe, expect, it } from "vitest";
import { PLANNING_ERROR } from "../../../src/v4/planning/index.js";
import { cleanupRoots, EXECUTOR, HUMAN, intent, openWorld, seedAcceptedWork } from "./helpers.js";

afterEach(() => cleanupRoots());

describe("M07 invariant refusals", () => {
  it("refuses executor-authored plans (D15)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const refused = await world.planning.propose(work_id, EXECUTOR);
    expect(refused.status).toBe("REJECTED");
    if (refused.status === "REJECTED") expect(refused.code).toBe(PLANNING_ERROR.EXECUTOR_CANNOT_PLAN);
  });

  it("refuses plans that request autonomy (D06)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const refused = await world.planning.propose(work_id, HUMAN, { requested_autonomy: "L3_AUTONOMOUS" });
    expect(refused.status).toBe("REJECTED");
    if (refused.status === "REJECTED") expect(refused.code).toBe(PLANNING_ERROR.AUTONOMY_FORBIDDEN);
  });

  it("refuses capability-score ranking inputs (ADR-V4-0010)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const ranked = await world.planning.propose(work_id, HUMAN, { ranked_executor_ids: ["executor_best01"] });
    expect(ranked.status).toBe("REJECTED");
    if (ranked.status === "REJECTED") expect(ranked.code).toBe(PLANNING_ERROR.SCORE_ROUTING_FORBIDDEN);

    const prefer = await world.planning.propose(work_id, HUMAN, { prefer_executor_id: "executor_best01" });
    expect(prefer.status).toBe("REJECTED");
    if (prefer.status === "REJECTED") expect(prefer.code).toBe(PLANNING_ERROR.SCORE_ROUTING_FORBIDDEN);
  });

  it("refuses cyclic proposed graphs (INV-TASK-05)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const cyclic = await world.planning.propose(work_id, HUMAN, {
      tasks: [
        {
          task_id: "task_cycleAAAA",
          title: "A",
          task_kind: "IMPLEMENT",
          expected_result: "a",
          depends_on: ["task_cycleBBBB"],
        },
        {
          task_id: "task_cycleBBBB",
          title: "B",
          task_kind: "IMPLEMENT",
          expected_result: "b",
          depends_on: ["task_cycleAAAA"],
        },
      ],
    });
    expect(cyclic.status).toBe("REJECTED");
    if (cyclic.status === "REJECTED") expect(cyclic.code).toBe("INV-TASK-05");
    expect(await world.engine.listTasks(work_id)).toHaveLength(0);
  });

  it("refuses self-dependency (INV-TASK-01)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const self = await world.planning.propose(work_id, HUMAN, {
      tasks: [
        {
          task_id: "task_selfAAAAAA",
          title: "Self",
          task_kind: "IMPLEMENT",
          expected_result: "loop",
          depends_on: ["task_selfAAAAAA"],
        },
      ],
    });
    expect(self.status).toBe("REJECTED");
    if (self.status === "REJECTED") expect(self.code).toBe("INV-TASK-01");
  });

  it("refuses dependencies that are not in the same work (INV-TASK-02)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const missing = await world.planning.propose(work_id, HUMAN, {
      tasks: [
        {
          title: "Orphan dep",
          task_kind: "IMPLEMENT",
          expected_result: "nope",
          depends_on: ["task_missing0001"],
        },
      ],
    });
    expect(missing.status).toBe("REJECTED");
    if (missing.status === "REJECTED") expect(missing.code).toBe("INV-TASK-02");
  });

  it("does not offer a planner path to VERIFIED or CONFIRMED (INV-TASK-03/04)", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);
    const planned = await world.planning.plan(work_id, HUMAN);
    expect(planned.status).toBe("OK");
    if (planned.status !== "OK") return;
    expect(planned.tasks.every((t) => t.state !== "VERIFIED")).toBe(true);
    expect(planned.tasks.every((t) => t.progress_status !== "CONFIRMED")).toBe(true);

    const task = planned.tasks.find((t) => t.state === "READY") ?? planned.tasks[0]!;
    const running = await world.engine.changeTaskState(work_id, EXECUTOR, { task_id: task.task_id, to: "RUNNING" });
    expect(running.status).toBe("OK");
    const claimed = await world.engine.changeTaskState(work_id, EXECUTOR, {
      task_id: task.task_id,
      to: "SUCCEEDED_UNVERIFIED",
    });
    expect(claimed.status).toBe("OK");
    if (claimed.status === "OK") expect(claimed.task.progress_status).toBe("UNVERIFIED");
    const byExecutor = await world.engine.changeTaskState(work_id, EXECUTOR, {
      task_id: task.task_id,
      to: "VERIFIED",
      progress_status: "CONFIRMED",
      evidence_ids: ["evd_fakeclaim1"],
    });
    expect(byExecutor.status).toBe("REJECTED");
    if (byExecutor.status === "REJECTED") expect(byExecutor.code).toBe("INV-TASK-03");
  });

  it("refuses planning a missing work", async () => {
    const world = openWorld();
    const refused = await world.planning.propose("work_doesnotexist01", HUMAN);
    expect(refused.status).toBe("REJECTED");
    if (refused.status === "REJECTED") expect(refused.code).toBe("STRUCT");
  });

  it("does not copy untrusted budget remaining as a fabricated number", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(
      world,
      intent({
        budget: { currency: "USD", max_amount: 100 },
      }),
    );
    const planned = await world.planning.plan(work_id, HUMAN);
    expect(planned.status).toBe("OK");
    if (planned.status !== "OK") return;
    expect(planned.proposal.analysis.remaining_cost).toEqual({
      provenance: "DERIVED",
      amount: null,
      currency: "USD",
      budget_max: 100,
      remaining_unknown: true,
    });
  });
});
