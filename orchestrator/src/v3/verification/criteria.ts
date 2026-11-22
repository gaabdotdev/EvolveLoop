/**
 * V5-M06 — evaluateWorkCriteria(work_id) over Goal Contract + evidence linkage.
 * Agent claims are ignored; only criterion states + evidence_ids count.
 */

import { resolve } from "node:path";
import { defaultWorkspaceV3DataDir } from "../agent-handles/list-view.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { evaluateTrueFullPass } from "../goal-contract/types.js";
import { resolveV3DataPaths } from "../paths.js";
import { StateDb, defaultStateDbPath } from "../state-db/store.js";
import {
  PersistentWorkRuntime,
  type PersistentWorkRuntimeOpts,
} from "../work-runtime/runtime.js";
import type {
  CriterionEvidenceLink,
  CriterionEvaluationRow,
  WorkCriteriaEvaluation,
} from "./types.js";

export class WorkCriteriaError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkCriteriaError";
  }
}

/**
 * Evaluate acceptance criteria for a Work.
 * Uses GoalContractStore / evaluateTrueFullPass — never agent prose.
 * Links criterion evidence_ids to StateDb rows when present.
 */
export function evaluateWorkCriteria(
  workId: string,
  opts: PersistentWorkRuntimeOpts,
): WorkCriteriaEvaluation {
  const wid = workId.trim();
  if (!wid) throw new WorkCriteriaError("WORK_ID_REQUIRED", "work_id required");

  const runtime = new PersistentWorkRuntime(opts);
  let work;
  try {
    work = runtime.read(wid);
  } catch (err) {
    throw new WorkCriteriaError(
      "WORK_NOT_FOUND",
      err instanceof Error ? err.message : String(err),
    );
  }

  const dataDir =
    opts.dataDir ?? defaultWorkspaceV3DataDir(resolve(opts.workspaceRoot));
  const paths = resolveV3DataPaths(dataDir);
  const goals = new GoalContractStore(paths.goalContractsDir);

  const goalId = work.goal_contract_id;
  if (!goalId) {
    return {
      kind: "WorkCriteriaEvaluation",
      work_id: wid,
      eligible_true_full_pass: false,
      work_state: work.work_state,
      reasons: ["no_goal_contract_bound"],
      criteria: [],
      agent_claim_ignored: true,
      evaluated_at: new Date().toISOString(),
    };
  }

  let contract;
  try {
    contract = goals.loadLatest(goalId);
  } catch (err) {
    throw new WorkCriteriaError(
      "GOAL_NOT_FOUND",
      err instanceof Error ? err.message : String(err),
    );
  }

  const evaluation = evaluateTrueFullPass(contract);

  const db = new StateDb(defaultStateDbPath(resolve(opts.workspaceRoot)));
  let evidenceById: Map<string, { status: string; kind?: string }>;
  try {
    const rows = db.listEvidence(wid);
    evidenceById = new Map(
      rows.map((r) => [
        r.evidence_id,
        { status: r.status, kind: r.kind },
      ]),
    );
  } finally {
    db.close();
  }

  const criteria: CriterionEvaluationRow[] = contract.criteria.map((c) => {
    const linkedIds = new Set([...c.evidence_ids, ...c.evidence_required]);
    const evidence_links: CriterionEvidenceLink[] = [...linkedIds].map(
      (evidence_id) => {
        const row = evidenceById.get(evidence_id);
        return {
          criterion_id: c.id,
          evidence_id,
          required: c.evidence_required.includes(evidence_id),
          present_in_statedb: Boolean(row),
          evidence_status: row?.status as CriterionEvidenceLink["evidence_status"],
          evidence_kind: row?.kind,
        };
      },
    );
    return {
      criterion_id: c.id,
      description: c.description,
      mandatory: c.mandatory,
      state: c.state,
      evidence_ids: [...c.evidence_ids],
      evidence_required: [...c.evidence_required],
      evidence_links,
    };
  });

  return {
    kind: "WorkCriteriaEvaluation",
    work_id: wid,
    goal_contract_id: contract.goal_contract_id,
    goal_contract_version: contract.version,
    eligible_true_full_pass: evaluation.eligible,
    work_state: evaluation.work_state,
    reasons: evaluation.reasons,
    criteria,
    agent_claim_ignored: true,
    evaluated_at: new Date().toISOString(),
  };
}
