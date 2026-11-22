/**
 * Host-level Global Ops data layout.
 * Separate from per-project --data-dir used by Coordinator/Core.
 */

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface OpsDataPaths {
  root: string;
  projectsDir: string;
  workflowsDir: string;
  dependenciesDir: string;
  queueDir: string;
  reservationsDir: string;
  decisionsDir: string;
  teamPlansDir: string;
  qualityResultsDir: string;
  policiesDir: string;
  accessLogDir: string;
  recoveryDir: string;
}

export function resolveOpsDataPaths(opsDir: string): OpsDataPaths {
  const root = resolve(opsDir);
  const paths: OpsDataPaths = {
    root,
    projectsDir: join(root, "projects"),
    workflowsDir: join(root, "workflows"),
    dependenciesDir: join(root, "dependencies"),
    queueDir: join(root, "queue"),
    reservationsDir: join(root, "reservations"),
    decisionsDir: join(root, "decisions"),
    teamPlansDir: join(root, "team-plans"),
    qualityResultsDir: join(root, "quality-results"),
    policiesDir: join(root, "policies"),
    accessLogDir: join(root, "access-log"),
    recoveryDir: join(root, "recovery"),
  };
  mkdirSync(root, { recursive: true });
  for (const dir of Object.values(paths)) {
    if (dir === root) continue;
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}

/** Default host ops dir under XDG or ~/.evolveloop/ops */
export function defaultOpsDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg) return join(xdg, "evolveloop", "ops");
  const home = process.env.HOME ?? "/tmp";
  return join(home, ".evolveloop", "ops");
}
