/**
 * V3-MEM-03 — Active Pagination / Virtual Memory (MemGPT-style).
 *
 * Metaphor:
 *   - Context window  = RAM (bounded token budget)
 *   - SQLite / Cold CAS = Disk (archival)
 *
 * Tools:
 *   - memory_search(query)  → ids + summary (no full payload in RAM)
 *   - memory_expand(id)     → page-in (load body from SQLite hot or CAS cold)
 *   - page_out / tombstone  → evict from RAM; keep a short stub; budget constant
 */

import type { ColdStorage } from "./cold-storage.js";
import type { MemoryBroker } from "./broker.js";
import type { MemoryRecord, MemorySearchHit, MemoryStatus, MemoryType } from "./types.js";

/** Canonical short stub left in the RAM window after page-out (~6 proxy tokens). */
export const MEMORY_TOMBSTONE_MARKER_PREFIX = "[lápide:mem:" as const;

export function memoryTombstoneMarker(memory_id: string): string {
  return `${MEMORY_TOMBSTONE_MARKER_PREFIX}${memory_id}]`;
}

/** Proxy token estimate (chars/4) — deterministic, matches token-economy helpers. */
export function estimateVirtualMemoryTokens(text: string, charsPerToken = 4): number {
  if (!text) return 0;
  const cpt = charsPerToken > 0 ? charsPerToken : 4;
  return Math.max(1, Math.ceil(text.length / cpt));
}

export class VirtualMemoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VirtualMemoryError";
  }
}

export type RamPageState = "resident" | "tombstoned";

/** Lightweight hit — never carries full body/payload. */
export interface MemorySearchRef {
  memory_id: string;
  title: string;
  summary: string;
  status: MemoryStatus;
  memory_type: MemoryType;
  cas_hash: string | null;
  /** Proxy tokens of the summary only (not the full body). */
  summary_tokens: number;
  bm25: number;
}

export interface RamPage {
  memory_id: string;
  state: RamPageState;
  /** Resident: full content. Tombstoned: short marker. */
  content: string;
  title: string;
  summary: string;
  cas_hash: string | null;
  source: "sqlite" | "cas" | "tombstone";
  /** Proxy tokens currently charged against the RAM budget for this page. */
  tokens: number;
  /** Last expand / touch time (ms epoch) for LRU page-out. */
  last_access_ms: number;
}

export interface VirtualMemoryOptions {
  broker: MemoryBroker;
  /** Required to page-in cold (CAS) rows. Optional if only hot SQLite is used. */
  cold?: ColdStorage;
  /** Hard cap on RAM-window proxy tokens (resident + tombstones). */
  token_budget: number;
  chars_per_token?: number;
  /**
   * When true (default), memory_expand auto page_out LRU pages until the new
   * page fits (or throws if a single page alone exceeds the budget).
   */
  auto_page_out?: boolean;
}

export interface RamBudgetSnapshot {
  token_budget: number;
  tokens_used: number;
  resident_count: number;
  tombstoned_count: number;
  pages_total: number;
  /** True when tokens_used <= token_budget. */
  within_budget: boolean;
}

export interface PageOutResult {
  memory_id: string;
  marker: string;
  tokens_before: number;
  tokens_after: number;
  freed_tokens: number;
}

export interface ExpandResult {
  page: RamPage;
  /** Pages that were tombstoned to make room (auto_page_out). */
  evicted: PageOutResult[];
  from_cache: boolean;
}

function summaryOf(rec: MemoryRecord): string {
  if (rec.summary && rec.summary.trim()) return rec.summary.trim();
  const body = rec.body?.trim() ?? "";
  if (body.length > 240) return `${body.slice(0, 237)}...`;
  return body || rec.title || "(empty)";
}

/**
 * MemGPT-style virtual memory over MemoryBroker (+ optional ColdStorage).
 * Disk is authoritative; RAM is a bounded working set.
 */
export class VirtualMemory {
  readonly broker: MemoryBroker;
  readonly cold: ColdStorage | undefined;
  readonly token_budget: number;
  readonly chars_per_token: number;
  readonly auto_page_out: boolean;

  /** RAM working set — only pages that have been expanded or tombstoned. */
  private readonly ram = new Map<string, RamPage>();

  constructor(opts: VirtualMemoryOptions) {
    if (!opts.broker) {
      throw new VirtualMemoryError("BROKER_REQUIRED", "VirtualMemory requires a MemoryBroker");
    }
    const budget = Math.floor(opts.token_budget);
    if (!Number.isFinite(budget) || budget <= 0) {
      throw new VirtualMemoryError(
        "BUDGET_REQUIRED",
        `token_budget must be a positive integer; got ${opts.token_budget}`,
      );
    }
    this.broker = opts.broker;
    this.cold = opts.cold;
    this.token_budget = budget;
    this.chars_per_token = opts.chars_per_token ?? 4;
    this.auto_page_out = opts.auto_page_out !== false;
  }

