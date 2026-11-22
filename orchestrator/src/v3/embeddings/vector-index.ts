/**
 * Durable per-work vector index under --data-dir/vector-index/.
 * Rebuildable from Context Views; not a general-purpose vector DB product claim.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { V3DataPaths } from "../paths.js";
import { buildContextView } from "../context/views.js";
import type { ContextViewRole } from "../context/types.js";
import { embedTexts, probeNomicEmbed } from "./nomic-client.js";

export interface VectorIndexChunk {
  id: string;
  source: string;
  text: string;
  embedding: number[];
}

export interface VectorIndexSnapshot {
  kind: "VectorIndex";
  work_id: string;
  model_id: string;
  embedding_dim: number;
  built_at: string;
  role: ContextViewRole;
  chunks: VectorIndexChunk[];
  limitations: string[];
}

export interface VectorSearchHit {
  id: string;
  source: string;
  text: string;
  score: number;
}

export interface VectorSearchResult {
  kind: "VectorSearchResult";
  work_id: string;
  query: string;
  hits: VectorSearchHit[];
  index_built_at?: string;
  status: "ok" | "index_missing" | "embed_unavailable" | "error";
  error?: string;
  limitations: string[];
}

function nowIso(): string {
  return new Date().toISOString();
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

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class VectorIndexStore {
  private readonly dir: string;

  constructor(paths: V3DataPaths) {
    this.dir = paths.vectorIndexDir;
    mkdirSync(this.dir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.dir, `${workId}.json`);
  }

  load(workId: string): VectorIndexSnapshot | null {
    const path = this.pathFor(workId);
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as VectorIndexSnapshot;
    if (parsed.kind !== "VectorIndex") return null;
    return parsed;
  }

  /**
   * Build/rebuild index from Context View sections. Requires Nomic/Ollama.
   */
  async build(
    paths: V3DataPaths,
    workId: string,
    opts?: { role?: ContextViewRole },
  ): Promise<VectorIndexSnapshot> {
    const role = opts?.role ?? "master";
    const probe = await probeNomicEmbed();
    if (!probe.available || !probe.embedding_dim) {
      throw new VectorIndexError("EMBED_UNAVAILABLE", probe.error ?? "nomic unavailable");
    }

    const view = buildContextView(paths, { work_id: workId, role });
    const texts: string[] = [];
    const meta: Array<{ id: string; source: string }> = [];
    for (const section of view.sections) {
      if (!section.included) continue;
      const text = `${section.title}\n${JSON.stringify(section.content)}`.slice(0, 4000);
      texts.push(text);
      meta.push({ id: `${role}:${section.id}`, source: "context-view" });
    }
    for (const g of view.gaps) {
      texts.push(g);
      meta.push({ id: `gap:${g.slice(0, 48)}`, source: "context-view-gap" });
    }
    if (texts.length === 0) {
      throw new VectorIndexError("EMPTY_CORPUS", workId);
    }

    const emb = await embedTexts(texts);
    if (emb.status !== "ok" || !emb.vectors) {
      throw new VectorIndexError("EMBED_FAILED", emb.error ?? emb.status);
    }

    const chunks: VectorIndexChunk[] = texts.map((text, i) => ({
      id: meta[i]!.id,
      source: meta[i]!.source,
      text,
      embedding: emb.vectors![i]!,
    }));

    const snap: VectorIndexSnapshot = {
      kind: "VectorIndex",
      work_id: workId,
      model_id: emb.model_id,
      embedding_dim: emb.embedding_dim ?? probe.embedding_dim,
      built_at: nowIso(),
      role,
      chunks,
      limitations: [
        "Per-work durable JSON index — not a multi-tenant vector database product",
        "Rebuild regenerates from Context Views; does not embed private model transcripts",
        ...emb.limitations,
      ],
    };
    atomicWrite(this.pathFor(workId), JSON.stringify(snap, null, 2));
    return snap;
  }

  async search(workId: string, query: string, topK = 5): Promise<VectorSearchResult> {
    const limitations = [
      "Scores are cosine similarity over stored Nomic vectors",
      "Index must be built before search",
    ];
    const index = this.load(workId);
    if (!index) {
      return {
        kind: "VectorSearchResult",
        work_id: workId,
        query,
        hits: [],
        status: "index_missing",
        error: "run evolve embeddings index-build first",
        limitations,
      };
    }

    const emb = await embedTexts([query]);
    if (emb.status !== "ok" || !emb.vectors?.[0]) {
      return {
        kind: "VectorSearchResult",
        work_id: workId,
        query,
        hits: [],
        index_built_at: index.built_at,
        status: "embed_unavailable",
        error: emb.error ?? emb.status,
        limitations: [...limitations, ...emb.limitations],
      };
    }

    const qv = emb.vectors[0];
    const hits = index.chunks
      .map((c) => ({
        id: c.id,
        source: c.source,
        text: c.text.slice(0, 500),
        score: cosine(qv, c.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return {
      kind: "VectorSearchResult",
      work_id: workId,
      query,
      hits,
      index_built_at: index.built_at,
      status: "ok",
      limitations: [...limitations, ...index.limitations],
    };
  }
}

export class VectorIndexError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "VectorIndexError";
  }
}
