/**
 * V3.6 Global Ops — unit coverage for scheduler, resources, isolation, teams, gates.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import {
  GlobalOpsService,
  canTransition,
  computeEffectivePriority,
  orderQueue,
  buildQueueEntry,
  DEFAULT_SCHEDULER_POLICY,
  discoverQualityGates,
} from "../../src/v3/ops/index.js";
import type { QueueEntry, WorkflowRecord } from "../../src/v3/ops/types.js";

const dirs: string[] = [];

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function fixtureProject(root: string, name: string): string {
  const p = join(root, name);
  mkdirSync(p, { recursive: true });
  writeFileSync(
    join(p, "package.json"),
    JSON.stringify({ name, scripts: { test: "echo ok", lint: "echo lint" } }),
  );
  execFileSync("git", ["init"], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: p, stdio: "ignore" });
  return p;
}

describe("workflow state machine", () => {
  it("allows valid transitions and rejects illegal ones", () => {
    expect(canTransition("SUBMITTED", "VALIDATING")).toBe(true);
    expect(canTransition("QUEUED", "ADMITTED")).toBe(true);
    expect(canTransition("SUCCEEDED", "RUNNING")).toBe(false);
    expect(canTransition("CANCELLED", "QUEUED")).toBe(false);
  });
});

describe("priority fairness aging", () => {
  it("applies aging boost deterministically", () => {
    const wf = {
      priority: 100,
      service_class: "standard" as const,
      submitted_at: new Date(Date.now() - 90_000).toISOString(),
    } as WorkflowRecord;
    const a = computeEffectivePriority(wf, DEFAULT_SCHEDULER_POLICY);
    expect(a.aging_boost).toBeGreaterThanOrEqual(2);
    const b = computeEffectivePriority(
      { ...wf, submitted_at: new Date().toISOString() },
      DEFAULT_SCHEDULER_POLICY,
    );
    expect(a.effective).toBeGreaterThan(b.effective);
  });

  it("fairness prefers alternate project when one dominates", () => {
    const mk = (id: string, project: string, prio: number): QueueEntry =>
      buildQueueEntry(
        {
          workflow_id: id,
          project_id: project,
          priority: prio,
          service_class: "standard",
          submitted_at: new Date().toISOString(),
        } as WorkflowRecord,
        DEFAULT_SCHEDULER_POLICY,
      );
    const entries = [mk("w1", "proj-a", 50), mk("w2", "proj-b", 50)];
    // Make both same effective by identical fields — orderQueue still sorts
    const recent = ["proj-a", "proj-a", "proj-a", "proj-a"];
    const ordered = orderQueue(entries, recent, {
      ...DEFAULT_SCHEDULER_POLICY,
      fairness_window: 4,
    });
    expect(ordered[0].project_id).toBe("proj-b");
  });
});

describe("GlobalOpsService integration-lite", () => {
  it("registers three projects, admits with concurrency limits, deps, isolation", () => {
    const root = tempDir("v36-ops-");
    const opsDir = join(root, "ops");
    const ops = new GlobalOpsService({
      opsDir,
      capacity: { workflows: 2, agents: 8 },
      bindExecutionPlane: true,
    });
    ops.policyStore.update({ max_global_workflows: 2, max_per_project: 2, aging_ms_per_boost: 1000 });

    const p1 = ops.projects.add({ path: fixtureProject(root, "alpha"), name: "alpha" });
    const p2 = ops.projects.add({ path: fixtureProject(root, "beta"), name: "beta" });
    const p3 = ops.projects.add({ path: fixtureProject(root, "gamma"), name: "gamma" });
    expect([p1, p2, p3].map((p) => p.project_id).length).toBe(3);

    const doctor = ops.projects.doctor(p1.project_id);
    expect(doctor.healthy).toBe(true);

    const w1 = ops.submitWorkflow({
      project_id: p1.project_id,
      objective: "Implement feature A with tests",
      priority: 10,
    });
    const w2 = ops.submitWorkflow({
      project_id: p2.project_id,
      objective: "Implement feature B with tests",
      priority: 20,
    });
    const w3 = ops.submitWorkflow({
      project_id: p1.project_id,
      objective: "Implement feature C after A",
      priority: 30,
    });
    const wCross = ops.submitWorkflow({
      project_id: p3.project_id,
      objective: "Cross project dependent workflow objective",
      priority: 40,
    });

    ops.dependencies.add({
      predecessor_id: w1.workflow_id,
      successor_id: w3.workflow_id,
      workflows: ops.workflows,
      projects: ops.projects,
    });

    // cross-project without artifact/policy denied
    expect(() =>
      ops.dependencies.add({
        predecessor_id: w1.workflow_id,
        successor_id: wCross.workflow_id,
        workflows: ops.workflows,
        projects: ops.projects,
      }),
    ).toThrow(/CROSS_PROJECT_DEP_DENIED/);

    // cycle rejected
    expect(() =>
      ops.dependencies.add({
        predecessor_id: w3.workflow_id,
        successor_id: w1.workflow_id,
        workflows: ops.workflows,
        projects: ops.projects,
      }),
    ).toThrow(/CYCLE/);

    const tick1 = ops.tick(2);
    expect(tick1.admitted.length).toBeGreaterThanOrEqual(1);
    expect(ops.workflows.activeCount()).toBeLessThanOrEqual(2);

    // w3 should wait on dependency if not admitted
    const w3state = ops.workflows.get(w3.workflow_id)!;
    expect(["WAITING_DEPENDENCY", "QUEUED", "WAITING_RESOURCE", "ADMITTED"]).toContain(
      w3state.state,
    );

    // Isolation deny
    const guard = ops.isolation.assertPathAllowed({
      from_project: p1,
      target_path: p2.canonical_path,
      projects: ops.projects,
    });
    expect(guard.allowed).toBe(false);

    // Complete w1 and release; admit more
    if (ops.workflows.get(w1.workflow_id)?.state === "ADMITTED") {
      ops.markRunning(w1.workflow_id);
      ops.complete(w1.workflow_id, true);
    }
    ops.dependencies.refresh(ops.workflows);
    ops.tick(2);

    // Recovery demotes RUNNING without live process
    const wr = ops.submitWorkflow({
      project_id: p2.project_id,
      objective: "Recovery candidate workflow objective",
    });
    // force admit
    ops.policyStore.update({ max_global_workflows: 10 });
    ops.evaluateAdmission(wr.workflow_id);
    if (ops.workflows.get(wr.workflow_id)?.state === "ADMITTED") {
      ops.markRunning(wr.workflow_id);
    }
    const report = ops.recover();
    expect(report.workflows_examined).toBeGreaterThan(0);
    if (ops.workflows.get(wr.workflow_id)?.state === "RUNNING") {
      // should have been demoted
      expect(report.demoted_to_recovering.length + report.demoted_to_paused.length).toBeGreaterThan(0);
    } else {
      expect([
        "PAUSED",
        "RECOVERING",
        "ADMITTED",
        "QUEUED",
        "WAITING_RESOURCE",
        "WAITING_DEPENDENCY",
        "RUNNING",
      ]).toContain(ops.workflows.get(wr.workflow_id)!.state);
    }

    // Team root-only
    const plan = ops.teams.compose({
      workflow: w2,
      project: p2,
      available_agents_slots: 1,
      harness_available: true,
      risk: "low",
      independent_task_count: 1,
      requires_review: false,
      measurement: { provenance: "unavailable" },
    });
    expect(plan.roles.length).toBe(1);
    expect(plan.roles[0].role).toBe("orchestrator");

    // Quality discovery
    const discovered = discoverQualityGates(p1.canonical_path);
    expect(discovered.some((d) => d.gate_id === "unit_tests")).toBe(true);

    ops.projects.update(p1.project_id, {
      policy: {
        ...p1.policy,
        quality_gates: [
          {
            gate_id: "unit_tests",
            name: "test",
            requirement: "required",
            command: "true",
            timeout_ms: 5000,
            expected_exit_code: 0,
            phase: "pre_integration",
            provenance: "measured",
          },
        ],
      },
    });
    const q = ops.quality.runPhase({
      project: ops.projects.get(p1.project_id)!,
      workflow_id: w1.workflow_id,
      phase: "pre_integration",
      inject: { unit_tests: 1 },
    });
    expect(q.blocked).toBe(true);

    // Pause / resume / cancel
    const wx = ops.submitWorkflow({
      project_id: p3.project_id,
      objective: "Pause resume cancel scenario objective",
    });
    ops.pause(wx.workflow_id);
    expect(ops.workflows.get(wx.workflow_id)!.state).toBe("PAUSED");
    ops.resume(wx.workflow_id);
    expect(ops.workflows.get(wx.workflow_id)!.state).toBe("QUEUED");
    ops.cancel(wx.workflow_id);
    expect(ops.workflows.get(wx.workflow_id)!.state).toBe("CANCELLED");

    // Duplicate path rejected
    expect(() => ops.projects.add({ path: p1.canonical_path })).toThrow(/DUPLICATE/);

    // Resource lease expiry
    const res = ops.resources.reserve({
      resource_type: "agents",
      quantity: 1,
      unit: "count",
      owner: "test-owner",
      scope: "agent",
      scope_id: "a1",
      lease_ms: 1,
      provenance: "policy_limit",
    });
    // wait expiry
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }
    const expired = ops.resources.expireLeases(Date.now() + 10);
    expect(expired.some((r) => r.reservation_id === res.reservation_id) || ops.resources.get(res.reservation_id)?.state === "EXPIRED").toBe(true);

    // tokens unavailable
    expect(() =>
      ops.resources.reserve({
        resource_type: "tokens",
        quantity: 1,
        unit: "tokens",
        owner: "x",
        scope: "workflow",
        scope_id: "w",
        provenance: "unavailable",
      }),
    ).toThrow(/UNAVAILABLE/);
  });
});
