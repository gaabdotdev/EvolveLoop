/**
 * V0 intent flow: silent scan → Grill-Me (≤5) → runtime gate → Goal Document + Contract in SQLite WAL.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildGoalDocument } from "../goal-document/build.js";
import {
  validateGoalContractStructural,
  validateGoalDocumentStructural,
} from "../goal-document/validate.js";
import type { GoalDocument } from "../goal-document/types.js";
import {
  goalContractInputFromGrillMe,
  GrillMeIntakeError,
  validateGrillMeResult,
} from "../grill-me/intake.js";
import {
  authorizePlanning,
  classifyRequestScale,
  type PlanningAuthorization,
  type RequestScale,
} from "../grill-me/runtime-gate.js";
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
  /**
   * When false, run scan+grill+gate but do not write SQLite (preview for interactive REPL).
   * Default true.
   */
  persist?: boolean;
  /** If true, treat as LLM claiming ready — used to prove gate rejects boolean-only proof. */
  llm_claim_ready?: boolean;
}

export interface IntentFlowGrillOutcome {
  kind: "goal_contract";
  tokens_used: 0;
  scale: RequestScale;
  planning: PlanningAuthorization;
  scan: SilentScanResult;
  questions: GrillMeQuestion[];
  answers: GrillMeAnswer[];
  question_count: number;
  grill_prompts_pt: string[];
  contract: GoalContract;
  goal_document?: GoalDocument;
  goal_document_id?: string;
  persisted: {
    db_path: string;
    journal_mode: string;
    validated: boolean;
    mso_confirmed: boolean;
    wrote: boolean;
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
  planning: PlanningAuthorization,
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
        runtime_planning_gate: planning,
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

  const persist = opts.persist !== false;
  const dbPath = opts.state_db_path ? resolve(opts.state_db_path) : defaultStateDbPath(workspace);
  const db = new StateDb(dbPath);

  try {
    const trivial = applyTrivialBypass(intent, db);
    if (trivial) return trivial;

    const scale = classifyRequestScale(intent);
    const scan = silentScan(workspace);
    const questions = buildGrillMeQuestions(intent, scan);
    if (questions.length < 2 || questions.length > 5) {
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

    const planning = authorizePlanning({
      intent,
      scan,
      grill_validation: validation,
      llm_claim_ready: opts.llm_claim_ready,
    });

    // V0-GRILL-01: medium/large must pass runtime gate before planning authorization
    if (planning.gate_required && !planning.planning_authorized) {
      throw new GrillMeIntakeError(
        "RUNTIME_GATE_BLOCKED",
        `Runtime code gate blocked planning (scale=${scale}): ${planning.reasons.join(", ")}`,
      );
    }
    if (!planning.planning_authorized) {
      throw new GrillMeIntakeError(
        "PLANNING_NOT_AUTHORIZED",
        `Planning not authorized (scale=${scale}): ${planning.reasons.join(", ")}`,
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
      planning,
    );

    let contract = materializeContract(goal_contract_id, intent, grillResult);

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

    const contractStructural = validateGoalContractStructural(contract);
    if (!contractStructural.ok) {
      throw new GrillMeIntakeError(
        "CONTRACT_STRUCTURAL_INVALID",
        `Goal Contract structural validation failed: ${contractStructural.reasons.join(", ")}`,
      );
    }

    const goal_document = buildGoalDocument({
      contract,
      scan,
      grill_validation: validation,
    });
    const docStructural = validateGoalDocumentStructural(goal_document);
    if (!docStructural.ok) {
      throw new GrillMeIntakeError(
        "DOCUMENT_STRUCTURAL_INVALID",
        `Goal Document structural validation failed: ${docStructural.reasons.join(", ")}`,
      );
    }

    let mso_confirmed = false;
    let journal_mode = db.journalMode();

    if (persist) {
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
      db.saveGoalDocument(goal_document, { validated: true });

      mso_confirmed = persisted.mso_confirmed;
      if (opts.confirm_mso && !mso_confirmed) {
        mso_confirmed = db.confirmMso(goal_contract_id).mso_confirmed;
      }
      journal_mode = db.journalMode();
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
      scale,
      planning,
      scan,
      questions,
      answers,
      question_count: questions.length,
      grill_prompts_pt: questions.map((q, i) =>
        formatQuestionForUser(q, i + 1, questions.length),
      ),
      contract,
      goal_document,
      goal_document_id: goal_document.goal_document_id,
      persisted: {
        db_path: db.path,
        journal_mode,
        validated: true,
        mso_confirmed,
        wrote: persist,
      },
      summary_lines,
      mso_ready: mso_confirmed,
      evidence_path,
    };
  } finally {
    db.close();
  }
}
