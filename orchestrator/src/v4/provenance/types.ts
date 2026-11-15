/**
 * M11-local types. Not catalog kinds. The frozen port remains
 * `ProvenanceQueryPort` in `contracts/ports.ts`.
 */

import type {
  Artifact,
  ArtifactStorePort,
  EffectLedgerPort,
  EventLedgerPort,
  Evidence,
  GoalContract,
  IsoTimestamp,
  PolicyDecision,
  WorkProof,
  WorkRepositoryPort,
} from "../contracts/index.js";

/**
 * Why a query returned no verifiable refs. Empty `refs` means "not proven",
 * never "fabricate an id". The frozen port does not surface this; `inspect*`
 * methods do, for M15/M20 and tests.
 */
export type FailClosedReason =
  | "invalid_id"
  | "missing_ref"
  | "chain_broken"
  | "hash_mismatch"
  | "self_reported_as_independent"
  | "decision_not_in_ledger"
  | "deny_cannot_authorize"
  | "approval_missing"
  | "artifact_integrity"
  | "uncorroborated_origin"
  | "wrong_goal_contract_version"
  | "requirement_not_proved"
  | "unpinned_supply_chain";

export interface ProvenanceAnswer {
  refs: string[];
  closed: FailClosedReason | null;
}

/**
 * Optional lookups owned by other metas, consumed only through these
 * narrow read faces so M11 never imports sibling engines. M19 wires them.
 *
 * `PolicyDecisionPort.decide` and `WorkProofPort.build` are command paths
 * and MUST NOT be called from a provenance query.
 */
export interface EvidenceLookup {
  get(evidence_id: string): Promise<Evidence | undefined>;
  listByWork?(work_id: string): Promise<Evidence[]>;
}

export interface ProofLookup {
  get?(proof_id: string): Promise<WorkProof | undefined>;
  latestForWork?(work_id: string): Promise<WorkProof | undefined>;
}

export interface PolicyLookup {
  getDecision?(decision_id: string): Promise<PolicyDecision | undefined>;
}

export interface ArtifactList {
  listByWork?(work_id: string): Promise<Artifact[]>;
}

export interface ProvenanceQueryDeps {
  ledger: EventLedgerPort;
  artifacts: ArtifactStorePort;
  effects: EffectLedgerPort;
  works?: WorkRepositoryPort;
  evidence?: EvidenceLookup;
  proofs?: ProofLookup;
  policy?: PolicyLookup;
  artifactList?: ArtifactList;
  /** Known work streams; required to resolve a bare decision_ref to a log. */
  listWorkIds?: () => Iterable<string> | Promise<Iterable<string>>;
  /** Evidence expiry clock. Timestamps never order events (ADR-V4-0015). */
  now?: () => IsoTimestamp;
}

export interface WorkStreamTrust {
  work_id: string;
  trusted: boolean;
  closed: FailClosedReason | null;
}

export type { GoalContract };
