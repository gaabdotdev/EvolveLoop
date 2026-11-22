import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import { evaluateBudgets, detectStuck, recordBudgetConsumption } from "../../src/v3/budget/tracker.js";

describe("Budget + stuck detection", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "bud-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-b",
      objective: "budget",
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-b", "gc-b", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "master-b",
      role: "master",
      work_id: "w-b",
      permissions: { allowSpawn: true, allowWrite: true },
    });
    agents.activate("w-b", "master-b");
    agents.register({
      agent_id: "worker-b",
      role: "worker",
      work_id: "w-b",
      parent_agent_id: "master-b",
      task_id: "t-b",
      permissions: { allowWrite: true },
      delegation: {
        delegation_id: "dlg-b",
        role: "worker",
        objective: "do",
        scope: [],
        out_of_scope: [],
        task_id: "t-b",
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowWrite: true },
        budget: { max_tokens: 100, max_children: 0 },
        expected_evidence: [],
        termination_condition: "done",
      },
    });
    agents.activate("w-b", "worker-b");
    new TaskGraphStore(paths.taskGraphsDir).addTask("w-b", {
      task_id: "t-b",
      goal_contract_id: "gc-b",
      goal_contract_version: 1,
      title: "task",
      owner_agent_id: "worker-b",
      state: "IN_PROGRESS",
    });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("reports unmeasured token budget as fail-closed breach", () => {
    const paths = resolveV3DataPaths(tmp);
    const report = evaluateBudgets(paths, "w-b");
    expect(report.breaches.some((b) => b.dimension === "tokens" && b.unmeasured)).toBe(true);
  });

  it("records measured consumption and detects overshoot", () => {
    const paths = resolveV3DataPaths(tmp);
    recordBudgetConsumption(paths, "w-b", "worker-b", { tokens: 150 });
    const report = evaluateBudgets(paths, "w-b");
    expect(report.breaches.some((b) => b.dimension === "tokens" && !b.unmeasured && b.consumed === 150)).toBe(
      true,
    );
    const tick = new CoordinatorService(paths).tick("w-b");
    expect(tick.work_state).toBe("BLOCKED");
    expect(tick.budget_breaches).toBeGreaterThan(0);
  });

  it("detects TASK_OWNER_INACTIVE when owner STALE", () => {
    const paths = resolveV3DataPaths(tmp);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.setState("w-b", "worker-b", "STALE");
    const stuck = detectStuck(paths, "w-b");
    expect(stuck.stuck.some((s) => s.reason === "STALE_LEASE")).toBe(true);
    expect(stuck.stuck.some((s) => s.reason === "TASK_OWNER_INACTIVE" && s.task_id === "t-b")).toBe(true);
  });
});
