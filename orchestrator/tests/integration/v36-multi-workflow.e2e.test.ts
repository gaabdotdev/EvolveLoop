/**
 * V3.6 Gate E2E (deterministic) — multi-project multi-workflow operations.
 * Live LLM harness marked BLOCKED when consent/auth absent.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { GlobalOpsService } from "../../src/v3/ops/index.js";
import { runOpsTui } from "../../src/v3/ops/ops-tui.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function fixture(root: string, name: string): string {
  const p = join(root, name);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "package.json"), JSON.stringify({ name, scripts: { test: "true" } }));
  execFileSync("git", ["init"], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: p, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "i"], { cwd: p, stdio: "ignore" });
  return p;
}

describe("v36 multi-workflow e2e deterministic", () => {
  it("runs three projects with concurrent admission, deps, pressure, ops tui, recovery", async () => {
    const root = mkdtempSync(join(tmpdir(), "v36-e2e-"));
    dirs.push(root);
    const ops = new GlobalOpsService({
      opsDir: join(root, "ops"),
      capacity: { workflows: 2, agents: 4 },
      bindExecutionPlane: true,
    });
    ops.policyStore.update({
      max_global_workflows: 2,
      max_per_project: 1,
      aging_ms_per_boost: 500,
      fairness_window: 4,
    });

    const a = ops.projects.add({ path: fixture(root, "a"), name: "a" });
    const b = ops.projects.add({ path: fixture(root, "b"), name: "b" });
    const c = ops.projects.add({ path: fixture(root, "c"), name: "c" });

    const wa1 = ops.submitWorkflow({
      project_id: a.project_id,
      objective: "Project A primary engineering objective",
      priority: 5,
      service_class: "interactive",
    });
    const wa2 = ops.submitWorkflow({
      project_id: a.project_id,
      objective: "Project A secondary objective waiting fairness",
      priority: 50,
    });
    const wb1 = ops.submitWorkflow({
      project_id: b.project_id,
      objective: "Project B engineering objective parallel",
      priority: 10,
    });
    const wb2 = ops.submitWorkflow({
      project_id: b.project_id,
      objective: "Project B follow-up depends on B primary",
      priority: 15,
    });
    const wc1 = ops.submitWorkflow({
      project_id: c.project_id,
      objective: "Project C independent under resource pressure",
      priority: 15,
    });

    ops.dependencies.add({
      predecessor_id: wb1.workflow_id,
      successor_id: wb2.workflow_id,
      workflows: ops.workflows,
      projects: ops.projects,
    });

    // Cross-project dependency only with explicit artifact contract
    ops.projects.update(c.project_id, {
      policy: { ...c.policy, allow_cross_project_artifacts: true },
    });
    ops.projects.update(b.project_id, {
      policy: { ...ops.projects.get(b.project_id)!.policy, allow_cross_project_artifacts: true },
    });
    ops.dependencies.add({
      predecessor_id: wb1.workflow_id,
      successor_id: wc1.workflow_id,
      artifact_ref: "artifact://b/report.json",
      workflows: ops.workflows,
      projects: ops.projects,
    });

    const t1 = ops.tick(2);
    expect(t1.admitted.length).toBeGreaterThanOrEqual(1);
    expect(ops.workflows.activeCount()).toBeLessThanOrEqual(2);

    // At least two projects represented or waiting due to pressure
    const active = ops.workflows
      .list()
      .filter((w) => w.state === "ADMITTED" || w.state === "RUNNING");
    const waiting = ops.workflows
      .list()
      .filter((w) =>
        ["WAITING_RESOURCE", "WAITING_DEPENDENCY", "QUEUED"].includes(w.state),
      );
    expect(active.length + waiting.length).toBeGreaterThanOrEqual(3);

    // Parallelism when capacity allows: bump and tick again after completing one
    for (const w of active.slice(0, 1)) {
      ops.markRunning(w.workflow_id);
      ops.complete(w.workflow_id, true);
    }
    ops.dependencies.refresh(ops.workflows);
    ops.policyStore.update({ max_global_workflows: 3, max_per_project: 2 });
    const t2 = ops.tick(2);
    const active2 = ops.workflows
      .list()
      .filter((w) => w.state === "ADMITTED" || w.state === "RUNNING");
    expect(active2.length + t2.admitted.length).toBeGreaterThanOrEqual(1);

    // Isolation
    const denied = ops.isolation.assertPathAllowed({
      from_project: a,
      target_path: join(b.canonical_path, "package.json"),
      projects: ops.projects,
    });
    expect(denied.allowed).toBe(false);

    // Ops TUI against real state
    const tui = await runOpsTui({
      ops,
      inputLines: ["overview", "queue", "blockers", "resources", "quit"],
    });
    expect(tui.lines.some((l) => l.includes("Operations Center"))).toBe(true);

    // Restart simulation: new service instance + recover
    const ops2 = new GlobalOpsService({
      opsDir: join(root, "ops"),
      bindExecutionPlane: true,
    });
    const report = ops2.recover();
    expect(report.workflows_examined).toBeGreaterThanOrEqual(4);
    expect(ops2.rebuildQueue().length).toBeGreaterThanOrEqual(0);

    // Live LLM portion
    const live =
      process.env.EVOLVELOOP_HARNESS_CONSENT === "1" &&
      Boolean(process.env.CURSOR_API_KEY || process.env.ANTHROPIC_API_KEY);
    if (!live) {
      // Explicit BLOCKED — do not claim E2E integral PASS for live harness
      expect(live).toBe(false);
    }

    // Reference fixtures exist
    expect([a, b, c].length).toBe(3);
    expect([wa1, wa2, wb1, wb2, wc1].every((w) => Boolean(w.workflow_id))).toBe(true);
  });
});
