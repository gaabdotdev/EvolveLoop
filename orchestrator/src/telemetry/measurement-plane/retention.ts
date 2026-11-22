/**
 * Automatic retention for Measurement Plane local stores.
 * Deletes aged facts/artifacts/reports; never touches Execution Plane state.
 */

import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import type { MeasurementDataPaths } from "./paths.js";
import { MeasurementEventStore } from "./event-store.js";

export interface RetentionPolicy {
  retention_days: number;
  /** Also prune workspaces under measurement/workspaces */
  prune_workspaces?: boolean;
  dry_run?: boolean;
}

export interface RetentionResult {
  policy: RetentionPolicy;
  cutoff_iso: string;
  deleted_runs: string[];
  deleted_artifacts: string[];
  deleted_reports: string[];
  deleted_workspaces: string[];
  skipped: string[];
  bytes_reclaimed_estimate: number;
}

function ageCutoff(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function fileMtime(path: string): Date {
  return statSync(path).mtime;
}

function dirSizeApprox(path: string): number {
  if (!existsSync(path)) return 0;
  let total = 0;
  const st = statSync(path);
  if (st.isFile()) return st.size;
  for (const name of readdirSync(path)) {
    total += dirSizeApprox(join(path, name));
  }
  return total;
}

function runLastOccurredAt(store: MeasurementEventStore, runId: string): Date | null {
  const events = store.load(runId);
  if (!events.length) return null;
  let max = events[0].occurred_at;
  for (const e of events) {
    if (e.occurred_at > max) max = e.occurred_at;
  }
  return new Date(max);
}

export function applyRetention(paths: MeasurementDataPaths, policy: RetentionPolicy): RetentionResult {
  if (!Number.isFinite(policy.retention_days) || policy.retention_days < 0) {
    throw new Error("retention_days must be a non-negative number");
  }
  const cutoff = ageCutoff(policy.retention_days);
  const result: RetentionResult = {
    policy,
    cutoff_iso: cutoff.toISOString(),
    deleted_runs: [],
    deleted_artifacts: [],
    deleted_reports: [],
    deleted_workspaces: [],
    skipped: [],
    bytes_reclaimed_estimate: 0,
  };

  const store = new MeasurementEventStore(paths);
  for (const runId of store.listRunIds()) {
    const eventPath = join(paths.eventsDir, `${runId}.jsonl`);
    const last = runLastOccurredAt(store, runId) ?? fileMtime(eventPath);
    if (last >= cutoff) {
      result.skipped.push(`run:${runId}`);
      continue;
    }
    const size = dirSizeApprox(eventPath);
    if (!policy.dry_run) rmSync(eventPath, { force: true });
    result.deleted_runs.push(runId);
    result.bytes_reclaimed_estimate += size;
  }

  if (existsSync(paths.artifactsDir)) {
    for (const id of readdirSync(paths.artifactsDir)) {
      const dir = join(paths.artifactsDir, id);
      if (!statSync(dir).isDirectory()) continue;
      const metaPath = join(dir, "meta.json");
      const mtime = existsSync(metaPath) ? fileMtime(metaPath) : fileMtime(dir);
      if (mtime >= cutoff) {
        result.skipped.push(`artifact:${id}`);
        continue;
      }
      const size = dirSizeApprox(dir);
      if (!policy.dry_run) rmSync(dir, { recursive: true, force: true });
      result.deleted_artifacts.push(id);
      result.bytes_reclaimed_estimate += size;
    }
  }

  if (existsSync(paths.reportsDir)) {
    for (const name of readdirSync(paths.reportsDir)) {
      const p = join(paths.reportsDir, name);
      if (!statSync(p).isFile()) continue;
      if (fileMtime(p) >= cutoff) {
        result.skipped.push(`report:${name}`);
        continue;
      }
      const size = dirSizeApprox(p);
      if (!policy.dry_run) rmSync(p, { force: true });
      result.deleted_reports.push(name);
      result.bytes_reclaimed_estimate += size;
    }
  }

  const workspaces = join(paths.root, "workspaces");
  if (policy.prune_workspaces !== false && existsSync(workspaces)) {
    for (const name of readdirSync(workspaces)) {
      const dir = join(workspaces, name);
      if (!statSync(dir).isDirectory()) continue;
      if (fileMtime(dir) >= cutoff) {
        result.skipped.push(`workspace:${name}`);
        continue;
      }
      const size = dirSizeApprox(dir);
      if (!policy.dry_run) rmSync(dir, { recursive: true, force: true });
      result.deleted_workspaces.push(name);
      result.bytes_reclaimed_estimate += size;
    }
  }

  mkdirSync(paths.root, { recursive: true });
  const auditPath = join(paths.root, "retention-audit.jsonl");
  const line = JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n";
  if (!policy.dry_run) {
    writeFileSync(auditPath, (existsSync(auditPath) ? readFileSync(auditPath, "utf-8") : "") + line);
  }

  return result;
}
