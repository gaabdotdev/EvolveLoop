/**
 * M19 — Token Ledger honest aggregation: MSO + Workers (+ subagents) = total.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateDb } from "../../src/v3/state-db/index.js";
import {
  aggregateTokenLedger,
  classifyTokenSubsystem,
  isSubagentSubsystem,
} from "../../src/v3/token-economy/ledger-aggregate.js";
import {
  buildDeliveryCardView,
  formatDeliveryTokens,
} from "../../src/cli/tui/delivery-card-view.js";

describe("M19 Token Ledger honest rollup", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "m19-tok-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("classifies MSO vs worker vs subagent subsystems", () => {
    expect(classifyTokenSubsystem("mso.planning")).toBe("mso");
    expect(classifyTokenSubsystem("grill.intake")).toBe("mso");
    expect(classifyTokenSubsystem("shell.authorized_execution")).toBe("workers");
    expect(classifyTokenSubsystem("circuit.evidence_validator")).toBe("mso");
    expect(classifyTokenSubsystem("circuit.adapter")).toBe("workers");
    expect(classifyTokenSubsystem("worker.implement")).toBe("workers");
    expect(classifyTokenSubsystem("subagent.helper")).toBe("workers");
    expect(isSubagentSubsystem("subagent.helper")).toBe(true);
    expect(isSubagentSubsystem("circuit.adapter")).toBe(false);
  });

  it("fixtures: MSO + Workers + subagents sum equals total (no omit / no inflate)", () => {
    const db = new StateDb(path.join(tmp, "state.db"));
    try {
      db.recordTokenLedger({
        work_id: "w-m19",
        task_id: "mso-1",
        subsystem: "mso.planning",
        tokens_in: 100,
        tokens_out: 50,
        cost_provenance: "reported",
        status: "ok",
      });
      db.recordTokenLedger({
        work_id: "w-m19",
        task_id: "worker-1",
        subsystem: "circuit.adapter",
        tokens_in: 200,
        tokens_out: 80,
        cost_provenance: "reported",
        status: "ok",
      });
      db.recordTokenLedger({
        work_id: "w-m19",
        task_id: "sub-1",
        subsystem: "subagent.reviewer",
        tokens_in: 40,
        tokens_out: 20,
        cost_provenance: "reported",
        status: "ok",
      });
      db.recordTokenLedger({
        work_id: "w-m19",
        task_id: "sub-2",
        subsystem: "subagent.helper",
        tokens_in: 10,
        tokens_out: 5,
        cost_provenance: "reported",
        status: "ok",
      });

      const rows = db.listTokenLedger("w-m19");
      const rollup = aggregateTokenLedger(rows);

      // 150 MSO + (280 worker + 60 + 15 subagents) = 505
      expect(rollup.tokens_mso).toBe(150);
      expect(rollup.tokens_workers).toBe(280 + 60 + 15);
      expect(rollup.tokens_total).toBe(rollup.tokens_mso + rollup.tokens_workers);
      expect(rollup.tokens_raw_sum).toBe(rollup.tokens_total);
      expect(rollup.tokens_total).toBe(505);
      expect(rollup.subagent_entry_count).toBe(2);
      expect(rollup.honesty).toBe("reported");

      const line = formatDeliveryTokens(rollup.tokens_mso, rollup.tokens_workers);
      expect(line).toBe("Tokens: MSO 150 · Workers 355");
      const card = buildDeliveryCardView({
        status: "PASS",
        diff_stat: "1 file changed",
        tokens_mso: rollup.tokens_mso,
        tokens_workers: rollup.tokens_workers,
      });
      expect(card.tokens_line).toBe(line);
    } finally {
      db.close();
    }
  });

  it("does not invent tokens when provenance is UNAVAILABLE (null in/out)", () => {
    const db = new StateDb(path.join(tmp, "state-u.db"));
    try {
      db.recordTokenLedger({
        work_id: "w-u",
        subsystem: "mso.planning",
        cost_provenance: "UNAVAILABLE",
        status: "BLOCKED",
      });
      db.recordTokenLedger({
        work_id: "w-u",
        subsystem: "subagent.x",
        tokens_in: 7,
        tokens_out: 3,
        cost_provenance: "reported",
        status: "ok",
      });
      const rollup = aggregateTokenLedger(db.listTokenLedger("w-u"));
      expect(rollup.tokens_mso).toBe(0);
      expect(rollup.tokens_workers).toBe(10);
      expect(rollup.tokens_total).toBe(10);
      expect(rollup.tokens_raw_sum).toBe(10);
      expect(rollup.honesty).toBe("mixed");
    } finally {
      db.close();
    }
  });

  it("unknown subsystem defaults to Workers so spend is never omitted", () => {
    const rollup = aggregateTokenLedger([
      {
        entry_id: "e1",
        work_id: "w",
        subsystem: "mystery.plugin",
        tokens_in: 11,
        tokens_out: 9,
        tokens_system: null,
        tokens_context: null,
        tokens_tools: null,
        tokens_output: null,
        tokens_cache_hit: null,
        latency_ms: null,
        cost_usd: null,
        cost_provenance: "reported",
        status: "ok",
        payload: {},
        created_at: new Date().toISOString(),
      },
    ]);
    expect(classifyTokenSubsystem("mystery.plugin")).toBe("workers");
    expect(rollup.tokens_mso).toBe(0);
    expect(rollup.tokens_workers).toBe(20);
    expect(rollup.tokens_total).toBe(20);
  });
});
