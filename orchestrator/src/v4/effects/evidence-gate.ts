/**
 * INV-EFF-03 / D05: COMMITTED, REJECTED, NOT_EXECUTED, PARTIAL, COMPENSATED
 * require Control-Plane-side observation. Executor report alone is ≤ UNKNOWN.
 *
 * Schema validators only check `evidence_ids.length > 0`. This module *resolves*
 * those ids (freeze review-2: "M03 must reject dangling / executor-only citations").
 */

import type { EffectRecord } from "../contracts/effect.js";
import { validateEvidence, type Evidence } from "../contracts/evidence.js";
import { EFFECT_ERROR, EffectLedgerError } from "./errors.js";
import type { EvidenceStore } from "./types.js";

export type CpEvidenceVerdict =
  | { ok: true; resolved: Evidence[]; qualifying: Evidence[] }
  | { ok: false; code: string; message: string; evidence_id?: string };

export function isExecutorSourced(
  evidence: Pick<Evidence, "method" | "provenance" | "produced_by">,
  effect: Pick<EffectRecord, "executor_ref">,
): boolean {
  if (evidence.method.kind === "SELF_REPORTED") return true;
  if (evidence.provenance === "SELF_REPORTED") return true;
  return evidence.produced_by.executor_id === effect.executor_ref.executor_id;
}

export function isCpSideEffectEvidence(
  evidence: Evidence,
  effect: Pick<EffectRecord, "effect_id" | "executor_ref">,
): boolean {
  if (isExecutorSourced(evidence, effect)) return false;
  if (evidence.subject.kind !== "EFFECT") return false;
  if (evidence.subject.ref !== effect.effect_id) return false;
  return true;
}

export async function resolveCpSideEvidence(
  evidenceIds: string[],
  effect: Pick<EffectRecord, "effect_id" | "executor_ref">,
  store: EvidenceStore,
): Promise<CpEvidenceVerdict> {
  if (evidenceIds.length === 0) {
    return { ok: false, code: EFFECT_ERROR.EVIDENCE_REQUIRED, message: "CP-side evidence_ids required" };
  }
  const resolved: Evidence[] = [];
  for (const id of evidenceIds) {
    const row = await store.get(id);
    if (!row) {
      return {
        ok: false,
        code: EFFECT_ERROR.EVIDENCE_UNRESOLVED,
        message: `dangling evidence_id ${id}`,
        evidence_id: id,
      };
    }
    const validation = validateEvidence(row);
    if (!validation.valid) {
      return {
        ok: false,
        code: EFFECT_ERROR.INVALID,
        message: `evidence ${id} failed validateEvidence`,
        evidence_id: id,
      };
    }
    resolved.push(row);
  }
  const qualifying = resolved.filter((e) => isCpSideEffectEvidence(e, effect));
  if (qualifying.length === 0) {
    return {
      ok: false,
      code: EFFECT_ERROR.EVIDENCE_NOT_CP_SIDE,
      message: "executor report alone cannot justify COMMITTED/REJECTED/NOT_EXECUTED/PARTIAL/COMPENSATED",
    };
  }
  return { ok: true, resolved, qualifying };
}

export function throwEvidenceFailure(verdict: Extract<CpEvidenceVerdict, { ok: false }>): never {
  throw new EffectLedgerError(verdict.code, verdict.message, { evidence_id: verdict.evidence_id });
}
