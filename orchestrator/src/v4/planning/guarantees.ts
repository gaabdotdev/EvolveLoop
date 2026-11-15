/**
 * Honesty pins (constitution §4.7 / §14; ADR-V4-0010; freeze R1).
 * These are constants, not runtime-configurable, so callers cannot advertise
 * capability-score routing or non-repudiation.
 */

/** ADR-V4-0010: profiles are PROVISIONAL until methodology ACCEPTED; M07 must not rank. */
export const ROUTING_BY_CAPABILITY_SCORE = false;

/** Plans are not Work State until accepted via M01 command paths. */
export const PLAN_IS_PROPOSAL_UNTIL_ACCEPTED = true;

/** Hash chain is tamper-evidence, not non-repudiation (freeze R1). */
export const HASH_CHAIN_IS_NON_REPUDIATION = false;

/** M07 never emits task VERIFIED; that path is M06. */
export const PLANNER_MAY_SET_VERIFIED = false;
