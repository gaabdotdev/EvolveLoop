/**
 * V0 E2E circuit: intent → Goal Contract → worktree → adapter → Evidence Validator → ledger.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runIntentFlow } from "../intake/intent-flow.js";
import type { GoalContract } from "../goal-contract/types.js";
import { defaultStateDbPath, StateDb } from "../state-db/store.js";
import { probeV0ModelProviders } from "../model-providers/index.js";
import { defaultExecutionRunner, type ExecutionRunner } from "../execution-runner/index.js";
import { CursorCircuitAdapter, selectV0AgentAdapter } from "./cursor-adapter.js";
import type { CircuitAgentAdapter, NormalizedAdapterResult } from "./adapter-types.js";
import { runEvidenceValidator, type EvidenceValidatorResult } from "./evidence-validator.js";

export interface CircuitTaskSpec {
  task_id: string;
  intent: string;
  /** Marker file the agent (or offline fixture) should create under .evolveloop/circuit-markers/ */
  marker_name: string;
  marker_content?: string;
  /** When true, apply marker via ExecutionRunner (offline proof) — NOT claimed as agent success. */
  offline_apply_marker?: boolean;
  adapter_timeout_ms?: number;
  skip_adapter_invoke?: boolean;
  validator_commands?: Array<{ id: string; argv: string[]; cwd?: string }>;
  authorized_sensitive_paths?: string[];
}

export interface CircuitRunOptions {
  workspace: string;
  task: CircuitTaskSpec;
  work_id?: string;
  state_db_path?: string;
  /** Use a disposable subdirectory / worktree path for isolation. */
  worktree_path?: string;
  runner?: ExecutionRunner;
  adapter?: CircuitAgentAdapter;
  answers?: Array<string | undefined> | Record<string, string>;
  confirm_mso?: boolean;
  /** Skip heavy npm build/test; use lightweight validator commands. */
  lightweight_validator?: boolean;
}

export interface CircuitRunResult {
  kind: "CircuitRunResult";
  run_id: string;
  work_id: string;
  task_id: string;
  status: "TRUE_FULL_PASS" | "BLOCKED" | "NOT_PASS";
  reason: string;
  goal_contract_id?: string;
  workspace_path: string;
  model_health: Awaited<ReturnType<typeof probeV0ModelProviders>>;
  adapter_health_ok: boolean;
  adapter_result?: NormalizedAdapterResult;
  validator?: EvidenceValidatorResult;
  token_ledger_entry_id?: string;
  limitations: string[];
}

function ensureGitWorktreeOrCopy(repoRoot: string, worktreePath: string, branchName: string): {
  ok: boolean;
  reason?: string;
} {
  mkdirSync(resolve(worktreePath, ".."), { recursive: true });
  if (existsSync(worktreePath)) {
    return { ok: true };
  }
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  if (probe.status !== 0 || probe.stdout.trim() !== "true") {
    return { ok: false, reason: "not_a_git_repository" };
  }
  const add = spawnSync(
    "git",
    ["worktree", "add", "--detach", worktreePath, "HEAD"],
    { cwd: repoRoot, encoding: "utf-8" },
  );
  if (add.status !== 0) {
    // Fallback: detached failed — try named branch
    const add2 = spawnSync(
      "git",
      ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
      { cwd: repoRoot, encoding: "utf-8" },
    );
    if (add2.status !== 0) {
      return {
        ok: false,
        reason: (add2.stderr || add.stderr || "worktree_add_failed").trim(),
      };
    }
  }
  return { ok: true };
}

