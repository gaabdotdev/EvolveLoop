import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";

describe("ContinuityEngine handoff", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cont-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-c",
      objective: "continuity",
      criteria: [
        {
          id: "c1",
          description: "ok",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "t" }],
          evidence_required: ["e1"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-c", "gc-c", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-c-master",
      role: "master",
      work_id: "w-c",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-c", "w-c-master");
    spawnDomainHierarchy(paths, { work_id: "w-c", domains: ["backend"] });
    approveDomainPlan(paths, "w-c", "backend", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("LIMIT_REACHED creates handoff; apply replaces agent without resetting verified task", () => {
    const paths = resolveV3DataPaths(tmp);
    const engine = new ContinuityEngine(paths);
    const plannerId = "w-c-planner-backend";
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    tasks.setTaskState("w-c", "plan-backend", "TRUE_PASS");

    const pkg = engine.createHandoff({
      work_id: "w-c",
      agent_id: plannerId,
      trigger: "LIMIT_REACHED",
      reason: "context window exhausted",
      next_action: "Finish planner notes then yield",
    });
    expect(pkg.status).toBe("pending");
    expect(pkg.verified_task_state).toBe("TRUE_PASS");
    expect(engine.agents.load("w-c").agents.find((a) => a.agent_id === plannerId)?.state).toBe(
      "LIMIT_REACHED",
    );

    const applied = engine.applyHandoff(pkg.handoff_id);
    expect(applied.status).toBe("applied");
    expect(applied.to_agent_id).toBeTruthy();

    const agents = engine.agents.load("w-c");
    expect(agents.agents.find((a) => a.agent_id === plannerId)?.state).toBe("REPLACED");
    expect(agents.agents.find((a) => a.agent_id === applied.to_agent_id)?.state).toBe("ACTIVE");

    const plan = tasks.load("w-c").tasks.find((t) => t.task_id === "plan-backend")!;
    expect(plan.state).toBe("TRUE_PASS");
    expect(plan.owner_agent_id).toBe(applied.to_agent_id);
  });
});
