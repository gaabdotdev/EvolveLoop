/**
 * V0 intent flow: silent scan → Grill-Me (≤5) → Goal Contract in SQLite WAL.
 * Bloco 3 circuit consumes this contract via `evolve circuit` / runV0Circuit.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  goalContractInputFromGrillMe,
  GrillMeIntakeError,
  validateGrillMeResult,
} from "../grill-me/intake.js";
import {
  buildGrillMeQuestions,
  buildGrillMeResultFromAnswers,
  formatQuestionForUser,
  resolveAnswers,
  summarizeContractLines,
  type GrillMeAnswer,
  type GrillMeQuestion,
} from "../grill-me/session.js";
import { applyTrivialBypass, type TrivialBypassResult } from "../grill-me/trivial-bypass.js";
import { GoalContractStore } from "../goal-contract/store.js";
import type { GoalContract } from "../goal-contract/types.js";
import { defaultStateDbPath, StateDb } from "../state-db/store.js";
import { silentScan, type SilentScanResult } from "../workspace-scan/silent-scan.js";

export interface IntentFlowOptions {
  workspace: string;
  intent: string;
  /** Pre-supplied answers for offline/tests (array by index or map by id). Empty/ok → defaults. */
  answers?: Array<string | undefined> | Record<string, string>;
  /** Confirm MSO launch (does not run Bloco 3). */
  confirm_mso?: boolean;
  /** Override state.db path (default: <workspace>/.evolveloop/state.db). */
  state_db_path?: string;
  /** Also mirror Goal Contract JSON under this dir (optional dual-write for legacy CLI). */
  mirror_goal_contracts_dir?: string;
  evidence_dir?: string;
  goal_contract_id?: string;
}

export interface IntentFlowGrillOutcome {
  kind: "goal_contract";
  tokens_used: 0;
  scan: SilentScanResult;
  questions: GrillMeQuestion[];
  answers: GrillMeAnswer[];
  question_count: number;
  grill_prompts_pt: string[];
  contract: GoalContract;
  persisted: {
    db_path: string;
    journal_mode: string;
    validated: boolean;
    mso_confirmed: boolean;
  };
  summary_lines: string[];
  mso_ready: boolean;
  evidence_path: string;
}

export type IntentFlowResult = TrivialBypassResult | IntentFlowGrillOutcome;

function goalIdFromIntent(intent: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const hash = createHash("sha256").update(intent.trim()).digest("hex").slice(0, 10);
  return `gc-${hash}`;
}

function materializeContract(
  goalContractId: string,
  intent: string,
  grillResult: ReturnType<typeof buildGrillMeResultFromAnswers>,
): GoalContract {
  const input = goalContractInputFromGrillMe(goalContractId, intent, grillResult);
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: input.goal_contract_id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: input.objective,
    scope: input.scope ?? [],
    out_of_scope: input.out_of_scope ?? [],
    functional_requirements: input.functional_requirements ?? [],
    non_functional_requirements: input.non_functional_requirements ?? [],
    constraints: input.constraints ?? [],
    dependencies: input.dependencies ?? [],
    risks: input.risks ?? [],
    criteria: input.criteria.map((c) => ({
      ...c,
      state: c.state ?? "NOT_STARTED",
      evidence_ids: [],
      updated_at: ts,
    })),
    work_id: input.work_id,
  };
}

function writeGrillEvidence(
  evidenceDir: string,
  goalContractId: string,
  validation: ReturnType<typeof validateGrillMeResult>,
  grillResult: ReturnType<typeof buildGrillMeResultFromAnswers>,
): string {
  mkdirSync(evidenceDir, { recursive: true });
  const evidence_path = join(evidenceDir, "gate.grill-me.json");
  writeFileSync(
    evidence_path,
    JSON.stringify(
      {
        gate: "grill-me",
        required: true,
        status: validation.status,
        skill_id: "grill-me",
        skill_version: "2.0.0",
        timestamp: new Date().toISOString(),
        goal_contract_id: goalContractId,
        reasons: validation.reasons,
        result: grillResult,
        v0_intent_flow: true,
      },
      null,
      2,
    ),
    "utf-8",
  );
  return evidence_path;
}

