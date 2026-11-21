#!/usr/bin/env node
/**
 * V3.6 LIVE MULTI-WORKFLOW E2E
 * Two independent git projects · ≥3 real engineering workflows · GlobalOps admission
 * · overlapping cursor-agent sessions · capacity saturation · isolated failure · ops TUI
 *
 * Usage (from orchestrator/):
 *   EVOLVELOOP_HARNESS_CONSENT=true node scripts/v36-live-multi-workflow.mjs
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(__dirname, "..");
const REPO = resolve(ORCH, "..");
const EVIDENCE = join(REPO, "docs/v3.6/evidence/live-multi-workflow");
const OPS_DIR = join(ORCH, "v36-live-ops");
const RUN_ROOT = join(ORCH, "v36-live-run");

function load(rel) {
  return import(pathToFileURL(join(ORCH, "dist", rel)).href);
}

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf-8", ...opts });
}

function evolve(args, env = {}) {
  return spawnSync(process.execPath, [join(ORCH, "dist/cli/evolve.js"), ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...env },
    cwd: ORCH,
  });
}

function mustConsent() {
  if (process.env.EVOLVELOOP_HARNESS_CONSENT !== "true") {
    console.error("Set EVOLVELOOP_HARNESS_CONSENT=true (process-scoped) for live run.");
    process.exit(2);
  }
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return { raw: stdout };
  }
}

function initGitRepo(repo) {
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "v36-live@evolveloop.local"]);
  git(repo, ["config", "user.name", "V36 Live"]);
}

/** Project A — shop core with TWO independent incomplete modules (discount + inventory). */
function createProjectA() {
  const repo = mkdtempSync(join(tmpdir(), "v36-proj-a-"));
  initGitRepo(repo);
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "shop-core-v36-a",
        version: "0.1.0",
        type: "module",
        scripts: {
          test: "node --test test/**/*.test.js",
          build: "node -e \"require('fs').writeFileSync('built','ok')\"",
        },
      },
      null,
      2,
    ),
  );
  mkdirSync(join(repo, "src/pricing"), { recursive: true });
  mkdirSync(join(repo, "src/inventory"), { recursive: true });
  mkdirSync(join(repo, "src/catalog"), { recursive: true });
  mkdirSync(join(repo, "test"), { recursive: true });

  writeFileSync(
    join(repo, "src/catalog/products.js"),
    `export const PRODUCTS = {
  p1: { id: "p1", name: "Cable", price_cents: 1500, stock: 10 },
  p2: { id: "p2", name: "Mouse", price_cents: 2500, stock: 5 },
};
export function getProduct(id) {
  const p = PRODUCTS[id];
  if (!p) throw new Error("UNKNOWN:" + id);
  return { ...p };
}
`,
  );

  writeFileSync(
    join(repo, "src/pricing/discount.js"),
    `/** INCOMPLETE — implement percent coupon on lines[{line_subtotal_cents}]. */
export function applyPercentDiscount(lines, percent) {
  throw new Error("NOT_IMPLEMENTED:applyPercentDiscount");
}
`,
  );

  writeFileSync(
    join(repo, "src/inventory/reserve.js"),
    `import { PRODUCTS } from "../catalog/products.js";
/** INCOMPLETE — reserve qty from stock without going negative; return {ok, remaining}. */
export function reserveStock(productId, qty) {
  throw new Error("NOT_IMPLEMENTED:reserveStock");
}
export function releaseStock(productId, qty) {
  throw new Error("NOT_IMPLEMENTED:releaseStock");
}
`,
  );

  writeFileSync(
    join(repo, "test/discount.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { applyPercentDiscount } from "../src/pricing/discount.js";
test("10 percent", () => {
  const r = applyPercentDiscount([{ line_subtotal_cents: 1000 }], 10);
  assert.equal(r.subtotal_cents, 900);
});
test("0 percent", () => {
  const r = applyPercentDiscount([{ line_subtotal_cents: 500 }], 0);
  assert.equal(r.subtotal_cents, 500);
});
`,
  );

  writeFileSync(
    join(repo, "test/inventory.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { reserveStock, releaseStock } from "../src/inventory/reserve.js";
import { PRODUCTS } from "../src/catalog/products.js";
test("reserve reduces stock", () => {
  PRODUCTS.p1.stock = 10;
  const r = reserveStock("p1", 3);
  assert.equal(r.ok, true);
  assert.equal(r.remaining, 7);
});
test("reserve fails when insufficient", () => {
  PRODUCTS.p2.stock = 2;
  const r = reserveStock("p2", 5);
  assert.equal(r.ok, false);
  assert.equal(PRODUCTS.p2.stock, 2);
});
test("release restores", () => {
  PRODUCTS.p1.stock = 7;
  releaseStock("p1", 3);
  assert.equal(PRODUCTS.p1.stock, 10);
});
`,
  );

  writeFileSync(
    join(repo, "ACCEPTANCE.md"),
    `# Project A acceptance\n- WF-A1: applyPercentDiscount\n- WF-A2: reserveStock/releaseStock\n- Modules must not cross-edit each other unnecessarily.\n`,
  );

  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base: shop A with incomplete discount+inventory"]);
  const pretest = sh("npm", ["test"], { cwd: repo, timeout: 30_000 });
  return {
    name: "project-a",
    repo,
    initial_commit: git(repo, ["rev-parse", "HEAD"]).stdout.trim(),
    pretest_exit: pretest.status,
  };
}

