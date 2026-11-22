/**
 * JSON ProfileStore — append evidence, recompute AgentIntelligenceProfile.
 * V2-INT-03: observational only; never invent metrics.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AgentIntelligenceProfile,
  AgentRunEvidence,
  EvidenceHonesty,
  MetricHonesty,
  ObservedMetric,
  ProfileStoreSnapshot,
} from "./types.js";
import { observed } from "./score.js";

export class AgentProfileStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentProfileStoreError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

function emptySnapshot(): ProfileStoreSnapshot {
  return {
    kind: "AgentProfileStore",
    evidence: [],
    profiles: [],
    updated_at: nowIso(),
  };
}

function validateEvidence(ev: AgentRunEvidence): void {
  if (!ev.evidence_id?.trim()) {
    throw new AgentProfileStoreError("INVALID_EVIDENCE", "evidence_id required");
  }
  if (!ev.agent_id?.trim()) {
    throw new AgentProfileStoreError("INVALID_EVIDENCE", "agent_id required");
  }
  if (!ev.task_type?.trim()) {
    throw new AgentProfileStoreError("INVALID_EVIDENCE", "task_type required");
  }
  if (!ev.observed_at?.trim()) {
    throw new AgentProfileStoreError("INVALID_EVIDENCE", "observed_at required");
  }
  if (typeof ev.true_full_pass !== "boolean") {
    throw new AgentProfileStoreError("INVALID_EVIDENCE", "true_full_pass required boolean");
  }
  if (!ev.honesty || ev.honesty.true_full_pass === "UNAVAILABLE") {
    throw new AgentProfileStoreError(
      "INVALID_EVIDENCE",
      "true_full_pass must be an observed metric (honesty ≠ UNAVAILABLE)",
    );
  }
  assertFieldHonesty("rework_count", ev.rework_count, ev.honesty.rework_count);
  assertFieldHonesty("latency_ms", ev.latency_ms, ev.honesty.latency_ms);
  assertFieldHonesty("cost_usd", ev.cost_usd, ev.honesty.cost_usd);
  assertFieldHonesty("tokens_in", ev.tokens_in, ev.honesty.tokens_in);
  assertFieldHonesty("tokens_out", ev.tokens_out, ev.honesty.tokens_out);
}

function assertFieldHonesty(
  name: string,
  value: number | null,
  honesty: MetricHonesty,
): void {
  if (honesty === "UNAVAILABLE" && value != null) {
    throw new AgentProfileStoreError(
      "INVALID_EVIDENCE",
      `${name}: UNAVAILABLE honesty requires null value`,
    );
  }
  if (honesty !== "UNAVAILABLE" && value == null) {
    throw new AgentProfileStoreError(
      "INVALID_EVIDENCE",
      `${name}: reported/estimated honesty requires a numeric value`,
    );
  }
}

function meanOf(
  values: number[],
  honestyIfPresent: MetricHonesty,
): ObservedMetric {
  if (values.length === 0) {
    return observed(null, "UNAVAILABLE");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return observed(sum / values.length, honestyIfPresent);
}

/**
 * Aggregate evidence into a profile. Pure — does not invent missing fields.
 */
