/**
 * Real OS lifecycle controls for owned ProcessSessions belonging to a Task/Work.
 * Journey pause/resume/cancel MUST go through identity-fenced signals — never bare PID.
 */

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  ProcessSessionStore,
  type ProcessSessionRecord,
} from "../adapters/drivers/process-sessions.js";
import { defaultWorkspaceV3DataDir } from "../agent-handles/list-view.js";
import { resolveV3DataPaths } from "../paths.js";
import { StateDb, defaultStateDbPath } from "../state-db/store.js";
import { isProcessLive, isProcessStopped } from "../sandbox/process-supervisor.js";

export type RunControlAction = "pause" | "resume" | "cancel";

export interface RunControlSessionResult {
  session_id: string;
  work_id: string;
  task_id?: string;
  agent_id?: string;
  pid?: number;
  previous_status: string;
  status: string;
  ok: boolean;
  reason: string;
  operational_stopped?: boolean;
}

export interface RunControlResult {
  kind: "RunControlResult";
  action: RunControlAction;
  workspace: string;
  work_id?: string;
  sessions: RunControlSessionResult[];
  /** True when at least one owned live session was controlled successfully. */
  ok: boolean;
  /** True when no owned live process existed — persistence-only journey flag is honest. */
  no_live_targets: boolean;
  message_pt: string;
  limitations: string[];
}

function processSessionsDir(workspace: string, dataDir?: string): string {
  const root = dataDir ?? defaultWorkspaceV3DataDir(workspace);
  return resolveV3DataPaths(root).processSessionsDir;
}