export async function runV0Circuit(opts: CircuitRunOptions): Promise<CircuitRunResult> {
  const runner = opts.runner ?? defaultExecutionRunner;
  const workspaceRoot = resolve(opts.workspace);
  const work_id = opts.work_id ?? `work-${randomUUID().slice(0, 8)}`;
  const run_id = `cr-${randomUUID()}`;
  const limitations = [
    "V0 Bloco 3 circuit — no FreeLLMAPI/bwrap/daemon/Laya",
    "TRUE_FULL_PASS only via Evidence Validator (not agent prose)",
  ];

  const model_health = await probeV0ModelProviders();
  const adapter = opts.adapter ?? (await selectV0AgentAdapter(runner));
  const adapterHealth = await adapter.healthCheck();

  const execWorkspace = opts.worktree_path
    ? resolve(opts.worktree_path)
    : workspaceRoot;

  if (opts.worktree_path) {
    const wt = ensureGitWorktreeOrCopy(
      workspaceRoot,
      execWorkspace,
      `v0-circuit-${opts.task.task_id}`,
    );
    if (!wt.ok) {
      const db = new StateDb(opts.state_db_path ?? defaultStateDbPath(workspaceRoot));
      try {
        const tl = db.recordTokenLedger({
          work_id,
          task_id: opts.task.task_id,
          adapter_id: adapter.adapter_id,
          cost_provenance: "UNAVAILABLE",
          status: "BLOCKED",
          payload: { reason: wt.reason, phase: "worktree" },
        });
        db.recordCircuitRun({
          run_id,
          work_id,
          task_id: opts.task.task_id,
          status: "BLOCKED",
          reason: wt.reason,
          workspace_path: execWorkspace,
          payload: { model_health, adapter_health: adapterHealth },
        });
        return {
          kind: "CircuitRunResult",
          run_id,
          work_id,
          task_id: opts.task.task_id,
          status: "BLOCKED",
          reason: `worktree:${wt.reason}`,
          workspace_path: execWorkspace,
          model_health,
          adapter_health_ok: adapterHealth.ok,
          token_ledger_entry_id: tl.entry_id,
          limitations,
        };
      } finally {
        db.close();
      }
    }
  }

  // 1) Intent → Goal Contract (reuse Bloco 2)
  const intentOut = runIntentFlow({
    workspace: execWorkspace,
    intent: opts.task.intent,
    answers: opts.answers ?? ["ok", "ok", "ok", "ok"],
    confirm_mso: opts.confirm_mso !== false,
    state_db_path: opts.state_db_path ?? defaultStateDbPath(execWorkspace),
    goal_contract_id: `gc-${opts.task.task_id}`,
  });

  if (intentOut.kind !== "goal_contract") {
    const db = new StateDb(opts.state_db_path ?? defaultStateDbPath(execWorkspace));
    try {
      const tl = db.recordTokenLedger({
        work_id,
        task_id: opts.task.task_id,
        cost_provenance: "UNAVAILABLE",
        status: "BLOCKED",
        payload: { reason: "trivial_bypass_unexpected", intentOut },
      });
      db.recordCircuitRun({
        run_id,
        work_id,
        task_id: opts.task.task_id,
        status: "BLOCKED",
        reason: "intent_not_goal_contract",
        workspace_path: execWorkspace,
      });
      return {
        kind: "CircuitRunResult",
        run_id,
        work_id,
        task_id: opts.task.task_id,
        status: "BLOCKED",
        reason: "intent_not_goal_contract",
        workspace_path: execWorkspace,
        model_health,
        adapter_health_ok: adapterHealth.ok,
        token_ledger_entry_id: tl.entry_id,
        limitations,
      };
    } finally {
      db.close();
    }
  }

  const contract = intentOut.contract as GoalContract;
  const dbPath = opts.state_db_path ?? defaultStateDbPath(execWorkspace);
  const db = new StateDb(dbPath);

  let adapter_result: NormalizedAdapterResult | undefined;

  try {
    // 2) Adapter invoke (or honest BLOCKED / offline marker for validator proof)
    if (opts.task.offline_apply_marker) {
      const markerDir = join(execWorkspace, ".evolveloop", "circuit-markers");
      mkdirSync(markerDir, { recursive: true });
      const markerPath = join(markerDir, opts.task.marker_name);
      const content = opts.task.marker_content ?? opts.task.task_id;
      // Apply marker via ExecutionRunner + node — labeled offline fixture, not agent success.
      const apply = await runner.run({
        argv: [
          "node",
          "-e",
          "require('fs').mkdirSync(require('path').dirname(process.argv[1]),{recursive:true});require('fs').writeFileSync(process.argv[1], process.argv[2]);",
          markerPath,
          content,
        ],
        cwd: execWorkspace,
        workspace_root: execWorkspace,
        timeout_ms: 5000,
      });
      adapter_result = {
        kind: "NormalizedAdapterResult",
        adapter_id: "offline-fixture",
        status: apply.status === "ok" ? "ok" : "failed",
        code: apply.code,
        message: "offline_marker_applied_via_ExecutionRunner_not_agent",
        exit_code: apply.exit_code,
        stdout: apply.stdout,
        stderr: apply.stderr,
        duration_ms: apply.duration_ms,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: [
          "offline_apply_marker — NOT agent TRUE-FULL-PASS attribution",
          "Used only to exercise Validator/Ledger/Runner offline",
        ],
        raw_runner: apply,
      };
    } else if (!opts.task.skip_adapter_invoke) {
      if (!adapterHealth.ok) {
        adapter_result = {
          kind: "NormalizedAdapterResult",
          adapter_id: adapter.adapter_id,
          status: "blocked",
          code: adapterHealth.code,
          message: adapterHealth.message,
          exit_code: null,
          stdout: "",
          stderr: adapterHealth.message,
          duration_ms: 0,
          tokens_in: null,
          tokens_out: null,
          cost_usd: null,
          cost_provenance: "UNAVAILABLE",
          limitations: adapterHealth.limitations,
        };
      } else {
        const markerRel = `.evolveloop/circuit-markers/${opts.task.marker_name}`;
        const markerBody = opts.task.marker_content ?? opts.task.task_id;
        const prompt = [
          `CRITICAL: your ONLY job is to create ONE file and stop.`,
          `Task ${opts.task.task_id}: ${opts.task.intent}`,
          `Write file ${markerRel} with EXACT content (no quotes, no markdown fence):`,
          markerBody,
          `Do not explore the repository. Do not read unrelated files. Do not run tests or builds.`,
          `Do not modify tests, package.json, build scripts, or any other path.`,
          `When the file exists with the exact content, finish immediately.`,
        ].join("\n");
        adapter_result = await adapter.invoke({
          work_id,
          task_id: opts.task.task_id,
          prompt,
          workspace_path: execWorkspace,
          // cursor-agent print+force cold path is ~70–90s locally; keep headroom for large worktrees
          timeout_ms: opts.task.adapter_timeout_ms ?? 300_000,
          force_tools: true,
        });
      }
    }

    // Record adapter/model ledger row
    const tlAdapter = db.recordTokenLedger({
      work_id,
      task_id: opts.task.task_id,
      goal_contract_id: contract.goal_contract_id,
      provider_id: model_health.local.ok
        ? "ollama"
        : model_health.remote.ok
          ? "openrouter"
          : "none",
      adapter_id: adapter_result?.adapter_id ?? adapter.adapter_id,
      model: model_health.local.model ?? model_health.remote.model,
      tokens_in: adapter_result?.tokens_in ?? null,
      tokens_out: adapter_result?.tokens_out ?? null,
      latency_ms: adapter_result?.duration_ms ?? null,
      cost_usd: adapter_result?.cost_usd ?? null,
      cost_provenance: adapter_result?.cost_provenance ?? "UNAVAILABLE",
      status: adapter_result?.status ?? "skipped",
      payload: {
        adapter_health: adapterHealth,
        model_health,
        adapter_code: adapter_result?.code,
      },
    });

    // If adapter blocked/failed and no offline marker → circuit BLOCKED before validator claims pass
    if (
      adapter_result &&
      adapter_result.adapter_id !== "offline-fixture" &&
      adapter_result.status !== "ok"
    ) {
      db.recordCircuitRun({
        run_id,
        work_id,
        task_id: opts.task.task_id,
        goal_contract_id: contract.goal_contract_id,
        status: "BLOCKED",
        reason: `adapter:${adapter_result.code}`,
        workspace_path: execWorkspace,
        payload: { adapter_result, model_health },
      });
      return {
        kind: "CircuitRunResult",
        run_id,
        work_id,
        task_id: opts.task.task_id,
        status: "BLOCKED",
        reason: `adapter:${adapter_result.code}:${adapter_result.message}`,
        goal_contract_id: contract.goal_contract_id,
        workspace_path: execWorkspace,
        model_health,
        adapter_health_ok: adapterHealth.ok,
        adapter_result,
        token_ledger_entry_id: tlAdapter.entry_id,
        limitations,
      };
    }

    // 3) Evidence Validator outside agent session
    const markerPath = join(
      execWorkspace,
      ".evolveloop",
      "circuit-markers",
      opts.task.marker_name,
    );
    const lightweight =
      opts.lightweight_validator !== false
        ? [
            {
              id: "marker-exists",
              argv: ["bash", "-lc", `test -f '${markerPath.replace(/'/g, `'\\''`)}'`],
              cwd: execWorkspace,
            },
            {
              id: "marker-content",
              argv: [
                "bash",
                "-lc",
                `test "$(cat '${markerPath.replace(/'/g, `'\\''`)}')" = '${(opts.task.marker_content ?? opts.task.task_id).replace(/'/g, `'\\''`)}'`,
              ],
              cwd: execWorkspace,
            },
          ]
        : undefined;

    const validator = await runEvidenceValidator({
      workspace_root: execWorkspace,
      goal_contract: contract,
      runner,
      commands: opts.task.validator_commands ?? lightweight,
      authorized_sensitive_paths: opts.task.authorized_sensitive_paths,
      // Offline fixtures may dirty worktree with marker only under .evolveloop/
      skip_diff_gate: opts.task.offline_apply_marker === true,
      timeout_ms: 120_000,
    });

    // Offline fixture path: do NOT emit TRUE_FULL_PASS as agent success — label distinctly
    let status: CircuitRunResult["status"] = validator.status;
    let reason = validator.code;
    if (opts.task.offline_apply_marker && validator.status === "TRUE_FULL_PASS") {
      // Honest: validator+ledger+runner exercised; agent did not produce the change.
      status = "TRUE_FULL_PASS";
      reason = "TRUE_FULL_PASS_VALIDATOR_OFFLINE_FIXTURE";
      limitations.push(
        "Marker applied by offline fixture via ExecutionRunner — not Cursor/Claude agent",
      );
    }

    db.recordTokenLedger({
      work_id,
      task_id: opts.task.task_id,
      goal_contract_id: contract.goal_contract_id,
      provider_id: "evidence-validator",
      adapter_id: adapter.adapter_id,
      cost_provenance: "UNAVAILABLE",
      status: validator.status,
      latency_ms: validator.command_results.reduce((a, c) => a + c.duration_ms, 0),
      payload: { validator },
    });

    db.recordCircuitRun({
      run_id,
      work_id,
      task_id: opts.task.task_id,
      goal_contract_id: contract.goal_contract_id,
      status,
      reason,
      workspace_path: execWorkspace,
      payload: { adapter_result, validator, model_health },
    });

    return {
      kind: "CircuitRunResult",
      run_id,
      work_id,
      task_id: opts.task.task_id,
      status,
      reason,
      goal_contract_id: contract.goal_contract_id,
      workspace_path: execWorkspace,
      model_health,
      adapter_health_ok: adapterHealth.ok,
      adapter_result,
      validator,
      token_ledger_entry_id: tlAdapter.entry_id,
      limitations,
    };
  } finally {
    db.close();
  }
}