export function recomputeProfileFromEvidence(
  agentId: string,
  taskType: string,
  evidence: readonly AgentRunEvidence[],
  updatedAt = nowIso(),
): AgentIntelligenceProfile {
  const rows = evidence.filter(
    (e) => e.agent_id === agentId && e.task_type === taskType,
  );

  if (rows.length === 0) {
    return {
      kind: "AgentIntelligenceProfile",
      agent_id: agentId,
      task_type: taskType,
      sample_size: 0,
      window_start: updatedAt,
      window_end: updatedAt,
      true_full_pass_rate: observed(null, "UNAVAILABLE"),
      rework_mean: observed(null, "UNAVAILABLE"),
      avg_latency_ms: observed(null, "UNAVAILABLE"),
      avg_cost_usd: observed(null, "UNAVAILABLE"),
      avg_tokens: observed(null, "UNAVAILABLE"),
      updated_at: updatedAt,
    };
  }

  const sorted = [...rows].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const window_start = sorted[0]!.observed_at;
  const window_end = sorted[sorted.length - 1]!.observed_at;
  const sample_size = sorted.length;

  const passes = sorted.filter((r) => r.true_full_pass).length;
  const true_full_pass_rate = observed(passes / sample_size, "reported");

  const reworks = sorted
    .filter((r) => r.honesty.rework_count !== "UNAVAILABLE" && r.rework_count != null)
    .map((r) => r.rework_count as number);
  const reworkHonesty: MetricHonesty = reworks.length === 0
    ? "UNAVAILABLE"
    : reworks.length === sample_size &&
        sorted.every((r) => r.honesty.rework_count === "reported")
      ? "reported"
      : "estimated";
  const rework_mean = meanOf(reworks, reworkHonesty);

  const latencies = sorted
    .filter((r) => r.honesty.latency_ms !== "UNAVAILABLE" && r.latency_ms != null)
    .map((r) => r.latency_ms as number);
  const latencyHonesty: MetricHonesty =
    latencies.length === 0
      ? "UNAVAILABLE"
      : latencies.length === sample_size &&
          sorted.every((r) => r.honesty.latency_ms === "reported")
        ? "reported"
        : "estimated";
  const avg_latency_ms = meanOf(latencies, latencyHonesty);

  const costs = sorted
    .filter((r) => r.honesty.cost_usd !== "UNAVAILABLE" && r.cost_usd != null)
    .map((r) => r.cost_usd as number);
  const costHonesty: MetricHonesty =
    costs.length === 0
      ? "UNAVAILABLE"
      : costs.length === sample_size &&
          sorted.every((r) => r.honesty.cost_usd === "reported")
        ? "reported"
        : "estimated";
  const avg_cost_usd = meanOf(costs, costHonesty);

  const tokenTotals: number[] = [];
  let tokenHonesty: MetricHonesty = "UNAVAILABLE";
  for (const r of sorted) {
    const inOk = r.honesty.tokens_in !== "UNAVAILABLE" && r.tokens_in != null;
    const outOk = r.honesty.tokens_out !== "UNAVAILABLE" && r.tokens_out != null;
    if (inOk && outOk) {
      tokenTotals.push((r.tokens_in as number) + (r.tokens_out as number));
    }
  }
  if (tokenTotals.length > 0) {
    tokenHonesty =
      tokenTotals.length === sample_size &&
      sorted.every(
        (r) =>
          r.honesty.tokens_in === "reported" && r.honesty.tokens_out === "reported",
      )
        ? "reported"
        : "estimated";
  }
  const avg_tokens = meanOf(tokenTotals, tokenHonesty);

  return {
    kind: "AgentIntelligenceProfile",
    agent_id: agentId,
    task_type: taskType,
    sample_size,
    window_start,
    window_end,
    true_full_pass_rate,
    rework_mean,
    avg_latency_ms,
    avg_cost_usd,
    avg_tokens,
    updated_at: updatedAt,
  };
}

/** Convenience builder for fully-reported evidence (tests / adapters). */
export function reportedEvidence(
  partial: Omit<AgentRunEvidence, "honesty" | "rework_count" | "latency_ms" | "cost_usd" | "tokens_in" | "tokens_out"> & {
    rework_count: number;
    latency_ms: number;
    cost_usd: number;
    tokens_in: number;
    tokens_out: number;
  },
): AgentRunEvidence {
  const honesty: EvidenceHonesty = {
    true_full_pass: "reported",
    rework_count: "reported",
    latency_ms: "reported",
    cost_usd: "reported",
    tokens_in: "reported",
    tokens_out: "reported",
  };
  return { ...partial, honesty };
}