/** Project B — taskboard with incomplete priority sorter (independent identity). */
function createProjectB() {
  const repo = mkdtempSync(join(tmpdir(), "v36-proj-b-"));
  initGitRepo(repo);
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "taskboard-v36-b",
        version: "0.1.0",
        type: "module",
        scripts: {
          test: "node --test test/**/*.test.js",
          build: "node -e \"require('fs').writeFileSync('built','ok')\"",
        },
      },
      null,
      2,
    ),
  );
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "test"), { recursive: true });

  writeFileSync(
    join(repo, "src/tasks.js"),
    `export function createTask(id, title, priority) {
  return { id, title, priority: Number(priority), done: false };
}
`,
  );

  writeFileSync(
    join(repo, "src/sort.js"),
    `/** INCOMPLETE — sort tasks by priority desc, then title asc. */
export function sortTasks(tasks) {
  throw new Error("NOT_IMPLEMENTED:sortTasks");
}
`,
  );

  writeFileSync(
    join(repo, "test/sort.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/tasks.js";
import { sortTasks } from "../src/sort.js";
test("priority desc then title", () => {
  const list = [
    createTask("1", "beta", 1),
    createTask("2", "alpha", 3),
    createTask("3", "gamma", 3),
  ];
  const s = sortTasks(list);
  assert.deepEqual(s.map((t) => t.id), ["2", "3", "1"]);
});
`,
  );

  writeFileSync(
    join(repo, "ACCEPTANCE.md"),
    `# Project B acceptance\n- Implement sortTasks per test/sort.test.js\n- Do not modify Project A paths (impossible — separate repo).\n`,
  );

  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base: taskboard B with incomplete sort"]);
  const pretest = sh("npm", ["test"], { cwd: repo, timeout: 30_000 });
  return {
    name: "project-b",
    repo,
    initial_commit: git(repo, ["rev-parse", "HEAD"]).stdout.trim(),
    pretest_exit: pretest.status,
  };
}

