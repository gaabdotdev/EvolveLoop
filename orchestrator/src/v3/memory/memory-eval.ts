/**
 * V2-MEM-03 — Memory Eval Suite (Measurement Plane–compatible).
 *
 * Monitors Recall@K, Precision@K, and the rate at which INVALIDATED/STALE
 * memories are returned as if still current (target 0%).
 *
 * Gates (defaults for k=5): Recall@5 ≥ 0.85, Precision@5 ≥ 0.80, invalidated rate = 0.
 *
 * Definitions (classic IR):
 * - Recall@K = |retrieved ∩ relevant| / |relevant|
 * - Precision@K = |retrieved ∩ relevant| / K  (missing slots count against precision)
 */

/** Honesty label aligned with Measurement Plane / ObservedMetric. */
export type MemoryEvalHonesty = "reported" | "estimated" | "UNAVAILABLE";

export interface HonestMetric {
  value: number | null;
  honesty: MemoryEvalHonesty;
}

/** Statuses that must never be returned as vigente (current). */
export const NON_CURRENT_MEMORY_STATUSES = ["INVALIDATED", "STALE"] as const;
export type NonCurrentMemoryStatus = (typeof NON_CURRENT_MEMORY_STATUSES)[number];

export interface GoldenQuery {
  query_id: string;
  /** Natural-language or keyword query text. */
  query: string;
  /** Gold-relevant memory ids (gabarito) for Recall/Precision. */
  relevant_ids: string[];
}

/** One hit from a retriever under evaluation. */
export interface MemoryEvalHit {
  memory_id: string;
  /**
   * Memory lifecycle status. INVALIDATED | STALE count as violations when
   * returned in the result set (treated as "vigente").
   */
  status?: string;
}

export type MemoryRetrieveFn = (
  query: string,
  k: number,
) => MemoryEvalHit[] | Promise<MemoryEvalHit[]>;

export interface MemoryEvalGates {
  /** Minimum macro Recall@K. Default 0.85. */
  recall_at_k_min: number;
  /** Minimum macro Precision@K. Default 0.80. */
  precision_at_k_min: number;
  /** Maximum share of INVALIDATED|STALE hits. Default 0. */
  invalidated_return_rate_max: number;
}

export const DEFAULT_MEMORY_EVAL_GATES: MemoryEvalGates = {
  recall_at_k_min: 0.85,
  precision_at_k_min: 0.8,
  invalidated_return_rate_max: 0,
};

export interface MemoryEvalQueryResult {
  query_id: string;
  query: string;
  k: number;
  retrieved_ids: string[];
  relevant_ids: string[];
  hit_relevant_count: number;
  recall_at_k: number;
  precision_at_k: number;
  invalidated_or_stale_count: number;
  invalidated_or_stale_ids: string[];
}

export interface MemoryEvalSuiteReport {
  kind: "MemoryEvalSuiteReport";
  k: number;
  query_count: number;
  metrics: {
    recall_at_k: HonestMetric;
    precision_at_k: HonestMetric;
    invalidated_return_rate: HonestMetric;
  };
  gates: MemoryEvalGates;
  passed: boolean;
  failures: string[];
  per_query: MemoryEvalQueryResult[];
  /** ISO-8601 when the suite finished. */
  evaluated_at: string;
}

export interface RunMemoryEvalSuiteInput {
  retrieve: MemoryRetrieveFn;
  queries: GoldenQuery[];
  k: number;
  gates?: Partial<MemoryEvalGates>;
  /**
   * Honesty for aggregate metrics. Defaults to "reported" (computed from
   * observed retrieval vs golden labels — not invented).
   */
  honesty?: Exclude<MemoryEvalHonesty, "UNAVAILABLE">;
}

function isNonCurrentStatus(status: string | undefined): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return (NON_CURRENT_MEMORY_STATUSES as readonly string[]).includes(upper);
}

/**
 * Recall@K = |retrieved ∩ relevant| / |relevant|
 * Empty relevant → 1 when nothing retrieved, else 0 (degenerate gold).
 */
export function recallAtK(retrievedIds: string[], relevantIds: string[]): number {
  if (relevantIds.length === 0) {
    return retrievedIds.length === 0 ? 1 : 0;
  }
  const relevant = new Set(relevantIds);
  let hits = 0;
  for (const id of retrievedIds) {
    if (relevant.has(id)) hits += 1;
  }
  return hits / relevantIds.length;
}

/**
 * Precision@K = |retrieved ∩ relevant| / K
 * (classic IR; missing slots count against precision).
 */
export function precisionAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (k <= 0) return 0;
  const relevant = new Set(relevantIds);
  let hits = 0;
  const top = retrievedIds.slice(0, k);
  for (const id of top) {
    if (relevant.has(id)) hits += 1;
  }
  return hits / k;
}

