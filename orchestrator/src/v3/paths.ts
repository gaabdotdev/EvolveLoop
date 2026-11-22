/**
 * V3 durable data layout under a single --data-dir.
 */

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface V3DataPaths {
  root: string;
  goalContractsDir: string;
  taskGraphsDir: string;
  agentsDir: string;
  coordinatorDir: string;
  eventLogDir: string;
  evidenceDir: string;
  handoffsDir: string;
  jobsDir: string;
  workLedgerDir: string;
  modelCatalogDir: string;
  vectorIndexDir: string;
  locksDir: string;
  worktreesDir: string;
  idempotencyDir: string;
  /** V3.5 */
  approvalsDir: string;
  sandboxDir: string;
  workspacesDir: string;
  processSessionsDir: string;
}

export function resolveV3DataPaths(dataDir: string): V3DataPaths {
  const root = resolve(dataDir);
  const paths: V3DataPaths = {
    root,
    goalContractsDir: join(root, "goal-contracts"),
    taskGraphsDir: join(root, "task-graphs"),
    agentsDir: join(root, "agents"),
    coordinatorDir: join(root, "coordinator"),
    eventLogDir: join(root, "events"),
    evidenceDir: join(root, "evidence"),
    handoffsDir: join(root, "handoffs"),
    jobsDir: join(root, "jobs"),
    workLedgerDir: join(root, "work-ledger"),
    modelCatalogDir: join(root, "model-catalog"),
    vectorIndexDir: join(root, "vector-index"),
    locksDir: join(root, "locks"),
    worktreesDir: join(root, "worktrees"),
    idempotencyDir: join(root, "idempotency"),
    approvalsDir: join(root, "approvals"),
    sandboxDir: join(root, "sandbox"),
    workspacesDir: join(root, "workspaces"),
    processSessionsDir: join(root, "process-sessions"),
  };
  for (const dir of Object.values(paths)) {
    if (dir === root) continue;
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(root, { recursive: true });
  return paths;
}
