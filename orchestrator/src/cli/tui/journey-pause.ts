/**
 * V4.3 P0-1 — Journey Task pause persisted in StateDb (same axis as TUI + evolve pause|resume).
 * ≠ workflow pause (ops). Resume is idempotent.
 *
 * Audit fix (M2): after StateDb write, attempt real SIGSTOP/SIGCONT/cancel on owned
 * ProcessSessions. Persistence never claims OS pause when signals failed.
 */

import { resolve } from "node:path";
import { StateDb, defaultStateDbPath } from "../../v3/state-db/store.js";
import {
  cancelOwnedRuns,
  pauseOwnedRuns,
  resumeOwnedRuns,
  type RunControlResult,
} from "../../v3/lifecycle/run-controls.js";

export const JOURNEY_PAUSE_META_KEY = "journey_task_pause";

export type JourneyPauseSource = "tui" | "cli" | "slash" | "test";

export interface JourneyPauseState {
  paused: boolean;
  paused_at?: string;
  resumed_at?: string;
  source?: JourneyPauseSource;
  workspace: string;
  /** Explicit: this is Task/jornada pause, not workflow pause. */
  axis: "journey_task";
  /** Real OS control outcome when attempted (may be absent for read-only). */
  run_control?: RunControlResult;
  /** Honest: StateDb flag set, but no live owned process was stopped. */
  os_pause_applied?: boolean;
}

const AXIS = "journey_task" as const;

