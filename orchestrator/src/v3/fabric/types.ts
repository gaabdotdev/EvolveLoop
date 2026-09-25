/**
 * Capability Fabric local types — adapter over existing CapabilityRegistry.
 * Proíbe segundo registry. Discovery/composition/acquisition stub only.
 */

import type { CapabilityRegistry } from "../../types/index.js";
import type {
  CapabilityLifecycleRecord,
  CapabilityLifecycleState,
  EffectClassification,
  SandboxDepth,
  SandboxDepthRequirement,
} from "../contracts/types.js";
import type { AgencyProposal } from "../agency/types.js";

export interface CandidateCapability {
  capability_id: string;
  /** Best-effort version from providers or lifecycle annotation. */
  capability_version: string;
  lifecycle_state: CapabilityLifecycleState;
  /** Matching score — higher is better (exact > token > profile). */
  score: number;
  match_reason: string;
  provider_ids: string[];
  lifecycle?: CapabilityLifecycleRecord;
}

export interface CompositionPlan {
  status: "plan";
  need: string;
  steps: string[];
  rationale: string;
  candidate_ids: string[];
}

export interface UnmetNeed {
  status: "unmet_need";
  need: string;
  rationale: string;
  candidate_ids: string[];
}

export type CompositionResult = CompositionPlan | UnmetNeed;

export type AcquisitionValidationStatus = "passed" | "failed" | "pending" | "not_run";

/**
 * Acquisition stub input — no download/install.
 * Gate decides REGISTER vs QUARANTINE only.
 */
export interface AcquisitionRequest {
  capability_id: string;
  capability_version: string;
  sandbox_depth: SandboxDepth;
  /** Effect classes that determine SandboxDepthRequirement (FW-H02). */
  effect_classes: EffectClassification[];
  validation_status: AcquisitionValidationStatus;
  /** Optional explicit requirements; defaults derived from effect_classes. */
  requirements?: SandboxDepthRequirement[];
  updated_at?: string;
  reason?: string;
}

export type AcquisitionGateResult =
  | {
      action: "register";
      lifecycle: CapabilityLifecycleRecord;
      unmet_requirements: [];
    }
  | {
      action: "quarantine";
      lifecycle: CapabilityLifecycleRecord;
      unmet_requirements: string[];
    };

export interface FabricDiscoveryOptions {
  /** Optional lifecycle annotations keyed by capability_id (extends registry; does not replace it). */
  lifecycleById?: Record<string, CapabilityLifecycleRecord>;
  /** Cap results; default unlimited. */
  limit?: number;
}

export interface FabricBridgeOptions {
  registry: CapabilityRegistry;
  lifecycleById?: Record<string, CapabilityLifecycleRecord>;
}

export interface FabricEnrichResult {
  proposal: AgencyProposal;
  composition: CompositionResult | null;
  /** True when fabric set capability_hint from a CompositionPlan. */
  enriched: boolean;
}
