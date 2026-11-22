/**
 * V1-TOK-04 — Sentence-level RAG pruning (BM25-lite + symbol regex) under token budget.
 */

import { describe, it, expect } from "vitest";
import {
  pruneRetrievedSnippets,
  pruneRetrievedSnippetsDetailed,
  splitIntoSentences,
  estimateProxyTokens,
  countSymbolHits,
  type RetrievedSnippet,
} from "../../src/v3/token-economy/index.js";

/** Fixture snippets: mixed relevance for symbols pruneRetrievedSnippets / MemoryBroker. */
const FIXTURE_SNIPPETS: RetrievedSnippet[] = [
  {
    id: "a",
    source: "docs/memory.md",
    text: [
      "The weather today is sunny and warm.",
      "MemoryBroker exposes FTS5 BM25 search scoped by project_id.",
      "Cats enjoy sleeping on keyboards during meetings.",
    ].join(" "),
  },
  {
    id: "b",
    source: "src/broker.ts",
    text: [
      "export class MemoryBroker { search(query: string) { return []; } }.",
      "Unrelated sentence about cooking pasta with tomato sauce.",
      "Call pruneRetrievedSnippets before injecting RAG into prompts.",
    ].join(" "),
  },
  {
    id: "c",
    source: "notes/noise.md",
    text: "Lorem ipsum dolor sit amet. Consectetur adipiscing elit. Sed do eiusmod tempor.",
  },
];

describe("V1-TOK-04 sentence-level RAG pruning", () => {
  it("splits snippets into sentences", () => {
    const sents = splitIntoSentences(FIXTURE_SNIPPETS[0]!.text);
    expect(sents.length).toBeGreaterThanOrEqual(3);
    expect(sents.some((s) => s.includes("MemoryBroker"))).toBe(true);
  });

  it("keeps symbol-matching sentences and drops irrelevant noise under budget", () => {
    const querySymbols = ["MemoryBroker", "pruneRetrievedSnippets", "BM25"];
    const pruned = pruneRetrievedSnippets(FIXTURE_SNIPPETS, querySymbols, 80);

    expect(pruned.length).toBeGreaterThan(0);
    const joined = pruned.map((p) => p.text).join(" ");
    expect(joined).toMatch(/MemoryBroker/);
    expect(joined).not.toMatch(/weather today is sunny/);
    expect(joined).not.toMatch(/cooking pasta/);
    expect(joined).not.toMatch(/Lorem ipsum/);

    for (const s of pruned) {
      expect(s.score).toBeGreaterThan(0);
      expect(s.proxy_tokens).toBeGreaterThan(0);
    }

    const used = pruned.reduce((a, s) => a + s.proxy_tokens, 0);
    expect(used).toBeLessThanOrEqual(80);
  });

  it("respects tight token budget (proxy chars/4)", () => {
    const detailed = pruneRetrievedSnippetsDetailed(
      FIXTURE_SNIPPETS,
      ["MemoryBroker"],
      12,
    );
    expect(detailed.stats.budget_tokens).toBe(12);
    expect(detailed.stats.used_tokens).toBeLessThanOrEqual(12);
    expect(detailed.stats.kept_sentences).toBeGreaterThanOrEqual(1);
    expect(detailed.stats.dropped_sentences).toBeGreaterThan(0);
    expect(estimateProxyTokens(detailed.text)).toBeLessThanOrEqual(12 + 2); // small slack for join spaces
  });

  it("countSymbolHits uses regex word boundaries for identifiers", () => {
    expect(countSymbolHits("Use MemoryBroker for search.", ["MemoryBroker"])).toBe(1);
    expect(countSymbolHits("MemoryBrokerage is unrelated.", ["MemoryBroker"])).toBe(0);
  });

  it("returns empty when budget is 0", () => {
    expect(pruneRetrievedSnippets(FIXTURE_SNIPPETS, ["MemoryBroker"], 0)).toEqual([]);
  });
});
