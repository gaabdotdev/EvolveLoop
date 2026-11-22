/**
 * V1-MEM-02 — Dynamic Context Engineering in MemoryBroker.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MemoryBroker,
  promotionGateAllowed,
  engineerContext,
} from "../../src/v3/memory/index.js";

describe("V1-MEM-02 dynamic context engineering", () => {
  let tmp: string;
  let broker: MemoryBroker;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-mem02-"));
    broker = new MemoryBroker(path.join(tmp, "mem.db"), "proj-ctx");
  });

  afterEach(async () => {
    broker.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("respects token_budget and prioritizes contract requirements", () => {
    const reqMem = broker.propose({
      memory_type: "decision",
      title: "SSRF must block private IPs",
      body: "Credential proxy blocks 127.0.0.0/8 and RFC1918 ranges",
      source: "contract",
    });
    const noise = broker.propose({
      memory_type: "episodic",
      title: "unrelated note",
      body: "yesterday the coffee machine broke in the office kitchen area repeatedly",
      source: "chat",
    });
    broker.promote(reqMem.memory_id, promotionGateAllowed("mso", "p1"));
    broker.promote(noise.memory_id, promotionGateAllowed("mso", "p2"));

    const ctx = broker.engineerTaskContext({
      token_budget: 40,
      contract_requirements: [
        { id: "SEC-02", text: "SSRF private IP block credential proxy", weight: 5 },
      ],
      search_query: "SSRF credential",
    });

    expect(ctx.kind).toBe("EngineeredContext");
    expect(ctx.tokens_used).toBeLessThanOrEqual(ctx.token_budget);
    expect(ctx.slices[0]?.memory_id).toBe(reqMem.memory_id);
    expect(ctx.prioritized_requirement_ids[0]).toBe("SEC-02");
  });

  it("omits candidates that exceed remaining budget", () => {
    const big = {
      memory_id: "big",
      project_id: "p",
      memory_type: "semantic" as const,
      status: "ACTIVE" as const,
      contract_version: 1,
      title: "x",
      body: "word ".repeat(500),
      source: "t",
      created_at: "2026-01-01T00:00:00Z",
      tainted: false,
      valid_from: null,
      valid_to: null,
      superseded_by: null,
      payload: {},
    };
    const small = { ...big, memory_id: "small", body: "tiny match budget" };
    const ctx = engineerContext({
      token_budget: 20,
      contract_requirements: [{ id: "R1", text: "budget match", weight: 1 }],
      candidates: [big, small],
      chars_per_token: 4,
    });
    expect(ctx.tokens_used).toBeLessThanOrEqual(20);
    expect(ctx.omitted_memory_ids.length + ctx.slices.length).toBe(2);
  });
});
