#!/usr/bin/env node
/**
 * V3.5 FINAL LIVE OPERATIONAL E2E
 * Real git fixture + worktree + coordinator daemon + bubblewrap + cursor-agent LLM
 * + approval broker + independent review + git integrate + post-merge + rollback fixture.
 *
 * Usage (from orchestrator/):
 *   EVOLVELOOP_HARNESS_CONSENT=true node scripts/v35-live-e2e.mjs
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(__dirname, "..");
const REPO = resolve(ORCH, "..");
const EVIDENCE_DOCS = join(REPO, "docs/v3.5/evidence/live-e2e");
const DATA_DIR = join(ORCH, "v35-live-e2e-data");
const require = createRequire(import.meta.url);

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
    console.error("Set EVOLVELOOP_HARNESS_CONSENT=true for this live run (scoped to process).");
    process.exit(2);
  }
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function createEngineeringFixture() {
  const repo = mkdtempSync(join(tmpdir(), "el-live-eng-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "live-e2e@evolveloop.local"]);
  git(repo, ["config", "user.name", "Live E2E"]);

  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "shop-core-live-e2e",
        version: "0.1.0",
        type: "module",
        scripts: {
          test: "node --test test/**/*.test.js",
          build: "node scripts/build.js",
          typecheck: "node -e \"console.log('no-ts'); process.exit(0)\"",
        },
      },
      null,
      2,
    ),
  );
  mkdirSync(join(repo, "src/catalog"), { recursive: true });
  mkdirSync(join(repo, "src/pricing"), { recursive: true });
  mkdirSync(join(repo, "src/cart"), { recursive: true });
  mkdirSync(join(repo, "test"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, "config"), { recursive: true });

  writeFileSync(
    join(repo, "config/tax.json"),
    JSON.stringify({ default_rate: 0.1, categories: { food: 0.05, books: 0.0 } }, null, 2),
  );

  writeFileSync(
    join(repo, "src/catalog/products.js"),
    `const PRODUCTS = {
  p1: { id: "p1", name: "Notebook", price_cents: 2000, category: "books" },
  p2: { id: "p2", name: "Apple", price_cents: 300, category: "food" },
  p3: { id: "p3", name: "Cable", price_cents: 1500, category: "electronics" },
};
export function getProduct(id) {
  const p = PRODUCTS[id];
  if (!p) throw new Error("UNKNOWN_PRODUCT:" + id);
  return { ...p };
}
export function listProducts() {
  return Object.values(PRODUCTS).map((p) => ({ ...p }));
}
`,
  );

  writeFileSync(
    join(repo, "src/pricing/tax.js"),
    `import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
export function loadTaxConfig() {
  return JSON.parse(readFileSync(join(root, "config/tax.json"), "utf-8"));
}
export function taxFor(product, cfg = loadTaxConfig()) {
  const rate = cfg.categories[product.category] ?? cfg.default_rate;
  return Math.round(product.price_cents * rate);
}
`,
  );

  writeFileSync(
    join(repo, "src/pricing/discount.js"),
    `/**
 * INCOMPLETE — implement applyDiscounts(lines, coupons).
 * Rules (acceptance tests encode these):
 * - coupons: { code, type: "percent"|"fixed", value, stackable?: boolean }
 * - percent applies to subtotal of matching lines before tax
 * - fixed subtracts cents from subtotal (floor at 0)
 * - non-stackable coupons: only the single best discount (max savings) applies
 * - stackable coupons combine after the best non-stackable (if any)
 * - never increase price; clamp subtotal >= 0
 */
export function applyDiscounts(_lines, _coupons) {
  throw new Error("NOT_IMPLEMENTED:applyDiscounts");
}
`,
  );

  writeFileSync(
    join(repo, "src/cart/totals.js"),
    `import { getProduct } from "../catalog/products.js";
import { taxFor } from "../pricing/tax.js";
import { applyDiscounts } from "../pricing/discount.js";

export function lineFor(productId, qty) {
  const product = getProduct(productId);
  return {
    product_id: productId,
    qty,
    unit_price_cents: product.price_cents,
    category: product.category,
    line_subtotal_cents: product.price_cents * qty,
  };
}

export function cartTotals(items, coupons = []) {
  const lines = items.map((i) => lineFor(i.product_id, i.qty));
  const discounted = applyDiscounts(lines, coupons);
  const subtotal = discounted.subtotal_cents;
  let tax = 0;
  for (const line of discounted.lines) {
    const product = getProduct(line.product_id);
    const unitTax = taxFor({ ...product, price_cents: Math.round(line.line_subtotal_cents / line.qty) });
    tax += unitTax * line.qty;
  }
  return {
    lines: discounted.lines,
    applied_coupons: discounted.applied,
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
  };
}
`,
  );

  writeFileSync(
    join(repo, "scripts/build.js"),
    `import { writeFileSync } from "node:fs";
writeFileSync("built", "ok\\n");
console.log("build ok");
`,
  );

  writeFileSync(
    join(repo, "test/catalog.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { getProduct, listProducts } from "../src/catalog/products.js";
test("lists products", () => assert.equal(listProducts().length, 3));
test("get product", () => assert.equal(getProduct("p1").price_cents, 2000));
`,
  );

  writeFileSync(
    join(repo, "test/tax.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { taxFor, loadTaxConfig } from "../src/pricing/tax.js";
test("books zero tax", () => {
  const cfg = loadTaxConfig();
  assert.equal(taxFor({ price_cents: 2000, category: "books" }, cfg), 0);
});
test("default tax", () => {
  const cfg = loadTaxConfig();
  assert.equal(taxFor({ price_cents: 1000, category: "electronics" }, cfg), 100);
});
`,
  );

  writeFileSync(
    join(repo, "test/discount.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { applyDiscounts } from "../src/pricing/discount.js";
import { cartTotals } from "../src/cart/totals.js";

test("percent coupon", () => {
  const lines = [{ product_id: "p3", qty: 2, unit_price_cents: 1500, category: "electronics", line_subtotal_cents: 3000 }];
  const r = applyDiscounts(lines, [{ code: "TEN", type: "percent", value: 10, stackable: true }]);
  assert.equal(r.subtotal_cents, 2700);
  assert.deepEqual(r.applied, ["TEN"]);
});

test("fixed coupon floors at zero", () => {
  const lines = [{ product_id: "p2", qty: 1, unit_price_cents: 300, category: "food", line_subtotal_cents: 300 }];
  const r = applyDiscounts(lines, [{ code: "BIG", type: "fixed", value: 500, stackable: true }]);
  assert.equal(r.subtotal_cents, 0);
});

test("non-stackable picks best single", () => {
  const lines = [{ product_id: "p3", qty: 2, unit_price_cents: 1500, category: "electronics", line_subtotal_cents: 3000 }];
  const r = applyDiscounts(lines, [
    { code: "A", type: "percent", value: 10, stackable: false },
    { code: "B", type: "fixed", value: 400, stackable: false },
  ]);
  // 10% of 3000 = 300 savings; fixed 400 wins
  assert.equal(r.subtotal_cents, 2600);
  assert.deepEqual(r.applied, ["B"]);
});

test("stackable combines after best non-stackable", () => {
  const lines = [{ product_id: "p3", qty: 2, unit_price_cents: 1500, category: "electronics", line_subtotal_cents: 3000 }];
  const r = applyDiscounts(lines, [
    { code: "NS", type: "fixed", value: 200, stackable: false },
    { code: "S1", type: "percent", value: 10, stackable: true },
  ]);
  // after NS: 2800; then 10% of remaining 2800 = 2520
  assert.equal(r.subtotal_cents, 2520);
  assert.deepEqual(r.applied, ["NS", "S1"]);
});

test("cart totals integrates discount + tax", () => {
  const t = cartTotals([{ product_id: "p3", qty: 2 }], [{ code: "TEN", type: "percent", value: 10, stackable: true }]);
  assert.equal(t.subtotal_cents, 2700);
  assert.ok(t.total_cents >= t.subtotal_cents);
});
`,
  );

  writeFileSync(
    join(repo, "ACCEPTANCE.md"),
    `# Acceptance

1. \`applyDiscounts\` implements percent/fixed/stacking rules encoded in \`test/discount.test.js\`.
2. Existing catalog + tax tests keep passing.
3. \`npm test\` and \`npm run build\` pass.
4. No changes outside this repository.
`,
  );

  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base: catalog/tax/cart with incomplete discounts"]);
  const initial = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
  const pretest = sh("npm", ["test"], { cwd: repo });
  return {
    repo,
    initial_commit: initial,
    pretest: {
      exit_code: pretest.status,
      // expect failure due to NOT_IMPLEMENTED
      failed_as_expected: pretest.status !== 0,
      stderr_tail: (pretest.stderr || pretest.stdout || "").slice(-400),
    },
  };
}

async function main() {
  mustConsent();
  mkdirSync(EVIDENCE_DOCS, { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });

  const {
    resolveV3DataPaths,
  } = await load("v3/paths.js");
  const { CoordinatorDaemon } = await load("v3/coordinator/daemon.js");
  const { ipcCall } = await load("v3/coordinator/ipc.js");
  const { GoalContractStore } = await load("v3/goal-contract/store.js");
  const { TaskGraphStore } = await load("v3/task-graph/store.js");
  const { AgentRegistryStore } = await load("v3/agent-registry/store.js");
  const { WorktreeManager } = await load("v3/worktrees/index.js");
  const { IntegrationCoordinator } = await load("v3/workspace/integration.js");
  const { SandboxManager, which } = await load("v3/sandbox/index.js");
  const { agentWorkspaceProfile } = await load("v3/security/index.js");
  const { ApprovalBroker } = await load("v3/approvals/broker.js");
  const { getAdapterDriver } = await load("v3/adapters/drivers/registry.js");
  const { inspectHarness } = await load("v3/harness/runtime.js");
  const { listHarnessSessions } = await load("v3/adapters/drivers/cli-process.js");

  const runId = `live-e2e-${Date.now()}`;
  const evidence = {
    kind: "V35_LIVE_E2E_Evidence",
    run_id: runId,
    started_at: new Date().toISOString(),
    gates: {},
    steps: [],
  };
  const step = (name, data) => {
    evidence.steps.push({ name, at: new Date().toISOString(), ...data });
    console.log(`[step] ${name}`, data?.ok === false ? "FAIL" : "ok");
  };

  // --- Phase 2 fixture ---
  const fixture = createEngineeringFixture();
  step("fixture_created", {
    repo: fixture.repo,
    initial_commit: fixture.initial_commit,
    pretest: fixture.pretest,
  });
  writeJson(join(EVIDENCE_DOCS, "01-fixture.json"), fixture);

  const paths = resolveV3DataPaths(DATA_DIR);

  // --- Phase 5 coordinator start (detached via CLI) ---
  // Stop any previous
  evolve(["service", "stop", "--data-dir", DATA_DIR]);
  const start = evolve(["service", "start", "--data-dir", DATA_DIR]);
  step("service_start", { exit: start.status, out: (start.stdout || "").slice(0, 500) });
  if (start.status !== 0) {
    evidence.gates.C = "FAIL";
    writeJson(join(EVIDENCE_DOCS, "FINAL.json"), evidence);
    process.exit(1);
  }

  // Fresh daemon handle for in-process APIs that need store access —
  // but primary control plane is IPC to the detached service.
  // For approvals/worktrees we use libraries against same data-dir (file SSOT).
  const goals = new GoalContractStore(paths.goalContractsDir);
  const goal = goals.create({
    goal_contract_id: `gc-${runId}`,
    objective:
      "Implement applyDiscounts in src/pricing/discount.js so all tests in test/discount.test.js pass, without breaking catalog/tax tests. Investigate modules under src/.",
    criteria: [
      {
        id: "c-impl",
        description: "discount rules implemented; npm test passes in worktree",
        mandatory: true,
        verification: [{ id: "v-test", kind: "test", description: "npm test" }],
        evidence_required: ["test-log", "diff"],
      },
      {
        id: "c-review",
        description: "independent review of diff vs ACCEPTANCE.md",
        mandatory: true,
        verification: [{ id: "v-review", kind: "review", description: "reviewer session" }],
        evidence_required: ["review-report"],
      },
      {
        id: "c-merge",
        description: "approved integration + post-merge tests on main",
        mandatory: true,
        verification: [{ id: "v-merge", kind: "test", description: "post-merge npm test/build" }],
        evidence_required: ["post-merge"],
      },
    ],
  });
  const workId = `work-${runId}`;
  {
    const { CoordinatorService } = await load("v3/coordinator/service.js");
    const svc = new CoordinatorService(paths);
    if (!svc.loadState().works?.some((w) => w.work_id === workId)) {
      svc.registerWork(workId, goal.goal_contract_id, goal.version);
    }
    step("work_registered", { work_id: workId, works: svc.loadState().works?.length });
  }

  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  tasks.addTask(workId, {
    task_id: "t-impl",
    goal_contract_id: goal.goal_contract_id,
    goal_contract_version: goal.version,
    title: "implement applyDiscounts",
    task_kind: "implement",
    state: "READY",
    depends_on: [],
  });
  tasks.addTask(workId, {
    task_id: "t-review",
    goal_contract_id: goal.goal_contract_id,
    goal_contract_version: goal.version,
    title: "independent review",
    task_kind: "verify",
    state: "PENDING",
    depends_on: ["t-impl"],
  });
  tasks.addTask(workId, {
    task_id: "t-integrate",
    goal_contract_id: goal.goal_contract_id,
    goal_contract_version: goal.version,
    title: "integrate with approval",
    task_kind: "integrate",
    state: "PENDING",
    depends_on: ["t-review"],
  });

  const agents = new AgentRegistryStore(paths.agentsDir);
  agents.ensure(workId);
  agents.register({
    work_id: workId,
    agent_id: "master-1",
    role: "master",
    permissions: { allowWrite: true, allowSpawn: true, allowShell: true },
  });
  agents.register({
    work_id: workId,
    agent_id: "impl-1",
    role: "worker",
    parent_agent_id: "master-1",
    task_id: "t-impl",
    permissions: { allowWrite: true, allowShell: true },
    delegation: {
      delegation_id: "dlg-impl",
      role: "worker",
      objective: "implement applyDiscounts",
      scope: ["src", "test"],
      out_of_scope: ["deploy"],
      task_id: "t-impl",
      authorized_inputs: [],
      deliverables: ["src/pricing/discount.js", "test/discount.test.js"],
      criteria_ids: ["c-impl"],
      permissions: { allowWrite: true, allowShell: true },
      budget: {},
      expected_evidence: ["test-log", "diff"],
      termination_condition: "tests_pass",
    },
  });
  agents.register({
    work_id: workId,
    agent_id: "reviewer-1",
    role: "verifier",
    parent_agent_id: "master-1",
    task_id: "t-review",
    permissions: { allowWrite: false, allowShell: false },
    delegation: {
      delegation_id: "dlg-review",
      role: "verifier",
      objective: "independent review of discount implementation",
      scope: ["src", "test", "ACCEPTANCE.md"],
      out_of_scope: ["deploy"],
      task_id: "t-review",
      authorized_inputs: ["diff"],
      deliverables: ["review-report"],
      criteria_ids: ["c-review"],
      permissions: { allowWrite: false, allowShell: false },
      budget: {},
      expected_evidence: ["review-report"],
      termination_condition: "verdict_emitted",
    },
  });

  // --- Phase 3 worktree ---
  const wt = new WorktreeManager(paths, fixture.repo);
  const rec = wt.create({ work_id: workId, agent_id: "impl-1" });
  step("worktree_created", {
    worktree_id: rec.worktree_id,
    path: rec.path,
    branch: rec.branch,
    status: rec.status,
  });
  if (rec.status !== "active") {
    evidence.gates.W = "FAIL";
    writeJson(join(EVIDENCE_DOCS, "FINAL.json"), evidence);
    process.exit(1);
  }
  const primaryBefore = git(fixture.repo, ["status", "--porcelain"]).stdout;
  const wtHead = git(rec.path, ["rev-parse", "HEAD"]).stdout.trim();

  const integ = new IntegrationCoordinator(paths.workspacesDir);
  integ.register({
    workspace_id: rec.worktree_id,
    work_id: workId,
    agent_id: "impl-1",
    workspace_path: rec.path,
    base_commit: fixture.initial_commit,
    branch: rec.branch,
  });
  const claim = integ.claimFile(workId, "impl-1", rec.worktree_id, "src/pricing/discount.js");
  step("ownership_claim", claim);

  // --- Phase 4 sandbox proof ---
  const hasBwrap = !!which("bwrap");
  let sandboxEvidence = { applied: false };
  if (hasBwrap) {
    const profile = agentWorkspaceProfile(rec.path, fixture.repo);
    const sm = new SandboxManager();
    const okRead = await sm.exec({
      argv: ["/bin/cat", join(rec.path, "ACCEPTANCE.md")],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    const leak = await sm.exec({
      argv: ["/bin/sh", "-c", `echo LEAK > '${join(fixture.repo, "LEAK.txt")}'`],
      profile,
      env: { PATH: "/bin:/usr/bin" },
    });
    const deniedPrimary = !existsSync(join(fixture.repo, "LEAK.txt"));
    sandboxEvidence = {
      applied: true,
      backend: okRead.backend_id ?? "bubblewrap",
      sandbox_id: okRead.sandbox_id,
      pid: okRead.pid,
      pgid: okRead.pgid,
      exit_code_read: okRead.exit_code,
      exit_code_leak_attempt: leak.exit_code,
      primary_write_denied: deniedPrimary,
      network_mode: profile.network.mode,
      mounts_workspace: rec.path,
      policy_profile: profile.profile_id,
    };
    step("sandbox_isolation", sandboxEvidence);
    evidence.gates.S = deniedPrimary && okRead.exit_code === 0 ? "PASS" : "FAIL";
  } else {
    evidence.gates.S = "BLOCKED";
    step("sandbox_isolation", { applied: false, reason: "no_bwrap" });
  }
  writeJson(join(EVIDENCE_DOCS, "02-sandbox.json"), sandboxEvidence);

  // --- Phase 1+7 harness implement (real LLM) ---
  const authStatus = sh("agent", ["status"], { timeout: 8000 });
  const authOk = authStatus.status === 0 && /logged in/i.test(authStatus.stdout || "");
  step("harness_auth", { ok: authOk, detail: (authStatus.stdout || "").split("\n")[0] });
  if (!authOk) {
    evidence.gates.H = "BLOCKED";
    writeJson(join(EVIDENCE_DOCS, "FINAL.json"), evidence);
    console.error("Harness auth BLOCKED — cannot complete live LLM body.");
    process.exit(3);
  }

  const implPrompt = [
    "You are the implementer agent for EvolveLoop live E2E.",
    "Workspace is a disposable git worktree. Do NOT touch paths outside it.",
    "Goal: implement applyDiscounts in src/pricing/discount.js per ACCEPTANCE.md and test/discount.test.js.",
    "Investigate src/catalog, src/pricing, src/cart first.",
    "Then implement, run npm test, fix until green, commit with message: feat: applyDiscounts.",
    "Do not invent unrelated features. Stay in this repo only.",
  ].join("\n");

  const driver = getAdapterDriver("antigravity");
  const implInvoke = await driver.invoke(paths, {
    work_id: workId,
    task_id: "t-impl",
    agent_id: "impl-1",
    provider_mode: "real",
    workspace_path: rec.path,
    note: implPrompt,
    wait_ms: 900_000,
    force_tools: true,
  });
  step("harness_implement", {
    status: implInvoke.status,
    code: implInvoke.code,
    message: implInvoke.message,
    bridge_ref: implInvoke.bridge_ref,
  });
  writeJson(join(EVIDENCE_DOCS, "03-harness-implement.json"), implInvoke);

  const sessionsImpl = listHarnessSessions(paths, workId);
  writeJson(join(EVIDENCE_DOCS, "03b-process-sessions.json"), sessionsImpl);

  // Verify engineering result in worktree (Core validates independently of harness shell)
  let wtTest = sh("npm", ["test"], { cwd: rec.path, timeout: 60_000 });
  const discountSrc = existsSync(join(rec.path, "src/pricing/discount.js"))
    ? readFileSync(join(rec.path, "src/pricing/discount.js"), "utf-8")
    : "";
  let implOk =
    wtTest.status === 0 &&
    !discountSrc.includes("NOT_IMPLEMENTED:applyDiscounts") &&
    discountSrc.includes("function applyDiscounts");
  // Orchestration commit if LLM wrote code+tests green but could not commit
  if (implOk && git(rec.path, ["status", "--porcelain"]).stdout.trim()) {
    git(rec.path, ["add", "src/pricing/discount.js", "test", "src"]);
    git(rec.path, ["commit", "-m", "feat: applyDiscounts"]);
  }
  const wtDiff = git(rec.path, ["diff", fixture.initial_commit, "--"]).stdout;
  const wtLog = git(rec.path, ["log", "--oneline", `${fixture.initial_commit}..HEAD`]).stdout;
  step("implement_verify", {
    npm_test_exit: wtTest.status,
    commits: wtLog.trim(),
    diff_bytes: Buffer.byteLength(wtDiff),
    implOk,
    primary_unchanged_porcelain: primaryBefore === git(fixture.repo, ["status", "--porcelain"]).stdout,
  });
  writeJson(join(EVIDENCE_DOCS, "04-implement-verify.json"), {
    npm_test_exit: wtTest.status,
    npm_test_tail: (wtTest.stdout || wtTest.stderr || "").slice(-1500),
    log: wtLog,
    diff: wtDiff.slice(0, 20000),
    primary_status: git(fixture.repo, ["status", "--porcelain"]).stdout,
    harness_stdout_tail: (() => {
      const p = join(paths.root, "harness-prompts", workId, `${implInvoke.bridge_ref}.stdout.log`);
      return existsSync(p) ? readFileSync(p, "utf-8").slice(-3000) : "";
    })(),
  });
  evidence.gates.H = implOk && implInvoke.code !== "DRY_RUN_PROMPT_WRITTEN" ? "PASS" : "FAIL";

  // If LLM failed, do NOT silently patch — gate fails. Still continue continuity/approval/rollback proofs where possible.
  if (!implOk) {
    step("implement_failed_no_solver", { note: "refusing deterministic solver on live path" });
  }

  // --- Gate C: close CLI client, keep service ---
  const status1 = evolve(["service", "status", "--data-dir", DATA_DIR]);
  // Simulate closing CLI: only IPC client exit — daemon stays. New CLI:
  const status2 = evolve(["service", "status", "--data-dir", DATA_DIR]);
  const ping = await ipcCall(DATA_DIR, "ping");
  const events = evolve(["events", "list", "--data-dir", DATA_DIR, "--work-id", workId]);
  step("continuity_cli_reconnect", {
    status1_exit: status1.status,
    status2_exit: status2.status,
    ping_ok: ping.ok === true,
    events_exit: events.status,
  });
  evidence.gates.C =
    status1.status === 0 && status2.status === 0 && ping.ok === true ? "PASS" : "FAIL";
  writeJson(join(EVIDENCE_DOCS, "05-continuity.json"), {
    status1: status1.stdout,
    status2: status2.stdout,
    ping,
  });

  // --- Phase 7 independent review ---
  let reviewOk = false;
  let reviewInvoke = null;
  if (implOk) {
    const reviewPrompt = [
      "You are an INDEPENDENT reviewer (not the implementer).",
      "Read ACCEPTANCE.md and git diff against the base commit.",
      "Evaluate whether applyDiscounts meets the acceptance tests/rules.",
      "Output a short report with: VERDICT: APPROVE or VERDICT: REJECT, then bullet reasons.",
      "Do not modify code unless you find a critical bug that blocks approval — prefer report-only.",
    ].join("\n");
    reviewInvoke = await driver.invoke(paths, {
      work_id: workId,
      task_id: "t-review",
      agent_id: "reviewer-1",
      provider_mode: "real",
      workspace_path: rec.path,
      note: reviewPrompt,
      wait_ms: 480_000,
      cli_mode: "ask",
      force_tools: false,
    });
    const reviewSessions = listHarnessSessions(paths, workId);
    const reviewSession = reviewSessions.find((s) => s.task_id === "t-review");
    let reviewText = "";
    if (reviewSession?.prompt_path) {
      const outLog = reviewSession.prompt_path.replace(/\.md$/, ".stdout.log");
      // Poll briefly for file-backed stdout after timeout races
      for (let i = 0; i < 30; i++) {
        if (existsSync(outLog) && readFileSync(outLog, "utf-8").trim()) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (existsSync(outLog)) reviewText = readFileSync(outLog, "utf-8");
    }
    reviewOk = /VERDICT\s*:\s*APPROVE/i.test(reviewText);
    // If reviewer wrote nothing parseable but tests pass, record as needs human — still require APPROVE text for PASS
    step("independent_review", {
      invoke: { status: reviewInvoke.status, code: reviewInvoke.code, bridge_ref: reviewInvoke.bridge_ref },
      session_id: reviewSession?.session_id,
      agent_id: "reviewer-1",
      distinct_from_impl: reviewSession?.session_id !== implInvoke.bridge_ref,
      reviewOk,
      review_tail: reviewText.slice(-2000),
    });
    writeJson(join(EVIDENCE_DOCS, "06-review.json"), {
      reviewInvoke,
      session: reviewSession,
      reviewText: reviewText.slice(0, 20000),
    });
    if (reviewOk) {
      goals.updateCriterionState(goal.goal_contract_id, "c-review", "PASS", ["review-report"]);
      tasks.setTaskState(workId, "t-review", "TRUE_PASS");
      tasks.setTaskState(workId, "t-impl", "TRUE_PASS");
    }
  }

  // --- Phase 6 Approval Broker for git.mutate / integrate ---
  const { ApprovalStore } = await load("v3/approvals/store.js");
  // Use daemon's approval store path (same data-dir)
  const approvalStore = new ApprovalStore(paths.approvalsDir);
  const broker = new ApprovalBroker(approvalStore);
  const profile = agentWorkspaceProfile(rec.path, fixture.repo);
  const pending = broker.evaluateAndMaybeRequest(profile, "git.mutate", {
    work_id: workId,
    resource: `integrate:${rec.branch}->main`,
    justification: "Live E2E authorized merge of disposable fixture branch after tests+review",
    agent_id: "impl-1",
    goal_id: goal.goal_contract_id,
    task_id: "t-integrate",
  });
  step("approval_pending", pending);
  writeJson(join(EVIDENCE_DOCS, "07-approval-pending.json"), pending);

  // Persist + close CLI + reconnect
  const list1 = evolve(["approvals", "list", "--data-dir", DATA_DIR]);
  const list2 = evolve(["approvals", "list", "--data-dir", DATA_DIR]);
  const stillPending =
    pending.status === "pending_approval" &&
    (list2.stdout || "").includes(pending.approval?.approval_id ?? "___");

  let approved = null;
  let consumed = null;
  let replayDenied = null;
  let scopeDenied = null;
  if (pending.status === "pending_approval" && implOk && reviewOk) {
    const approveCli = evolve([
      "approvals",
      "approve",
      "--data-dir",
      DATA_DIR,
      "--id",
      pending.approval.approval_id,
      "--actor",
      "operator-live-e2e",
    ]);
    approved = { exit: approveCli.status, out: approveCli.stdout };
    // Scope mismatch must fail before successful consume
    scopeDenied = broker.authorize(
      pending.approval.approval_id,
      "git.mutate",
      "integrate:other->main",
    );
    consumed = broker.authorize(
      pending.approval.approval_id,
      "git.mutate",
      `integrate:${rec.branch}->main`,
    );
    replayDenied = broker.authorize(
      pending.approval.approval_id,
      "git.mutate",
      `integrate:${rec.branch}->main`,
    );
  }
  step("approval_decision", {
    stillPending_before_approve: stillPending,
    approved,
    consumed,
    replayDenied,
    scopeDenied,
  });
  writeJson(join(EVIDENCE_DOCS, "08-approval-decision.json"), {
    list1: list1.stdout,
    list2: list2.stdout,
    approved,
    consumed,
    replayDenied,
    scopeDenied,
  });
  evidence.gates.A =
    pending.status === "pending_approval" &&
    scopeDenied?.ok === false &&
    consumed?.ok === true &&
    replayDenied?.ok === false
      ? "PASS"
      : implOk && reviewOk
        ? "FAIL"
        : "NOT_RUN";

  // --- Phase 8 integrate ---
  let merged = null;
  if (consumed?.ok && implOk && reviewOk) {
    // Ensure worktree has commit
    if (!wtLog.trim()) {
      git(rec.path, ["add", "."]);
      git(rec.path, ["commit", "-m", "feat: applyDiscounts"]);
    }
    merged = integ.integrate({
      workspace_id: rec.worktree_id,
      primary_repo: fixture.repo,
      run_post_merge: true,
    });
    const postTest = sh("npm", ["test"], { cwd: fixture.repo, timeout: 60_000 });
    const postBuild = sh("npm", ["run", "build"], { cwd: fixture.repo, timeout: 30_000 });
    step("integrate", {
      state: merged.state,
      integrated_commit: merged.integrated_commit,
      post_merge: merged.post_merge,
      post_test_exit: postTest.status,
      post_build_exit: postBuild.status,
    });
    writeJson(join(EVIDENCE_DOCS, "09-integrate.json"), {
      merged,
      post_test_tail: (postTest.stdout || postTest.stderr || "").slice(-1500),
      post_build_tail: (postBuild.stdout || postBuild.stderr || "").slice(-500),
      main_log: git(fixture.repo, ["log", "--oneline", "-5"]).stdout,
    });
    if (merged.state === "integrated" && postTest.status === 0) {
      goals.updateCriterionState(goal.goal_contract_id, "c-impl", "PASS", ["test-log", "diff"]);
      goals.updateCriterionState(goal.goal_contract_id, "c-merge", "PASS", ["post-merge"]);
      tasks.setTaskState(workId, "t-integrate", "TRUE_PASS");
      evidence.gates.R = "PASS";
    } else {
      evidence.gates.R = "FAIL";
    }
  } else {
    evidence.gates.R = "NOT_RUN";
  }

  // --- Rollback separate fixture ---
  const rbRepo = mkdtempSync(join(tmpdir(), "el-live-rb-"));
  git(rbRepo, ["init", "-b", "main"]);
  git(rbRepo, ["config", "user.email", "rb@evolveloop.local"]);
  git(rbRepo, ["config", "user.name", "RB"]);
  writeFileSync(join(rbRepo, "README.md"), "base\n");
  git(rbRepo, ["add", "."]);
  git(rbRepo, ["commit", "-m", "base"]);
  const rbBase = git(rbRepo, ["rev-parse", "HEAD"]).stdout.trim();
  const rbPaths = resolveV3DataPaths(mkdtempSync(join(tmpdir(), "el-live-rb-data-")));
  const rbWt = new WorktreeManager(rbPaths, rbRepo);
  const rbRec = rbWt.create({ work_id: "rb-work", agent_id: "rb-1" });
  writeFileSync(join(rbRec.path, "README.md"), "changed\n");
  git(rbRec.path, ["add", "."]);
  git(rbRec.path, ["commit", "-m", "bad change"]);
  const rbInteg = new IntegrationCoordinator(rbPaths.workspacesDir);
  rbInteg.register({
    workspace_id: rbRec.worktree_id,
    work_id: "rb-work",
    agent_id: "rb-1",
    workspace_path: rbRec.path,
    base_commit: rbBase,
    branch: rbRec.branch,
  });
  const rbMerged = rbInteg.integrate({
    workspace_id: rbRec.worktree_id,
    primary_repo: rbRepo,
    run_post_merge: false,
  });
  const rbRolled = rbInteg.rollback(rbRec.worktree_id, rbRepo);
  const rbHead = git(rbRepo, ["rev-parse", "HEAD"]).stdout.trim();
  const rollbackOk = rbHead === rbBase && rbRolled.state === "rolled_back";
  step("rollback_fixture", {
    rbBase,
    rbMerged_state: rbMerged.state,
    rbHead,
    rollbackOk,
  });
  writeJson(join(EVIDENCE_DOCS, "10-rollback.json"), {
    rbBase,
    rbMerged,
    rbRolled,
    rbHead,
    rollbackOk,
  });

  // E2E gate
  evidence.gates.E2E =
    evidence.gates.H === "PASS" &&
    evidence.gates.C === "PASS" &&
    evidence.gates.A === "PASS" &&
    evidence.gates.R === "PASS" &&
    (evidence.gates.S === "PASS" || evidence.gates.S === "BLOCKED") &&
    rollbackOk
      ? "PASS"
      : "FAIL";

  evidence.ended_at = new Date().toISOString();
  evidence.goal_id = goal.goal_contract_id;
  evidence.work_id = workId;
  evidence.harness = {
    adapter: "antigravity/cursor-agent",
    auth: "session",
    inspect: inspectHarness("antigravity"),
    implement_session: implInvoke.bridge_ref,
    review_session: reviewInvoke?.bridge_ref,
  };
  evidence.workspace = {
    repo: fixture.repo,
    worktree: rec.path,
    branch: rec.branch,
    initial_commit: fixture.initial_commit,
    integrated_commit: merged?.integrated_commit,
  };
  evidence.sandbox = sandboxEvidence;
  writeJson(join(EVIDENCE_DOCS, "FINAL.json"), evidence);
  writeJson(join(paths.evidenceDir, "live-e2e-final.json"), evidence);

  console.log(JSON.stringify({ run_id: runId, gates: evidence.gates }, null, 2));
  process.exit(evidence.gates.E2E === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
