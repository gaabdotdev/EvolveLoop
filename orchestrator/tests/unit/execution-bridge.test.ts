import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { dispatchImplementTask } from "../../src/v3/execution/bridge.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const irPath = path.join(__dirname, "../fixtures/v3-filesystem-read.ir.yaml");
const agentsRoot = path.join(__dirname, "../../..");

describe("execution bridge", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "exec-bridge-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-e",
      objective: "exec",
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
    new CoordinatorService(paths).registerWork("w-e", "gc-e", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-e-master",
      role: "master",
      work_id: "w-e",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-e", "w-e-master");
    spawnDomainHierarchy(paths, { work_id: "w-e", domains: ["backend"] });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("refuses implement before PLAN_APPROVED", async () => {
    const paths = resolveV3DataPaths(tmp);
    await expect(
      dispatchImplementTask(paths, {
        work_id: "w-e",
        task_id: "implement-backend",
        ir_path: irPath,
        provider_mode: "real",
        agents_root: agentsRoot,
      }),
    ).rejects.toThrow(/TASK_NOT_READY/);
  });

  it("runs implement with provider_mode=real after plan approval", async () => {
    const paths = resolveV3DataPaths(tmp);
    approveDomainPlan(paths, "w-e", "backend", 1);
    const result = await dispatchImplementTask(paths, {
      work_id: "w-e",
      task_id: "implement-backend",
      ir_path: irPath,
      provider_mode: "real",
      agents_root: agentsRoot,
    });
    expect(result.provider_mode).toBe("real");
    expect(result.blocked_reason ?? null).toBeNull();
    expect(result.success).toBe(true);
    expect(result.finished).toBe(true);

    const task = new TaskGraphStore(paths.taskGraphsDir)
      .load("w-e")
      .tasks.find((t) => t.task_id === "implement-backend")!;
    expect(task.state).toBe("TRUE_PASS");
    expect(task.feature_id).toBe("w-e__implement-backend");
    expect(task.ir_id).toBe("v3-filesystem-read");
  });
});