function resolveActiveWorkId(workspace: string, workId?: string): string | undefined {
  if (workId?.trim()) return workId.trim();
  try {
    const db = new StateDb(defaultStateDbPath(resolve(workspace)));
    try {
      const sessions = db.listMsoSessionsForWorkspace(resolve(workspace), 5);
      for (const s of sessions) {
        if (s.work_id) return s.work_id;
      }
      return db.listValidatedGoalContracts()[0]?.work_id;
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

function listWorkIdsInStore(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

function ownedLive(
  sessions: ProcessSessionRecord[],
  opts?: { task_id?: string },
): ProcessSessionRecord[] {
  return sessions.filter((s) => {
    if (s.status !== "running" && s.status !== "paused") return false;
    if (opts?.task_id && s.task_id && s.task_id !== opts.task_id) return false;
    return true;
  });
}

function summarize(
  action: RunControlAction,
  workspace: string,
  work_id: string | undefined,
  results: RunControlSessionResult[],
  limitations: string[],
): RunControlResult {
  const liveAttempted = results.length > 0;
  const ok = liveAttempted
    ? results.some((r) => r.ok)
    : false;
  const no_live_targets = !liveAttempted;
  let message_pt: string;
  if (no_live_targets) {
    message_pt =
      action === "pause"
        ? "Pause de jornada registado — nenhum processo owned vivo para SIGSTOP."
        : action === "resume"
          ? "Resume de jornada registado — nenhum processo owned pausado/vivo."
          : "Cancel de jornada — nenhum processo owned vivo para encerrar.";
  } else if (ok) {
    const n = results.filter((r) => r.ok).length;
    message_pt =
      action === "pause"
        ? `Pause operacional: ${n} sessão(ões) SIGSTOP com identidade verificada.`
        : action === "resume"
          ? `Resume operacional: ${n} sessão(ões) SIGCONT.`
          : `Cancel operacional: ${n} sessão(ões) encerrada(s).`;
  } else {
    message_pt = `${action} não concluído — nenhum sinal aplicado com identidade verificada.`;
  }
  return {
    kind: "RunControlResult",
    action,
    workspace: resolve(workspace),
    work_id,
    sessions: results,
    ok: no_live_targets ? false : ok,
    no_live_targets,
    message_pt,
    limitations,
  };
}

export interface RunControlOpts {
  workspace: string;
  work_id?: string;
  task_id?: string;
  /** Override process-sessions directory (tests). */
  process_sessions_dir?: string;
  data_dir?: string;
}

/**
 * Pause all owned running sessions for the active work (SIGSTOP + fence).
 */
export function pauseOwnedRuns(opts: RunControlOpts): RunControlResult {
  const workspace = resolve(opts.workspace);
  const dir = opts.process_sessions_dir ?? processSessionsDir(workspace, opts.data_dir);
  const store = new ProcessSessionStore(dir);
  const limitations: string[] = [];
  const work_id = resolveActiveWorkId(workspace, opts.work_id);
  const workIds = work_id ? [work_id] : listWorkIdsInStore(dir);
  if (!work_id && workIds.length === 0) {
    limitations.push("no_work_id_and_empty_store");
  }
  const results: RunControlSessionResult[] = [];
  for (const wid of workIds) {
    const live = ownedLive(store.reconcile(wid), { task_id: opts.task_id }).filter(
      (s) => s.status === "running",
    );
    for (const s of live) {
      const prev = s.status;
      try {
        const next = store.pause(wid, s.session_id);
        const identity =
          next.pid != null && next.starttime
            ? {
                pid: next.pid,
                pgid: next.pgid ?? next.pid,
                starttime: next.starttime,
                cmdline: next.command.join(" "),
              }
            : undefined;
        const stopped = identity ? isProcessStopped(identity) : false;
        // Success only with verified operational stop — never soft-claim on signal alone.
        const ok = next.status === "paused" && stopped;
        if (!ok) {
          const lim = next.limitations.filter((l) => l.includes("LIMITATION"));
          if (lim.length) limitations.push(...lim.map((l) => `${next.session_id}:${l}`));
          else limitations.push(`${next.session_id}:pause_incomplete`);
        }
        results.push({
          session_id: next.session_id,
          work_id: wid,
          task_id: next.task_id,
          agent_id: next.agent_id,
          pid: next.pid,
          previous_status: prev,
          status: next.status,
          ok,
          reason: ok
            ? "sigstop_applied_and_stopped"
            : stopped
              ? "paused_flag_missing"
              : "LIMITATION_pause_not_operational",
          operational_stopped: stopped,
        });
      } catch (err) {
        results.push({
          session_id: s.session_id,
          work_id: wid,
          previous_status: prev,
          status: s.status,
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return summarize("pause", workspace, work_id ?? workIds[0], results, limitations);
}

/**
 * Resume owned paused sessions (SIGCONT). Idempotent for already-running.
 */
export function resumeOwnedRuns(opts: RunControlOpts): RunControlResult {
  const workspace = resolve(opts.workspace);
  const dir = opts.process_sessions_dir ?? processSessionsDir(workspace, opts.data_dir);
  const store = new ProcessSessionStore(dir);
  const limitations: string[] = [];
  const work_id = resolveActiveWorkId(workspace, opts.work_id);
  const workIds = work_id ? [work_id] : listWorkIdsInStore(dir);
  const results: RunControlSessionResult[] = [];
  for (const wid of workIds) {
    const targets = ownedLive(store.reconcile(wid), { task_id: opts.task_id }).filter(
      (s) => s.status === "paused",
    );
    for (const s of targets) {
      const prev = s.status;
      try {
        const next = store.resume(wid, s.session_id);
        const identity =
          next.pid != null && next.starttime
            ? {
                pid: next.pid,
                pgid: next.pgid ?? next.pid,
                starttime: next.starttime,
                cmdline: next.command.join(" "),
              }
            : undefined;
        const stillStopped = identity ? isProcessStopped(identity) : false;
        const ok = next.status === "running" && !stillStopped;
        if (!ok) {
          limitations.push(
            `${next.session_id}:${stillStopped ? "LIMITATION_still_stopped" : "resume_incomplete"}`,
          );
        }
        results.push({
          session_id: next.session_id,
          work_id: wid,
          task_id: next.task_id,
          agent_id: next.agent_id,
          pid: next.pid,
          previous_status: prev,
          status: next.status,
          ok,
          reason: ok
            ? "sigcont_applied"
            : next.limitations.some((l) => l.includes("pid_reuse"))
              ? "LIMITATION_pid_reuse_or_gone"
              : "resume_incomplete",
          operational_stopped: stillStopped,
        });
      } catch (err) {
        results.push({
          session_id: s.session_id,
          work_id: wid,
          previous_status: prev,
          status: s.status,
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return summarize("resume", workspace, work_id ?? workIds[0], results, limitations);
}

/**
 * Cancel owned running/paused sessions (SIGTERM→SIGKILL with fence).
 */
export function cancelOwnedRuns(opts: RunControlOpts): RunControlResult {
  const workspace = resolve(opts.workspace);
  const dir = opts.process_sessions_dir ?? processSessionsDir(workspace, opts.data_dir);
  const store = new ProcessSessionStore(dir);
  const limitations: string[] = [];
  const work_id = resolveActiveWorkId(workspace, opts.work_id);
  const workIds = work_id ? [work_id] : listWorkIdsInStore(dir);
  const results: RunControlSessionResult[] = [];
  for (const wid of workIds) {
    const targets = ownedLive(store.reconcile(wid), { task_id: opts.task_id });
    for (const s of targets) {
      const prev = s.status;
      try {
        const next = store.cancel(wid, s.session_id, { grace_ms: 1_500 });
        const still =
          next.pid != null &&
          !!next.starttime &&
          isProcessLive({
            pid: next.pid,
            pgid: next.pgid ?? next.pid,
            starttime: next.starttime,
            cmdline: "",
          });
        const ok = next.status === "cancelled" && !still;
        if (!ok) {
          limitations.push(
            `${next.session_id}:${still ? "LIMITATION_still_alive" : "cancel_incomplete"}`,
          );
        }
        results.push({
          session_id: next.session_id,
          work_id: wid,
          task_id: next.task_id,
          agent_id: next.agent_id,
          pid: next.pid,
          previous_status: prev,
          status: next.status,
          ok,
          reason: still
            ? "LIMITATION_cancel_still_alive"
            : ok
              ? "cancelled_confirmed_dead"
              : "cancel_incomplete",
        });
      } catch (err) {
        results.push({
          session_id: s.session_id,
          work_id: wid,
          previous_status: prev,
          status: s.status,
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return summarize("cancel", workspace, work_id ?? workIds[0], results, limitations);
}

/** Register a circuit/harness spawn into ProcessSessionStore (identity fenced). */
export function registerOwnedProcessSession(input: {
  workspace: string;
  work_id: string;
  task_id: string;
  session_id: string;
  adapter_id: ProcessSessionRecord["adapter_id"];
  agent_id?: string;
  pid: number;
  command: string[];
  prompt_path?: string;
  data_dir?: string;
  mux_backend?: ProcessSessionRecord["mux_backend"];
  mux_session?: string;
  limitations?: string[];
}): ProcessSessionRecord {
  const workspace = resolve(input.workspace);
  const dir = processSessionsDir(workspace, input.data_dir);
  const store = new ProcessSessionStore(dir);
  let rec: ProcessSessionRecord = {
    kind: "ProcessSessionRecord",
    session_id: input.session_id,
    work_id: input.work_id,
    task_id: input.task_id,
    adapter_id: input.adapter_id,
    agent_id: input.agent_id,
    status: "running",
    started_at: new Date().toISOString(),
    command: input.command,
    prompt_path: input.prompt_path,
    limitations: input.limitations ?? ["registered_via_run_controls"],
    mux_backend: input.mux_backend,
    mux_session: input.mux_session,
  };
  store.upsert(rec);
  rec = store.attachIdentity(rec, input.pid);
  return rec;
}
