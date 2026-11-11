/**
 * Hybrid retrieval MVP: structural Context View chunks + optional Nomic cosine rank.
 * Keyword overlap always available; semantic rank requires successful embed.
 */

import type { V3DataPaths } from "../paths.js";
import { buildContextView } from "../context/views.js";
import type { ContextViewRole } from "../context/types.js";
import { embedTexts } from "./nomic-client.js";
import { VectorIndexStore } from "./vector-index.js";

export interface RetrievalChunk {
  id: string;
  source: string;
  text: string;
  score: number;
  rank_method: "keyword" | "hybrid" | "durable_index";
}

export interface HybridRetrieveResult {
  kind: "HybridRetrieveResult";
  work_id: string;
  query: string;
  chunks: RetrievalChunk[];
  semantic_used: boolean;
  embedding_status: "ok" | "unavailable" | "error" | "skipped";
  durable_index_used: boolean;
  limitations: string[];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9_\u00c0-\u017f]+/i)
      .filter((t) => t.length > 2),
  );
}

function keywordScore(query: string, text: string): number {
  const q = tokenize(query);
  const t = tokenize(text);
  if (q.size === 0) return 0;
  let hit = 0;
  for (const term of q) if (t.has(term)) hit++;
  return hit / q.size;
}

function chunkFromView(workId: string, role: ContextViewRole, paths: V3DataPaths): RetrievalChunk[] {
  const view = buildContextView(paths, { work_id: workId, role });
  const chunks: RetrievalChunk[] = [];
  for (const section of view.sections) {
    if (!section.included) continue;
    const text = `${section.title}\n${JSON.stringify(section.content)}`;
    chunks.push({
      id: `${view.role}:${section.id}`,
      source: "context-view",
      text: text.slice(0, 4000),
      score: 0,
      rank_method: "keyword",
    });
  }
  for (const g of view.gaps) {
    chunks.push({
      id: `gap:${g.slice(0, 40)}`,
      source: "context-view-gap",
      text: g,
      score: 0,
      rank_method: "keyword",
    });
  }
  return chunks;
}

export async function hybridRetrieve(
  paths: V3DataPaths,
  input: {
    work_id: string;
    query: string;
    role?: ContextViewRole;
    top_k?: number;
    use_embeddings?: boolean;
    /** Prefer durable vector-index when present (default true). */
    prefer_durable_index?: boolean;
  },
): Promise<HybridRetrieveResult> {
  const role = input.role ?? "master";
  const topK = input.top_k ?? 5;
  const limitations: string[] = [];

  if (input.prefer_durable_index !== false && input.use_embeddings !== false) {
    const store = new VectorIndexStore(paths);
    if (store.load(input.work_id)) {
      const search = await store.search(input.work_id, input.query, topK);
      if (search.status === "ok") {
        return {
          kind: "HybridRetrieveResult",
          work_id: input.work_id,
          query: input.query,
          chunks: search.hits.map((h) => ({
            id: h.id,
            source: h.source,
            text: h.text,
            score: h.score,
            rank_method: "durable_index" as const,
          })),
          semantic_used: true,
          embedding_status: "ok",
          durable_index_used: true,
          limitations: [
            "Used durable --data-dir/vector-index snapshot",
            ...search.limitations,
          ],
        };
      }
      limitations.push(`durable_index_skip: ${search.status} ${search.error ?? ""}`);
    }
  }

  const chunks = chunkFromView(input.work_id, role, paths);
  limitations.push(
    "Corpus is Context View sections for this work_id — ephemeral unless durable index built",
  );

  for (const c of chunks) {
    c.score = keywordScore(input.query, c.text);
    c.rank_method = "keyword";
  }

  let embedding_status: HybridRetrieveResult["embedding_status"] = "skipped";
  let semantic_used = false;

  if (input.use_embeddings !== false) {
    const texts = [input.query, ...chunks.map((c) => c.text.slice(0, 1500))];
    const emb = await embedTexts(texts);
    embedding_status = emb.status === "ok" ? "ok" : emb.status;
    if (emb.status === "ok" && emb.vectors && emb.vectors.length === texts.length) {
      semantic_used = true;
      const qv = emb.vectors[0]!;
      for (let i = 0; i < chunks.length; i++) {
        const sv = emb.vectors[i + 1]!;
        const sem = cosine(qv, sv);
        const kw = chunks[i]!.score;
        chunks[i]!.score = 0.35 * kw + 0.65 * Math.max(0, sem);
        chunks[i]!.rank_method = "hybrid";
      }
      limitations.push(`nomic dim=${emb.embedding_dim ?? "?"}`);
    } else {
      limitations.push(`semantic_unavailable: ${emb.error ?? emb.status}`);
    }
  }

  chunks.sort((a, b) => b.score - a.score);
  return {
    kind: "HybridRetrieveResult",
    work_id: input.work_id,
    query: input.query,
    chunks: chunks.slice(0, topK),
    semantic_used,
    embedding_status,
    durable_index_used: false,
    limitations,
  };
}
