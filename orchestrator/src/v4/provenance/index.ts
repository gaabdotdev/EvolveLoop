/**
 * M11 — Trust & Provenance Graph (read-model).
 *
 * Import contracts only from `../contracts/`. This module implements
 * `ProvenanceQueryPort`. Wiring to other metas is M19.
 *
 * Not Work Continuity. Not a trust score. Not L2/L3 routing.
 */

export {
  ANSWERS_FROM_CHAT_MEMORY,
  FABRICATES_MISSING_REFS,
  GLOBAL_TRUST_SCORE_DEFINED,
  HASH_CHAIN_IS_NON_REPUDIATION,
  PROVENANCE_IS_AUTHORITATIVE_WORK_STATE,
  ROUTES_BY_TRUST_OR_SCORE,
} from "./guarantees.js";
export { ProvenanceGraph } from "./graph.js";
export { collectRefs, isVerifiableRef } from "./refs.js";
export { indexWorkStream } from "./stream.js";
export type {
  ArtifactList,
  EvidenceLookup,
  FailClosedReason,
  PolicyLookup,
  ProofLookup,
  ProvenanceAnswer,
  ProvenanceQueryDeps,
  WorkStreamTrust,
} from "./types.js";
