/**
 * V1-TOK-04 — Sentence-level RAG pruning before prompt injection.
 *
 * Split retrieved snippets into sentences, score with BM25-lite + regex
 * symbol hits against querySymbols, keep within a token budget.
 */

/** Proxy token estimate (chars/4) — deterministic, no tiktoken dependency. */
export function estimateProxyTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface RetrievedSnippet {
  id?: string;
  text: string;
  source?: string;
}

export interface PrunedSentence {
  text: string;
  score: number;
  /** BM25-lite component. */
  bm25: number;
  /** Regex / exact symbol hit boost. */
  symbol_hits: number;
  snippet_id?: string;
  source?: string;
  proxy_tokens: number;
}

export interface PruneRetrievedStats {
  input_snippets: number;
  input_sentences: number;
  kept_sentences: number;
  dropped_sentences: number;
  budget_tokens: number;
  used_tokens: number;
}

export interface PruneRetrievedResult {
  kind: "PruneRetrievedResult";
  sentences: PrunedSentence[];
  /** Joined pruned text ready for prompt injection. */
  text: string;
  stats: PruneRetrievedStats;
}

const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+|\n+/;

/** Tokenize for BM25 / symbol matching (identifiers + words). */
export function tokenizeForPrune(text: string): string[] {
  const raw = text.match(/[A-Za-z_][A-Za-z0-9_]*|[0-9]+/g) ?? [];
  return raw.map((t) => t.toLowerCase()).filter((t) => t.length >= 2);
}

function normalizeSymbols(querySymbols: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of querySymbols) {
    const t = String(s ?? "").trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out;
}

/**
 * Split snippet text into sentences (period/newline aware).
 * Empty / whitespace-only discarded.
 */
export function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Classic BM25 over a tiny in-memory corpus (sentences).
 * k1=1.2, b=0.75 — deterministic lexical score.
 */
export function bm25ScoreSentence(
  sentenceTokens: string[],
  queryTokens: string[],
  df: Map<string, number>,
  docCount: number,
  avgDl: number,
  k1 = 1.2,
  b = 0.75,
): number {
  if (queryTokens.length === 0 || sentenceTokens.length === 0 || docCount === 0) return 0;
  const tf = new Map<string, number>();
  for (const t of sentenceTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const dl = sentenceTokens.length;
  let score = 0;
  const seenQ = new Set<string>();
  for (const q of queryTokens) {
    if (seenQ.has(q)) continue;
    seenQ.add(q);
    const f = tf.get(q) ?? 0;
    if (f === 0) continue;
    const n = df.get(q) ?? 0;
    const idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5));
    const denom = f + k1 * (1 - b + b * (dl / Math.max(avgDl, 1)));
    score += idf * ((f * (k1 + 1)) / denom);
  }
  return score;
}