async function prepareWorkExecution(pathsMod, stores, opts) {
  const { resolveV3DataPaths } = pathsMod;
  const { GoalContractStore } = stores.goals;
  const { TaskGraphStore } = stores.tasks;
  const { AgentRegistryStore } = stores.agents;
  const { WorktreeManager } = stores.worktrees;
  const { IntegrationCoordinator } = stores.integ;
  const { CoordinatorService } = stores.coord;

  const paths = resolveV3DataPaths(opts.dataDir);
  const goals = new GoalContractStore(paths.goalContractsDir);
  let goal;
  try {
    goal = goals.loadLatest(opts.goalId);
  } catch {
    goal = goals.create({
      goal_contract_id: opts.goalId,
      objective: opts.objective,
      criteria: [
        {
          id: "c-impl",
          description: opts.criterion,
          mandatory: true,
          verification: [{ id: "v-test", kind: "test", description: "npm test" }],
          evidence_required: ["diff", "test-log"],
        },
      ],
    });
  }
  const workId = opts.workId;
  const coord = new CoordinatorService(paths);
  if (!coord.loadState().works.some((w) => w.work_id === workId)) {
    coord.registerWork(workId, goal.goal_contract_id, goal.version);
  }
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const snap = tasks.load(workId);
  if (!snap.tasks.some((t) => t.task_id === "t-impl")) {
    tasks.addTask(workId, {
      task_id: "t-impl",
      goal_contract_id: goal.goal_contract_id,
      goal_contract_version: goal.version,
      title: "implement",
      task_kind: "implement",
      state: "READY",
      depends_on: [],
    });
  }
  const agents = new AgentRegistryStore(paths.agentsDir);
  agents.ensure(workId);
  const existing = agents.load(workId).agents;
  if (!existing.some((a) => a.agent_id === "master-1")) {
    agents.register({
      work_id: workId,
      agent_id: "master-1",
      role: "master",
      permissions: { allowWrite: true, allowSpawn: true, allowShell: true },
    });
  }
  if (!existing.some((a) => a.agent_id === "impl-1")) {
    agents.register({
      work_id: workId,
      agent_id: "impl-1",
      role: "worker",
      parent_agent_id: "master-1",
      task_id: "t-impl",
      permissions: { allowWrite: true, allowShell: true },
      delegation: {
        delegation_id: `dlg-${workId}`,
        role: "worker",
        objective: opts.objective,
        scope: ["src", "test"],
        out_of_scope: ["deploy"],
        task_id: "t-impl",
        authorized_inputs: [],
        deliverables: opts.claimFiles,
        criteria_ids: ["c-impl"],
        permissions: { allowWrite: true, allowShell: true },
        budget: {},
        expected_evidence: ["diff", "test-log"],
        termination_condition: "tests_pass",
      },
    });
  }
  const wt = new WorktreeManager(paths, opts.repoPath);
  const rec = wt.create({ work_id: workId, agent_id: "impl-1" });
  const integ = new IntegrationCoordinator(paths.workspacesDir);
  integ.register({
    workspace_id: rec.worktree_id,
    work_id: workId,
    agent_id: "impl-1",
    workspace_path: rec.path,
    base_commit: opts.baseCommit,
    branch: rec.branch,
  });
  for (const f of opts.claimFiles) {
    integ.claimFile(workId, "impl-1", rec.worktree_id, f);
  }
  return { paths, workId, worktree: rec, goal };
}

