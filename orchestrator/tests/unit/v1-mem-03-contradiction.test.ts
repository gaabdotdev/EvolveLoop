/**
 * V1-MEM-03 — Contradiction detection → SUPERSEDED/STALE.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MemoryBroker,
  promotionGateAllowed,
  detectContradiction,
  MEMORY_STATUSES,
} from "../../src/v3/memory/index.js";

describe("V1-MEM-03 contradiction SUPERSEDED/STALE", () => {
  let tmp: string;
  let broker: MemoryBroker;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-mem03-"));
    broker = new MemoryBroker(path.join(tmp, "mem.db"), "proj-contra");
  });

  afterEach(async () => {
    broker.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("includes STALE in canonical statuses", () => {
    expect(MEMORY_STATUSES).toContain("STALE");
    expect(MEMORY_STATUSES).toContain("SUPERSEDED");
  });

  it("detectContradiction finds opposing decisions", () => {
    const signal = detectContradiction(
      {
        title: "Network policy",
        body: "Egress must be enabled for provider calls during implement",
      },
      {
        title: "Network policy",
        body: "Egress must be disabled for provider calls during implement",
      },
    );
    expect(signal.conflicts).toBe(true);
    expect(signal.opposing_markers.length).toBeGreaterThan(0);
  });

  it("approving conflicting decision marks old SUPERSEDED", () => {
    const old = broker.propose({
      memory_type: "decision",
      title: "Sandbox network",
      body: "Network egress is allowed for all agent phases",
      source: "old",
    });
    const neu = broker.propose({
      memory_type: "decision",
      title: "Sandbox network",
      body: "Network egress is denied for analyze and read phases",
      source: "new",
    });
    broker.promote(old.memory_id, promotionGateAllowed("human", "activate old"));

    const result = broker.approveConflictingDecision(
      neu.memory_id,
      old.memory_id,
      promotionGateAllowed("mso", "approve conflict → supersede"),
    );
    expect(result.disposition).toBe("SUPERSEDED");
    expect(result.promoted.status).toBe("ACTIVE");
    expect(result.previous.status).toBe("SUPERSEDED");
    expect(result.previous.superseded_by).toBe(neu.memory_id);
  });

  it("approving conflicting decision can mark old STALE", () => {
    const old = broker.propose({
      memory_type: "decision",
      title: "Token budget policy",
      body: "Large context windows are required and must stay enabled",
      source: "old",
    });
    const neu = broker.propose({
      memory_type: "decision",
      title: "Token budget policy",
      body: "Large context windows are forbidden and must stay disabled",
      source: "new",
    });
    broker.promote(old.memory_id, promotionGateAllowed("validator", "old"));

    const result = broker.approveConflictingDecision(
      neu.memory_id,
      old.memory_id,
      promotionGateAllowed("validator", "prefer stale"),
      { prefer_stale: true },
    );
    expect(result.disposition).toBe("STALE");
    expect(result.previous.status).toBe("STALE");
    expect(result.promoted.status).toBe("ACTIVE");
  });
});