/** Count case-insensitive whole-token / regex symbol hits in a sentence. */
export function countSymbolHits(sentence: string, symbols: readonly string[]): number {
  if (symbols.length === 0) return 0;
  let hits = 0;
  for (const sym of symbols) {
    const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?:[^A-Za-z0-9_]|$)`, "i");
    if (re.test(sentence)) hits += 1;
  }
  return hits;
}

function toSnippet(raw: string | RetrievedSnippet, index: number): RetrievedSnippet {
  if (typeof raw === "string") {
    return { id: `snip-${index}`, text: raw };
  }
  return {
    id: raw.id ?? `snip-${index}`,
    text: raw.text,
    source: raw.source,
  };
}

/**
 * Prune retrieved RAG snippets to relevant sentences under a token budget.
 *
 * @param snippets — raw RAG chunks (string or {id,text,source})
 * @param querySymbols — identifiers / terms from the user query / goal
 * @param budget — max proxy tokens for the pruned output (must be > 0)
 */
export function pruneRetrievedSnippets(
  snippets: readonly (string | RetrievedSnippet)[],
  querySymbols: readonly string[],
  budget: number,
): PrunedSentence[] {
  return pruneRetrievedSnippetsDetailed(snippets, querySymbols, budget).sentences;
}

/**
 * Same pruning with joined text + stats (for callers / tests that need telemetry).
 */
export function pruneRetrievedSnippetsDetailed(
  snippets: readonly (string | RetrievedSnippet)[],
  querySymbols: readonly string[],
  budget: number,
): PruneRetrievedResult {
  const budgetTokens = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
  const symbols = normalizeSymbols(querySymbols);
  const queryTokens = tokenizeForPrune(symbols.join(" "));

  type Cand = {
    text: string;
    tokens: string[];
    snippet_id?: string;
    source?: string;
    order: number;
  };

  const candidates: Cand[] = [];
  let order = 0;
  for (let i = 0; i < snippets.length; i++) {
    const snip = toSnippet(snippets[i]!, i);
    for (const sent of splitIntoSentences(snip.text)) {
      candidates.push({
        text: sent,
        tokens: tokenizeForPrune(sent),
        snippet_id: snip.id,
        source: snip.source,
        order: order++,
      });
    }
  }

  const docCount = candidates.length;
  const df = new Map<string, number>();
  let totalDl = 0;
  for (const c of candidates) {
    totalDl += c.tokens.length;
    const uniq = new Set(c.tokens);
    for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const avgDl = docCount > 0 ? totalDl / docCount : 0;

  const scored: PrunedSentence[] = candidates.map((c) => {
    const bm25 = bm25ScoreSentence(c.tokens, queryTokens, df, docCount, avgDl);
    const symbol_hits = countSymbolHits(c.text, symbols);
    // Symbol hits dominate so exact identifier sentences survive over generic prose.
    const score = bm25 + symbol_hits * 5;
    return {
      text: c.text,
      score,
      bm25,
      symbol_hits,
      snippet_id: c.snippet_id,
      source: c.source,
      proxy_tokens: estimateProxyTokens(c.text),
    };
  });

  // Prefer higher score; stable tie-break by original order (encoded via proxy of index).
  const ranked = scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i);

  const kept: PrunedSentence[] = [];
  let used = 0;
  if (budgetTokens > 0) {
    for (const { s } of ranked) {
      // Drop zero-relevance noise when we have query symbols.
      // Require a symbol hit OR positive BM25 so generic prose near a hit is not kept alone.
      if (symbols.length > 0 && s.symbol_hits === 0 && s.bm25 <= 0) continue;
      if (symbols.length > 0 && s.score <= 0) continue;
      const cost = s.proxy_tokens;
      if (used + cost > budgetTokens && kept.length > 0) continue;
      if (used + cost > budgetTokens && kept.length === 0) {
        // Fit a truncated first sentence if nothing else fits.
        const maxChars = budgetTokens * 4;
        const truncated = s.text.slice(0, Math.max(0, maxChars));
        if (truncated.length === 0) break;
        kept.push({
          ...s,
          text: truncated,
          proxy_tokens: estimateProxyTokens(truncated),
        });
        used += estimateProxyTokens(truncated);
        break;
      }
      kept.push(s);
      used += cost;
    }
  }

  // Restore reading order among kept sentences for coherent injection.
  const orderIndex = new Map(candidates.map((c, i) => [c.text + "\0" + (c.snippet_id ?? ""), i]));
  kept.sort((a, b) => {
    const ka = a.text + "\0" + (a.snippet_id ?? "");
    const kb = b.text + "\0" + (b.snippet_id ?? "");
    return (orderIndex.get(ka) ?? 0) - (orderIndex.get(kb) ?? 0);
  });

  return {
    kind: "PruneRetrievedResult",
    sentences: kept,
    text: kept.map((s) => s.text).join(" "),
    stats: {
      input_snippets: snippets.length,
      input_sentences: candidates.length,
      kept_sentences: kept.length,
      dropped_sentences: Math.max(0, candidates.length - kept.length),
      budget_tokens: budgetTokens,
      used_tokens: used,
    },
  };
}