async function main() {
  mustConsent();
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(RUN_ROOT, { recursive: true });
  if (existsSync(OPS_DIR)) rmSync(OPS_DIR, { recursive: true, force: true });
  mkdirSync(OPS_DIR, { recursive: true });

  const runId = `v36-live-${Date.now()}`;
  const evidence = {
    kind: "V36_LIVE_MULTI_WORKFLOW_Evidence",
    run_id: runId,
    started_at: new Date().toISOString(),
    gates: {},
    timeline: [],
    steps: [],
  };
  const step = (name, data = {}) => {
    const row = { name, at: new Date().toISOString(), ...data };
    evidence.steps.push(row);
    console.log(`[step] ${name}`, data.ok === false ? "FAIL" : "ok");
    return row;
  };
  const timeline = (event, meta = {}) => {
    evidence.timeline.push({ event, at: new Date().toISOString(), ...meta });
  };

  // Auth
  const auth = sh("agent", ["status"], { timeout: 8000 });
  const authOk = auth.status === 0 && /logged in/i.test(auth.stdout || "");
  step("harness_auth", {
    ok: authOk,
    detail: (auth.stdout || "").split("\n")[0]?.replace(/Logged in as .*/, "Logged in as REDACTED"),
  });
  writeJson(join(EVIDENCE, "00-auth.json"), {
    ok: authOk,
    detail: "session auth via cursor-agent (email redacted)",
  });
  if (!authOk) {
    evidence.gates["E2E-LIVE"] = "BLOCKED";
    writeJson(join(EVIDENCE, "FINAL.json"), evidence);
    process.exit(3);
  }

  // Fixtures
  const projA = createProjectA();
  const projB = createProjectB();
  step("fixtures", {
    a: { repo: projA.repo, commit: projA.initial_commit, pretest: projA.pretest_exit },
    b: { repo: projB.repo, commit: projB.initial_commit, pretest: projB.pretest_exit },
  });
  writeJson(join(EVIDENCE, "01-fixtures.json"), { projA, projB });

  // Register projects via real CLI
  const addA = evolve(["project", "add", "--ops-dir", OPS_DIR, "--path", projA.repo, "--name", "shop-a"]);
  const addB = evolve(["project", "add", "--ops-dir", OPS_DIR, "--path", projB.repo, "--name", "board-b"]);
  const recA = parseJson(addA.stdout);
  const recB = parseJson(addB.stdout);
  if (!recA.project_id || !recB.project_id) {
    step("project_register", { ok: false, addA: addA.stdout, addB: addB.stdout });
    evidence.gates.P = "FAIL";
    writeJson(join(EVIDENCE, "FINAL.json"), evidence);
    process.exit(1);
  }
  step("project_register", {
    ok: true,
    a: recA.project_id,
    b: recB.project_id,
    paths: [recA.canonical_path, recB.canonical_path],
  });
  writeJson(join(EVIDENCE, "02-projects.json"), { recA, recB });

  // Capacity: 2 global, 1 per project → forces A1+B1 across projects; A2 waits
  evolve([
    "scheduler",
    "policy",
    "--ops-dir",
    OPS_DIR,
    "--set",
    "true",
    "--max-global",
    "2",
    "--max-per-project",
    "1",
  ]);

  // Submit 3 workflows via CLI (A1, B1 first for cross-project admit; A2 waits)
  const goals = {
    A1: "Implement applyPercentDiscount in src/pricing/discount.js so test/discount.test.js passes. Do not modify inventory module.",
    A2: "Implement reserveStock and releaseStock in src/inventory/reserve.js so test/inventory.test.js passes. Do not modify pricing module.",
    B1: "Implement sortTasks in src/sort.js so test/sort.test.js passes. Stay inside this repository only.",
  };
  const subA1 = parseJson(
    evolve([
      "workflow",
      "submit",
      "--ops-dir",
      OPS_DIR,
      "--project-id",
      recA.project_id,
      "--goal",
      goals.A1,
      "--priority",
      "10",
      "--service-class",
      "interactive",
    ]).stdout,
  );
  const subB1 = parseJson(
    evolve([
      "workflow",
      "submit",
      "--ops-dir",
      OPS_DIR,
      "--project-id",
      recB.project_id,
      "--goal",
      goals.B1,
      "--priority",
      "15",
      "--service-class",
      "interactive",
    ]).stdout,
  );
  const subA2 = parseJson(
    evolve([
      "workflow",
      "submit",
      "--ops-dir",
      OPS_DIR,
      "--project-id",
      recA.project_id,
      "--goal",
      goals.A2,
      "--priority",
      "40",
    ]).stdout,
  );
  step("workflows_submitted", {
    A1: subA1.workflow_id,
    A2: subA2.workflow_id,
    B1: subB1.workflow_id,
  });
  writeJson(join(EVIDENCE, "03-workflows-submitted.json"), { subA1, subA2, subB1, goals });

  // Admission tick — expect 2 admitted, 1 waiting
  const tick1 = parseJson(evolve(["scheduler", "tick", "--ops-dir", OPS_DIR, "--max", "2"]).stdout);
  const queue1 = parseJson(evolve(["scheduler", "queue", "--ops-dir", OPS_DIR]).stdout);
  const status1 = parseJson(evolve(["scheduler", "status", "--ops-dir", OPS_DIR]).stdout);
  const resources1 = parseJson(evolve(["resources", "status", "--ops-dir", OPS_DIR]).stdout);
  step("admission_capacity", {
    admitted: tick1.admitted?.length,
    skipped: tick1.skipped?.length,
    active: status1.active_workflows,
    queue_depth: queue1.queue?.length,
    resources: resources1.usage?.workflows,
  });
  writeJson(join(EVIDENCE, "04-admission-tick1.json"), { tick1, queue1, status1, resources1 });
  evidence.gates.Q =
    (tick1.admitted?.length ?? 0) >= 1 && (status1.active_workflows ?? 0) <= 2 ? "PASS" : "FAIL";

  // Load modules for execution plane
  const pathsMod = { resolveV3DataPaths: (await load("v3/paths.js")).resolveV3DataPaths };
  const stores = {
    goals: await load("v3/goal-contract/store.js"),
    tasks: await load("v3/task-graph/store.js"),
    agents: await load("v3/agent-registry/store.js"),
    worktrees: await load("v3/worktrees/index.js"),
    integ: await load("v3/workspace/integration.js"),
    coord: await load("v3/coordinator/service.js"),
  };
  const { getAdapterDriver } = await load("v3/adapters/drivers/registry.js");
  const { listHarnessSessions, cancelHarnessSession } = await load(
    "v3/adapters/drivers/cli-process.js",
  );
  const { runOpsTui } = await load("v3/ops/ops-tui.js");
  const { GlobalOpsService } = await load("v3/ops/global-ops-service.js");
  const ops = new GlobalOpsService({ opsDir: OPS_DIR, bindExecutionPlane: true });

  const admittedIds = (tick1.admitted || []).map((d) => d.workflow_id);
  // Prefer A1 + B1 for overlap across projects; if A2 admitted instead, still proceed
  const wfMap = {
    [subA1.workflow_id]: {
      label: "A1",
      project: recA,
      repo: projA.repo,
      base: projA.initial_commit,
      claimFiles: ["src/pricing/discount.js"],
      prompt: goals.A1,
      criterion: "discount tests pass",
      testFocus: "test/discount.test.js",
    },
    [subA2.workflow_id]: {
      label: "A2",
      project: recA,
      repo: projA.repo,
      base: projA.initial_commit,
      claimFiles: ["src/inventory/reserve.js"],
      prompt: goals.A2,
      criterion: "inventory tests pass",
      testFocus: "test/inventory.test.js",
    },
    [subB1.workflow_id]: {
      label: "B1",
      project: recB,
      repo: projB.repo,
      base: projB.initial_commit,
      claimFiles: ["src/sort.js"],
      prompt: goals.B1,
      criterion: "sort tests pass",
      testFocus: "test/sort.test.js",
    },
  };

  // Ensure at least two cross-project if possible by forcing evaluate on preferred pair
  let toRun = admittedIds.filter((id) => wfMap[id]).slice(0, 2);
  if (toRun.length < 2) {
    // try admit specific
    for (const id of [subA1.workflow_id, subB1.workflow_id, subA2.workflow_id]) {
      if (toRun.includes(id)) continue;
      if (ops.workflows.activeCount() >= 2) break;
      const r = ops.evaluateAdmission(id);
      if (r.decision.action === "admit") toRun.push(id);
      if (toRun.length >= 2) break;
    }
  }

  // Start coordinator services per project data dir
  for (const p of [recA, recB]) {
    evolve(["service", "stop", "--data-dir", p.data_dir]);
    const st = evolve(["service", "start", "--data-dir", p.data_dir]);
    step("coordinator_start", { project: p.project_id, exit: st.status });
  }

  const driver = getAdapterDriver("antigravity");
  const execMeta = {};

  async function launchWorkflow(wfId) {
    const meta = wfMap[wfId];
    const wf = ops.workflows.get(wfId);
    const workId = wf?.runtime?.work_id || `work-${wfId}`;
    const goalId = wf?.goal_contract_id || `gc-${wfId}`;
    const prepared = await prepareWorkExecution(pathsMod, stores, {
      dataDir: meta.project.data_dir,
      repoPath: meta.repo,
      baseCommit: meta.base,
      workId,
      goalId,
      objective: meta.prompt,
      criterion: meta.criterion,
      claimFiles: meta.claimFiles,
    });
    ops.markRunning(wfId);
    timeline("workflow_running", {
      workflow_id: wfId,
      label: meta.label,
      work_id: workId,
      worktree: prepared.worktree.path,
    });
    const started_at = new Date().toISOString();
    const note = [
      `You are implementer for EvolveLoop V3.6 live multi-workflow (${meta.label}).`,
      "Stay strictly inside this workspace/git worktree.",
      meta.prompt,
      `Run: npm test -- ${meta.testFocus} (or full npm test). Fix until green.`,
      "Commit with a clear message when done.",
      "Do not touch unrelated modules or other repositories.",
    ].join("\n");
    const invoke = await driver.invoke(prepared.paths, {
      work_id: workId,
      task_id: "t-impl",
      agent_id: "impl-1",
      provider_mode: "real",
      workspace_path: prepared.worktree.path,
      note,
      wait_ms: 720_000,
      force_tools: true,
    });
    const completed_at = new Date().toISOString();
    const sessions = listHarnessSessions(prepared.paths, workId);
    // Focused acceptance for this workflow — full suite may include unrelated NOT_IMPLEMENTED modules
    const test = sh("node", ["--test", meta.testFocus], {
      cwd: prepared.worktree.path,
      timeout: 60_000,
    });
    const porcelainPrimary = git(meta.repo, ["status", "--porcelain"]).stdout;
    const diff = git(prepared.worktree.path, ["diff", meta.base, "--"]).stdout;
    const log = git(prepared.worktree.path, ["log", "--oneline", `${meta.base}..HEAD`]).stdout;
    // commit if code fixed but uncommitted
    if (test.status === 0 && git(prepared.worktree.path, ["status", "--porcelain"]).stdout.trim()) {
      git(prepared.worktree.path, ["add", "-A"]);
      git(prepared.worktree.path, ["commit", "-m", `feat(${meta.label}): live implement`]);
    }
    const result = {
      workflow_id: wfId,
      label: meta.label,
      project_id: meta.project.project_id,
      work_id: workId,
      worktree: prepared.worktree.path,
      branch: prepared.worktree.branch,
      started_at,
      completed_at,
      invoke,
      session_id: invoke.bridge_ref,
      sessions,
      npm_test_exit: test.status,
      diff_bytes: Buffer.byteLength(diff),
      commits: log.trim(),
      primary_porcelain: porcelainPrimary,
      stdout_tail: (() => {
        const p = join(
          prepared.paths.root,
          "harness-prompts",
          workId,
          `${invoke.bridge_ref}.stdout.log`,
        );
        return existsSync(p) ? readFileSync(p, "utf-8").slice(-2500) : "";
      })(),
    };
    const ok =
      test.status === 0 &&
      invoke.code !== "DRY_RUN_PROMPT_WRITTEN" &&
      (invoke.status === "accepted" || invoke.status === "failed");
    if (ok) ops.complete(wfId, true);
    else if (invoke.status === "failed") ops.complete(wfId, false);
    timeline("workflow_finished", {
      workflow_id: wfId,
      label: meta.label,
      ok,
      started_at,
      completed_at,
    });
    return result;
  }

  // Parallel overlapping execution of two admitted workflows
  step("parallel_launch", { workflow_ids: toRun, labels: toRun.map((id) => wfMap[id]?.label) });
  timeline("parallel_start", { workflow_ids: toRun });
  const parallelStartedAt = Date.now();
  const parallelPromise = Promise.allSettled(toRun.map((id) => launchWorkflow(id)));

  // Mid-flight: ops TUI snapshot + controlled failure on a third or queued workflow path
  await new Promise((r) => setTimeout(r, 5000));
  const tui = await runOpsTui({
    ops,
    inputLines: ["overview", "queue", "resources", "workflows", "quit"],
  });
  writeJson(join(EVIDENCE, "05-ops-tui.json"), { lines: tui.lines.slice(0, 80) });
  step("ops_tui", { ok: tui.lines.some((l) => /Operations Center|overview/i.test(l)) });

  // Isolation check while running
  const isolation = ops.isolation.assertPathAllowed({
    from_project: recA,
    target_path: join(recB.canonical_path, "src/sort.js"),
    projects: ops.projects,
  });
  step("isolation_deny", { allowed: isolation.allowed, reason: isolation.reason });
  evidence.gates.P = isolation.allowed === false ? "PASS" : "FAIL";
  writeJson(join(EVIDENCE, "06-isolation.json"), isolation);

  // Controlled failure: fail queued sibling A2 while A1+B1 keep running (isolated; no cancel of live LLM pair).
  await new Promise((r) => setTimeout(r, 12_000));
  let failure = { mode: "none" };
  const midSessions = [];
  for (const id of toRun) {
    const wf = ops.workflows.get(id);
    const dataDir = wfMap[id].project.data_dir;
    const { resolveV3DataPaths } = await load("v3/paths.js");
    const paths = resolveV3DataPaths(dataDir);
    const sess = listHarnessSessions(paths, wf.runtime?.work_id || `work-${id}`);
    midSessions.push({
      workflow_id: id,
      label: wfMap[id]?.label,
      state: wf?.state,
      sessions: sess.map((s) => ({
        session_id: s.session_id,
        status: s.status,
        pid: s.pid,
        started_at: s.started_at,
      })),
    });
  }
  const waitingA2 = ops.workflows.get(subA2.workflow_id);
  if (
    waitingA2 &&
    ["QUEUED", "WAITING_RESOURCE", "WAITING_DEPENDENCY", "SUBMITTED", "VALIDATING"].includes(
      waitingA2.state,
    )
  ) {
    ops.workflows.transition(waitingA2.workflow_id, "FAILED", "live-test", {
      reason: "controlled_failure_queued_sibling_while_peers_running",
    });
    failure = {
      mode: "queue_sibling_fail",
      workflow_id: waitingA2.workflow_id,
      label: "A2",
      others_preserved: true,
      preserved_running: toRun,
      peer_states_at_failure: midSessions,
    };
    timeline("controlled_failure", failure);
  } else if (toRun.length >= 2) {
    // Last resort: cancel one running session only if A2 already left queue
    const victimId = toRun[1];
    const wf = ops.workflows.get(victimId);
    const { resolveV3DataPaths } = await load("v3/paths.js");
    const paths = resolveV3DataPaths(wfMap[victimId].project.data_dir);
    const workId = wf.runtime?.work_id || `work-${victimId}`;
    const sess = listHarnessSessions(paths, workId).find((s) => s.status === "running");
    if (sess) {
      const cancelled = cancelHarnessSession(paths, workId, sess.session_id);
      ops.workflows.transition(victimId, "FAILED", "live-test", {
        reason: "controlled_session_cancel_fallback",
      });
      failure = {
        mode: "session_cancel",
        workflow_id: victimId,
        label: wfMap[victimId]?.label,
        session_id: sess.session_id,
        cancelled,
        others_preserved: true,
        preserved: toRun.filter((id) => id !== victimId),
      };
      timeline("controlled_failure", failure);
    }
  }
  step("controlled_failure", failure);
  writeJson(join(EVIDENCE, "07-failure.json"), { failure, midSessions });

  // Wait for parallel harnesses
  const settled = await parallelPromise;
  const results = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { workflow_id: toRun[i], error: String(s.reason), ok: false },
  );
  writeJson(join(EVIDENCE, "08-parallel-results.json"), results);
  step("parallel_complete", {
    elapsed_ms: Date.now() - parallelStartedAt,
    outcomes: results.map((r) => ({
      id: r.workflow_id,
      label: r.label,
      test: r.npm_test_exit,
      code: r.invoke?.code,
      started_at: r.started_at,
      completed_at: r.completed_at,
    })),
  });

  // Overlap proof from timeline timestamps
  const finished = results.filter((r) => r.started_at && r.completed_at);
  let overlap = false;
  if (finished.length >= 2) {
    const [x, y] = finished;
    const a0 = Date.parse(x.started_at);
    const a1 = Date.parse(x.completed_at);
    const b0 = Date.parse(y.started_at);
    const b1 = Date.parse(y.completed_at);
    overlap = a0 < b1 && b0 < a1;
  }
  writeJson(join(EVIDENCE, "09-concurrency-timeline.json"), {
    overlap,
    parallel_elapsed_ms: Date.now() - parallelStartedAt,
    timeline: evidence.timeline,
    intervals: finished.map((r) => ({
      workflow_id: r.workflow_id,
      label: r.label,
      project_id: r.project_id,
      session_id: r.session_id,
      started_at: r.started_at,
      completed_at: r.completed_at,
    })),
  });
  step("overlap_proof", { overlap, count: finished.length });

  // After completion, free capacity and admit remaining eligible
  const tick2 = parseJson(evolve(["scheduler", "tick", "--ops-dir", OPS_DIR, "--max", "2"]).stdout);
  const status2 = parseJson(evolve(["scheduler", "status", "--ops-dir", OPS_DIR]).stdout);
  writeJson(join(EVIDENCE, "10-admission-tick2.json"), { tick2, status2 });
  step("admission_after_release", {
    admitted: tick2.admitted?.length,
    active: status2.active_workflows,
  });

  // Launch any newly admitted remaining workflow (if not failed)
  const newly = (tick2.admitted || [])
    .map((d) => d.workflow_id)
    .filter((id) => !toRun.includes(id) && ops.workflows.get(id)?.state === "ADMITTED");
  for (const id of newly.slice(0, 1)) {
    try {
      const r = await launchWorkflow(id);
      results.push(r);
      writeJson(join(EVIDENCE, "11-third-workflow.json"), r);
    } catch (err) {
      step("third_workflow_error", { ok: false, err: String(err) });
    }
  }

  // Recovery reconcile
  const recover = parseJson(evolve(["scheduler", "recover", "--ops-dir", OPS_DIR]).stdout);
  writeJson(join(EVIDENCE, "12-recover.json"), recover);
  step("recover", { examined: recover.workflows_examined });

  // Coordinator restart scenario (project A)
  const stopA = evolve(["service", "stop", "--data-dir", recA.data_dir]);
  const startA = evolve(["service", "start", "--data-dir", recA.data_dir]);
  const statusA = evolve(["service", "status", "--data-dir", recA.data_dir]);
  writeJson(join(EVIDENCE, "13-coordinator-restart.json"), {
    stop_exit: stopA.status,
    start_exit: startA.status,
    status: statusA.stdout,
  });
  step("coordinator_restart", { ok: startA.status === 0 && statusA.status === 0 });

  // Cross-project file integrity
  const aPrimary = git(projA.repo, ["status", "--porcelain"]).stdout.trim();
  const bPrimary = git(projB.repo, ["status", "--porcelain"]).stdout.trim();
  // primary trees should remain clean (work happened in worktrees)
  const isolationIntegrity = {
    project_a_primary_clean: aPrimary === "",
    project_b_primary_clean: bPrimary === "",
    a_head: git(projA.repo, ["rev-parse", "HEAD"]).stdout.trim(),
    b_head: git(projB.repo, ["rev-parse", "HEAD"]).stdout.trim(),
  };
  writeJson(join(EVIDENCE, "14-isolation-integrity.json"), isolationIntegrity);
  step("primary_repos_intact", isolationIntegrity);

  // Resource consistency
  const resourcesFinal = parseJson(evolve(["resources", "status", "--ops-dir", OPS_DIR]).stdout);
  writeJson(join(EVIDENCE, "15-resources-final.json"), resourcesFinal);

  const liveImplOk = results.filter(
    (r) =>
      r.npm_test_exit === 0 &&
      r.invoke &&
      r.invoke.code !== "DRY_RUN_PROMPT_WRITTEN" &&
      r.invoke.code !== "PROCESS_EXIT_NONZERO" &&
      r.session_id &&
      (r.diff_bytes > 0 || (r.commits || "").length > 0),
  );
  const distinctProjects = new Set(liveImplOk.map((r) => r.project_id));
  const e2eLive =
    authOk &&
    overlap &&
    liveImplOk.length >= 2 &&
    distinctProjects.size >= 2 &&
    evidence.gates.P === "PASS" &&
    evidence.gates.Q === "PASS" &&
    failure.mode !== "none";

  evidence.gates["E2E-LIVE"] = e2eLive ? "PASS" : "FAIL";
  evidence.gates.R =
    resourcesFinal.usage?.workflows != null &&
    resourcesFinal.usage.workflows.held <= resourcesFinal.usage.workflows.capacity
      ? "PASS"
      : "FAIL";
  evidence.gates.O = evidence.steps.some((s) => s.name === "ops_tui" && s.ok !== false)
    ? "PASS"
    : "FAIL";
  evidence.gates.S = isolation.allowed === false ? "PASS" : "FAIL";
  evidence.finished_at = new Date().toISOString();
  evidence.summary = {
    projects: [recA.project_id, recB.project_id],
    workflows: [subA1.workflow_id, subA2.workflow_id, subB1.workflow_id],
    live_successes: liveImplOk.map((r) => r.label),
    overlap,
    failure,
    e2e_live: evidence.gates["E2E-LIVE"],
  };
  writeJson(join(EVIDENCE, "FINAL.json"), evidence);
  console.log(JSON.stringify({ run_id: runId, gates: evidence.gates, summary: evidence.summary }, null, 2));
  process.exit(e2eLive ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
