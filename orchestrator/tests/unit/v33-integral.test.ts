import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy, approveDomainPlan, spawnAuxiliary } from "../../src/v3/hierarchy/spawn.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import { classifyLimitSignal, triggerLimitHandoff } from "../../src/v3/limits/index.js";
import { evaluateHierarchicalBudgets } from "../../src/v3/budget/hierarchical.js";
import { recordBudgetConsumption } from "../../src/v3/budget/tracker.js";
import { AdapterHandoffBridge } from "../../src/v3/adapters/handoff-bridge.js";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { getAdapterDriver } from "../../src/v3/adapters/drivers/registry.js";
import { runInteractiveTui } from "../../src/v3/tui/interactive.js";

describe("V3.3 integral capabilities", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v33i-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-i",
      objective: "integral",
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
    new CoordinatorService(paths).registerWork("w-i", "gc-i", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-i-master",
      role: "master",
      work_id: "w-i",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-i", "w-i-master");
    spawnDomainHierarchy(paths, { work_id: "w-i", domains: ["backend"] });
    approveDomainPlan(paths, "w-i", "backend", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("classifies quota/rate-limit signals for handoff", () => {
    expect(classifyLimitSignal("HTTP 429 rate limit").cause).toBe("rate_limit");
    expect(classifyLimitSignal("quota exhausted for month").cause).toBe("quota_exhausted");
    expect(classifyLimitSignal("context window exceeded").agent_state).toBe("LIMIT_REACHED");
  });

  it("limit signal creates LIMIT_REACHED handoff without resetting TRUE_PASS", () => {
    const paths = resolveV3DataPaths(tmp);
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    tasks.setTaskState("w-i", "plan-backend", "TRUE_PASS");
    const planner = "w-i-planner-backend";
    const result = triggerLimitHandoff(paths, {
      work_id: "w-i",
      agent_id: planner,
      signal: "quota exhausted",
      apply_handoff: true,
    });
    expect(result.classification.cause).toBe("quota_exhausted");
    expect(result.handoff?.status).toBe("applied");
    expect(tasks.load("w-i").tasks.find((t) => t.task_id === "plan-backend")?.state).toBe(
      "TRUE_PASS",
    );
  });

  it("hierarchical budget breach when subtree exceeds parent max_tokens", async () => {
    const paths = resolveV3DataPaths(tmp);
    const agentsFile = path.join(paths.agentsDir, "w-i.json");
    const raw = JSON.parse(await fs.readFile(agentsFile, "utf-8"));
    const dlg = raw.delegations.find((d: { child_agent_id: string }) => d.child_agent_id === "w-i-leader-backend");
    dlg.budget.max_tokens = 50;
    await fs.writeFile(agentsFile, JSON.stringify(raw, null, 2));

    recordBudgetConsumption(paths, "w-i", "w-i-planner-backend", { tokens: 40 });
    recordBudgetConsumption(paths, "w-i", "w-i-leader-backend", { tokens: 20 });
    const report = evaluateHierarchicalBudgets(paths, "w-i");
    expect(report.breaches.some((b) => b.agent_id === "w-i-leader-backend" && b.dimension === "tokens")).toBe(
      true,
    );
  });

  it("spawns auxiliary under leader with inherited permissions", () => {
    const paths = resolveV3DataPaths(tmp);
    const aux = spawnAuxiliary(paths, {
      work_id: "w-i",
      parent_agent_id: "w-i-leader-backend",
      objective: "research auth patterns",
      domain: "backend",
    });
    expect(aux.auxiliary_agent_id).toContain("aux");
    const agents = new AgentRegistryStore(paths.agentsDir).load("w-i");
    const child = agents.agents.find((a) => a.agent_id === aux.auxiliary_agent_id)!;
    expect(child.role).toBe("auxiliary");
    expect(child.permissions.allowSpawn).toBe(false);
    expect(child.parent_agent_id).toBe("w-i-leader-backend");
  });

  it("cross-provider apply rebinds provider and dry-runs target when available", async () => {
    const paths = resolveV3DataPaths(tmp);
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    tasks.setTaskState("w-i", "plan-backend", "TRUE_PASS");
    const engine = new ContinuityEngine(paths);
    const pkg = engine.createHandoff({
      work_id: "w-i",
      agent_id: "w-i-planner-backend",
      trigger: "LIMIT_REACHED",
      reason: "quota",
    });
    const target = getAdapterDriver("claude-code").can_invoke ? "claude-code" : "cursor";
    const applied = await new AdapterHandoffBridge(paths).applyCrossProvider({
      handoff_id: pkg.handoff_id,
      to_adapter: target,
      provider_mode: "mock",
      invoke_target: target !== "cursor", // cursor needs ir_path
    });
    expect(applied.envelope.auto_swap).toBe(true);
    expect(applied.package.status).toBe("applied");
    const subId = applied.package.to_agent_id!;
    expect(
      new AgentRegistryStore(paths.agentsDir).load("w-i").agents.find((a) => a.agent_id === subId)
        ?.provider_id,
    ).toBe(target);
  });

  it("coordinator tick reports parallel + hierarchical + limit fields", () => {
    const paths = resolveV3DataPaths(tmp);
    const tick = new CoordinatorService(paths).tick("w-i");
    expect(tick.hierarchical_budget_breaches).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(tick.parallel_started)).toBe(true);
    expect(Array.isArray(tick.limit_reached_agents)).toBe(true);
  });

  it("TUI exposes cancel/parallel/handoff commands", async () => {
    const paths = resolveV3DataPaths(tmp);
    const { lines } = await runInteractiveTui({
      paths,
      workId: "w-i",
      inputLines: ["help", "parallel", "hier-budgets", "quit"],
    });
    expect(lines.join("\n")).toMatch(/cancel <|hier-budgets|parallel/);
    expect(lines.some((l) => l.includes("ParallelScheduleResult") || l.includes("newly_started"))).toBe(
      true,
    );
  });
});
