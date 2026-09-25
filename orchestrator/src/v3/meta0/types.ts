/**
 * Meta0 Public Proof — demo catalog + honest stub runner.
 * Sources: v3-metas-topo.md DEMO-001..008; contracts/v3/meta0-evidence-demo.yaml
 *
 * Inegociável: runDemoStub never emits PASS. Missing runtime → NOT_MEASURED or BLOCKED.
 */

import type { DemoManifest } from "../contracts/types.js";
import type { OutcomeStatus } from "../failure/types.js";

/** Runtime context supplied by a future live demo runner. Stub defaults are empty. */
export interface DemoRuntimeContext {
  /** Capability IDs available in the current environment. */
  available_capabilities?: readonly string[];
  /** True only when a real sandbox is provisioned and ready. */
  sandbox_ready?: boolean;
  /**
   * Explicit opt-in that a live runner path exists for this demo_id.
   * Stub never sets this; without it status stays NOT_MEASURED.
   */
  runtime_ready?: boolean;
}

export interface DemoStubResult {
  demo_id: string;
  status: OutcomeStatus;
  reason: string;
  /** Always false for the stub — measurement requires a live runner. */
  measured: false;
  title?: string;
  missing_capabilities?: string[];
  validation_errors?: string[];
}

export interface LoadDemoOptions {
  demosDir?: string;
}

export type DemoCatalogEntry = {
  demo_id: string;
  path: string;
  manifest: DemoManifest;
};
