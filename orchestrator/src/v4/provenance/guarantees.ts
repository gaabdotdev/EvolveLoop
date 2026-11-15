/**
 * Honesty pins for the M11 provenance read-model (constitution §4.12;
 * WAVE5-COMMON; freeze R1; TM-V4-F02/F07/F14, D13/D16/D17).
 *
 * These are constants, not runtime-configurable, so callers cannot advertise
 * a trust score, L2/L3 routing, non-repudiation, or authoritative Work State.
 */

/** Read-model only. Work Continuity (ledger + projections) remains source of truth. */
export const PROVENANCE_IS_AUTHORITATIVE_WORK_STATE = false;

/** Hash chain is tamper-evidence, not a signature (freeze R1 / ADR-V4-0003). */
export const HASH_CHAIN_IS_NON_REPUDIATION = false;

/** No global reputation / trust score is defined or returned. */
export const GLOBAL_TRUST_SCORE_DEFINED = false;

/** Provenance must not drive L2/L3 routing preference (M09 block still in force). */
export const ROUTES_BY_TRUST_OR_SCORE = false;

/** Missing, mismatched, or self-reported-as-independent refs are never invented. */
export const FABRICATES_MISSING_REFS = false;

/** Chat / model memory is never a provenance source. */
export const ANSWERS_FROM_CHAT_MEMORY = false;
