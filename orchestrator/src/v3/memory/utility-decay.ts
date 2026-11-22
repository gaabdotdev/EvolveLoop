/**
 * V3-MEM-06 — Utility-Based Decay (active forgetting).
 *
 * Demote low-utility hot memories to Content-Addressed Cold Storage (MEM-01).
 * Utility rewards TRUE-FULL-PASS contribution and recency; penalizes rework
 * correlation. Audit trail of every demotion is retained (CAS blob + decision log).
 *
 * score = w_tfp * true_full_pass_contrib
 *       - w_rework * rework_correlation
 *       + w_recency * recency
 */

import type { ColdStorage, ColdMigrateResult } from "./cold-storage.js";
import type { MemoryBroker } from "./broker.js";
import type { MemoryRecord } from "./types.js";

export const UTILITY_DECAY_SCHEMA_VERSION = "1";

/** Default weights — TFP and rework dominate; recency is a mild keep-hot bias. */
export const DEFAULT_UTILITY_WEIGHTS = {
  true_full_pass_contrib: 1.0,
  rework_correlation: 1.0,
  recency: 0.25,
} as const;

/** Default: demote when score is strictly below this threshold. */
export const DEFAULT_UTILITY_THRESHOLD = 0.35;

export class UtilityDecayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UtilityDecayError";
  }
}

/**
 * Observational signals for a single memory.
 * Callers supply measured/estimated values; this module never invents them.
 * Expected ranges are [0, 1] (clamped).
 */
export interface UtilitySignals {
  /** How much this memory contributed to TRUE-FULL-PASS outcomes (higher = keep). */
  true_full_pass_contrib: number;
  /** Correlation with rework / retries (higher = demote). */
  rework_correlation: number;
  /** Recency score (higher = more recent = keep). */
  recency: number;
}

export interface UtilityWeights {
  true_full_pass_contrib: number;
  rework_correlation: number;
  recency: number;
}

/** Minimal memory identity needed for scoring / decay. */
export interface UtilityMemoryRef {
  memory_id: string;
  /** Optional; used only in audit metadata. */
  title?: string;
  cas_hash?: string | null;
  created_at?: string;
}

export interface UtilityScoreBreakdown {
  memory_id: string;
  score: number;
  signals: UtilitySignals;
  /** Signals after clamp to [0, 1]. */
  clamped: UtilitySignals;
  weights: UtilityWeights;
  components: {
    true_full_pass_contrib: number;
    rework_penalty: number;
    recency_bonus: number;
  };
  /** True when score < threshold (candidate for cold migration). */
  low_utility: boolean;
  /** Skip reasons when memory is not eligible for decay. */
  skip_reason?: string;
}

export interface DecayAuditEntry {
  audit_id: string;
  memory_id: string;
  action: "migrated_to_cold" | "skipped";
  at: string;
  utility_score: number;
  signals: UtilitySignals;
  threshold: number;
  cas_hash: string | null;
  summary: string | null;
  reason: string;
  /** Opaque metadata retained for forensics (never deletes prior audit). */
  metadata: Record<string, unknown>;
}

export interface DecayCandidate {
  memory: UtilityMemoryRef | MemoryRecord;
  signals: UtilitySignals;
}

export interface DecayPassOptions {
  broker: MemoryBroker;
  cold: ColdStorage;
  candidates: DecayCandidate[];
  /** Demote when score < threshold. Default DEFAULT_UTILITY_THRESHOLD. */
  threshold?: number;
  weights?: Partial<UtilityWeights>;
  /** Cap how many migrations happen in one pass (lowest scores first). */
  max_migrations?: number;
  /** Injected clock for deterministic tests. */
  now?: () => Date;
  /**
   * Prior audit trail to append to (preserves history across passes).
   * Mutated in place when provided; otherwise a fresh array is created.
   */
  audit_trail?: DecayAuditEntry[];
}

export interface DecayPassResult {
  scored: UtilityScoreBreakdown[];
  migrated: Array<{
    memory_id: string;
    utility_score: number;
    cas_hash: string;
    migration: ColdMigrateResult;
    record: MemoryRecord;
  }>;
  skipped: UtilityScoreBreakdown[];
  /** Full append-only audit trail (includes prior entries when opted in). */
  audit_trail: DecayAuditEntry[];
  threshold: number;
  weights: UtilityWeights;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function assertFiniteSignal(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UtilityDecayError(
      "INVALID_SIGNAL",
      `signals.${name} must be a finite number; got ${String(value)}`,
    );
  }
  return value;
}

