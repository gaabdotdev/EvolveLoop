/**
 * V3-MEM-03 — Active Pagination / Virtual Memory (MemGPT).
 * Page-in / page-out; token budget stays constant under 100× history growth.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ColdStorage,
  MemoryBroker,
  VirtualMemory,
  VirtualMemoryError,
  estimateVirtualMemoryTokens,
  memoryTombstoneMarker,
} from "../../src/v3/memory/index.js";

describe("V3-MEM-03 Virtual Memory (MemGPT paging)", () => {
  let coldRoot: string;
  let cold: ColdStorage;
  let broker: MemoryBroker;

  beforeEach(() => {
    coldRoot = mkdtempSync(join(tmpdir(), "v3-mem03-vm-"));
    cold = new ColdStorage({ rootDir: coldRoot, compressionLevel: 3 });
    broker = new MemoryBroker(":memory:", "proj-vm-03");
  });

  afterEach(() => {
    broker.close();
    rmSync(coldRoot, { recursive: true, force: true });
  });

  function seedHot(title: string, body: string, marker?: string) {
    return broker.propose({
      memory_type: "episodic",
      title,
      body: marker ? `${marker} ${body}` : body,
      source: "unit-test",
      payload: { marker: marker ?? title },
    });
  }

  it("memory_search returns ids/summary without paging full payload into RAM", () => {
    const bulky = "FULL_PAYLOAD_" + "X".repeat(2000);
    const a = seedHot("alpha auth rotate", bulky, "needle-alpha");
    seedHot("beta other topic", "unrelated body content", "other");

    const vm = new VirtualMemory({ broker, cold, token_budget: 500 });
    const refs = vm.memory_search("needle-alpha auth");

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.memory_id === a.memory_id)).toBe(true);
    const hit = refs.find((r) => r.memory_id === a.memory_id)!;
    expect(hit.summary.length).toBeGreaterThan(0);
    expect(hit.summary.length).toBeLessThanOrEqual(240);
    expect(hit.summary_tokens).toBeGreaterThan(0);
    // Search must not inflate the RAM window (disk catalog only).
    expect(vm.listRamPages()).toHaveLength(0);
    expect(vm.ramTokensUsed()).toBe(0);
    // Truncated summary ≠ full payload (2000× X run must not appear).
    expect(hit.summary).not.toMatch(/X{500,}/);
    expect(Object.keys(hit).sort()).toEqual(
      [
        "bm25",
        "cas_hash",
        "memory_id",
        "memory_type",
        "status",
        "summary",
        "summary_tokens",
        "title",
      ].sort(),
    );
  });

  it("memory_expand page-in loads hot SQLite content into RAM", async () => {
    const rec = seedHot("hot page", "HOT_BODY_" + "h".repeat(400), "hot-signal");
    const vm = new VirtualMemory({ broker, cold, token_budget: 2000 });

    const { page, from_cache, evicted } = await vm.memory_expand(rec.memory_id);
    expect(from_cache).toBe(false);
    expect(evicted).toHaveLength(0);
    expect(page.state).toBe("resident");
    expect(page.source).toBe("sqlite");
    expect(page.content).toContain("HOT_BODY_");
    expect(page.content).toContain("hot-signal");
    expect(vm.getRamPage(rec.memory_id)?.state).toBe("resident");

    const again = await vm.memory_expand(rec.memory_id);
    expect(again.from_cache).toBe(true);
    expect(again.page.content).toContain("HOT_BODY_");
  });

  it("memory_expand page-in loads cold CAS payload via cas_hash", async () => {
    const bulky = "COLD_RAW_" + "Z".repeat(3000);
    const proposed = seedHot("cold evidence", bulky, "cold-needle");
    await broker.migrateToCold(proposed.memory_id, cold, {
      summary: "cold evidence summary cold-needle pointer",
    });
    const disk = broker.get(proposed.memory_id)!;
    expect(disk.cas_hash).toMatch(/^sha256:/);
    expect(disk.body).not.toContain("COLD_RAW_");

    const vm = new VirtualMemory({ broker, cold, token_budget: 5000 });
    // Search sees summary only (raw payload stays on CAS disk).
    const refs = vm.memory_search("cold-needle evidence");
    expect(refs.some((r) => r.memory_id === proposed.memory_id)).toBe(true);
    expect(JSON.stringify(refs)).not.toContain("COLD_RAW_");
    expect(vm.ramTokensUsed()).toBe(0);

    const { page } = await vm.memory_expand(proposed.memory_id);
    expect(page.source).toBe("cas");
    expect(page.cas_hash).toBe(disk.cas_hash);
    expect(page.content).toContain("COLD_RAW_");
    expect(page.summary).toContain("cold evidence");
  });

  it("page_out / tombstone removes payload from RAM and leaves short stub", async () => {
    const rec = seedHot("evict me", "EVICT_BODY_" + "e".repeat(800), "evict-signal");
    const vm = new VirtualMemory({ broker, cold, token_budget: 2000 });
    await vm.memory_expand(rec.memory_id);
    const before = vm.ramTokensUsed();
    expect(before).toBeGreaterThan(50);

    const out = vm.page_out(rec.memory_id);
    expect(out.freed_tokens).toBeGreaterThan(0);
    expect(out.marker).toBe(memoryTombstoneMarker(rec.memory_id));

    const page = vm.getRamPage(rec.memory_id)!;
    expect(page.state).toBe("tombstoned");
    expect(page.content).toBe(out.marker);
    expect(page.content).not.toContain("EVICT_BODY_");
    expect(vm.ramTokensUsed()).toBeLessThan(before);
    expect(vm.ramTokensUsed()).toBe(estimateVirtualMemoryTokens(out.marker));

    // Alias
    const again = vm.tombstone(rec.memory_id);
    expect(again.freed_tokens).toBe(0);
  });

  it("token budget does not grow with 100× history (measured)", async () => {
    /**
     * Baseline: expand N pages under a fixed budget → measure tokens_used.
     * Scale: expand 100× more pages (same per-page size) with auto page_out.
     * Invariant: tokens_used stays ≤ token_budget and does not scale with history.
     */
    const TOKEN_BUDGET = 800;
    const PAGE_BODY = "HIST_" + "w".repeat(600); // ~150+ proxy tokens each
    const BASE_N = 4;
    const SCALE = 100;
    const BIG_N = BASE_N * SCALE; // 400 pages

    const vm = new VirtualMemory({
      broker,
      cold,
      token_budget: TOKEN_BUDGET,
      auto_page_out: true,
    });

    const ids: string[] = [];
    for (let i = 0; i < BIG_N; i++) {
      const rec = seedHot(
        `hist-${i}`,
        `${PAGE_BODY} idx-${i}`,
        i % 17 === 0 ? `marker-special-${i}` : `marker-${i}`,
      );
      ids.push(rec.memory_id);
    }

    // Baseline window fill
    for (let i = 0; i < BASE_N; i++) {
      await vm.memory_expand(ids[i]!);
    }
    const baseline = vm.budgetSnapshot();
    expect(baseline.within_budget).toBe(true);
    expect(baseline.tokens_used).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(baseline.tokens_used).toBeGreaterThan(0);
    const baselineTokens = baseline.tokens_used;

    // Grow history 100× — keep expanding; LRU page_out must bound RAM.
    let expands = 0;
    for (let i = BASE_N; i < BIG_N; i++) {
      await vm.memory_expand(ids[i]!);
      expands += 1;
      const snap = vm.budgetSnapshot();
      expect(snap.within_budget).toBe(true);
      expect(snap.tokens_used).toBeLessThanOrEqual(TOKEN_BUDGET);
    }

    const final = vm.budgetSnapshot();
    expect(expands).toBe(BIG_N - BASE_N);
    // Working set stays bounded — stubs may be dropped under pressure.
    expect(final.pages_total).toBeLessThan(BIG_N / 5);
    expect(final.resident_count).toBeGreaterThan(0);
    expect(final.tokens_used).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(final.within_budget).toBe(true);

    // Critical: must NOT grow ~100× with history.
    const growthRatio = final.tokens_used / baselineTokens;
    expect(growthRatio).toBeLessThan(2.5);
    expect(final.tokens_used).toBeLessThanOrEqual(TOKEN_BUDGET);

    // Naive full-history cost would be huge; prove we stayed bounded.
    const naiveFullHistoryTokens = estimateVirtualMemoryTokens(
      ids.map((id, i) => `hist-${i}\n${PAGE_BODY} idx-${i}`).join("\n"),
    );
    expect(naiveFullHistoryTokens).toBeGreaterThan(TOKEN_BUDGET * 50);
    expect(final.tokens_used).toBeLessThan(naiveFullHistoryTokens / 50);

    // Emit measurable evidence line for the gate artifact.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        gate: "V3-MEM-03",
        token_budget: TOKEN_BUDGET,
        baseline_n: BASE_N,
        scale: SCALE,
        history_n: BIG_N,
        baseline_tokens: baselineTokens,
        final_tokens: final.tokens_used,
        growth_ratio: Number(growthRatio.toFixed(4)),
        resident: final.resident_count,
        tombstoned: final.tombstoned_count,
        pages_total: final.pages_total,
        naive_full_history_tokens: naiveFullHistoryTokens,
        TOKEN_BUDGET_100X: "BOUNDED",
      }),
    );
  });

  it("rejects empty search and expand of missing id", async () => {
    const vm = new VirtualMemory({ broker, cold, token_budget: 100 });
    expect(() => vm.memory_search("  ")).toThrow(VirtualMemoryError);
    await expect(vm.memory_expand("mem-does-not-exist")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(() => vm.page_out("mem-does-not-exist")).toThrowError(
      expect.objectContaining({ code: "NOT_IN_RAM" }),
    );
  });

  it("cold expand without ColdStorage fails clearly", async () => {
    const proposed = seedHot("needs cold", "BODY_" + "c".repeat(200), "needs-cold");
    await broker.migrateToCold(proposed.memory_id, cold);
    const vm = new VirtualMemory({ broker, token_budget: 2000 }); // no cold
    await expect(vm.memory_expand(proposed.memory_id)).rejects.toMatchObject({
      code: "COLD_REQUIRED",
    });
  });
});
