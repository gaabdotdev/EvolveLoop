/**
 * Honest Token Ledger aggregation for HUD / delivery card.
 *
 * MSO + Workers (incl. subagents) must sum to the reported total —
 * never inflate, omit, or invent silent zeros.
 */

import type { TokenCostProvenance, TokenLedgerEntry } from "../state-db/types.js";

export type TokenRoleBucket = "mso" | "workers";

export interface TokenLedgerAggregate {
  kind: "TokenLedgerAggregate";
  tokens_mso: number;
  tokens_workers: number;
  /** tokens_mso + tokens_workers (always equal when honesty holds). */
  tokens_total: number;
  /** Entry-level sum of (in+out) for cross-check — must equal tokens_total. */
  tokens_raw_sum: number;
  entry_count: number;
  mso_entry_count: number;
  worker_entry_count: number;
  subagent_entry_count: number;
  provenance: TokenCostProvenance | "mixed";
  honesty: "reported" | "estimated" | "UNAVAILABLE" | "mixed";
  limitations: string[];
}

const MSO_SUBSYSTEM_RE =
  /^(mso(\.|$)|grill(\.|$)|circuit\.evidence_validator|intake(\.|$)|coordinator(\.|$))/i;

const WORKER_SUBSYSTEM_RE =
  /^(worker(\.|$)|shell(\.|$)|circuit\.adapter|adapter(\.|$)|subagent(\.|$)|harness(\.|$)|agent(\.|$))/i;

const SUBAGENT_SUBSYSTEM_RE = /subagent/i;

/**
 * Classify a ledger subsystem into MSO vs Workers.
 * Unknown subsystems default to workers so spend is never omitted from the total.
 */
export function classifyTokenSubsystem(subsystem?: string | null): TokenRoleBucket {
  const s = (subsystem ?? "").trim();
  if (!s) return "workers";
  if (MSO_SUBSYSTEM_RE.test(s)) return "mso";
  if (WORKER_SUBSYSTEM_RE.test(s)) return "workers";
  // Explicit payload role wins when present via "role:mso" / "role:worker" prefixes
  if (/^role:mso/i.test(s)) return "mso";
  if (/^role:(worker|subagent)/i.test(s)) return "workers";
  return "workers";
}

export function isSubagentSubsystem(subsystem?: string | null): boolean {
  return SUBAGENT_SUBSYSTEM_RE.test(subsystem ?? "");
}

/** Honest per-entry token total: sum of reported in+out; nulls contribute 0 only when both absent → counted as unavailable entry. */
export function entryTokenTotal(entry: Pick<TokenLedgerEntry, "tokens_in" | "tokens_out">): {
  total: number;
  measured: boolean;
} {
  const hasIn = typeof entry.tokens_in === "number";
  const hasOut = typeof entry.tokens_out === "number";
  if (!hasIn && !hasOut) return { total: 0, measured: false };
  return {
    total: (hasIn ? (entry.tokens_in as number) : 0) + (hasOut ? (entry.tokens_out as number) : 0),
    measured: true,
  };
}

function mergeProvenance(
  a: TokenCostProvenance | "mixed" | undefined,
  b: TokenCostProvenance,
): TokenCostProvenance | "mixed" {
  if (!a) return b;
  if (a === b) return a;
  return "mixed";
}

/**
 * Aggregate ledger rows into MSO vs Workers (subagents roll into Workers).
 * Invariant: tokens_mso + tokens_workers === tokens_total === tokens_raw_sum.
 */
export function aggregateTokenLedger(entries: TokenLedgerEntry[]): TokenLedgerAggregate {
  let tokens_mso = 0;
  let tokens_workers = 0;
  let tokens_raw_sum = 0;
  let mso_entry_count = 0;
  let worker_entry_count = 0;
  let subagent_entry_count = 0;
  let measured = 0;
  let provenance: TokenCostProvenance | "mixed" | undefined;

  for (const entry of entries) {
    const { total, measured: ok } = entryTokenTotal(entry);
    tokens_raw_sum += total;
    if (ok) measured += 1;
    provenance = mergeProvenance(provenance, entry.cost_provenance);

    const bucket = classifyTokenSubsystem(entry.subsystem);
    if (bucket === "mso") {
      tokens_mso += total;
      mso_entry_count += 1;
    } else {
      tokens_workers += total;
      worker_entry_count += 1;
      if (isSubagentSubsystem(entry.subsystem)) subagent_entry_count += 1;
    }
  }

  const tokens_total = tokens_mso + tokens_workers;
  const limitations = [
    "Aggregation sums tokens_in+tokens_out as reported — never invents spend",
    "Subagent subsystems roll into Workers (included in tokens_workers and tokens_total)",
    "Unknown subsystem defaults to Workers so spend is never omitted from the total",
  ];

  let honesty: TokenLedgerAggregate["honesty"] = "UNAVAILABLE";
  if (entries.length === 0) {
    honesty = "UNAVAILABLE";
  } else if (measured === 0) {
    honesty = provenance === "estimated" ? "estimated" : "UNAVAILABLE";
  } else if (provenance === "mixed") {
    honesty = "mixed";
  } else if (provenance === "estimated") {
    honesty = "estimated";
  } else if (provenance === "reported") {
    honesty = "reported";
  } else {
    honesty = "UNAVAILABLE";
  }

  return {
    kind: "TokenLedgerAggregate",
    tokens_mso,
    tokens_workers,
    tokens_total,
    tokens_raw_sum,
    entry_count: entries.length,
    mso_entry_count,
    worker_entry_count,
    subagent_entry_count,
    provenance: provenance ?? "UNAVAILABLE",
    honesty,
    limitations,
  };
}
