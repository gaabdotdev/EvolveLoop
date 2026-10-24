/**
 * EvolveLoop V2.5 - UKS Knowledge Backend Adapter (Phase 9)
 * Connects the Unified Knowledge System (UKS Core) to the EvolveLoop KnowledgeBackend seam.
 * Provides in-process, sub-10ms retrieval delivering EvidenceSets with surgical line anchors.
 */

import * as path from "node:path";
import type { EvidenceSet, KnowledgeHit } from "../../capabilities/results.ts";
import type {
  KnowledgeBackend,
  KnowledgeHealth,
  KnowledgeInspectResult,
  KnowledgeBackendId
} from "./types.ts";
import { ContextPackBuilder } from "../uks/context-pack-builder.ts";

export interface UKSBackendOptions {
  workspaceRoot?: string;
  builder?: ContextPackBuilder;
  maxTokens?: number;
}

export class UKSKnowledgeBackend implements KnowledgeBackend {
  readonly id: KnowledgeBackendId = "uks";
  private workspaceRoot: string;
  private builder: ContextPackBuilder;
  private maxTokens: number;
  private initialized = false;

  constructor(options: UKSBackendOptions = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.builder = options.builder || new ContextPackBuilder();
    this.maxTokens = options.maxTokens ?? 2000;
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.builder.initialize(this.workspaceRoot);
      this.initialized = true;
    }
  }

  public async search(query: string): Promise<EvidenceSet> {
    await this.ensureInitialized();
    try {
      const response = await this.builder.buildContextPack({
        query,
        workspace_root: this.workspaceRoot,
        max_tokens: this.maxTokens
      });

      const hits: KnowledgeHit[] = response.hits.map(h => ({
        source: h.citation_ref,
        section: h.item.title,
        score: h.score,
        retrieval_method: h.match_sources.join("+"),
        project: response.scope_enforced,
        excerpt: h.item.content,
        chunk_id: h.item.id,
        degraded: response.degraded_mode ? "vector_offline" : undefined
      }));

      return {
        kind: "EvidenceSet",
        query,
        hits,
        retrieval_method: "uks_hybrid_fusion",
        degraded: response.degraded_mode ? "vector_offline" : null,
        error_code: null
      };
    } catch (err: any) {
      return {
        kind: "EvidenceSet",
        query,
        hits: [],
        retrieval_method: "uks_error",
        degraded: "uks_exception",
        error_code: err.message
      };
    }
  }

  public async inspect(query = ""): Promise<KnowledgeInspectResult> {
    const base = await this.search(query || "overview");
    return {
      ...base,
      cli_available: true,
      rag_root: this.workspaceRoot,
      backend: this.id
    };
  }

  public async health(): Promise<KnowledgeHealth> {
    await this.ensureInitialized();
    return {
      available: true,
      backend: this.id,
      root: this.workspaceRoot,
      error_code: null,
      degraded: null
    };
  }

  public getBuilder(): ContextPackBuilder {
    return this.builder;
  }
}