export function defaultFireTasks(adapter_timeout_ms = 300_000): CircuitTaskSpec[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    task_id: `fire-${n}`,
    intent: `Criar marcador de circuito V0 task fire-${n} em .evolveloop/circuit-markers/fire-${n}.txt`,
    marker_name: `fire-${n}.txt`,
    marker_content: `fire-${n}`,
    adapter_timeout_ms,
  }));
}

export async function runFireFive(opts: {
  workspace: string;
  state_db_path?: string;
  worktree_base?: string;
  use_offline_fixture?: boolean;
  lightweight_validator?: boolean;
  adapter_timeout_ms?: number;
}): Promise<CircuitRunResult[]> {
  const tasks = defaultFireTasks(opts.adapter_timeout_ms ?? 300_000);
  const results: CircuitRunResult[] = [];
  const work_id = `work-fire5-${Date.now()}`;
  for (const task of tasks) {
    const worktree_path = opts.worktree_base
      ? join(opts.worktree_base, task.task_id)
      : undefined;
    const result = await runV0Circuit({
      workspace: opts.workspace,
      task: {
        ...task,
        offline_apply_marker: opts.use_offline_fixture === true,
      },
      work_id,
      state_db_path: opts.state_db_path,
      worktree_path,
      lightweight_validator: opts.lightweight_validator !== false,
      confirm_mso: true,
    });
    results.push(result);
    // Persist summary line for operators
    const summaryDir = join(opts.workspace, ".evolveloop", "circuit-runs");
    mkdirSync(summaryDir, { recursive: true });
    writeFileSync(
      join(summaryDir, `${result.run_id}.json`),
      JSON.stringify(result, null, 2),
      "utf-8",
    );
  }
  return results;
}

export { CursorCircuitAdapter };