function parseState(
  workspace: string,
  raw: string | undefined,
): JourneyPauseState {
  if (!raw?.trim()) {
    return { paused: false, workspace, axis: AXIS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<JourneyPauseState>;
    return {
      paused: Boolean(parsed.paused),
      paused_at: parsed.paused_at,
      resumed_at: parsed.resumed_at,
      source: parsed.source,
      workspace,
      axis: AXIS,
    };
  } catch {
    return { paused: false, workspace, axis: AXIS };
  }
}

/** Read from an open StateDb (preferred inside intent/trivial path). */
export function getJourneyPauseOnDb(
  db: StateDb,
  workspaceRoot: string,
): JourneyPauseState {
  const workspace = resolve(workspaceRoot);
  return parseState(workspace, db.getMeta(JOURNEY_PAUSE_META_KEY));
}

export function pauseJourneyTaskOnDb(
  db: StateDb,
  workspaceRoot: string,
  source: JourneyPauseSource = "cli",
): JourneyPauseState {
  const workspace = resolve(workspaceRoot);
  const run_control = pauseOwnedRuns({ workspace });
  const prev = parseState(workspace, db.getMeta(JOURNEY_PAUSE_META_KEY));
  const os_pause_applied = run_control.ok;
  const next: JourneyPauseState = {
    paused: true,
    paused_at: prev.paused ? prev.paused_at : new Date().toISOString(),
    resumed_at: undefined,
    source,
    workspace,
    axis: AXIS,
    run_control,
    os_pause_applied,
  };
  // Persist without nesting full run_control blob twice — keep summary flags.
  db.setMeta(
    JOURNEY_PAUSE_META_KEY,
    JSON.stringify({
      paused: next.paused,
      paused_at: next.paused_at,
      source: next.source,
      workspace: next.workspace,
      axis: next.axis,
      os_pause_applied: next.os_pause_applied,
      run_control_ok: run_control.ok,
      run_control_no_live: run_control.no_live_targets,
      run_control_message: run_control.message_pt,
    }),
  );
  return next;
}

export function resumeJourneyTaskOnDb(
  db: StateDb,
  workspaceRoot: string,
  source: JourneyPauseSource = "cli",
): JourneyPauseState {
  const workspace = resolve(workspaceRoot);
  const run_control = resumeOwnedRuns({ workspace });
  const prev = parseState(workspace, db.getMeta(JOURNEY_PAUSE_META_KEY));
  const next: JourneyPauseState = {
    paused: false,
    paused_at: prev.paused_at,
    resumed_at: prev.paused ? new Date().toISOString() : prev.resumed_at,
    source,
    workspace,
    axis: AXIS,
    run_control,
    os_pause_applied: false,
  };
  db.setMeta(
    JOURNEY_PAUSE_META_KEY,
    JSON.stringify({
      paused: next.paused,
      paused_at: next.paused_at,
      resumed_at: next.resumed_at,
      source: next.source,
      workspace: next.workspace,
      axis: next.axis,
      os_pause_applied: false,
      run_control_ok: run_control.ok,
      run_control_no_live: run_control.no_live_targets,
      run_control_message: run_control.message_pt,
    }),
  );
  return next;
}

function withDb<T>(workspaceRoot: string, fn: (db: StateDb) => T): T {
  const db = new StateDb(defaultStateDbPath(resolve(workspaceRoot)));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Read persisted journey pause (false when absent / corrupt). */
export function getJourneyPause(workspaceRoot: string): JourneyPauseState {
  return withDb(workspaceRoot, (db) => getJourneyPauseOnDb(db, workspaceRoot));
}

/** Persist pause. Idempotent when already paused (keeps original paused_at). */
export function pauseJourneyTask(
  workspaceRoot: string,
  source: JourneyPauseSource = "cli",
): JourneyPauseState {
  return withDb(workspaceRoot, (db) =>
    pauseJourneyTaskOnDb(db, workspaceRoot, source),
  );
}

/** Clear pause. Idempotent when already active. */
export function resumeJourneyTask(
  workspaceRoot: string,
  source: JourneyPauseSource = "cli",
): JourneyPauseState {
  return withDb(workspaceRoot, (db) =>
    resumeJourneyTaskOnDb(db, workspaceRoot, source),
  );
}

/**
 * Clear pause flag on cancel (destructive) + cancel owned processes.
 * Does NOT SIGCONT — cancel path must not revive targets.
 */
export function clearJourneyPauseOnCancel(
  workspaceRoot: string,
  source: JourneyPauseSource = "tui",
): JourneyPauseState {
  const workspace = resolve(workspaceRoot);
  const run_control = cancelOwnedRuns({ workspace });
  return withDb(workspace, (db) => {
    const prev = parseState(workspace, db.getMeta(JOURNEY_PAUSE_META_KEY));
    const next: JourneyPauseState = {
      paused: false,
      paused_at: prev.paused_at,
      resumed_at: new Date().toISOString(),
      source,
      workspace,
      axis: AXIS,
      run_control,
      os_pause_applied: false,
    };
    db.setMeta(
      JOURNEY_PAUSE_META_KEY,
      JSON.stringify({
        paused: false,
        paused_at: next.paused_at,
        resumed_at: next.resumed_at,
        source: next.source,
        workspace: next.workspace,
        axis: next.axis,
        os_pause_applied: false,
        run_control_ok: run_control.ok,
        run_control_no_live: run_control.no_live_targets,
        run_control_message: run_control.message_pt,
        cancelled: true,
      }),
    );
    return next;
  });
}

/** Explicit cancel of owned runs without requiring a prior pause flag. */
export function cancelJourneyTask(
  workspaceRoot: string,
  _source: JourneyPauseSource = "tui",
): RunControlResult {
  return cancelOwnedRuns({ workspace: resolve(workspaceRoot) });
}

/** Honest operator-facing line after pause/resume/cancel attempt. */
export function formatJourneyRunControlMessage(state: JourneyPauseState): string {
  const rc = state.run_control;
  if (!rc) {
    return state.paused
      ? "Task em pausa (jornada StateDb)."
      : "Task ativa (sem run_control).";
  }
  if (rc.action === "pause") {
    if (rc.ok && state.os_pause_applied) {
      return `${rc.message_pt} (StateDb paused=true).`;
    }
    if (rc.no_live_targets) {
      return `LIMITATION: pausa de jornada gravada sem processo owned vivo (StateDb only). ${rc.message_pt}`;
    }
    return `LIMITATION: pause OS incompleto — não declarar SIGSTOP. ${rc.message_pt}${
      rc.limitations.length ? ` [${rc.limitations.join("; ")}]` : ""
    }`;
  }
  if (rc.action === "resume") {
    if (rc.ok || rc.no_live_targets) {
      return `${rc.message_pt} (StateDb paused=false).`;
    }
    return `LIMITATION: resume OS incompleto. ${rc.message_pt}`;
  }
  if (rc.ok) return rc.message_pt;
  if (rc.no_live_targets) return rc.message_pt;
  return `LIMITATION: cancel incompleto. ${rc.message_pt}`;
}
