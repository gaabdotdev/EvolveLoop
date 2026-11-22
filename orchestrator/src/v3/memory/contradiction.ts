/**
 * V1-MEM-03 — Contradiction detection → SUPERSEDED / STALE on old memories.
 */

import type { MemoryRecord } from "./types.js";

export interface ContradictionSignal {
  kind: "ContradictionSignal";
  conflicts: boolean;
  reason: string;
  overlap_ratio: number;
  opposing_markers: string[];
}

const OPPOSITE_PAIRS: Array<[RegExp, RegExp]> = [
  [/\benable[sd]?\b/i, /\bdisable[sd]?\b/i],
  [/\ballow(ed|s)?\b/i, /\bdeny|denied|forbid(den)?\b/i],
  [/\btrue\b/i, /\bfalse\b/i],
  [/\bon\b/i, /\boff\b/i],
  [/\bmust\b/i, /\bmust not\b/i],
  [/\brequired\b/i, /\boptional|forbidden\b/i],
  [/\buse\b/i, /\bdo not use|avoid\b/i],
];

function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9_\u00c0-\u024f]+/gi) ?? []).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Heuristic contradiction: high topical overlap + opposing polarity markers.
 */
export function detectContradiction(
  existing: Pick<MemoryRecord, "title" | "body">,
  incoming: Pick<MemoryRecord, "title" | "body">,
): ContradictionSignal {
  const a = `${existing.title}\n${existing.body}`;
  const b = `${incoming.title}\n${incoming.body}`;
  const overlap_ratio = jaccard(tokenize(a), tokenize(b));
  const opposing_markers: string[] = [];

  for (const [pos, neg] of OPPOSITE_PAIRS) {
    const aPos = pos.test(a);
    const aNeg = neg.test(a);
    const bPos = pos.test(b);
    const bNeg = neg.test(b);
    if ((aPos && bNeg) || (aNeg && bPos)) {
      opposing_markers.push(`${pos.source}<->${neg.source}`);
    }
  }

  const conflicts = overlap_ratio >= 0.25 && opposing_markers.length > 0;
  return {
    kind: "ContradictionSignal",
    conflicts,
    reason: conflicts
      ? `topical_overlap=${overlap_ratio.toFixed(2)} opposing=${opposing_markers.join(",")}`
      : `no_contradiction overlap=${overlap_ratio.toFixed(2)}`,
    overlap_ratio,
    opposing_markers,
  };
}

export type ContradictionDisposition = "SUPERSEDED" | "STALE";

/**
 * When a conflicting decision is approved, choose disposition for the old memory.
 * - SUPERSEDED: same subject replaced by new decision (default).
 * - STALE: old remains historically relevant but must not drive new actions.
 */
export function dispositionForContradiction(
  signal: ContradictionSignal,
  opts?: { prefer_stale?: boolean },
): ContradictionDisposition | null {
  if (!signal.conflicts) return null;
  return opts?.prefer_stale ? "STALE" : "SUPERSEDED";
}
