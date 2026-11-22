/**
 * V0 canonical memory types (V0-MEM-01..04).
 */

export const MEMORY_STATUSES = ["PROPOSED", "ACTIVE", "SUPERSEDED", "STALE", "REJECTED"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_TYPES = [
  "episodic",
  "semantic",
  "procedural",
  "operational",
  "evidence",
  "decision",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Relational edge node kinds — Goal → Task → File → Evidence. */
export const EDGE_NODE_KINDS = ["Goal", "Task", "File", "Evidence"] as const;
export type EdgeNodeKind = (typeof EDGE_NODE_KINDS)[number];

export interface MemoryRecord {
  memory_id: string;
  project_id: string;
  memory_type: MemoryType;
  status: MemoryStatus;
  contract_version: number;
  title: string;
  body: string;
  source: string;
  created_at: string;
  tainted: boolean;
  valid_from: string | null;
  valid_to: string | null;
  superseded_by: string | null;
  payload: Record<string, unknown>;
  /** V3-MEM-01 — content-addressed cold blob pointer (sha256:…). Null/absent while hot. */
  cas_hash?: string | null;
  /** Short summary retained in the active DB after cold migration. */
  summary?: string | null;
  /** ISO timestamp when body/payload were migrated to cold storage. */
  cold_migrated_at?: string | null;
}

export interface ProposeMemoryInput {
  memory_type: MemoryType;
  title: string;
  body: string;
  source: string;
  contract_version?: number;
  tainted?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  payload?: Record<string, unknown>;
  /** Agents cannot set status — always PROPOSED. */
}

export interface MemorySearchFilters {
  project_id: string;
  memory_type?: MemoryType;
  status?: MemoryStatus;
  contract_version?: number;
  include_tainted?: boolean;
  /**
   * When false (default), only rows with `valid_to IS NULL` are returned.
   * Superseded / expired temporal rows are excluded unless explicitly requested.
   */
  include_expired?: boolean;
  limit?: number;
}

export interface MemorySearchHit {
  record: MemoryRecord;
  /** BM25 rank from FTS5 (lower/more-negative is better for sqlite bm25()). */
  bm25: number;
}

export interface MemoryEdge {
  edge_id: string;
  project_id: string;
  from_kind: EdgeNodeKind;
  from_id: string;
  to_kind: EdgeNodeKind;
  to_id: string;
  relation: string;
  created_at: string;
}

export interface LinkEdgeInput {
  from_kind: EdgeNodeKind;
  from_id: string;
  to_kind: EdgeNodeKind;
  to_id: string;
  relation?: string;
}

export interface PromotionGateDecision {
  allow: boolean;
  reason: string;
  /** Must be a gate actor (validator|human|mso) — never raw agent self-promote. */
  actor: "validator" | "human" | "mso";
  supersede_memory_id?: string;
}
