/**
 * Published capability-scoring methodology (ADR-V4-0010).
 *
 * Status is PROVISIONAL. It is not ACCEPTED. It must not be cited as evidence of
 * quality, and must not drive L2/L3 routing preference. M17 baselines are the
 * gate before any later RFC can move this to ACCEPTED.
 */

import type { CapabilityProfile } from "../contracts/capability-profile.js";

/** ADR-V4-0010 placeholder — not evidence of quality; do not cite in production routing. */
export const PLACEHOLDER_METHODOLOGY: CapabilityProfile["methodology"] = {
  id: "cprof-methodology.placeholder.v0",
  version: "0.0.0",
  status: "PLACEHOLDER",
};

/**
 * M08 first-cut published methodology. Disclosure + provenance composition only.
 * No ranking formula (no Elo, Bradley-Terry, Bayesian, or global 0–100).
 */
export const PUBLISHED_METHODOLOGY: CapabilityProfile["methodology"] = {
  id: "cprof-methodology.provisional.v0",
  version: "0.1.0",
  status: "PROVISIONAL",
};

export const METHODOLOGY_ENGINE_VERSION = "0.1.0";

/** Uncertainty method used when a single authenticated observation has no variance estimate. */
export const POINT_INTERVAL_METHOD = "point_interval.v0";

export const METHODOLOGY_RESIDUALS = [
  "formula",
  "recency_decay",
  "provider_version_identity",
  "minimum_sample_for_inference",
] as const;

export type MethodologyResidual = (typeof METHODOLOGY_RESIDUALS)[number];

export function isPublishedMethodology(m: CapabilityProfile["methodology"]): boolean {
  return m.id === PUBLISHED_METHODOLOGY.id && m.version === PUBLISHED_METHODOLOGY.version;
}

export function isPlaceholderMethodology(m: CapabilityProfile["methodology"]): boolean {
  return m.id === PLACEHOLDER_METHODOLOGY.id;
}

/** First cut recognizes no ACCEPTED methodology (M17 baselines do not exist yet). */
export function methodologyIsAccepted(_m: CapabilityProfile["methodology"]): boolean {
  return false;
}

export function methodologyAllowsActive(m: CapabilityProfile["methodology"]): boolean {
  return methodologyIsAccepted(m) && m.status === "ACCEPTED";
}