export function countNonCurrentHits(hits: MemoryEvalHit[]): {
  count: number;
  ids: string[];
} {
  const ids: string[] = [];
  for (const h of hits) {
    if (isNonCurrentStatus(h.status)) ids.push(h.memory_id);
  }
  return { count: ids.length, ids };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function honest(value: number, honesty: Exclude<MemoryEvalHonesty, "UNAVAILABLE">): HonestMetric {
  return { value, honesty };
}

/**
 * Run the Memory Eval Suite against an injectable retriever.
 * Macro-averages Recall@K / Precision@K across golden queries.
 * INVALIDATED|STALE hits in any result set raise invalidated_return_rate.
 */
export async function runMemoryEvalSuite(
  input: RunMemoryEvalSuiteInput,
): Promise<MemoryEvalSuiteReport> {
  const k = input.k;
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error(`runMemoryEvalSuite: k must be a positive number, got ${k}`);
  }
  if (!input.queries.length) {
    throw new Error("runMemoryEvalSuite: queries must be non-empty");
  }

  const gates: MemoryEvalGates = {
    ...DEFAULT_MEMORY_EVAL_GATES,
    ...input.gates,
  };
  const honesty = input.honesty ?? "reported";
  const per_query: MemoryEvalQueryResult[] = [];
  let totalHits = 0;
  let totalNonCurrent = 0;

  for (const gq of input.queries) {
    const raw = await input.retrieve(gq.query, k);
    const hits = Array.isArray(raw) ? raw.slice(0, k) : [];
    const retrieved_ids = hits.map((h) => h.memory_id);
    const nonCurrent = countNonCurrentHits(hits);
    totalHits += hits.length;
    totalNonCurrent += nonCurrent.count;

    const hit_relevant_count = retrieved_ids.filter((id) =>
      gq.relevant_ids.includes(id),
    ).length;

    per_query.push({
      query_id: gq.query_id,
      query: gq.query,
      k,
      retrieved_ids,
      relevant_ids: [...gq.relevant_ids],
      hit_relevant_count,
      recall_at_k: recallAtK(retrieved_ids, gq.relevant_ids),
      precision_at_k: precisionAtK(retrieved_ids, gq.relevant_ids, k),
      invalidated_or_stale_count: nonCurrent.count,
      invalidated_or_stale_ids: nonCurrent.ids,
    });
  }

  const recall = mean(per_query.map((q) => q.recall_at_k));
  const precision = mean(per_query.map((q) => q.precision_at_k));
  const invalidated_return_rate = totalHits === 0 ? 0 : totalNonCurrent / totalHits;

  const failures: string[] = [];
  if (recall < gates.recall_at_k_min) {
    failures.push(
      `recall_at_${k}=${recall.toFixed(4)} < gate ${gates.recall_at_k_min}`,
    );
  }
  if (precision < gates.precision_at_k_min) {
    failures.push(
      `precision_at_${k}=${precision.toFixed(4)} < gate ${gates.precision_at_k_min}`,
    );
  }
  if (invalidated_return_rate > gates.invalidated_return_rate_max) {
    failures.push(
      `invalidated_return_rate=${invalidated_return_rate.toFixed(4)} > gate ${gates.invalidated_return_rate_max} (INVALIDATED|STALE in result set)`,
    );
  }

  return {
    kind: "MemoryEvalSuiteReport",
    k,
    query_count: input.queries.length,
    metrics: {
      recall_at_k: honest(recall, honesty),
      precision_at_k: honest(precision, honesty),
      invalidated_return_rate: honest(invalidated_return_rate, honesty),
    },
    gates,
    passed: failures.length === 0,
    failures,
    per_query,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Built-in golden queries for offline eval / unit tests (k=5).
 * Each query has 5 relevant ids so a perfect top-5 can hit Precision@5 = 1.0 ≥ 0.80.
 */
export const DEFAULT_GOLDEN_QUERIES: GoldenQuery[] = [
  {
    query_id: "gq-sandbox",
    query: "bubblewrap sandbox isolation agent",
    relevant_ids: [
      "mem-sandbox-policy",
      "mem-bwrap-flags",
      "mem-sandbox-network",
      "mem-sandbox-landlock",
      "mem-sandbox-cgroup",
    ],
  },
  {
    query_id: "gq-promotion",
    query: "memory promotion gate validator human mso",
    relevant_ids: [
      "mem-promo-gate",
      "mem-no-self-promote",
      "mem-promo-actor",
      "mem-promo-audit",
      "mem-promo-contract",
    ],
  },
  {
    query_id: "gq-idempotency",
    query: "idempotency key saga compensation",
    relevant_ids: [
      "mem-idem-key",
      "mem-saga-comp",
      "mem-idem-claim",
      "mem-idem-replay",
      "mem-saga-unknown",
    ],
  },
  {
    query_id: "gq-tokens",
    query: "token economy crystallizer zero token skill",
    relevant_ids: [
      "mem-crystallizer",
      "mem-prefix-pin",
      "mem-nl-compress",
      "mem-tombstone",
      "mem-stateless-snap",
    ],
  },
];

/**
 * Corpus used by {@link createFixtureRetriever}. Includes ACTIVE gold rows plus
 * INVALIDATED/STALE distractors that a correct retriever must not return.
 */
export interface FixtureMemoryDoc {
  memory_id: string;
  status: string;
  /** Keywords matched against the query (simple bag-of-words). */
  terms: string[];
}

export const DEFAULT_FIXTURE_CORPUS: FixtureMemoryDoc[] = [
  // sandbox (5)
  { memory_id: "mem-sandbox-policy", status: "ACTIVE", terms: ["bubblewrap", "sandbox", "isolation", "agent", "policy"] },
  { memory_id: "mem-bwrap-flags", status: "ACTIVE", terms: ["bubblewrap", "sandbox", "isolation", "agent", "flags"] },
  { memory_id: "mem-sandbox-network", status: "ACTIVE", terms: ["bubblewrap", "sandbox", "isolation", "agent", "network"] },
  { memory_id: "mem-sandbox-landlock", status: "ACTIVE", terms: ["bubblewrap", "sandbox", "isolation", "agent", "landlock"] },
  { memory_id: "mem-sandbox-cgroup", status: "ACTIVE", terms: ["bubblewrap", "sandbox", "isolation", "agent", "cgroup"] },
  // promotion (5)
  { memory_id: "mem-promo-gate", status: "ACTIVE", terms: ["memory", "promotion", "gate", "validator", "human", "mso"] },
  { memory_id: "mem-no-self-promote", status: "ACTIVE", terms: ["memory", "promotion", "gate", "validator", "human", "mso"] },
  { memory_id: "mem-promo-actor", status: "ACTIVE", terms: ["memory", "promotion", "gate", "validator", "human", "mso"] },
  { memory_id: "mem-promo-audit", status: "ACTIVE", terms: ["memory", "promotion", "gate", "validator", "human", "mso"] },
  { memory_id: "mem-promo-contract", status: "ACTIVE", terms: ["memory", "promotion", "gate", "validator", "human", "mso"] },
  // idempotency (5)
  { memory_id: "mem-idem-key", status: "ACTIVE", terms: ["idempotency", "key", "saga", "compensation"] },
  { memory_id: "mem-saga-comp", status: "ACTIVE", terms: ["idempotency", "key", "saga", "compensation"] },
  { memory_id: "mem-idem-claim", status: "ACTIVE", terms: ["idempotency", "key", "saga", "compensation"] },
  { memory_id: "mem-idem-replay", status: "ACTIVE", terms: ["idempotency", "key", "saga", "compensation"] },
  { memory_id: "mem-saga-unknown", status: "ACTIVE", terms: ["idempotency", "key", "saga", "compensation"] },
  // tokens (5)
  { memory_id: "mem-crystallizer", status: "ACTIVE", terms: ["token", "economy", "crystallizer", "zero", "skill"] },
  { memory_id: "mem-prefix-pin", status: "ACTIVE", terms: ["token", "economy", "crystallizer", "zero", "skill"] },
  { memory_id: "mem-nl-compress", status: "ACTIVE", terms: ["token", "economy", "crystallizer", "zero", "skill"] },
  { memory_id: "mem-tombstone", status: "ACTIVE", terms: ["token", "economy", "crystallizer", "zero", "skill"] },
  { memory_id: "mem-stateless-snap", status: "ACTIVE", terms: ["token", "economy", "crystallizer", "zero", "skill"] },
  // Non-current distractors — must never appear as vigente
  {
    memory_id: "mem-old-docker-sandbox",
    status: "INVALIDATED",
    terms: ["bubblewrap", "sandbox", "isolation", "agent", "docker"],
  },
  {
    memory_id: "mem-stale-promo",
    status: "STALE",
    terms: ["memory", "promotion", "gate", "validator", "human", "mso"],
  },
];

function scoreDoc(query: string, doc: FixtureMemoryDoc): number {
  const qTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of qTerms) {
    if (doc.terms.some((d) => d.toLowerCase() === t || d.toLowerCase().includes(t))) {
      score += 1;
    }
  }
  return score;
}

/**
 * Correct fixture retriever: ranks ACTIVE docs only (filters INVALIDATED|STALE).
 * Passes default gates on {@link DEFAULT_GOLDEN_QUERIES}.
 */
export function createFixtureRetriever(
  corpus: FixtureMemoryDoc[] = DEFAULT_FIXTURE_CORPUS,
  opts?: { includeNonCurrent?: boolean },
): MemoryRetrieveFn {
  const includeNonCurrent = opts?.includeNonCurrent ?? false;
  return (query: string, k: number): MemoryEvalHit[] => {
    const ranked = corpus
      .filter((d) => includeNonCurrent || !isNonCurrentStatus(d.status))
      .map((d) => ({ d, score: scoreDoc(query, d) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.d.memory_id.localeCompare(b.d.memory_id))
      .slice(0, k)
      .map((x) => ({ memory_id: x.d.memory_id, status: x.d.status }));
    return ranked;
  };
}