  /** Proxy tokens currently charged to the RAM window. */
  ramTokensUsed(): number {
    let total = 0;
    for (const page of this.ram.values()) {
      total += page.tokens;
    }
    return total;
  }

  budgetSnapshot(): RamBudgetSnapshot {
    let resident = 0;
    let tombstoned = 0;
    for (const page of this.ram.values()) {
      if (page.state === "resident") resident += 1;
      else tombstoned += 1;
    }
    const tokens_used = this.ramTokensUsed();
    return {
      token_budget: this.token_budget,
      tokens_used,
      resident_count: resident,
      tombstoned_count: tombstoned,
      pages_total: this.ram.size,
      within_budget: tokens_used <= this.token_budget,
    };
  }

  getRamPage(memory_id: string): RamPage | undefined {
    return this.ram.get(memory_id);
  }

  listRamPages(): RamPage[] {
    return [...this.ram.values()].sort((a, b) => a.last_access_ms - b.last_access_ms);
  }

  /**
   * Search archival (disk) memory. Returns ids + summaries only —
   * does **not** page-in full payloads into the RAM window.
   */
  memory_search(
    query: string,
    filters: {
      status?: MemoryStatus;
      memory_type?: MemoryType;
      limit?: number;
      include_tainted?: boolean;
      include_expired?: boolean;
    } = {},
  ): MemorySearchRef[] {
    const q = query?.trim() ?? "";
    if (!q) {
      throw new VirtualMemoryError("QUERY_REQUIRED", "memory_search requires a non-empty query");
    }

    const hits: MemorySearchHit[] = this.broker.search(q, {
      status: filters.status,
      memory_type: filters.memory_type,
      limit: filters.limit ?? 20,
      include_tainted: filters.include_tainted,
      include_expired: filters.include_expired,
    });

    return hits.map((hit) => {
      const rec = hit.record;
      const summary = summaryOf(rec);
      return {
        memory_id: rec.memory_id,
        title: rec.title,
        summary,
        status: rec.status,
        memory_type: rec.memory_type,
        cas_hash: rec.cas_hash ?? null,
        summary_tokens: estimateVirtualMemoryTokens(summary, this.chars_per_token),
        bm25: hit.bm25,
      } satisfies MemorySearchRef;
    });
  }

  /**
   * Page-in: load full content into the RAM window from SQLite (hot) or CAS (cold).
   * Auto-evicts LRU residents via page_out when over budget (unless disabled).
   */
  async memory_expand(memory_id: string): Promise<ExpandResult> {
    const id = memory_id?.trim();
    if (!id) {
      throw new VirtualMemoryError("MEMORY_ID_REQUIRED", "memory_expand requires memory_id");
    }

    const existing = this.ram.get(id);
    if (existing && existing.state === "resident") {
      existing.last_access_ms = Date.now();
      return { page: existing, evicted: [], from_cache: true };
    }

    const loaded = await this.loadFromDisk(id);
    const contentTokens = estimateVirtualMemoryTokens(loaded.content, this.chars_per_token);

    if (contentTokens > this.token_budget) {
      throw new VirtualMemoryError(
        "PAGE_EXCEEDS_BUDGET",
        `memory_id=${id} needs ${contentTokens} tokens but budget is ${this.token_budget}`,
      );
    }

    const evicted: PageOutResult[] = [];

    // If re-expanding a tombstone, drop the stub first so its tokens don't double-count.
    if (existing?.state === "tombstoned") {
      this.ram.delete(id);
    }

    if (this.auto_page_out) {
      while (this.ramTokensUsed() + contentTokens > this.token_budget) {
        const victim = this.pickLruResident(id);
        if (victim) {
          evicted.push(this.page_out(victim.memory_id));
          continue;
        }
        // Tombstone stubs still consume budget; drop oldest stubs entirely
        // (disk archival remains — stubs are RAM-only markers).
        const dropped = this.dropOldestTombstone(id);
        if (!dropped) {
          throw new VirtualMemoryError(
            "BUDGET_EXHAUSTED",
            `cannot free enough RAM for memory_id=${id} (need ${contentTokens}, used ${this.ramTokensUsed()}, budget ${this.token_budget})`,
          );
        }
        evicted.push(dropped);
      }
    } else if (this.ramTokensUsed() + contentTokens > this.token_budget) {
      throw new VirtualMemoryError(
        "BUDGET_EXCEEDED",
        `expand would exceed token_budget (${this.ramTokensUsed()}+${contentTokens} > ${this.token_budget})`,
      );
    }

    const page: RamPage = {
      memory_id: id,
      state: "resident",
      content: loaded.content,
      title: loaded.title,
      summary: loaded.summary,
      cas_hash: loaded.cas_hash,
      source: loaded.source,
      tokens: contentTokens,
      last_access_ms: Date.now(),
    };
    this.ram.set(id, page);

    if (this.ramTokensUsed() > this.token_budget) {
      throw new VirtualMemoryError(
        "BUDGET_INVARIANT",
        `internal invariant broken: tokens_used=${this.ramTokensUsed()} > budget=${this.token_budget}`,
      );
    }

    return { page, evicted, from_cache: false };
  }

