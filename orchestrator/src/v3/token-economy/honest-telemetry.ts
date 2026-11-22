/**
 * Load honest MSO/Workers token telemetry from the Token Ledger SQLite store.
 */

import { existsSync } from "node:fs";
import { StateDb, defaultStateDbPath } from "../state-db/index.js";
import type { HonestMetric } from "../evolve-shell/footer.js";
import { aggregateTokenLedger, type TokenLedgerAggregate } from "./ledger-aggregate.js";

export interface HonestTokenTelemetry {
  tok_mso: HonestMetric;
  tok_workers: HonestMetric;
  aggregate: TokenLedgerAggregate | null;
}

function metricFrom(
  value: number,
  honesty: TokenLedgerAggregate["honesty"],
  entryCount: number,
): HonestMetric {
  if (entryCount === 0 || honesty === "UNAVAILABLE") {
    return { provenance: "UNAVAILABLE" };
  }
  const provenance =
    honesty === "reported" || honesty === "estimated" || honesty === "mixed"
      ? honesty === "mixed"
        ? "estimated"
        : honesty
      : "UNAVAILABLE";
  if (provenance === "UNAVAILABLE") return { provenance: "UNAVAILABLE" };
  return { value, provenance };
}

/**
 * Read workspace Token Ledger and return MSO vs Workers metrics.
 * When the DB is absent or empty → UNAVAILABLE (never silent 0).
 */
export function loadHonestTokenTelemetry(
  workspace: string,
  workId?: string,
): HonestTokenTelemetry {
  const dbPath = defaultStateDbPath(workspace);
  if (!existsSync(dbPath)) {
    return {
      tok_mso: { provenance: "UNAVAILABLE" },
      tok_workers: { provenance: "UNAVAILABLE" },
      aggregate: null,
    };
  }

  const db = new StateDb(dbPath);
  try {
    const rows = db.listTokenLedger(workId);
    if (rows.length === 0) {
      return {
        tok_mso: { provenance: "UNAVAILABLE" },
        tok_workers: { provenance: "UNAVAILABLE" },
        aggregate: null,
      };
    }
    const aggregate = aggregateTokenLedger(rows);
    return {
      tok_mso: metricFrom(aggregate.tokens_mso, aggregate.honesty, aggregate.mso_entry_count),
      tok_workers: metricFrom(
        aggregate.tokens_workers,
        aggregate.honesty,
        aggregate.worker_entry_count,
      ),
      aggregate,
    };
  } finally {
    db.close();
  }
}
