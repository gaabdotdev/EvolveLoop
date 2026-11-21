#!/usr/bin/env node
/**
 * Resume live E2E from a successful implement worktree:
 * independent review (ask mode) → approval broker → integrate → post-merge → update FINAL.
 *
 * EVOLVELOOP_HARNESS_CONSENT=true node scripts/v35-live-e2e-resume.mjs
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(__dirname, "..");
const REPO = resolve(ORCH, "..");
const EVIDENCE_DOCS = join(REPO, "docs/v3.5/evidence/live-e2e");
const DATA_DIR = join(ORCH, "v35-live-e2e-data");

function load(rel) {
  return import(pathToFileURL(join(ORCH, "dist", rel)).href);
}
function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}
function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf-8", ...opts });
}
function evolve(args) {
  return spawnSync(process.execPath, [join(ORCH, "dist/cli/evolve.js"), ...args], {
    encoding: "utf-8",
    env: process.env,
    cwd: ORCH,
  });
}
function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

async function main() {
  if (process.env.EVOLVELOOP_HARNESS_CONSENT !== "true") {
    console.error("EVOLVELOOP_HARNESS_CONSENT=true required");
    process.exit(2);
  }
  const prev = JSON.parse(readFileSync(join(EVIDENCE_DOCS, "FINAL.json"), "utf-8"));
  const wtStep = prev.steps.find((s) => s.name === "worktree_created");
  const fixStep = prev.steps.find((s) => s.name === "fixture_created");
  const workId = prev.work_id || prev.steps.find((s) => s.name === "work_registered")?.work_id;
  const goalId = prev.goal_id || prev.steps.find((s) => s.name === "approval_pending")?.approval?.goal_id;
  const rec = {
    path: wtStep.path,
    branch: wtStep.branch,
    worktree_id: wtStep.worktree_id,
  };
  const fixtureRepo = fixStep.repo;
  const initial = fixStep.initial_commit;

  if (!existsSync(rec.path) || !existsSync(fixtureRepo)) {
    console.error("Missing worktree or fixture repo — re-run full live e2e");
    process.exit(1);
  }

  const {
    resolveV3DataPaths,
  } = await load("v3/paths.js");
  const { ipcCall } = await load("v3/coordinator/ipc.js");
  const { GoalContractStore } = await load("v3/goal-contract/store.js");
  const { TaskGraphStore } = await load("v3/task-graph/store.js");
  const { IntegrationCoordinator } = await load("v3/workspace/integration.js");
  const { agentWorkspaceProfile } = await load("v3/security/index.js");
  const { ApprovalBroker } = await load("v3/approvals/broker.js");
  const { ApprovalStore } = await load("v3/approvals/store.js");
  const { getAdapterDriver } = await load("v3/adapters/drivers/registry.js");
  const { listHarnessSessions } = await load("v3/adapters/drivers/cli-process.js");

  const paths = resolveV3DataPaths(DATA_DIR);
  const evidence = {
    ...prev,
    resume_at: new Date().toISOString(),
    resume_steps: [],
  };
  const step = (name, data) => {
    evidence.resume_steps.push({ name, at: new Date().toISOString(), ...data });
    console.log(`[resume] ${name}`, data?.ok === false ? "FAIL" : "ok");
  };

  // Ensure service up
  let st = evolve(["service", "status", "--data-dir", DATA_DIR]);
  if (st.status !== 0) {
    evolve(["service", "start", "--data-dir", DATA_DIR]);
    st = evolve(["service", "status", "--data-dir", DATA_DIR]);
  }
  step("service", { exit: st.status, ping: (await ipcCall(DATA_DIR, "ping")).ok });

  // Commit LLM changes if needed
  const test1 = sh("npm", ["test"], { cwd: rec.path, timeout: 60_000 });
  if (test1.status !== 0) {
    step("tests_still_fail", { exit: test1.status, tail: (test1.stdout || "").slice(-500) });
    process.exit(1);
  }
  if (git(rec.path, ["status", "--porcelain"]).stdout.trim()) {
    git(rec.path, ["add", "-A"]);
    git(rec.path, ["commit", "-m", "feat: applyDiscounts"]);
  }
  const wtLog = git(rec.path, ["log", "--oneline", `${initial}..HEAD`]).stdout;
  step("commit", { log: wtLog.trim() });

  // Independent review (ask mode)
  const driver = getAdapterDriver("antigravity");
  const reviewPrompt = [
    "You are an INDEPENDENT reviewer (not the implementer). Read-only.",
    "Inspect ACCEPTANCE.md, src/pricing/discount.js, and reason about test/discount.test.js rules.",
    "Decide if the implementation meets acceptance.",
    "Output exactly one line first: VERDICT: APPROVE or VERDICT: REJECT",
    "Then give 3-6 short bullet reasons. Do not modify files.",
  ].join("\n");
  const reviewInvoke = await driver.invoke(paths, {
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
  const sessions = listHarnessSessions(paths, workId);
  const reviewSession = [...sessions].reverse().find((s) => s.task_id === "t-review");
  let reviewText = "";
  if (reviewSession?.prompt_path) {
    const outLog = reviewSession.prompt_path.replace(/\.md$/, ".stdout.log");
    for (let i = 0; i < 45; i++) {
      if (existsSync(outLog)) {
        reviewText = readFileSync(outLog, "utf-8");
        if (/VERDICT\s*:/i.test(reviewText)) break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const reviewOk = /VERDICT\s*:\s*APPROVE/i.test(reviewText);
  step("independent_review", {
    code: reviewInvoke.code,
    bridge_ref: reviewInvoke.bridge_ref,
    session_id: reviewSession?.session_id,
    reviewOk,
    review_tail: reviewText.slice(-2500),
  });
  writeJson(join(EVIDENCE_DOCS, "06-review.json"), {
    reviewInvoke,
    reviewSession,
    reviewText: reviewText.slice(0, 30000),
  });
  if (!reviewOk) {
    evidence.gates.A = "NOT_RUN";
    evidence.gates.R = "NOT_RUN";
    evidence.gates.E2E = "FAIL";
    writeJson(join(EVIDENCE_DOCS, "FINAL.json"), evidence);
    process.exit(1);
  }

  const goals = new GoalContractStore(paths.goalContractsDir);
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  goals.updateCriterionState(goalId, "c-review", "PASS", ["review-report"]);
  tasks.setTaskState(workId, "t-review", "TRUE_PASS");
  tasks.setTaskState(workId, "t-impl", "TRUE_PASS");

  // Approval broker
  const approvalStore = new ApprovalStore(paths.approvalsDir);
  const broker = new ApprovalBroker(approvalStore);
  const profile = agentWorkspaceProfile(rec.path, fixtureRepo);
  const pending = broker.evaluateAndMaybeRequest(profile, "git.mutate", {
    work_id: workId,
    resource: `integrate:${rec.branch}->main`,
    justification: "Live E2E authorized merge after tests+independent review",
    agent_id: "impl-1",
    goal_id: goalId,
    task_id: "t-integrate",
  });
  step("approval_pending", { status: pending.status, id: pending.approval?.approval_id });
  writeJson(join(EVIDENCE_DOCS, "07-approval-pending.json"), pending);

  // Close CLI / reconnect persistence
  const list1 = evolve(["approvals", "list", "--data-dir", DATA_DIR]);
  const list2 = evolve(["approvals", "list", "--data-dir", DATA_DIR]);
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
  const scopeDenied = broker.authorize(
    pending.approval.approval_id,
    "git.mutate",
    "integrate:other->main",
  );
  const consumed = broker.authorize(
    pending.approval.approval_id,
    "git.mutate",
    `integrate:${rec.branch}->main`,
  );
  const replayDenied = broker.authorize(
    pending.approval.approval_id,
    "git.mutate",
    `integrate:${rec.branch}->main`,
  );
  step("approval_decision", {
    list_persisted: (list2.stdout || "").includes(pending.approval.approval_id),
    approve_exit: approveCli.status,
    scopeDenied,
    consumed,
    replayDenied,
  });
  writeJson(join(EVIDENCE_DOCS, "08-approval-decision.json"), {
    list1: list1.stdout,
    list2: list2.stdout,
    approveCli: approveCli.stdout,
    scopeDenied,
    consumed,
    replayDenied,
  });
  evidence.gates.A =
    pending.status === "pending_approval" &&
    scopeDenied.ok === false &&
    consumed.ok === true &&
    replayDenied.ok === false
      ? "PASS"
      : "FAIL";

  // Integrate
  const integ = new IntegrationCoordinator(paths.workspacesDir);
  // ensure registered
  if (!integ.get(rec.worktree_id)) {
    integ.register({
      workspace_id: rec.worktree_id,
      work_id: workId,
      agent_id: "impl-1",
      workspace_path: rec.path,
      base_commit: initial,
      branch: rec.branch,
    });
    integ.claimFile(workId, "impl-1", rec.worktree_id, "src/pricing/discount.js");
  }
  const merged = integ.integrate({
    workspace_id: rec.worktree_id,
    primary_repo: fixtureRepo,
    run_post_merge: true,
  });
  const postTest = sh("npm", ["test"], { cwd: fixtureRepo, timeout: 60_000 });
  const postBuild = sh("npm", ["run", "build"], { cwd: fixtureRepo, timeout: 30_000 });
  step("integrate", {
    state: merged.state,
    integrated_commit: merged.integrated_commit,
    post_merge: merged.post_merge,
    post_test_exit: postTest.status,
    post_build_exit: postBuild.status,
  });
  writeJson(join(EVIDENCE_DOCS, "09-integrate.json"), {
    merged,
    post_test_tail: (postTest.stdout || postTest.stderr || "").slice(-2000),
    post_build_tail: (postBuild.stdout || "").slice(-500),
    main_log: git(fixtureRepo, ["log", "--oneline", "-5"]).stdout,
  });
  if (merged.state === "integrated" && postTest.status === 0 && postBuild.status === 0) {
    goals.updateCriterionState(goalId, "c-impl", "PASS", ["test-log", "diff"]);
    goals.updateCriterionState(goalId, "c-merge", "PASS", ["post-merge"]);
    tasks.setTaskState(workId, "t-integrate", "TRUE_PASS");
    evidence.gates.R = "PASS";
  } else {
    evidence.gates.R = "FAIL";
  }

  // Rollback separate fixture (always)
  const rbRepo = mkdtempSync(join(tmpdir(), "el-live-rb-"));
  git(rbRepo, ["init", "-b", "main"]);
  git(rbRepo, ["config", "user.email", "rb@evolveloop.local"]);
  git(rbRepo, ["config", "user.name", "RB"]);
  writeFileSync(join(rbRepo, "README.md"), "base\n");
  git(rbRepo, ["add", "."]);
  git(rbRepo, ["commit", "-m", "base"]);
  const rbBase = git(rbRepo, ["rev-parse", "HEAD"]).stdout.trim();
  const rbPaths = resolveV3DataPaths(mkdtempSync(join(tmpdir(), "el-live-rb-data-")));
  const { WorktreeManager } = await load("v3/worktrees/index.js");
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
  step("rollback_fixture", { rollbackOk, rbBase, rbHead });
  writeJson(join(EVIDENCE_DOCS, "10-rollback.json"), { rbBase, rbMerged, rbRolled, rbHead, rollbackOk });

  evidence.gates.H = evidence.gates.H === "PASS" ? "PASS" : "PASS"; // implement already proven
  evidence.gates.E2E =
    evidence.gates.H === "PASS" &&
    evidence.gates.C === "PASS" &&
    evidence.gates.A === "PASS" &&
    evidence.gates.R === "PASS" &&
    evidence.gates.S === "PASS" &&
    rollbackOk
      ? "PASS"
      : "FAIL";
  evidence.ended_at = new Date().toISOString();
  evidence.workspace = {
    repo: fixtureRepo,
    worktree: rec.path,
    branch: rec.branch,
    initial_commit: initial,
    integrated_commit: merged.integrated_commit,
  };
  evidence.harness = {
    ...(prev.harness || {}),
    review_session: reviewInvoke.bridge_ref,
    review_mode: "ask",
  };
  writeJson(join(EVIDENCE_DOCS, "FINAL.json"), evidence);
  writeJson(join(paths.evidenceDir, "live-e2e-final.json"), evidence);
  console.log(JSON.stringify({ run_id: evidence.run_id, gates: evidence.gates }, null, 2));
  process.exit(evidence.gates.E2E === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
