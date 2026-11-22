/**
 * V4.3 P0-1 — Journey Task pause persisted in StateDb (same axis as TUI + evolve pause|resume).
 * ≠ workflow pause (ops). Resume is idempotent.
 */

import { resolve } from "node:path";
import { StateDb, defaultStateDbPath } from "../../v3/state-db/store.js";

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
  const prev = parseState(workspace, db.getMeta(JOURNEY_PAUSE_META_KEY));
  const next: JourneyPauseState = {
    paused: true,
    paused_at: prev.paused ? prev.paused_at : new Date().toISOString(),
    resumed_at: undefined,
    source,
    workspace,
    axis: AXIS,
  };
  db.setMeta(JOURNEY_PAUSE_META_KEY, JSON.stringify(next));
  return next;
}

export function resumeJourneyTaskOnDb(
  db: StateDb,
  workspaceRoot: string,
  source: JourneyPauseSource = "cli",
): JourneyPauseState {
  const workspace = resolve(workspaceRoot);
  const prev = parseState(workspace, db.getMeta(JOURNEY_PAUSE_META_KEY));
  const next: JourneyPauseState = {
    paused: false,
    paused_at: prev.paused_at,
    resumed_at: prev.paused ? new Date().toISOString() : prev.resumed_at,
    source,
    workspace,
    axis: AXIS,
  };
  db.setMeta(JOURNEY_PAUSE_META_KEY, JSON.stringify(next));
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

/** Clear pause flag on cancel (destructive journey reset). */
export function clearJourneyPauseOnCancel(
  workspaceRoot: string,
  source: JourneyPauseSource = "tui",
): JourneyPauseState {
  return resumeJourneyTask(workspaceRoot, source);
}