export function runIntentFlow(opts: IntentFlowOptions): IntentFlowResult {
  const workspace = resolve(opts.workspace);
  const intent = opts.intent.trim();
  if (!intent) {
    throw new Error("intent required");
  }

  const dbPath = opts.state_db_path ? resolve(opts.state_db_path) : defaultStateDbPath(workspace);
  const db = new StateDb(dbPath);

  try {
    const trivial = applyTrivialBypass(intent, db);
    if (trivial) return trivial;

    const scan = silentScan(workspace);
    const questions = buildGrillMeQuestions(intent, scan);
    if (questions.length < 3 || questions.length > 5) {
      throw new Error(`Grill-Me question count out of bounds: ${questions.length}`);
    }

    const answers = resolveAnswers(questions, opts.answers);
    const grillResult = buildGrillMeResultFromAnswers(intent, scan, questions, answers);
    const validation = validateGrillMeResult(grillResult);
    if (!validation.allow_goal_contract) {
      throw new GrillMeIntakeError(
        "GRILL_ME_BLOCKED",
        `Grill-Me blocked Goal Contract: ${validation.reasons.join(", ")}`,
      );
    }

    const goal_contract_id = goalIdFromIntent(intent, opts.goal_contract_id);
    const evidenceDir = opts.evidence_dir
      ? resolve(opts.evidence_dir)
      : resolve(workspace, ".evolveloop", "evidence");
    const evidence_path = writeGrillEvidence(
      evidenceDir,
      goal_contract_id,
      validation,
      grillResult,
    );

    let contract = materializeContract(goal_contract_id, intent, grillResult);

    // Bump version if same id already exists in SQLite
    const existing = db.loadLatestGoalContract(goal_contract_id);
    if (existing) {
      contract = {
        ...contract,
        version: existing.version + 1,
        created_at: existing.created_at,
        updated_at: new Date().toISOString(),
        supersedes_version: existing.version,
      };
    }

    if (opts.mirror_goal_contracts_dir) {
      const mirrorDir = resolve(opts.mirror_goal_contracts_dir);
      const store = new GoalContractStore(mirrorDir);
      const pointer = join(mirrorDir, goal_contract_id, "LATEST");
      if (existsSync(pointer)) {
        store.revise(goal_contract_id, {
          objective: contract.objective,
          scope: contract.scope,
          out_of_scope: contract.out_of_scope,
          constraints: contract.constraints,
          risks: contract.risks,
          criteria: contract.criteria,
        });
      } else {
        store.create(goalContractInputFromGrillMe(goal_contract_id, intent, grillResult));
      }
    }

    const persisted = db.saveGoalContract(contract, {
      validated: true,
      mso_confirmed: Boolean(opts.confirm_mso),
    });

    let mso_confirmed = persisted.mso_confirmed;
    if (opts.confirm_mso && !mso_confirmed) {
      mso_confirmed = db.confirmMso(goal_contract_id).mso_confirmed;
    }

    const acceptance =
      contract.criteria.find((c) => c.id === "c-accept")?.description ??
      contract.criteria[0]?.description ??
      "";

    const summary_lines = summarizeContractLines({
      goal_contract_id: contract.goal_contract_id,
      objective: contract.objective,
      scope: contract.scope,
      out_of_scope: contract.out_of_scope,
      acceptance,
      db_path: db.path,
    });

    return {
      kind: "goal_contract",
      tokens_used: 0,
      scan,
      questions,
      answers,
      question_count: questions.length,
      grill_prompts_pt: questions.map((q, i) =>
        formatQuestionForUser(q, i + 1, questions.length),
      ),
      contract,
      persisted: {
        db_path: db.path,
        journal_mode: db.journalMode(),
        validated: true,
        mso_confirmed,
      },
      summary_lines,
      mso_ready: mso_confirmed,
      evidence_path,
    };
  } finally {
    db.close();
  }
}
