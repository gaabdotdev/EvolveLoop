/**
 * V0-ORCH-04 — topological sequential (or strictly disjoint) TaskGraph execution
 * in a dedicated git worktree per task. Integrates circuit breaker + inbox (06/07).
 */

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { StateDb } from "../state-db/store.js";
import { defaultExecutionRunner } from "../execution-runner/index.js";
import { MsoError } from "./errors.js";
import {
  canAttempt,
  classifyFailure,
  createCircuitBreaker,
  applyCircuitFailure,
  type CircuitBreakerState,
  type ClassifiableFailure,
  type FailureBucket,
  CIRCUIT_BREAKER_MAX_ATTEMPTS,
} from "./failure.js";
import { assertStrictlyDisjoint, topologicalOrder, type TopoTask } from "./topo.js";
import { mayAutoRetryTask } from "./task-states.js";

export type ExecutionMode = "sequential" | "disjoint";

export interface ExecutableTask extends TopoTask {
  /** Optional seed payload persisted on the node. */
  payload?: Record<string, unknown>;
}

export interface TaskRunContext {
  work_id: string;
  task_id: string;
  worktree_path: string;
  attempt: number;
  receiveInbox: (kind: string, body?: Record<string, unknown>) => void;
}

export interface TaskRunResult {
  ok: boolean;
  failure?: ClassifiableFailure;
  pgid?: number;
  payload?: Record<string, unknown>;
}

export interface TaskExecutionRecord {
  task_id: string;
  worktree_path: string;
  state: string;
  attempts: number;
  circuit_open: boolean;
  last_bucket?: FailureBucket;
}

export interface TaskGraphExecutionReport {
  kind: "TaskGraphExecutionReport";
  work_id: string;
  mode: ExecutionMode;
  order: string[];
  tasks: TaskExecutionRecord[];
  inbox_received: number;
}