function normalizeSignals(signals: UtilitySignals): UtilitySignals {
  return {
    true_full_pass_contrib: assertFiniteSignal(
      "true_full_pass_contrib",
      signals.true_full_pass_contrib,
    ),
    rework_correlation: assertFiniteSignal("rework_correlation", signals.rework_correlation),
    recency: assertFiniteSignal("recency", signals.recency),
  };
}

function resolveWeights(partial?: Partial<UtilityWeights>): UtilityWeights {
  return {
    true_full_pass_contrib:
      partial?.true_full_pass_contrib ?? DEFAULT_UTILITY_WEIGHTS.true_full_pass_contrib,
    rework_correlation:
      partial?.rework_correlation ?? DEFAULT_UTILITY_WEIGHTS.rework_correlation,
    recency: partial?.recency ?? DEFAULT_UTILITY_WEIGHTS.recency,
  };
}

function memoryIdOf(memory: UtilityMemoryRef | MemoryRecord): string {
  const id = memory?.memory_id;
  if (!id || typeof id !== "string") {
    throw new UtilityDecayError("MEMORY_ID_REQUIRED", "memory.memory_id is required");
  }
  return id;
}

/**
 * Deterministic utility score for a memory given observational signals.
 * Higher score → keep hot; lower → candidate for cold demotion.
 */
export function scoreUtility(
  memory: UtilityMemoryRef | MemoryRecord,
  signals: UtilitySignals,
  opts?: { weights?: Partial<UtilityWeights>; threshold?: number },
): UtilityScoreBreakdown {
  const memory_id = memoryIdOf(memory);
  const raw = normalizeSignals(signals);
  const clamped: UtilitySignals = {
    true_full_pass_contrib: clamp01(raw.true_full_pass_contrib),
    rework_correlation: clamp01(raw.rework_correlation),
    recency: clamp01(raw.recency),
  };
  const weights = resolveWeights(opts?.weights);
  const threshold = opts?.threshold ?? DEFAULT_UTILITY_THRESHOLD;

  const true_full_pass_contrib =
    weights.true_full_pass_contrib * clamped.true_full_pass_contrib;
  const rework_penalty = weights.rework_correlation * clamped.rework_correlation;
  const recency_bonus = weights.recency * clamped.recency;
  const score = true_full_pass_contrib - rework_penalty + recency_bonus;

  let skip_reason: string | undefined;
  if (memory.cas_hash) {
    skip_reason = "already_cold";
  }

  return {
    memory_id,
    score,
    signals: raw,
    clamped,
    weights,
    components: {
      true_full_pass_contrib,
      rework_penalty,
      recency_bonus,
    },
    low_utility: skip_reason ? false : score < threshold,
    skip_reason,
  };
}

function newAuditId(now: Date, memory_id: string, seq: number): string {
  return `decay:${now.toISOString()}:${memory_id}:${seq}`;
}

/**
 * One decay pass: score candidates, migrate low-utility hot rows to Cold CAS,
 * append audit entries (never deletes prior trail or CAS blobs).
 */
