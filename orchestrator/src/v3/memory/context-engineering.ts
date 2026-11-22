/**
 * V1-MEM-02 — Dynamic Context Engineering for MemoryBroker.
 * Respect token_budget per task; prioritize current contract requirements.
 */

import type { MemoryRecord, MemorySearchHit } from "./types.js";

export interface ContractRequirement {
  id: string;
  text: string;
  /** Higher = more important (default 1). */
  weight?: number;
}

export interface ContextEngineeringInput {
  token_budget: number;
  /** Active contract requirements for the current task. */
  contract_requirements: ContractRequirement[];
  /** Candidate memories (typically ACTIVE, non-tainted). */
  candidates: Array<MemoryRecord | MemorySearchHit>;
  /** Approx chars per token (default 4). */
  chars_per_token?: number;
}

export interface ContextMemorySlice {
  memory_id: string;
  title: string;
  body: string;
  priority_score: number;
  estimated_tokens: number;
  matched_requirements: string[];
}

export interface EngineeredContext {
  kind: "EngineeredContext";
  token_budget: number;
  tokens_used: number;
  slices: ContextMemorySlice[];
  omitted_memory_ids: string[];
  prioritized_requirement_ids: string[];
}

function estimateTokens(text: string, charsPerToken: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerToken));
}

function asRecord(c: MemoryRecord | MemorySearchHit): MemoryRecord {
  return "record" in c && c.record ? c.record : (c as MemoryRecord);
}

function requirementOverlap(req: ContractRequirement, rec: MemoryRecord): number {
  const tokens = req.text.toLowerCase().match(/[a-z0-9_\u00c0-\u024f]+/gi) ?? [];
  if (tokens.length === 0) return 0;
  const hay = `${rec.title} ${rec.body}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  return hits / tokens.length;
}

/**
 * Pack memories into a token budget, preferring those that match contract requirements.
 */
export function engineerContext(input: ContextEngineeringInput): EngineeredContext {
  const charsPerToken = input.chars_per_token ?? 4;
  const budget = Math.max(0, Math.floor(input.token_budget));
  const reqs = input.contract_requirements;

  const scored = input.candidates.map((c) => {
    const rec = asRecord(c);
    const matched: string[] = [];
    let priority = 0;
    for (const req of reqs) {
      const overlap = requirementOverlap(req, rec);
      if (overlap > 0) {
        matched.push(req.id);
        priority += overlap * (req.weight ?? 1) * 10;
      }
    }
    // Prefer decision/semantic slightly; demote tainted.
    if (rec.memory_type === "decision") priority += 2;
    if (rec.memory_type === "semantic") priority += 1;
    if (rec.tainted) priority -= 100;
    if (rec.status !== "ACTIVE") priority -= 5;

    const body = `${rec.title}\n${rec.body}`;
    return {
      memory_id: rec.memory_id,
      title: rec.title,
      body: rec.body,
      priority_score: priority,
      estimated_tokens: estimateTokens(body, charsPerToken),
      matched_requirements: matched,
    } satisfies ContextMemorySlice;
  });

  scored.sort((a, b) => b.priority_score - a.priority_score || a.estimated_tokens - b.estimated_tokens);

  const slices: ContextMemorySlice[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const s of scored) {
    if (used + s.estimated_tokens <= budget) {
      slices.push(s);
      used += s.estimated_tokens;
    } else {
      omitted.push(s.memory_id);
    }
  }

  const prioritized_requirement_ids = [...reqs]
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
    .map((r) => r.id);

  return {
    kind: "EngineeredContext",
    token_budget: budget,
    tokens_used: used,
    slices,
    omitted_memory_ids: omitted,
    prioritized_requirement_ids,
  };
}
