import { afterEach, describe, expect, it } from "vitest";
import {
  PLAN_IS_PROPOSAL_UNTIL_ACCEPTED,
  PLANNER_MAY_SET_VERIFIED,
  ROUTING_BY_CAPABILITY_SCORE,
  allowlistM07Payload,
} from "../../../src/v4/planning/index.js";
import { cleanupRoots, HUMAN, intent, openWorld, seedAcceptedWork } from "./helpers.js";

afterEach(() => cleanupRoots());

describe("M07 initial plan", () => {
  it("pins honesty: proposals until M01 accept, no score routing, no VERIFIED", () => {
    expect(PLAN_IS_PROPOSAL_UNTIL_ACCEPTED).toBe(true);
    expect(ROUTING_BY_CAPABILITY_SCORE).toBe(false);
    expect(PLANNER_MAY_SET_VERIFIED).toBe(false);
  });

  it("proposes an acyclic graph from an ACCEPTED Goal Contract without writing Work", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);

    const proposed = await world.planning.propose(work_id, HUMAN);
    expect(proposed.status).toBe("OK");
    if (proposed.status !== "OK") return;

    expect(proposed.proposed_tasks.length).toBeGreaterThanOrEqual(4);
    expect(proposed.proposed_tasks.every((t) => t.task_kind === "IMPLEMENT" || t.task_kind === "VERIFY")).toBe(true);
    expect(proposed.analysis.critical_path_task_ids.length).toBeGreaterThanOrEqual(2);
    expect(proposed.analysis.independent_task_ids.length).toBeGreaterThanOrEqual(2);
    expect(proposed.autonomy_requested).toBe(false);
    expect(proposed.profiles_used_for_routing).toBe(false);
    expect(proposed.ranked_executor_ids).toEqual([]);

    const before = await world.engine.listTasks(work_id);
    expect(before).toHaveLength(0);
    expect(PLAN_IS_PROPOSAL_UNTIL_ACCEPTED).toBe(true);
  });

  it("accepts a proposal via M01 planTasks and appends plan.revised on the M02 ledger", async () => {
    const world = openWorld();
    const { work_id } = await seedAcceptedWork(world);

    const accepted = await world.planning.plan(work_id, HUMAN);
    expect(accepted.status).toBe("OK");
    if (accepted.status !== "OK") return;

    expect(accepted.history_mutated).toBe(false);
    expect(accepted.plan_revised_event.type).toBe("plan.revised");
    expect(accepted.plan_revised_event.payload.justification).toBeTruthy();
    expect(accepted.plan_revised_event.payload.autonomy_requested).toBe(false);
    expect(accepted.plan_revised_event.payload.profiles_used_for_routing).toBe(false);
    expect(accepted.plan_revised_event.payload.remaining_cost).toMatchObject({
      provenance: "UNAVAILABLE",
      amount: null,
      remaining_unknown: true,
    });

    const tasks = await world.engine.listTasks(work_id);
    expect(tasks.length).toBe(accepted.proposal.proposed_tasks.length);
    expect(tasks.every((t) => t.state === "READY" || t.state === "PENDING")).toBe(true);
    expect(tasks.every((t) => t.progress_status !== "CONFIRMED")).toBe(true);
    expect(tasks.every((t) => t.state !== "VERIFIED")).toBe(true);

    const work = await world.engine.getWork(work_id);
    expect(work?.state).toBe("READY");

    const log = await world.m02.ledger.read(work_id);
    expect(log.some((e) => e.type === "plan.revised")).toBe(true);
    expect(log.filter((e) => e.type === "task.planned").length).toBe(tasks.length);
  });

  it("refuses to plan before the Goal Contract is ACCEPTED", async () => {
    const world = openWorld();
    const ingested = await world.engine.ingest(intent());
    expect(ingested.status).toBe("OK");
    if (ingested.status !== "OK") return;
    const refused = await world.planning.propose(ingested.work.work_id, HUMAN);
    expect(refused.status).toBe("REJECTED");
    if (refused.status === "REJECTED") expect(refused.code).toBe("INV-GC-03");
  });

  it("allowlists plan.revised and drops F12 / score field names (R2)", () => {
    const clean = allowlistM07Payload("plan.revised", {
      plan_version: 1,
      justification: "traceable",
      next_action: "escalate autonomy",
      objective: "secret control",
      permissions: ["*"],
      ranked_executor_ids: ["executor_best"],
      autonomy: "L3_AUTONOMOUS",
    });
    expect(clean).toEqual({ plan_version: 1, justification: "traceable" });
    expect(clean.next_action).toBeUndefined();
    expect(clean.autonomy).toBeUndefined();
  });
});