export async function decayPass(opts: DecayPassOptions): Promise<DecayPassResult> {
  if (!opts?.broker) {
    throw new UtilityDecayError("BROKER_REQUIRED", "decayPass requires broker");
  }
  if (!opts?.cold) {
    throw new UtilityDecayError("COLD_REQUIRED", "decayPass requires cold storage");
  }
  if (!Array.isArray(opts.candidates)) {
    throw new UtilityDecayError("CANDIDATES_REQUIRED", "decayPass requires candidates[]");
  }

  const threshold = opts.threshold ?? DEFAULT_UTILITY_THRESHOLD;
  const weights = resolveWeights(opts.weights);
  const nowFn = opts.now ?? (() => new Date());
  const atDate = nowFn();
  const at = atDate.toISOString();
  const audit_trail = opts.audit_trail ?? [];
  const maxMigrations =
    opts.max_migrations != null && Number.isFinite(opts.max_migrations)
      ? Math.max(0, Math.floor(opts.max_migrations))
      : Number.POSITIVE_INFINITY;

  const casById = new Map<string, string | null>();
  const scored: UtilityScoreBreakdown[] = opts.candidates.map((c) => {
    const id = memoryIdOf(c.memory);
    casById.set(id, c.memory.cas_hash ?? null);
    return scoreUtility(c.memory, c.signals, { weights, threshold });
  });

  // Lowest utility first among eligible low-utility hot memories.
  const demoteQueue = scored
    .filter((s) => s.low_utility && !s.skip_reason)
    .sort((a, b) => {
      const ds = a.score - b.score;
      if (ds !== 0) return ds;
      return a.memory_id.localeCompare(b.memory_id);
    });

  const migrated: DecayPassResult["migrated"] = [];
  const skipped: UtilityScoreBreakdown[] = [];
  let seq = audit_trail.length;

  for (const s of scored) {
    if (s.skip_reason === "already_cold") {
      skipped.push(s);
      audit_trail.push({
        audit_id: newAuditId(atDate, s.memory_id, seq++),
        memory_id: s.memory_id,
        action: "skipped",
        at,
        utility_score: s.score,
        signals: s.signals,
        threshold,
        cas_hash: casById.get(s.memory_id) ?? null,
        summary: null,
        reason: "already_cold",
        metadata: { components: s.components },
      });
    }
  }

  let migratedCount = 0;
  for (const s of demoteQueue) {
    if (migratedCount >= maxMigrations) {
      skipped.push({ ...s, skip_reason: "max_migrations" });
      audit_trail.push({
        audit_id: newAuditId(atDate, s.memory_id, seq++),
        memory_id: s.memory_id,
        action: "skipped",
        at,
        utility_score: s.score,
        signals: s.signals,
        threshold,
        cas_hash: null,
        summary: null,
        reason: "max_migrations",
        metadata: { components: s.components, max_migrations: maxMigrations },
      });
      continue;
    }

    const { record, migration } = await opts.broker.migrateToCold(s.memory_id, opts.cold, {
      summary: undefined,
    });

    migrated.push({
      memory_id: s.memory_id,
      utility_score: s.score,
      cas_hash: migration.cas_hash,
      migration,
      record,
    });
    migratedCount += 1;

    audit_trail.push({
      audit_id: newAuditId(atDate, s.memory_id, seq++),
      memory_id: s.memory_id,
      action: "migrated_to_cold",
      at,
      utility_score: s.score,
      signals: s.signals,
      threshold,
      cas_hash: migration.cas_hash,
      summary: migration.summary,
      reason: `low_utility score=${s.score.toFixed(4)} < threshold=${threshold}`,
      metadata: {
        components: s.components,
        weights: s.weights,
        raw_bytes: migration.raw_bytes,
        compressed_bytes: migration.compressed_bytes,
        title: record.title,
      },
    });
  }

  // High-utility (kept hot) — recorded as skip for completeness of the pass.
  for (const s of scored) {
    if (s.skip_reason || s.low_utility) continue;
    skipped.push({ ...s, skip_reason: "above_threshold" });
    audit_trail.push({
      audit_id: newAuditId(atDate, s.memory_id, seq++),
      memory_id: s.memory_id,
      action: "skipped",
      at,
      utility_score: s.score,
      signals: s.signals,
      threshold,
      cas_hash: null,
      summary: null,
      reason: "above_threshold",
      metadata: { components: s.components },
    });
  }

  return {
    scored,
    migrated,
    skipped,
    audit_trail,
    threshold,
    weights,
  };
}

/**
 * Derive a crude recency signal in [0,1] from an ISO timestamp vs `now`.
 * Half-life default 7 days — convenience for callers; not required by scoreUtility.
 */
export function recencyFromTimestamp(
  isoTimestamp: string | null | undefined,
  now: Date = new Date(),
  halfLifeMs = 7 * 24 * 60 * 60 * 1000,
): number {
  if (!isoTimestamp) return 0;
  const t = Date.parse(isoTimestamp);
  if (!Number.isFinite(t)) return 0;
  const age = Math.max(0, now.getTime() - t);
  if (halfLifeMs <= 0) return age === 0 ? 1 : 0;
  return clamp01(Math.exp(-Math.LN2 * (age / halfLifeMs)));
}
