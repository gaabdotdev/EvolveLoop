/**
 * Gate E2E — integrated engineering workflow with REAL git worktrees + sandbox + coordinator + approvals.
 * Harness LLM body: BLOCKED when auth unavailable (recorded). Deterministic file edits prove workspace path.
 */
import { describe, expect, it, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import { ipcCall } from "../../src/v3/coordinator/ipc.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { WorktreeManager } from "../../src/v3/worktrees/index.js";
import { IntegrationCoordinator } from "../../src/v3/workspace/integration.js";
import { SandboxManager, which } from "../../src/v3/sandbox/index.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";
import { ApprovalBroker } from "../../src/v3/approvals/broker.js";
import { inspectHarness } from "../../src/v3/harness/runtime.js";

const hasBwrap = !!which("bwrap");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function initProject(): string {
  const repo = mkdtempSync(join(tmpdir(), "el-e2e-eng-"));
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "e2e@example.com"]);
  git(repo, ["config", "user.name", "E2E"]);
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "el-e2e-eng",
        type: "module",
        scripts: {
          test: "node --test test/*.test.js",
          build: "node -e \"require('fs').writeFileSync('built','ok')\"",
        },
      },
      null,
      2,
    ),
  );
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "test"), { recursive: true });
  writeFileSync(join(repo, "src", "greet.js"), `export function greet(name){ return 'hi '+name; }\n`);
  writeFileSync(
    join(repo, "test", "greet.test.js"),
    `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from '../src/greet.js';\ntest('greet', () => assert.equal(greet('a'), 'hi a'));\n`,
  );
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base"]);
  return repo;
}