/** Convenience: mark optional numeric fields as UNAVAILABLE. */
export function unavailableFieldsEvidence(
  base: Pick<
    AgentRunEvidence,
    "evidence_id" | "agent_id" | "task_type" | "observed_at" | "true_full_pass"
  > & {
    unavailable: Array<keyof Omit<EvidenceHonesty, "true_full_pass">>;
    reported?: Partial<
      Pick<AgentRunEvidence, "rework_count" | "latency_ms" | "cost_usd" | "tokens_in" | "tokens_out">
    >;
  },
): AgentRunEvidence {
  const honesty: EvidenceHonesty = {
    true_full_pass: "reported",
    rework_count: "reported",
    latency_ms: "reported",
    cost_usd: "reported",
    tokens_in: "reported",
    tokens_out: "reported",
  };
  for (const f of base.unavailable) {
    honesty[f] = "UNAVAILABLE";
  }
  const reported = base.reported ?? {};
  return {
    evidence_id: base.evidence_id,
    agent_id: base.agent_id,
    task_type: base.task_type,
    observed_at: base.observed_at,
    true_full_pass: base.true_full_pass,
    rework_count: honesty.rework_count === "UNAVAILABLE" ? null : (reported.rework_count ?? 0),
    latency_ms: honesty.latency_ms === "UNAVAILABLE" ? null : (reported.latency_ms ?? 0),
    cost_usd: honesty.cost_usd === "UNAVAILABLE" ? null : (reported.cost_usd ?? 0),
    tokens_in: honesty.tokens_in === "UNAVAILABLE" ? null : (reported.tokens_in ?? 0),
    tokens_out: honesty.tokens_out === "UNAVAILABLE" ? null : (reported.tokens_out ?? 0),
    honesty,
  };
}

export class AgentProfileStore {
  private readonly filePath: string;

  constructor(rootDir: string, fileName = "agent-profiles.json") {
    mkdirSync(rootDir, { recursive: true });
    this.filePath = join(rootDir, fileName);
  }

  load(): ProfileStoreSnapshot {
    if (!existsSync(this.filePath)) return emptySnapshot();
    const parsed = JSON.parse(readFileSync(this.filePath, "utf-8")) as ProfileStoreSnapshot;
    if (parsed.kind !== "AgentProfileStore") {
      throw new AgentProfileStoreError("INVALID", this.filePath);
    }
    return parsed;
  }

  private save(snap: ProfileStoreSnapshot): void {
    atomicWrite(this.filePath, JSON.stringify(snap, null, 2));
  }

  listEvidence(): AgentRunEvidence[] {
    return [...this.load().evidence];
  }

  listProfiles(taskType?: string): AgentIntelligenceProfile[] {
    const profiles = this.load().profiles;
    if (taskType == null) return [...profiles];
    return profiles.filter((p) => p.task_type === taskType);
  }

  getProfile(agentId: string, taskType: string): AgentIntelligenceProfile | null {
    return (
      this.load().profiles.find(
        (p) => p.agent_id === agentId && p.task_type === taskType,
      ) ?? null
    );
  }

  /**
   * Append evidence and recompute the (agent_id, task_type) profile.
   * Idempotent on evidence_id: duplicate id with same payload is a no-op replay;
   * conflicting payload → conflict error.
   */
  appendEvidence(ev: AgentRunEvidence): AgentIntelligenceProfile {
    validateEvidence(ev);
    const snap = this.load();
    const existing = snap.evidence.find((e) => e.evidence_id === ev.evidence_id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(ev)) {
        throw new AgentProfileStoreError(
          "EVIDENCE_CONFLICT",
          `evidence_id ${ev.evidence_id} already stored with different payload`,
        );
      }
      return (
        snap.profiles.find(
          (p) => p.agent_id === ev.agent_id && p.task_type === ev.task_type,
        ) ??
        recomputeProfileFromEvidence(ev.agent_id, ev.task_type, snap.evidence)
      );
    }

    snap.evidence.push(ev);
    const profile = recomputeProfileFromEvidence(
      ev.agent_id,
      ev.task_type,
      snap.evidence,
    );
    const idx = snap.profiles.findIndex(
      (p) => p.agent_id === ev.agent_id && p.task_type === ev.task_type,
    );
    if (idx >= 0) snap.profiles[idx] = profile;
    else snap.profiles.push(profile);
    snap.updated_at = nowIso();
    this.save(snap);
    return profile;
  }

  /** Force recompute for one pair from current evidence (e.g. after window trim). */
  recomputeProfile(agentId: string, taskType: string): AgentIntelligenceProfile {
    const snap = this.load();
    const profile = recomputeProfileFromEvidence(agentId, taskType, snap.evidence);
    const idx = snap.profiles.findIndex(
      (p) => p.agent_id === agentId && p.task_type === taskType,
    );
    if (idx >= 0) snap.profiles[idx] = profile;
    else if (profile.sample_size > 0) snap.profiles.push(profile);
    snap.updated_at = nowIso();
    this.save(snap);
    return profile;
  }
}
