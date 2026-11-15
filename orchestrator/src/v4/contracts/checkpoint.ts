/**
 * Checkpoint v1 — recoverable point of a work (constitution §5, §7.2; ADR-V4-0005).
 * Producer: M02. Three distinct layers, only the first is authoritative:
 *   1. workflow state  (authoritative)  — event high-water mark + state digest + effect summary
 *   2. workspace snapshot (artifact)    — content-addressed (e.g. git commit / archive hash)
 *   3. context hint (non-authoritative) — conversation/context material; recovery MUST NOT require it
 */

import { type ContractHeader, type ContentRef, type IsoTimestamp, isSha256, validateWith, type ValidationResult } from "./common.js";
import { EFFECT_STATES, OPEN_EFFECT_STATES, type EffectState } from "./effect.js";

export const CHECKPOINT_SCHEMA_VERSION = "1.0.0";

export type CheckpointConsistency = "VERIFIED" | "UNVERIFIED" | "INCONSISTENT";

export interface Checkpoint extends ContractHeader<"Checkpoint"> {
  checkpoint_id: string;
  work_id: string;
  /** All events with seq <= event_seq are reflected; none after (INV-CKPT-01). */
  event_seq: number;
  /** sha256 of the canonical projected work state at event_seq. */
  state_digest: string;
  goal_contract_ref: { id: string; version: number };
  task_states: { task_id: string; state: string }[];
  artifact_refs: ContentRef[];
  /** Every effect of the work; open ones are explicit so recovery reconciles before acting (INV-CKPT-04). */
  effect_summary: { effect_id: string; state: EffectState }[];
  workspace_snapshot?: ContentRef & { kind: "GIT_COMMIT" | "ARCHIVE" };
  /** Non-authoritative (INV-CKPT-02). */
  context_hint?: ContentRef;
  consistency: CheckpointConsistency;
  created_at: IsoTimestamp;
}

export function openEffects(cp: Pick<Checkpoint, "effect_summary">): string[] {
  return cp.effect_summary.filter((e) => (OPEN_EFFECT_STATES as readonly string[]).includes(e.state)).map((e) => e.effect_id);
}

export function validateCheckpoint(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Checkpoint");
    c.id("checkpoint_id", "checkpoint");
    c.id("work_id", "work");
    c.integer("event_seq", 1);
    c.ensure(isSha256(c.get("state_digest")), "INV-CKPT-05", "state_digest", "state_digest must be sha256");
    c.versionedRef("goal_contract_ref", "goal_contract");
    c.each("task_states", (cc) => {
      cc.id("task_id", "task");
      cc.string("state");
    });
    c.each("artifact_refs", (cc) => {
      cc.ensure(isSha256(cc.get("sha256")), "INV-CKPT-03", "sha256", "artifact refs must be content-addressed");
    });
    c.each("effect_summary", (cc) => {
      cc.id("effect_id", "effect");
      cc.oneOf("state", EFFECT_STATES);
    });
    c.contentRef("workspace_snapshot", { optional: true });
    c.contentRef("context_hint", { optional: true });
    c.oneOf("consistency", ["VERIFIED", "UNVERIFIED", "INCONSISTENT"] as const);
    c.timestamp("created_at");
  });
}

/**
 * Cross-object consistency (INV-CKPT-01/03): checkpoint high-water mark must not exceed the
 * work's event head, and every referenced artifact must be resolvable with matching hash.
 */
export function checkCheckpointAgainst(
  cp: Pick<Checkpoint, "event_seq" | "artifact_refs" | "work_id">,
  ctx: { work_id: string; last_event_seq: number; available_artifact_hashes: ReadonlySet<string> },
): string[] {
  const problems: string[] = [];
  if (cp.work_id !== ctx.work_id) problems.push("INV-CKPT-01:work_mismatch");
  if (cp.event_seq > ctx.last_event_seq) problems.push("INV-CKPT-01:event_seq_beyond_head");
  for (const a of cp.artifact_refs) {
    if (!ctx.available_artifact_hashes.has(a.sha256)) problems.push(`INV-CKPT-03:missing_artifact:${a.sha256}`);
  }
  return problems;
}
