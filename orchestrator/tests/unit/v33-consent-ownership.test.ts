import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { AdapterHandoffBridge } from "../../src/v3/adapters/handoff-bridge.js";
import { getAdapterDriver } from "../../src/v3/adapters/drivers/registry.js";
import { WorkLockStore } from "../../src/v3/locks/store.js";
import { listHarnessSessions } from "../../src/v3/adapters/drivers/cli-process.js";

describe("V3.3 consent + ownership (auto_swap)", () => {
  let tmp: string;
  const prevConsent = process.env.EVOLVELOOP_HARNESS_CONSENT;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v33c-"));
    delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-c",
      objective: "consent",
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
    if (prevConsent === undefined) delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    else process.env.EVOLVELOOP_HARNESS_CONSENT = prevConsent;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("without consent, provider_mode=real still does not spawn (dry-run or blocked)", async () => {
    delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    const paths = resolveV3DataPaths(tmp);
    const driver = getAdapterDriver("claude-code");
    const result = await driver.invoke(paths, {
      work_id: "w-c",
      task_id: "plan-backend",
      provider_mode: "real",
      note: "must not spawn",
    });
    if (driver.can_invoke) {
      expect(result.status).toBe("accepted");
      expect(result.code).toBe("DRY_RUN_PROMPT_WRITTEN");
      expect(result.code).not.toBe("PROCESS_SPAWNED");
      const sessions = listHarnessSessions(paths, "w-c");
      expect(sessions.every((s) => s.status === "dry_run")).toBe(true);
      expect(sessions.every((s) => s.pid == null)).toBe(true);
    } else {
      expect(result.status).toBe("blocked");
    }
  });

  it("applyCrossProvider transfers ownership fence; replaced agent cannot renew old lock", async () => {
    const paths = resolveV3DataPaths(tmp);
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    tasks.setTaskState("w-c", "plan-backend", "TRUE_PASS");
    const locks = new WorkLockStore(paths.locksDir);
    const held = locks.acquire({
      work_id: "w-c",
      holder_agent_id: "w-c-planner-backend",
      scope: "task",
      resource_key: "plan-backend",
      lease_ms: 60_000,
    });
    expect(held.status).toBe("acquired");
    const oldToken = held.lock!.fencing_token;

    const engine = new ContinuityEngine(paths);
    const pkg = engine.createHandoff({
      work_id: "w-c",
      agent_id: "w-c-planner-backend",
      trigger: "LIMIT_REACHED",
      reason: "quota",
    });

    const applied = await new AdapterHandoffBridge(paths).applyCrossProvider({
      handoff_id: pkg.handoff_id,
      to_adapter: getAdapterDriver("claude-code").can_invoke ? "claude-code" : "cursor",
      provider_mode: "mock",
      invoke_target: false,
    });
    expect(applied.envelope.auto_swap).toBe(true);
    expect(applied.package.to_agent_id).toBeTruthy();

    const agents = new AgentRegistryStore(paths.agentsDir).load("w-c");
    expect(agents.agents.find((a) => a.agent_id === "w-c-planner-backend")?.state).toBe("REPLACED");
    const sub = applied.package.to_agent_id!;
    expect(agents.agents.find((a) => a.agent_id === sub)?.state).toBe("ACTIVE");
    expect(tasks.load("w-c").tasks.find((t) => t.task_id === "plan-backend")?.owner_agent_id).toBe(sub);
    expect(tasks.load("w-c").tasks.find((t) => t.task_id === "plan-backend")?.state).toBe("TRUE_PASS");

    // Old fencing token rejected
    const fence = locks.checkFencing(
      "w-c",
      "task",
      "plan-backend",
      oldToken,
      "w-c-planner-backend",
    );
    expect(fence.allowed).toBe(false);

    // Replaced agent cannot renew
    const renew = locks.renew("w-c", held.lock!.lock_id, "w-c-planner-backend");
    expect(renew.status === "denied" || renew.status === "conflict" || renew.lock?.status === "released").toBe(
      true,
    );
  });
});