  /**
   * Page-out: remove full content from RAM, leave a tombstone stub.
   * Disk (SQLite/CAS) is untouched — archival remains.
   */
  page_out(memory_id: string): PageOutResult {
    const id = memory_id?.trim();
    if (!id) {
      throw new VirtualMemoryError("MEMORY_ID_REQUIRED", "page_out requires memory_id");
    }
    const page = this.ram.get(id);
    if (!page) {
      throw new VirtualMemoryError("NOT_IN_RAM", `memory_id=${id} is not in the RAM window`);
    }
    if (page.state === "tombstoned") {
      return {
        memory_id: id,
        marker: page.content,
        tokens_before: page.tokens,
        tokens_after: page.tokens,
        freed_tokens: 0,
      };
    }

    const marker = memoryTombstoneMarker(id);
    const tokens_before = page.tokens;
    const tokens_after = estimateVirtualMemoryTokens(marker, this.chars_per_token);
    page.state = "tombstoned";
    page.content = marker;
    page.source = "tombstone";
    page.tokens = tokens_after;
    page.last_access_ms = Date.now();

    return {
      memory_id: id,
      marker,
      tokens_before,
      tokens_after,
      freed_tokens: Math.max(0, tokens_before - tokens_after),
    };
  }

  /** Alias for page_out — MemGPT / token-economy naming. */
  tombstone(memory_id: string): PageOutResult {
    return this.page_out(memory_id);
  }

  private pickLruResident(exceptId: string): RamPage | undefined {
    let best: RamPage | undefined;
    for (const page of this.ram.values()) {
      if (page.memory_id === exceptId) continue;
      if (page.state !== "resident") continue;
      if (!best || page.last_access_ms < best.last_access_ms) {
        best = page;
      }
    }
    return best;
  }

  /**
   * Fully remove the oldest tombstone stub from the RAM window.
   * Returns a PageOutResult-shaped record for audit (freed_tokens = stub size).
   */
  private dropOldestTombstone(exceptId: string): PageOutResult | undefined {
    let best: RamPage | undefined;
    for (const page of this.ram.values()) {
      if (page.memory_id === exceptId) continue;
      if (page.state !== "tombstoned") continue;
      if (!best || page.last_access_ms < best.last_access_ms) {
        best = page;
      }
    }
    if (!best) return undefined;
    const tokens_before = best.tokens;
    this.ram.delete(best.memory_id);
    return {
      memory_id: best.memory_id,
      marker: best.content,
      tokens_before,
      tokens_after: 0,
      freed_tokens: tokens_before,
    };
  }

  private async loadFromDisk(
    memory_id: string,
  ): Promise<{
    content: string;
    title: string;
    summary: string;
    cas_hash: string | null;
    source: "sqlite" | "cas";
  }> {
    const rec = this.broker.get(memory_id);
    if (!rec) {
      throw new VirtualMemoryError(
        "NOT_FOUND",
        `memory_id=${memory_id} not found in project ${this.broker.project_id}`,
      );
    }

    const summary = summaryOf(rec);

    if (rec.cas_hash) {
      if (!this.cold) {
        throw new VirtualMemoryError(
          "COLD_REQUIRED",
          `memory_id=${memory_id} is cold (cas_hash=${rec.cas_hash}) but no ColdStorage was configured`,
        );
      }
      const raw = await this.broker.getColdPayload(memory_id, this.cold);
      let body = raw.toString("utf8");
      try {
        const envelope = JSON.parse(body) as { body?: string; title?: string; payload?: unknown };
        if (typeof envelope.body === "string") {
          const payloadPart =
            envelope.payload && Object.keys(envelope.payload as object).length > 0
              ? `\n${JSON.stringify(envelope.payload)}`
              : "";
          body = `${envelope.title ?? rec.title}\n${envelope.body}${payloadPart}`;
        }
      } catch {
        // Non-JSON blob: use raw bytes as content.
      }
      return {
        content: body,
        title: rec.title,
        summary,
        cas_hash: rec.cas_hash,
        source: "cas",
      };
    }

    const payloadPart =
      rec.payload && Object.keys(rec.payload).length > 0 ? `\n${JSON.stringify(rec.payload)}` : "";
    return {
      content: `${rec.title}\n${rec.body}${payloadPart}`,
      title: rec.title,
      summary,
      cas_hash: null,
      source: "sqlite",
    };
  }
}
