/**
 * V5-M01 — Persistent Work Runtime foundation.
 * Real disk StateDb + V3 stores; no forged PASS.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContinuityEngine } from "../../src/v3/continuity/engine.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { spawnDomainHierarchy, approveDomainPlan } from "../../src/v3/hierarchy/spawn.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  PersistentWorkRuntime,
  WorkRuntimeError,
} from "../../src/v3/work-runtime/index.js";
import { STATE_DB_SCHEMA_VERSION } from "../../src/v3/state-db/schema.js";

describe("V5-M01 Persistent Work Runtime", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshWorkspace(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m01-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("open/read Work by stable work_id (canonical aggregate)", () => {
    const ws = freshWorkspace("open");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    const work = rt.open({
      work_id: "w-m01",
      objective: "Fund Persistent Work Runtime",
      tasks: [
        { task_id: "t-plan", title: "Plan", task_kind: "plan" },
        { task_id: "t-impl", title: "Implement", task_kind: "implement", depends_on: ["t-plan"] },
      ],
    });
    expect(work.kind).toBe("Work");
    expect(work.work_id).toBe("w-m01");
    expect(work.objective).toBe("Fund Persistent Work Runtime");
    expect(work.work_state).toBe("IN_PROGRESS");
    expect(work.workspace_root).toBe(ws);
    expect(work.ux_dual_label).toEqual({ infrastructure: "Work", product_v4: "Task" });
    expect(work.liveness.durable).toBe(true);
    expect(work.task_ids).toEqual(expect.arrayContaining(["t-plan", "t-impl"]));

    const again = rt.read("w-m01");
    expect(again.work_id).toBe("w-m01");
    expect(again.goal_contract_id).toBeTruthy();

    const idem = rt.open({ work_id: "w-m01", objective: "ignored on re-open" });
    expect(idem.work_id).toBe("w-m01");
    expect(idem.objective).toBe("Fund Persistent Work Runtime");

    rt.close();
  });

  it("Work graph lists TaskGraph units under Work (no second graph engine)", () => {
    const ws = freshWorkspace("graph");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-g",
      objective: "graph",
      tasks: [
        { task_id: "a", title: "A" },
        { task_id: "b", title: "B", depends_on: ["a"] },
      ],
    });
    const graph = rt.graph("w-g");
    expect(graph.kind).toBe("WorkGraphView");
    expect(graph.source).toBe("TaskGraphStore");
    expect(graph.tasks.map((t) => t.task_id).sort()).toEqual(["a", "b"]);
    expect(rt.listTasks("w-g")).toHaveLength(2);
    // Projection matches underlying store
    const raw = new TaskGraphStore(rt.paths.taskGraphsDir).load("w-g");
    expect(raw.tasks.map((t) => t.task_id).sort()).toEqual(
      graph.tasks.map((t) => t.task_id).sort(),
    );
    rt.close();
  });

  it("Attempt create/list + idempotency via StateDb (same SQLite)", () => {
    const ws = freshWorkspace("attempt");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-att",
      objective: "attempts",
      tasks: [{ task_id: "t1", title: "T1" }],
    });
    const a1 = rt.createAttempt({
      work_id: "w-att",
      task_id: "t1",
      execution_mode: "native",
      status: "running",
      idempotency_key: "idem-1",
      run_id: "run-x",
    });
    expect(a1.kind).toBe("Attempt");
    expect(a1.attempt_id).toBeTruthy();
    expect(a1.execution_mode).toBe("native");
    expect(a1.run_id).toBe("run-x");

    const a2 = rt.createAttempt({
      work_id: "w-att",
      task_id: "t1",
      execution_mode: "harness",
      idempotency_key: "idem-1",
    });
    expect(a2.attempt_id).toBe(a1.attempt_id);
    expect(a2.execution_mode).toBe("native"); // original preserved

    const listed = rt.listAttempts("w-att");
    expect(listed).toHaveLength(1);
    expect(rt.read("w-att").attempt_ids).toContain(a1.attempt_id);

    const tables = rt.stateDb().listTables();
    expect(tables).toContain("attempts");
    expect(STATE_DB_SCHEMA_VERSION).toBe("8");
    rt.close();
  });

  it("survives Agent REPLACED — Work still readable; verified task not rewound", () => {
    const ws = freshWorkspace("replaced");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-rep",
      objective: "continuity",
      criteria: [
        {
          id: "c1",
          description: "ok",
          mandatory: true,
          evidence_required: ["e1"],
        },
      ],
    });
    const agents = new AgentRegistryStore(rt.paths.agentsDir);
    agents.register({
      agent_id: "w-rep-master",
      role: "master",
      work_id: "w-rep",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-rep", "w-rep-master");
    spawnDomainHierarchy(rt.paths, { work_id: "w-rep", domains: ["backend"] });
    approveDomainPlan(rt.paths, "w-rep", "backend", 1);

    const plannerId = "w-rep-planner-backend";
    const tasks = new TaskGraphStore(rt.paths.taskGraphsDir);
    tasks.setTaskState("w-rep", "plan-backend", "TRUE_PASS");

    const engine = new ContinuityEngine(rt.paths);
    const pkg = engine.createHandoff({
      work_id: "w-rep",
      agent_id: plannerId,
      trigger: "LIMIT_REACHED",
      reason: "fixture REPLACED for V5-M01",
      next_action: "continue under substitute",
    });
    const applied = engine.applyHandoff(pkg.handoff_id);
    expect(applied.to_agent_id).toBeTruthy();

    // New runtime instance (simulates process restart / new CLI)
    rt.close();
    const rt2 = new PersistentWorkRuntime({ workspaceRoot: ws });
    const work = rt2.read("w-rep");
    expect(work.liveness.durable).toBe(true);
    expect(work.kind).toBe("Work");
    const replaced = work.agent_refs.find((a) => a.agent_id === plannerId);
    expect(replaced?.state).toBe("REPLACED");
    expect(work.agent_refs.some((a) => a.state === "ACTIVE")).toBe(true);

    const plan = rt2.listTasks("w-rep").find((t) => t.task_id === "plan-backend");
    expect(plan?.state).toBe("TRUE_PASS");
    expect(plan?.owner_agent_id).toBe(applied.to_agent_id);
    // Honesty: Work IN_PROGRESS ≠ forged TRUE_FULL_PASS
    expect(work.work_state).not.toBe("TRUE_FULL_PASS");
    rt2.close();
  });

  it("survives TUI exit — Work durable; coordinator process not alive", () => {
    const ws = freshWorkspace("tui");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-tui",
      objective: "tui exit",
      tasks: [{ task_id: "t1", title: "one" }],
    });
    rt.coordinator.start();
    expect(rt.read("w-tui").liveness.coordinator_process_alive).toBe(true);

    rt.simulateTuiExit("operator_closed_tui");
    const after = rt.read("w-tui");
    expect(after.liveness.durable).toBe(true);
    expect(after.liveness.coordinator_process_alive).toBe(false);
    expect(after.task_ids).toContain("t1");
    expect(after.work_state).toBe("IN_PROGRESS");

    // Fresh handle after "exit"
    rt.close();
    const rt2 = new PersistentWorkRuntime({ workspaceRoot: ws });
    const recovered = rt2.read("w-tui");
    expect(recovered.objective).toBe("tui exit");
    expect(recovered.liveness.durable).toBe(true);
    expect(recovered.liveness.coordinator_process_alive).toBe(false);
    rt2.close();
  });

  it("isolates Work by workspace root (StateDb + V3 data dir)", () => {
    const wsA = freshWorkspace("iso-a");
    const wsB = freshWorkspace("iso-b");
    const rtA = new PersistentWorkRuntime({ workspaceRoot: wsA });
    const rtB = new PersistentWorkRuntime({ workspaceRoot: wsB });

    rtA.open({ work_id: "shared-id", objective: "only in A" });
    expect(rtA.read("shared-id").objective).toBe("only in A");
    expect(() => rtB.read("shared-id")).toThrow(WorkRuntimeError);
    try {
      rtB.read("shared-id");
    } catch (e) {
      expect(e).toBeInstanceOf(WorkRuntimeError);
      expect((e as WorkRuntimeError).code).toBe("WORK_NOT_FOUND");
    }

    rtB.open({ work_id: "shared-id", objective: "only in B" });
    expect(rtB.read("shared-id").objective).toBe("only in B");
    expect(rtA.read("shared-id").objective).toBe("only in A");

    expect(rtA.stateDbPath).not.toBe(rtB.stateDbPath);
    rtA.close();
    rtB.close();
  });

  it("pause Work metadata without deleting aggregate", () => {
    const ws = freshWorkspace("pause");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({ work_id: "w-p", objective: "pause me" });
    const paused = rt.pause({ work_id: "w-p", reason: "operator_pause" });
    expect(paused.work_state).toBe("BLOCKED");
    expect(paused.pause_reason).toBe("operator_pause");
    expect(paused.liveness.durable).toBe(true);
    rt.close();
  });
});