describe("V3.5 OP Gate E2E — engineering runtime", () => {
  let daemon: CoordinatorDaemon | undefined;
  const clean: string[] = [];
  afterEach(async () => {
    if (daemon) {
      try {
        await daemon.stop("cleanup");
      } catch {
        /* */
      }
      daemon = undefined;
    }
    for (const p of clean.splice(0)) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  });

  it("full stack: service + goal + real worktrees + sandbox + approval + merge + real tests + restart", async () => {
    const repo = initProject();
    clean.push(repo);
    const dataDir = mkdtempSync(join(tmpdir(), "el-e2e-data-"));
    clean.push(dataDir);
    const paths = resolveV3DataPaths(dataDir);

    daemon = new CoordinatorDaemon(dataDir);
    await daemon.start();
    expect((await ipcCall(dataDir, "ping")).ok).toBe(true);

    const goals = new GoalContractStore(paths.goalContractsDir);
    const goal = goals.create({
      goal_contract_id: "gc-eng",
      objective: "Add shout() helper and tests",
      criteria: [
        {
          id: "c1",
          description: "shout exists and tests pass",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "npm test" }],
          evidence_required: ["test-log"],
        },
      ],
    });
    const workId = "work-eng";
    daemon.service.registerWork(workId, goal.goal_contract_id, goal.version);
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    tasks.addTask(workId, {
      task_id: "t-impl",
      goal_contract_id: goal.goal_contract_id,
      goal_contract_version: goal.version,
      title: "implement shout",
      task_kind: "implement",
      state: "READY",
      depends_on: [],
    });
    tasks.addTask(workId, {
      task_id: "t-review",
      goal_contract_id: goal.goal_contract_id,
      goal_contract_version: goal.version,
      title: "review",
      task_kind: "verify",
      state: "PENDING",
      depends_on: ["t-impl"],
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
      agent_id: "worker-1",
      role: "worker",
      parent_agent_id: "master-1",
      task_id: "t-impl",
      permissions: { allowWrite: true, allowShell: true },
      delegation: {
        delegation_id: "dlg-1",
        role: "worker",
        objective: "add shout",
        scope: ["src", "test"],
        out_of_scope: ["deploy"],
        task_id: "t-impl",
        authorized_inputs: [],
        deliverables: ["src/greet.js", "test/shout.test.js"],
        criteria_ids: ["c1"],
        permissions: { allowWrite: true, allowShell: true },
        budget: {},
        expected_evidence: ["test-log"],
        termination_condition: "tests_pass",
      },
    });

    const wt = new WorktreeManager(paths, repo);
    const rec = wt.create({ work_id: workId, agent_id: "worker-1" });
    expect(rec.status).toBe("active");

    // Sandbox-constrained edit verification
    let sandboxOk = false;
    if (hasBwrap) {
      const profile = agentWorkspaceProfile(rec.path, repo);
      const payload =
        "export function greet(name){ return 'hi '+name; }\nexport function shout(name){ return greet(name).toUpperCase(); }\n";
      writeFileSync(join(rec.path, "src", "greet.js"), payload);
      // Prove sandbox can read workspace and cannot write primary
      const res = await new SandboxManager().exec({
        argv: ["/usr/bin/cat", join(rec.path, "src", "greet.js")],
        profile,
        env: { PATH: "/usr/bin:/bin" },
      });
      expect(res.exit_code).toBe(0);
      expect(res.stdout).toContain("shout");
      const leak = await new SandboxManager().exec({
        argv: ["/bin/sh", "-c", `echo leak > '${join(repo, "LEAK.txt")}'`],
        profile,
        env: { PATH: "/usr/bin:/bin" },
      });
      expect(existsSync(join(repo, "LEAK.txt"))).toBe(false);
      void leak;
      sandboxOk = true;
    } else {
      writeFileSync(
        join(rec.path, "src", "greet.js"),
        `export function greet(name){ return 'hi '+name; }\nexport function shout(name){ return greet(name).toUpperCase(); }\n`,
      );
    }

    writeFileSync(
      join(rec.path, "test", "shout.test.js"),
      `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { shout } from '../src/greet.js';\ntest('shout', () => assert.equal(shout('a'), 'HI A'));\n`,
    );
    git(rec.path, ["add", "."]);
    git(rec.path, ["commit", "-m", "feat: shout"]);

    // Sensitive op approval (package.install)
    const broker = new ApprovalBroker(daemon.approvals);
    const pending = broker.evaluateAndMaybeRequest(agentWorkspaceProfile(rec.path), "package.install", {
      work_id: workId,
      resource: "npm:noop-local",
      justification: "controlled fixture install request",
      agent_id: "worker-1",
      test_provider: true,
    });
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") throw new Error("pending");

    // Close "CLI" — new client still sees approval
    const listed = await ipcCall(dataDir, "approvals.list", { work_id: workId });
    expect(listed.ok).toBe(true);

    await ipcCall(dataDir, "approvals.approve", {
      approval_id: pending.approval.approval_id,
      actor: "operator-cli",
    });
    const consumed = daemon.approvals.consume(
      pending.approval.approval_id,
      "package.install",
      "npm:noop-local",
    );
    expect(consumed.ok).toBe(true);

    // Interrupt worker simulation — mark task + recover via tick
    agents.heartbeat(workId, "worker-1");
    const tick = daemon.service.tick(workId);
    expect(tick.work_id).toBe(workId);

    writeFileSync(join(repo, "HUMAN.md"), "preserve\n");

    const integ = new IntegrationCoordinator(paths.workspacesDir);
    integ.register({
      workspace_id: rec.worktree_id,
      work_id: workId,
      agent_id: "worker-1",
      workspace_path: rec.path,
      base_commit: git(repo, ["rev-parse", "HEAD"]).stdout.trim(),
      branch: rec.branch,
    });
    expect(integ.claimFile(workId, "worker-1", rec.worktree_id, "src/greet.js").ok).toBe(true);

    const merged = integ.integrate({
      workspace_id: rec.worktree_id,
      primary_repo: repo,
      run_post_merge: true,
    });
    expect(merged.state).toBe("integrated");
    expect(merged.post_merge?.overall).toBe("PASS");
    expect(existsSync(join(repo, "HUMAN.md"))).toBe(true);
    expect(readFileSync(join(repo, "src", "greet.js"), "utf-8")).toContain("shout");

    // Independent review criterion
    goals.updateCriterionState(goal.goal_contract_id, "c1", "PASS", [
      "test-log",
      `post_merge:${merged.post_merge?.overall}`,
    ]);
    tasks.setTaskState(workId, "t-impl", "TRUE_PASS");
    tasks.setTaskState(workId, "t-review", "TRUE_PASS");

    const harness = {
      claude: inspectHarness("claude-code"),
      cursor: inspectHarness("cursor"),
      auth: (() => {
        const a = spawnSync("claude", ["auth", "status"], { encoding: "utf-8", timeout: 5000 });
        try {
          return JSON.parse(a.stdout || "{}");
        } catch {
          return { loggedIn: false };
        }
      })(),
    };

    await daemon.stop("restart_proof");
    daemon = new CoordinatorDaemon(dataDir);
    const recovered = await daemon.start();
    expect(recovered.lifecycle).toBe("RUNNING");
    expect(daemon.service.loadState().works.some((w) => w.work_id === workId)).toBe(true);

    const evidence = {
      kind: "V35_OP_E2E_Evidence",
      work_id: workId,
      goal_id: goal.goal_contract_id,
      worktree_id: rec.worktree_id,
      branch: rec.branch,
      sandbox_os_applied: sandboxOk,
      approval_id: pending.approval.approval_id,
      integrated_commit: merged.integrated_commit,
      post_merge: merged.post_merge,
      human_dirty_preserved: existsSync(join(repo, "HUMAN.md")),
      harness_llm: {
        status: harness.auth.loggedIn ? "AUTH_OK" : "BLOCKED_AUTH",
        claude_execution_path: harness.claude.execution_path,
        note: "File edits performed under sandbox/worktree; LLM body not forged",
      },
      real: [
        "CoordinatorDaemon IPC",
        "git worktree create/commit/merge",
        "post-merge npm test/build discovery",
        hasBwrap ? "bubblewrap write confinement" : null,
        "approval persist/approve/consume",
        "restart reconcile",
      ].filter(Boolean),
      simulated: ["LLM code generation (auth blocked) — deterministic shout patch used"],
    };
    mkdirSync(paths.evidenceDir, { recursive: true });
    writeFileSync(join(paths.evidenceDir, "v35-op-e2e.json"), JSON.stringify(evidence, null, 2));
    // also copy to docs evidence if writable
    try {
      mkdirSync(join(process.cwd(), "../docs/v3.5/evidence"), { recursive: true });
      writeFileSync(
        join(process.cwd(), "../docs/v3.5/evidence/v35-op-e2e.json"),
        JSON.stringify(evidence, null, 2),
      );
    } catch {
      /* */
    }

    expect(evidence.post_merge?.overall).toBe("PASS");
    if (hasBwrap) expect(evidence.sandbox_os_applied).toBe(true);
  }, 90000);
});
