import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy } from "../../src/v3/hierarchy/spawn.js";
import { buildContextView } from "../../src/v3/context/views.js";

describe("Context Views", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ctx-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-ctx",
      objective: "context",
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
    new CoordinatorService(paths).registerWork("w-ctx", "gc-ctx", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-ctx-master",
      role: "master",
      work_id: "w-ctx",
      permissions: { allowSpawn: true, allowWrite: true, allowHostInspect: true },
    });
    agents.activate("w-ctx", "w-ctx-master");
    spawnDomainHierarchy(paths, { work_id: "w-ctx", domains: ["backend", "frontend"] });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("builds disposable master view with Nomic GAP and regenerable_from", () => {
    const paths = resolveV3DataPaths(tmp);
    const view = buildContextView(paths, { work_id: "w-ctx", role: "master" });
    expect(view.kind).toBe("ContextView");
    expect(view.disposable).toBe(true);
    expect(view.regenerable_from).toContain("goal-contracts");
    expect(view.gaps.some((g) => /Nomic/i.test(g))).toBe(true);
    expect(view.sections.some((s) => s.id === "goal_contract")).toBe(true);
    expect(view.sections.some((s) => s.id === "ledger_tail")).toBe(true);
  });

  it("filters worker view to own task scope", () => {
    const paths = resolveV3DataPaths(tmp);
    const agents = new AgentRegistryStore(paths.agentsDir).load("w-ctx");
    const workerish = agents.agents.find((a) => a.role === "planner" && a.domain === "backend")!;
    const view = buildContextView(paths, {
      work_id: "w-ctx",
      role: "planner",
      agent_id: workerish.agent_id,
    });
    const tasks = view.sections.find((s) => s.id === "task_graph")!.content.tasks as Array<{
      domain?: string;
      task_id: string;
    }>;
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.domain === "backend" || t.task_id.includes("backend"))).toBe(true);
    expect(view.omitted.some((o) => o.id === "ledger_tail")).toBe(true);
  });
});
