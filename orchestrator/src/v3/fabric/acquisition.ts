/**
 * AcquisitionGate — stub gate before REGISTER.
 * Proíbe real download/install. No OS sandbox — schema depth only (FW-H02).
 *
 * Gate: sandbox_depth >= required AND validation_status=passed → REGISTER path;
 * otherwise QUARANTINE lifecycle annotation.
 */

import {
  assertEffectsAllowedAtDepth,
  requirementForEffect,
  sandboxDepthMeetsRequirement,
} from "../contracts/enforcement.js";
import type { SandboxDepthRequirement } from "../contracts/types.js";
import { makeLifecycleRecord } from "./lifecycle.js";
import type { AcquisitionGateResult, AcquisitionRequest } from "./types.js";

function resolveRequirements(request: AcquisitionRequest): SandboxDepthRequirement[] {
  if (request.requirements && request.requirements.length > 0) {
    return request.requirements;
  }
  return request.effect_classes.map((effect_class) => requirementForEffect(effect_class));
}

/**
 * Evaluate acquisition stub gate.
 * Does not register into CapabilityRegistry — returns lifecycle annotation only.
 */
export function evaluateAcquisitionGate(request: AcquisitionRequest): AcquisitionGateResult {
  const unmet: string[] = [];
  const requirements = resolveRequirements(request);

  if (request.validation_status !== "passed") {
    unmet.push(`validation_status must be passed (got ${request.validation_status})`);
  }

  for (const req of requirements) {
    if (!sandboxDepthMeetsRequirement(request.sandbox_depth, req.min_depth)) {
      unmet.push(
        `sandbox_depth ${request.sandbox_depth} < required ${req.min_depth} for ${req.effect_class}`,
      );
    }
  }

  // Align with FW-H02 helper when effect_classes present
  if (request.effect_classes.length > 0) {
    const depthCheck = assertEffectsAllowedAtDepth(request.effect_classes, request.sandbox_depth);
    for (const err of depthCheck.errors) {
      if (!unmet.includes(err)) unmet.push(err);
    }
  }

  const updated_at = request.updated_at ?? new Date().toISOString();

  if (unmet.length > 0) {
    return {
      action: "quarantine",
      lifecycle: makeLifecycleRecord({
        capability_id: request.capability_id,
        capability_version: request.capability_version,
        state: "QUARANTINED",
        updated_at,
        reason: request.reason ?? `acquisition_gate: ${unmet.join("; ")}`,
      }),
      unmet_requirements: unmet,
    };
  }

  return {
    action: "register",
    lifecycle: makeLifecycleRecord({
      capability_id: request.capability_id,
      capability_version: request.capability_version,
      state: "VALIDATED",
      updated_at,
      reason: request.reason ?? "acquisition_gate: sandbox+validation passed (stub — no install)",
    }),
    unmet_requirements: [],
  };
}

/** Alias matching Briefing name AcquisitionGate. */
export const AcquisitionGate = {
  evaluate: evaluateAcquisitionGate,
};
