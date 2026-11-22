/**
 * Global recovery — never trust persisted RUNNING without reconcile.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type { WorkflowRegistry } from "./workflow-registry.js";
import type { GlobalResourceManager } from "./resource-manager.js";
import type { DependencyCoordinator } from "./dependency-coordinator.js";
import type { WorkflowRecord } from "./types.js";

export interface RecoveryReport {
  kind: "GlobalRecoveryReport";
  at: string;
  workflows_examined: number;
  demoted_to_recovering: string[];
  demoted_to_paused: string[];
  reservations_expired: string[];
  dependencies_refreshed: number;
  notes: string[];
}

export interface ProcessPresence {
  /** Owners (workflow ids / reservation owners) still backed by live processes */
  active_owners: Set<string>;
  /** work_ids observed as having a live coordinator session */
  live_work_ids: Set<string>;
}

export function reconcileGlobalState(input: {
  paths: OpsDataPaths;
  workflows: WorkflowRegistry;
  resources: GlobalResourceManager;
  dependencies: DependencyCoordinator;
  presence?: ProcessPresence;
}): RecoveryReport {
  mkdirSync(input.paths.recoveryDir, { recursive: true });
  const presence = input.presence ?? {
    active_owners: new Set<string>(),
    live_work_ids: new Set<string>(),
  };

  const demoted_to_recovering: string[] = [];
  const demoted_to_paused: string[] = [];
  const notes: string[] = [];

  const all = input.workflows.list();
  for (const wf of all) {
    if (wf.state === "RUNNING" || wf.state === "ADMITTED" || wf.state === "PAUSING") {
      const workId = wf.runtime.work_id;
      const live =
        (workId && presence.live_work_ids.has(workId)) ||
        presence.active_owners.has(wf.workflow_id);
      if (!live) {
        // Do not keep RUNNING solely from durable field
        input.workflows.transition(wf.workflow_id, "RECOVERING", "recovery", {
          reason: "persisted_active_without_live_process",
        });
        demoted_to_recovering.push(wf.workflow_id);
        notes.push(`${wf.workflow_id}: ${wf.state}→RECOVERING (no live process/session)`);
      }
    }
  }

  const expired = input.resources.expireLeases();
  const recon = input.resources.reconcile(presence.active_owners);
  const deps = input.dependencies.refresh(input.workflows);

  // After recover, move recoverable workflows to PAUSED for safe resume
  for (const id of demoted_to_recovering) {
    const wf = input.workflows.get(id);
    if (wf?.state === "RECOVERING") {
      input.workflows.transition(id, "PAUSED", "recovery", {
        reason: "awaiting_safe_resume_after_reconcile",
      });
      demoted_to_paused.push(id);
    }
  }

  const report: RecoveryReport = {
    kind: "GlobalRecoveryReport",
    at: nowIso(),
    workflows_examined: all.length,
    demoted_to_recovering,
    demoted_to_paused,
    reservations_expired: [
      ...expired.map((r) => r.reservation_id),
      ...recon.released,
    ],
    dependencies_refreshed: deps.length,
    notes,
  };

  writeFileSync(
    join(input.paths.recoveryDir, `recovery-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
  );
  return report;
}

/** Detect coordinator daemon presence for a project data dir (best-effort). */
export function detectLiveCoordinator(dataDir: string): boolean {
  const sock = join(dataDir, "coordinator", "ipc.sock");
  return existsSync(sock);
}

export function workflowNeedsIntervention(wf: WorkflowRecord): boolean {
  return (
    wf.state === "BLOCKED" ||
    wf.state === "FAILED" ||
    wf.state === "RECOVERING" ||
    (wf.state === "WAITING_RESOURCE" && (wf.wait_reason ?? "").includes("starvation"))
  );
}
