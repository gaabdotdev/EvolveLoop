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
import { WorktreeManager } from "../../src/v3/worktrees/index.js";
import { cancelWorkSlice, CancelError } from "../../src/v3/cancel/index.js";
import { IdempotencyStore } from "../../src/v3/idempotency/index.js";
import { scheduleReadyTasks, listReadyTasks } from "../../src/v3/parallel/index.js";
import { runFailureBattery } from "../../src/v3/failure-injection/index.js";
import { WorkLockStore } from "../../src/v3/locks/store.js";

describe("V3.3 resilience — worktree / cancel / parallel / battery", () => {
  let tmp: string;
  let repo: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v33-"));
    repo = path.join(tmp, "repo");
    await fs.mkdir(repo, { recursive: true });
    // Minimal git repo for worktree tests
    const { spawnSync } = await import("node:child_process");
    spawnSync("git", ["init"], { cwd: repo });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    spawnSync("git", ["config", "user.name", "test"], { cwd: repo });
    await fs.writeFile(path.join(repo, "README.md"), "v33\n");
    spawnSync("git", ["add", "."], { cwd: repo });
    spawnSync("git", ["commit", "-m", "init"], { cwd: repo });

    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-33",
      objective: "v33 resilience",
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
    new CoordinatorService(paths).registerWork("w-33", "gc-33", 1);
    const agents = new AgentRegistryStore(paths.agentsDir);
    agents.register({
      agent_id: "w-33-master",
      role: "master",
      work_id: "w-33",
      permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true },
    });
    agents.activate("w-33", "w-33-master");
    spawnDomainHierarchy(paths, { work_id: "w-33", domains: ["backend"] });
    approveDomainPlan(paths, "w-33", "backend", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates and removes a git worktree under data-dir", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const mgr = new WorktreeManager(paths, repo);
    const rec = mgr.create({ work_id: "w-33", agent_id: "w-33-master" });
    expect(rec.status).toBe("active");
    expect(rec.path).toContain("worktrees");
    const listed = mgr.list("w-33");
    expect(listed.some((w) => w.worktree_id === rec.worktree_id)).toBe(true);
    const removed = mgr.remove("w-33", rec.worktree_id, { force: true });
    expect(removed.status).toBe("removed");
  });

  it("fails closed when repo is not git", async () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const bare = path.join(tmp, "not-git");
    await fs.mkdir(bare);
    const mgr = new WorktreeManager(paths, bare);
    const rec = mgr.create({ work_id: "w-33" });
    expect(rec.status).toBe("failed");
    expect(rec.error).toBe("not_a_git_repository");
  });

  it("cancels agent + releases locks; idempotent replay; conflict on payload change", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const agents = new AgentRegistryStore(paths.agentsDir);
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    const graph = tasks.load("w-33");
    tasks.addTask("w-33", {
      task_id: "cancel-target-task",
      goal_contract_id: graph.goal_contract_id,
      goal_contract_version: graph.goal_contract_version,
      title: "cancel target",
      task_kind: "research",
      depends_on: [],
    });
    agents.register({
      agent_id: "aux-cancel",
      role: "auxiliary",
      work_id: "w-33",
      parent_agent_id: "w-33-master",
      task_id: "cancel-target-task",
      permissions: { allowHostInspect: true },
      delegation: {
        delegation_id: "dlg-aux-cancel",
        role: "auxiliary",
        objective: "cancel target",
        scope: ["test"],
        out_of_scope: [],
        task_id: "cancel-target-task",
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowHostInspect: true },
        budget: {},
        expected_evidence: [],
        termination_condition: "CANCELLED",
      },
    });
    agents.activate("w-33", "aux-cancel");

    const locks = new WorkLockStore(paths.locksDir);
    const acq = locks.acquire({
      work_id: "w-33",
      holder_agent_id: "aux-cancel",
      lease_ms: 60_000,
    });
    expect(acq.status).toBe("acquired");

    const first = cancelWorkSlice(paths, {
      work_id: "w-33",
      agent_id: "aux-cancel",
      reason: "test-cancel",
      cascade_children: false,
      idempotency_key: "cancel-1",
    });
    expect(first.cancelled_agents).toContain("aux-cancel");
    expect(first.released_locks.length).toBeGreaterThanOrEqual(1);
    expect(agents.load("w-33").agents.find((a) => a.agent_id === "aux-cancel")?.state).toBe(
      "CANCELLED",
    );

    const replay = cancelWorkSlice(paths, {
      work_id: "w-33",
      agent_id: "aux-cancel",
      reason: "test-cancel",
      cascade_children: false,
      idempotency_key: "cancel-1",
    });
    expect(replay.idempotent_replay).toBe(true);

    expect(() =>
      cancelWorkSlice(paths, {
        work_id: "w-33",
        agent_id: "aux-cancel",
        reason: "DIFFERENT",
        cascade_children: false,
        idempotency_key: "cancel-1",
      }),
    ).toThrow(CancelError);

    const idem = new IdempotencyStore(paths.idempotencyDir);
    const conflict = idem.beginOrReplay("w-33", "cancel-1", "cancel", {
      work_id: "w-33",
      agent_id: "aux-cancel",
      reason: "DIFFERENT",
      cascade_children: false,
      idempotency_key: "cancel-1",
    });
    expect(conflict.status).toBe("conflict");
  });

  it("does not rewrite TRUE_PASS tasks on cancel", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    tasks.setTaskState("w-33", "plan-backend", "TRUE_PASS");
    const agents = new AgentRegistryStore(paths.agentsDir);
    const planner = agents.load("w-33").agents.find((a) => a.role === "planner")!;
    cancelWorkSlice(paths, {
      work_id: "w-33",
      agent_id: planner.agent_id,
      reason: "cancel-planner",
      cascade_children: false,
    });
    expect(tasks.load("w-33").tasks.find((t) => t.task_id === "plan-backend")?.state).toBe(
      "TRUE_PASS",
    );
  });

  it("schedules ready tasks up to max_in_progress", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    const graph = tasks.load("w-33");
    // Keep implement from consuming parallel slots
    tasks.setTaskState("w-33", "implement-backend", "BLOCKED");
    for (const tid of ["r1", "r2", "r3"]) {
      tasks.addTask("w-33", {
        task_id: tid,
        goal_contract_id: graph.goal_contract_id,
        goal_contract_version: graph.goal_contract_version,
        title: tid,
        task_kind: "research",
        depends_on: [],
      });
    }
    const ready = listReadyTasks(paths, "w-33").filter((t) => t.task_id.startsWith("r"));
    expect(ready.length).toBe(3);

    const scheduled = scheduleReadyTasks(paths, "w-33", { max_in_progress: 2 });
    const researchStarted = scheduled.newly_started.filter((id) => id.startsWith("r"));
    expect(researchStarted.length).toBe(2);
    expect(scheduled.ready_but_deferred.filter((id) => id.startsWith("r")).length).toBe(1);

    const inProg = tasks.load("w-33").tasks.filter((t) => t.state === "IN_PROGRESS" && t.task_id.startsWith("r"));
    expect(inProg.length).toBe(2);
  });

  it("failure battery passes on hierarchy fixture", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const report = runFailureBattery(paths, "w-33");
    expect(report.kind).toBe("FailureBatteryReport");
    const failed = report.scenarios.filter((s) => !s.passed);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
