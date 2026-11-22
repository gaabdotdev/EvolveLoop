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
  /** V5-M03 Model & Provider Freedom registries (≠ Agent Registry). */
  modelRegistryDir: string;
  /** V5-M04 Tool Freedom — Tool Registry + assignments (deny-by-default). */
  toolRegistryDir: string;
  /** V5-M05 Human Governance — policy / budget / audit (JSON + jsonl). */
  governanceDir: string;
  /** V5-M06 Verification — verifier registry stubs + projections cache (optional). */
  verificationDir: string;
  /** V5-M08 Extensions — extension registry (enable/disable + permissions). */
  extensionsDir: string;
  /** V5-M09 Agent Studio — declarative agent/team/workflow configs (no secrets). */
  agentStudioDir: string;
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
    modelRegistryDir: join(root, "model-registry"),
    toolRegistryDir: join(root, "tool-registry"),
    governanceDir: join(root, "governance"),
    verificationDir: join(root, "verification"),
    extensionsDir: join(root, "extensions"),
    agentStudioDir: join(root, "agent-studio"),
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
