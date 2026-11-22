/**
 * V5-M07 — Shared Work state bridge for CLI + TUI.
 * Both surfaces must read the same PersistentWorkRuntime projection.
 */

import { resolve } from "node:path";
import {
  PersistentWorkRuntime,
  type Work,
  type WorkListItem,
  type WorkStatusSummary,
} from "../work-runtime/index.js";

export interface WorkStateBridgeOpts {
  workspaceRoot: string;
  dataDir?: string;
  stateDbPath?: string;
}

export interface WorkStateSnapshot {
  kind: "WorkStateSnapshot";
  workspace_root: string;
  source: "PersistentWorkRuntime";
  summary: WorkStatusSummary;
  /** Present when a specific work_id was requested. */
  work?: Work;
  list: WorkListItem[];
}

/**
 * Open a short-lived runtime, read shared Work projections, then close.
 * Safe for CLI handlers and TUI view-models (no Ink dependency).
 */
export function readSharedWorkState(
  opts: WorkStateBridgeOpts & { workId?: string },
): WorkStateSnapshot {
  const workspaceRoot = resolve(opts.workspaceRoot);
  const rt = new PersistentWorkRuntime({
    workspaceRoot,
    dataDir: opts.dataDir,
    stateDbPath: opts.stateDbPath,
  });
  try {
    const summary = rt.statusSummary(opts.workId);
    const list = opts.workId
      ? summary.works
      : rt.listWorks();
    const work = opts.workId ? rt.read(opts.workId) : undefined;
    return {
      kind: "WorkStateSnapshot",
      workspace_root: workspaceRoot,
      source: "PersistentWorkRuntime",
      summary,
      work,
      list,
    };
  } finally {
    rt.close();
  }
}

/** Convenience for TUI footer / status panels — same source as `evolve work status`. */
export function workStatusForTui(
  workspaceRoot: string,
  workId?: string,
): WorkStatusSummary {
  return readSharedWorkState({ workspaceRoot, workId }).summary;
}
