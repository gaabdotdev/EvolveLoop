/**
 * WorkProof v1 — verifiable synthesis of conformance (constitution §4.11, §8; ADR-V4-0009).
 * Producer: M06 (WorkProof builder + independent verifier).
 *
 * HONESTY RULE (constitution §8.3): no component may promote PARTIAL/UNVERIFIED to PROVEN
 * from opinion, absence of errors or executor self-declaration. The derivation functions below
 * are normative: an implementation's statuses must equal (or be more conservative than) them.
 */

import {
  type ContractHeader,
  type IsoTimestamp,
  type VersionedRef,
  scanForSecrets,
  validateWith,
  type ValidationResult,
} from "./common.js";
import type { AcceptanceCriterion, GoalContract } from "./goal-contract.js";
import { type Evidence, isIndependent } from "./evidence.js";
import { OPEN_EFFECT_STATES, type EffectState } from "./effect.js";

export const WORK_PROOF_SCHEMA_VERSION = "1.0.0";

export type ProofStatus = "PROVEN" | "PARTIAL" | "FAILED" | "UNVERIFIED";
export const PROOF_STATUSES: readonly ProofStatus[] = ["PROVEN", "PARTIAL", "FAILED", "UNVERIFIED"];

export interface RequirementProof {
  criterion_id: string;
  mandatory: boolean;
  status: ProofStatus;
  /** Qualifying evidence only (independent, current, accepted method). */
  evidence_ids: string[];
  gaps: string[];
}

export interface WorkProof extends ContractHeader<"WorkProof"> {
  proof_id: string;
  work_id: string;
  goal_contract_ref: VersionedRef;
  requirements: RequirementProof[];
  artifact_ids: string[];
  execution_ids: string[];
  /** Every effect of the work with its confirmation state at proof time. */
  effects: { effect_id: string; state: EffectState }[];
  provenance_refs: string[];
  limitations: string[];
  final_status: ProofStatus;
  generated_by: { verifier_id: string; verifier_version: string };
  generated_at: IsoTimestamp;
  supersedes_proof_id?: string;
}

export interface DerivationContext {
  goal_contract_ref: VersionedRef;
  now: IsoTimestamp;
  /** Hashes of the artifacts that constitute the current deliverable; evidence on other hashes is stale. */
  current_artifact_hashes?: ReadonlySet<string>;
}

export interface RequirementDerivation {
  status: ProofStatus;
  qualifying_evidence_ids: string[];
  gaps: string[];
}

function exclusionReason(e: Evidence, criterion: AcceptanceCriterion, ctx: DerivationContext): string | null {
  const ref = e.criterion_ref;
  if (!ref || ref.criterion_id !== criterion.criterion_id) return "other_criterion";
  if (ref.goal_contract_id !== ctx.goal_contract_ref.id || ref.goal_contract_version !== ctx.goal_contract_ref.version) {
    return `wrong_goal_contract_version:${e.evidence_id}`;
  }
  if (!isIndependent(e)) return `not_independent:${e.evidence_id}`;
  if (!(criterion.verification_methods as readonly string[]).includes(e.method.kind)) return `method_not_accepted:${e.evidence_id}`;
  if (e.valid_until && Date.parse(e.valid_until) <= Date.parse(ctx.now)) return `expired:${e.evidence_id}`;
  if (ctx.current_artifact_hashes && e.tested_artifacts.some((a) => !ctx.current_artifact_hashes!.has(a.sha256))) {
    return `stale_artifact:${e.evidence_id}`;
  }
  if (e.result === "INCONCLUSIVE" || e.result === "ERROR") return `inconclusive:${e.evidence_id}`;
  return null;
}

/** Normative per-criterion derivation (INV-PROOF-01). */
export function deriveRequirementStatus(
  criterion: AcceptanceCriterion,
  evidence: readonly Evidence[],
  ctx: DerivationContext,
): RequirementDerivation {
  const gaps: string[] = [];
  const qualifying: Evidence[] = [];
  for (const e of evidence) {
    const reason = exclusionReason(e, criterion, ctx);
    if (reason === null) qualifying.push(e);
    else if (reason !== "other_criterion") gaps.push(reason);
  }
  const ids = qualifying.map((e) => e.evidence_id);
  if (qualifying.some((e) => e.result === "FAIL")) {
    return { status: "FAILED", qualifying_evidence_ids: ids, gaps };
  }
  const passing = qualifying.filter((e) => e.result === "PASS");
  if (passing.length === 0) {
    return { status: "UNVERIFIED", qualifying_evidence_ids: ids, gaps: [...gaps, "no_qualifying_pass"] };
  }
  const covered = new Set(passing.map((e) => e.evidence_kind));
  const missing = criterion.evidence_required.filter((k) => !covered.has(k));
  if (missing.length > 0) {
    return { status: "PARTIAL", qualifying_evidence_ids: ids, gaps: [...gaps, ...missing.map((k) => `missing_evidence_kind:${k}`)] };
  }
  return { status: "PROVEN", qualifying_evidence_ids: ids, gaps };
}

