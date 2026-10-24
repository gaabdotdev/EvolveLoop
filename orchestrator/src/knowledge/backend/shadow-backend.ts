/**
 * EvolveLoop V2.5 - Shadow Knowledge Backend (Phase 9)
 * Operates in Shadow Mode (EVOLVELOOP_UKS_SHADOW=1) alongside primary backend.
 * Dispatches primary (wiki or fake) and shadow (UKS Core) in parallel.
 * Compares latency, recall, and divergence while strictly returning primary result
 * to ensure zero behavioral impact on active cycles.
 */

import type { EvidenceSet } from "../../capabilities/results.ts";
import type {
  KnowledgeBackend,
  KnowledgeHealth,
  KnowledgeInspectResult,
  KnowledgeBackendId
} from "./types.ts";
import { UKSKnowledgeBackend } from "./uks-backend.ts";
import { FakeKnowledgeBackend } from "./fake-backend.ts";

export interface ShadowComparisonLog {
  query: string;
  timestamp: string;
  primary_latency_ms: number;
  shadow_latency_ms: number;
  speedup_factor: number;
  primary_hits_count: number;
  shadow_hits_count: number;
  divergence_detected: boolean;
  divergence_details?: string;
  shadow_error?: string | null;
}

export class ShadowKnowledgeBackend implements KnowledgeBackend {
  readonly id: KnowledgeBackendId = "shadow";
  private primary: KnowledgeBackend;
  private shadow: UKSKnowledgeBackend;
  private telemetryLogs: ShadowComparisonLog[] = [];

  constructor(options: {
    primary?: KnowledgeBackend;
    shadow?: UKSKnowledgeBackend;
    workspaceRoot?: string;
  } = {}) {
    this.primary = options.primary || new FakeKnowledgeBackend();
    this.shadow = options.shadow || new UKSKnowledgeBackend({ workspaceRoot: options.workspaceRoot });
  }

  public async search(query: string): Promise<EvidenceSet> {
    const startPrimary = performance.now();
    const primaryPromise = this.primary.search(query).then(res => ({
      res,
      durationMs: performance.now() - startPrimary,
      error: null
    })).catch(err => ({
      res: null,
      durationMs: performance.now() - startPrimary,
      error: err
    }));

    const startShadow = performance.now();
    const shadowPromise = this.shadow.search(query).then(res => ({
      res,
      durationMs: performance.now() - startShadow,
      error: null
    })).catch(err => ({
      res: null,
      durationMs: performance.now() - startShadow,
      error: err
    }));

    const [primaryOutcome, shadowOutcome] = await Promise.all([primaryPromise, shadowPromise]);

    const primaryDur = Number(primaryOutcome.durationMs.toFixed(2));
    const shadowDur = Number(shadowOutcome.durationMs.toFixed(2));
    const speedup = Number((primaryOutcome.durationMs / (shadowOutcome.durationMs || 0.001)).toFixed(1));
    const primaryHits = primaryOutcome.res?.hits.length || 0;
    const shadowHits = shadowOutcome.res?.hits.length || 0;

    // Detect significant divergence
    let divergence = false;
    let details: string | undefined;
    if (primaryHits > 0 && shadowHits === 0) {
      divergence = true;
      details = `Shadow UKS failed to retrieve hits where primary found ${primaryHits} hits.`;
    }

    const logEntry: ShadowComparisonLog = {
      query,
      timestamp: new Date().toISOString(),
      primary_latency_ms: primaryDur,
      shadow_latency_ms: shadowDur,
      speedup_factor: speedup,
      primary_hits_count: primaryHits,
      shadow_hits_count: shadowHits,
      divergence_detected: divergence,
      divergence_details: details,
      shadow_error: shadowOutcome.error ? shadowOutcome.error.message : null
    };

    this.telemetryLogs.push(logEntry);

    if (primaryOutcome.error) {
      throw primaryOutcome.error;
    }

    // Zero behavioral drift: Return strictly primary result
    return primaryOutcome.res!;
  }

  public async inspect(query = ""): Promise<KnowledgeInspectResult> {
    const [primaryInsp, shadowInsp] = await Promise.all([
      this.primary.inspect(query),
      this.shadow.inspect(query).catch(() => null)
    ]);

    return {
      ...primaryInsp,
      backend: this.id
    };
  }

  public async health(): Promise<KnowledgeHealth> {
    const [primaryHealth, shadowHealth] = await Promise.all([
      this.primary.health(),
      this.shadow.health().catch(() => ({ available: false, backend: "uks" as const, error_code: "shadow_health_failed" }))
    ]);

    return {
      available: primaryHealth.available,
      backend: this.id,
      root: primaryHealth.root || shadowHealth.root,
      error_code: primaryHealth.error_code,
      degraded: shadowHealth.available ? null : "shadow_unavailable"
    };
  }

  public getTelemetry(): ShadowComparisonLog[] {
    return this.telemetryLogs;
  }

  public getLatestComparison(): ShadowComparisonLog | null {
    return this.telemetryLogs[this.telemetryLogs.length - 1] || null;
  }

  public getPrimary(): KnowledgeBackend {
    return this.primary;
  }

  public getShadow(): UKSKnowledgeBackend {
    return this.shadow;
  }
}