/** Git via ExecutionRunner (V0-SEC-01) — same path/env scrub/gate pipeline. */
function git(
  cwd: string,
  args: string[],
  workspace_root?: string,
): { ok: boolean; stdout: string; stderr: string } {
  const r = defaultExecutionRunner.runSync({
    argv: ["git", ...args],
    cwd,
    workspace_root: workspace_root ?? cwd,
    timeout_ms: 120_000,
  });
  return {
    ok: r.status === "ok" && r.exit_code === 0,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

export function ensureTaskWorktree(input: {
  repo_root: string;
  worktrees_base: string;
  work_id: string;
  task_id: string;
}): { path: string; branch: string } {
  const check = git(input.repo_root, ["rev-parse", "--is-inside-work-tree"]);
  if (!check.ok || check.stdout.trim() !== "true") {
    throw new MsoError("NOT_GIT_REPO", `repo_root is not a git worktree: ${input.repo_root}`);
  }
  const branch = `evolveloop/${input.work_id}/${input.task_id}`;
  const path = resolve(input.worktrees_base, input.work_id, input.task_id);
  mkdirSync(resolve(input.worktrees_base, input.work_id), { recursive: true });

  if (existsSync(path)) {
    const inside = git(path, ["rev-parse", "--is-inside-work-tree"]);
    if (inside.ok) return { path, branch };
  }

  const add = git(input.repo_root, ["worktree", "add", "-b", branch, path, "HEAD"]);
  if (!add.ok) {
    // Branch may already exist from a previous run — reuse with detach.
    const add2 = git(input.repo_root, ["worktree", "add", "--detach", path, "HEAD"]);
    if (!add2.ok) {
      throw new MsoError(
        "WORKTREE_ADD_FAILED",
        (add2.stderr || add.stderr || "worktree add failed").trim(),
      );
    }
  }
  return { path, branch };
}

export async function executeTaskGraph(input: {
  db: StateDb;
  workspace_id: string;
  session_id?: string;
  work_id: string;
  repo_root: string;
  worktrees_base?: string;
  tasks: ExecutableTask[];
  mode?: ExecutionMode;
  runTask: (ctx: TaskRunContext) => Promise<TaskRunResult>;
}): Promise<TaskGraphExecutionReport> {
  const mode: ExecutionMode = input.mode ?? "sequential";
  if (mode === "disjoint") {
    assertStrictlyDisjoint(input.tasks);
  }

  const order = topologicalOrder(input.tasks);
  const byId = new Map(input.tasks.map((t) => [t.task_id, t]));
  const worktrees_base = input.worktrees_base ?? join(input.repo_root, ".evolveloop", "worktrees");
  const circuits = new Map<string, CircuitBreakerState>();
  const records: TaskExecutionRecord[] = [];
  let inbox_received = 0;

  const receiveInbox = (kind: string, body?: Record<string, unknown>) => {
    input.db.appendInboxMessage({
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      kind,
      body: { ...(body ?? {}), work_id: input.work_id, during_execution: true },
    });
    inbox_received += 1;
  };

  // Persist initial graph (never overwrite UNKNOWN / CIRCUIT_OPEN with PENDING)
  for (const t of input.tasks) {
    const existing = input.db.listTaskGraphNodes(input.work_id).find((n) => n.task_id === t.task_id);
    if (!existing) {
      input.db.upsertTaskGraphNode({
        work_id: input.work_id,
        task_id: t.task_id,
        state: "PENDING",
        payload: {
          depends_on: t.depends_on ?? [],
          touch_paths: t.touch_paths ?? [],
          ...(t.payload ?? {}),
        },
      });
    }
    const attempts = Number(existing?.payload.attempts ?? 0);
    const circuit = createCircuitBreaker(t.task_id);
    circuit.attempts = Math.min(attempts, CIRCUIT_BREAKER_MAX_ATTEMPTS);
    circuit.open = existing?.state === "CIRCUIT_OPEN" || circuit.attempts >= CIRCUIT_BREAKER_MAX_ATTEMPTS;
    circuits.set(t.task_id, circuit);
  }

  for (const taskId of order) {
    const node = input.db.listTaskGraphNodes(input.work_id).find((n) => n.task_id === taskId)!;
    // V0-ORCH-05: UNKNOWN (and CIRCUIT_OPEN) must never be blindly retried.
    if (!mayAutoRetryTask(node.state)) {
      records.push({
        task_id: taskId,
        worktree_path: String(node.payload.worktree_path ?? ""),
        state: node.state,
        attempts: Number(node.payload.attempts ?? 0),
        circuit_open: node.state === "CIRCUIT_OPEN",
        last_bucket: node.payload.last_bucket as FailureBucket | undefined,
      });
      continue;
    }

    const deps = byId.get(taskId)?.depends_on ?? [];
    let blocked = false;
    for (const dep of deps) {
      const depNode = input.db.listTaskGraphNodes(input.work_id).find((n) => n.task_id === dep);
      if (!depNode || depNode.state !== "TRUE_PASS") {
        input.db.upsertTaskGraphNode({
          work_id: input.work_id,
          task_id: taskId,
          state: "BLOCKED",
          payload: { ...node.payload, blocked_by: dep, reason: "dependency_not_true_pass" },
        });
        records.push({
          task_id: taskId,
          worktree_path: "",
          state: "BLOCKED",
          attempts: 0,
          circuit_open: false,
        });
        blocked = true;
        break;
      }
    }
    if (blocked) break;

    const wt = ensureTaskWorktree({
      repo_root: input.repo_root,
      worktrees_base,
      work_id: input.work_id,
      task_id: taskId,
    });

    let circuit = circuits.get(taskId)!;
    let finalState = circuit.open ? "CIRCUIT_OPEN" : "FAILED";
    let lastBucket: FailureBucket | undefined = node.payload.last_bucket as FailureBucket | undefined;

    if (circuit.open) {
      input.db.upsertTaskGraphNode({
        work_id: input.work_id,
        task_id: taskId,
        state: "CIRCUIT_OPEN",
        payload: {
          ...node.payload,
          attempts: circuit.attempts,
          max_attempts: CIRCUIT_BREAKER_MAX_ATTEMPTS,
          circuit_open: true,
        },
      });
      records.push({
        task_id: taskId,
        worktree_path: String(node.payload.worktree_path ?? ""),
        state: "CIRCUIT_OPEN",
        attempts: circuit.attempts,
        circuit_open: true,
        last_bucket: lastBucket,
      });
      break;
    }

    while (canAttempt(circuit)) {
      const attempt = circuit.attempts + 1;
      input.db.upsertTaskGraphNode({
        work_id: input.work_id,
        task_id: taskId,
        state: "IN_PROGRESS",
        payload: {
          ...node.payload,
          worktree_path: wt.path,
          worktree_branch: wt.branch,
          attempts: attempt,
          max_attempts: CIRCUIT_BREAKER_MAX_ATTEMPTS,
        },
      });

      const result = await input.runTask({
        work_id: input.work_id,
        task_id: taskId,
        worktree_path: wt.path,
        attempt,
        receiveInbox,
      });

      if (result.ok) {
        finalState = "TRUE_PASS";
        input.db.upsertTaskGraphNode({
          work_id: input.work_id,
          task_id: taskId,
          state: "TRUE_PASS",
          payload: {
            ...node.payload,
            worktree_path: wt.path,
            worktree_branch: wt.branch,
            attempts: attempt,
            pgid: result.pgid,
            ...(result.payload ?? {}),
          },
        });
        break;
      }

      const bucket = classifyFailure(result.failure ?? { message: "task_failed" });
      lastBucket = bucket;
      // V1-GATE-COMPAT: INFRA_QUOTA → cooldown, no task-attempt burn
      circuit = applyCircuitFailure(
        circuit,
        bucket,
        result.failure?.message ?? result.failure?.code,
      );
      circuits.set(taskId, circuit);

      if (circuit.open) {
        finalState = "CIRCUIT_OPEN";
        input.db.upsertTaskGraphNode({
          work_id: input.work_id,
          task_id: taskId,
          state: "CIRCUIT_OPEN",
          payload: {
            ...node.payload,
            worktree_path: wt.path,
            attempts: circuit.attempts,
            max_attempts: CIRCUIT_BREAKER_MAX_ATTEMPTS,
            last_bucket: bucket,
            circuit_open: true,
            pgid: result.pgid,
          },
        });
        break;
      }

      finalState = "FAILED";
      input.db.upsertTaskGraphNode({
        work_id: input.work_id,
        task_id: taskId,
        state: "FAILED",
        payload: {
          ...node.payload,
          worktree_path: wt.path,
          attempts: circuit.attempts,
          last_bucket: bucket,
          cooldown_until_ms: circuit.cooldown_until_ms,
          pgid: result.pgid,
        },
      });
      // INFRA: no burn + cooldown — do not spin retries; caller should fallback.
      if (bucket === "INFRA_QUOTA") break;
    }

    records.push({
      task_id: taskId,
      worktree_path: wt.path,
      state: finalState,
      attempts: circuit.attempts,
      circuit_open: circuit.open,
      last_bucket: lastBucket,
    });

    if (finalState === "CIRCUIT_OPEN" || finalState === "FAILED") {
      // Sequential policy: stop the graph on hard failure (disjoint same for V0).
      break;
    }
  }

  return {
    kind: "TaskGraphExecutionReport",
    work_id: input.work_id,
    mode,
    order,
    tasks: records,
    inbox_received,
  };
}
