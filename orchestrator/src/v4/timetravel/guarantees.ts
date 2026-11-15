/**
 * Honesty pins for fork/replay (constitution §14, ADR-V4-0007 / 0008).
 *
 * Replay is a declared mode over captured I/O or a fresh executor call.
 * It is not determinism of models or external services. External side
 * effects are never auto-reapplied. There is no exactly-once claim.
 */

/** Constitution §14: do not confuse replay with absolute determinism. */
export const REPLAY_IS_ABSOLUTE_DETERMINISM = false;

export const REPLAY_DETERMINISM_CLAIM = "none" as const;

/** ADR-V4-0008 / constitution §4.4: at-most-once dispatch decisions, not exactly-once. */
export const EXACTLY_ONCE_CLAIMED = false;

/** Hash chain is M02 tamper-evidence, not a signature (freeze R1). */
export const HASH_CHAIN_IS_NON_REPUDIATION = false;

export const FORK_INHERITS = {
  event_history: "referenced",
  artifacts: "referenced_by_hash",
  goal_contract: "new_version",
  checkpoints: "new_ids_origin_cites_base_seq",
  grants: "not_inherited",
  credentials: "not_inherited",
  leases: "not_inherited",
  external_effects: "fork_inherited_forbidden_redispatch",
  internal_projections: "rebuilt_from_referenced_events_then_new_events",
} as const;