/**
 * Normative work-level derivation. Unresolved effects (open states) cap the result at PARTIAL:
 * integrity of side effects is part of what the proof asserts.
 */
export function deriveFinalStatus(
  requirements: readonly Pick<RequirementProof, "mandatory" | "status">[],
  effects: readonly { state: EffectState }[] = [],
): ProofStatus {
  const mandatory = requirements.filter((r) => r.mandatory);
  if (mandatory.length === 0) return "UNVERIFIED";
  if (mandatory.some((r) => r.status === "FAILED")) return "FAILED";
  const unresolvedEffects = effects.some((e) => (OPEN_EFFECT_STATES as readonly string[]).includes(e.state));
  if (mandatory.every((r) => r.status === "PROVEN")) return unresolvedEffects ? "PARTIAL" : "PROVEN";
  if (mandatory.some((r) => r.status === "PROVEN" || r.status === "PARTIAL")) return "PARTIAL";
  return "UNVERIFIED";
}

/** Cross-object invariant: every mandatory criterion of the goal contract version is covered (INV-PROOF-02). */
export function checkProofCoverage(proof: Pick<WorkProof, "requirements" | "goal_contract_ref">, goal: GoalContract): string[] {
  const problems: string[] = [];
  if (proof.goal_contract_ref.id !== goal.goal_contract_id || proof.goal_contract_ref.version !== goal.version) {
    problems.push("goal_contract_version_mismatch");
  }
  const covered = new Map(proof.requirements.map((r) => [r.criterion_id, r]));
  for (const c of goal.acceptance_criteria) {
    const r = covered.get(c.criterion_id);
    if (!r) problems.push(`criterion_not_covered:${c.criterion_id}`);
    else if (r.mandatory !== c.mandatory) problems.push(`mandatory_flag_mismatch:${c.criterion_id}`);
  }
  return problems;
}

/**
 * A WorkProof is immutable once emitted (INV-PROOF-05): a status change requires a new proof
 * with `supersedes_proof_id`, re-derived from evidence — never an in-place edit.
 */
export function validateWorkProof(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("WorkProof");
    c.id("proof_id", "proof");
    c.id("work_id", "work");
    c.versionedRef("goal_contract_ref", "goal_contract");
    c.each("requirements", (cc) => {
      cc.string("criterion_id");
      cc.boolean("mandatory");
      const st = cc.oneOf("status", PROOF_STATUSES);
      const ev = cc.stringArray("evidence_ids");
      cc.stringArray("gaps");
      if (st === "PROVEN") cc.ensure((ev?.length ?? 0) > 0, "INV-PROOF-03", "evidence_ids", "PROVEN requirement needs qualifying evidence");
      if (st === "PARTIAL" || st === "UNVERIFIED") {
        cc.ensure(((cc.get("gaps") as unknown[]) ?? []).length > 0, "INV-PROOF-04", "gaps", `${st} requirement must state its gaps`);
      }
    }, { minLength: 1 });
    c.stringArray("artifact_ids");
    c.stringArray("execution_ids");
    c.each("effects", (cc) => {
      cc.id("effect_id", "effect");
      cc.string("state");
    });
    c.stringArray("provenance_refs");
    c.stringArray("limitations");
    const declared = c.oneOf("final_status", PROOF_STATUSES);
    c.nested("generated_by", (cc) => {
      cc.string("verifier_id");
      cc.string("verifier_version");
    });
    c.timestamp("generated_at");
    c.id("supersedes_proof_id", "proof", { optional: true });

    const reqs = c.get("requirements");
    const effects = c.get("effects");
    if (declared && Array.isArray(reqs) && Array.isArray(effects)) {
      const derived = deriveFinalStatus(reqs as RequirementProof[], effects as { state: EffectState }[]);
      c.ensure(
        declared === derived,
        "INV-PROOF-01",
        "final_status",
        `final_status ${declared} does not match normative derivation ${derived}`,
      );
    }
    for (const f of scanForSecrets(c.value())) {
      c.fail("INV-PROOF-06", f.path, `possible secret material (${f.reason}); WorkProof must not carry secrets (TM-V4-F11)`);
    }
  });
}
