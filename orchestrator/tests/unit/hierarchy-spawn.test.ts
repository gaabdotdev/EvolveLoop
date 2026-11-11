import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { canStartTask } from "../../src/v3/task-graph/index.js";

describe("hierarchy spawn", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "hier-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-h",
      objective: "multi domain",
      out_of_scope: ["marketing"],
      criteria: [
        {
          id: "c1",
          description: "done",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "t" }],
          evidence_required: ["e1"],
        },
      ],
    });
    const coord = new CoordinatorService(paths);
    coord.registerWork("w-h", "gc-h", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-h-master",
      role: "master",
      work_id: "w-h",
      permissions: {
        allowWrite: true,
        allowSpawn: true,
        allowHostInspect: true,
      },
    });
    agents.activate("w-h", "w-h-master");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("spawns leader+planner per domain and gates implement until PLAN_APPROVED", () => {
    const paths = resolveV3DataPaths(tmp);
    const spawned = spawnDomainHierarchy(paths, {
      work_id: "w-h",
      domains: ["backend", "frontend"],
    });
    expect(spawned.domains).toHaveLength(2);
    expect(spawned.agents.some((a) => a.role === "planner" && a.domain === "backend")).toBe(true);

    const byId = new Map(spawned.tasks.tasks.map((t) => [t.task_id, t]));
    const impl = spawned.tasks.tasks.find((t) => t.task_id === "implement-backend")!;
    expect(canStartTask(impl, byId)).toBe(false);

    const approved = approveDomainPlan(paths, "w-h", "backend", 1);
    const byId2 = new Map(approved.tasks.tasks.map((t) => [t.task_id, t]));
    const impl2 = approved.tasks.tasks.find((t) => t.task_id === "implement-backend")!;
    expect(approved.plan_task.plan_approved).toBe(true);
    expect(canStartTask(impl2, byId2)).toBe(true);
  });
});
