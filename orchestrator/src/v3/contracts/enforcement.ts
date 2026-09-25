/**
 * Deterministic enforcement helpers for V3 first-wave contracts (FW-H01–H04).
 * Schema/policy only — no OS sandbox, no second MemoryStore, no Policy Engine rewrite.
 */

import type { MemoryEntry } from "../../types/index.js";
import { redactSecretLikeContent } from "../../memory/secret-redaction.js";
import { fail, ok, type V3ValidationResult } from "./common.js";
import {
  AUTONOMY_GOVERNOR_DECISION_MATRIX,
  DEFAULT_SANDBOX_DEPTH_REQUIREMENTS,
  INSTRUCTION_HIERARCHY_LEVELS,
  INSTRUCTION_HIERARCHY_SEALED_ROOT_LEVELS,
  SANDBOX_DEPTHS,
  type AutonomyGovernorDecision,
  type AutonomyGovernorInputs,
  type AutonomyGovernorLevel,
  type DegradedAutonomyMode,
  type EffectClassification,
  type InstructionHierarchyBinding,
  type InstructionHierarchyLevel,
  type MemoryEntryWithTrust,
  type MemoryTrustClass,
  type SafetyState,
  type SandboxDepth,
  type SandboxDepthRequirement,
} from "./types.js";

function matchesWhenValue<T extends string>(
  actual: T,
  expected: T | T[] | undefined,
): boolean {
  if (expected === undefined) return true;
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

function ruleApplies(
  rule: (typeof AUTONOMY_GOVERNOR_DECISION_MATRIX)[number],
  inputs: AutonomyGovernorInputs,
): boolean {
  return (
    matchesWhenValue(inputs.risk, rule.when.risk) &&
    matchesWhenValue(inputs.safety_state, rule.when.safety_state) &&
    matchesWhenValue(inputs.reversibility, rule.when.reversibility)
  );
}

/**
 * FW-H01 — evaluate typed decision matrix against proposed level.
 * Proíbe risk=critical → AUTONOMOUS; QUARANTINED → anything but BLOCK; etc.
 */
export function assertAutonomyGovernorConstraints(
  inputs: AutonomyGovernorInputs,
  level: AutonomyGovernorLevel,
): V3ValidationResult {
  const errors: string[] = [];

  for (const rule of AUTONOMY_GOVERNOR_DECISION_MATRIX) {
    if (!ruleApplies(rule, inputs)) continue;
    if (rule.require_level !== undefined && level !== rule.require_level) {
      errors.push(
        `governor matrix [${rule.id}]: level must be ${rule.require_level} (got ${level})`,
      );
    }
    if (rule.forbid_levels.includes(level)) {
      errors.push(
        `governor matrix [${rule.id}]: level ${level} is forbidden for risk=${inputs.risk} safety_state=${inputs.safety_state}`,
      );
    }
  }

  return errors.length ? fail(...errors) : ok();
}

/** Map safety_state → §255 degraded mode label (informational). */
export function degradedModeForSafetyState(safety_state: SafetyState): DegradedAutonomyMode {
  switch (safety_state) {
    case "QUARANTINED":
      return "QUARANTINED";
    case "RESTRICTED":
      return "SANDBOX_ONLY";
    case "SUSPECT":
      return "LIMITED_AUTONOMY";
    case "RECOVERING":
      return "HUMAN_APPROVAL";
    case "RESTORED":
    case "NORMAL":
      return "FULL_AUTONOMY";
    default: {
      const _exhaustive: never = safety_state;
      return _exhaustive;
    }
  }
}

/**
 * FW-H01 — full decision record constraints (matrix + policy_ref when not BLOCK).
 */
export function assertAutonomyGovernorDecisionConstraints(
  decision: Pick<AutonomyGovernorDecision, "spec"> | AutonomyGovernorDecision,
): V3ValidationResult {
  const { inputs, level, policy_ref } = decision.spec;
  const matrix = assertAutonomyGovernorConstraints(inputs, level);
  const errors = [...matrix.errors];

  if (level !== "BLOCK") {
    if (typeof policy_ref !== "string" || policy_ref.length === 0) {
      errors.push("spec.policy_ref is required when level is not BLOCK");
    }
  }

  return errors.length ? fail(...errors) : ok();
}

export function sandboxDepthIndex(depth: SandboxDepth): number {
  return SANDBOX_DEPTHS.indexOf(depth);
}

export function sandboxDepthMeetsRequirement(
  actual: SandboxDepth,
  min_depth: SandboxDepth,
): boolean {
  return sandboxDepthIndex(actual) >= sandboxDepthIndex(min_depth);
}

export function requirementForEffect(effect_class: EffectClassification): SandboxDepthRequirement {
  return {
    effect_class,
    min_depth: DEFAULT_SANDBOX_DEPTH_REQUIREMENTS[effect_class],
  };
}

/**
 * FW-H02 — reject effects that lack required sandbox depth (e.g. DESTRUCTIVE @ S0).
 */
export function assertEffectAllowedAtDepth(
  effect_class: EffectClassification,
  sandbox_depth: SandboxDepth,
): V3ValidationResult {
  const req = requirementForEffect(effect_class);
  if (!sandboxDepthMeetsRequirement(sandbox_depth, req.min_depth)) {
    return fail(
      `effect_class ${effect_class} requires min_depth ${req.min_depth} (got ${sandbox_depth})`,
    );
  }
  return ok();
}

export function assertEffectsAllowedAtDepth(
  effect_classes: readonly EffectClassification[],
  sandbox_depth: SandboxDepth,
): V3ValidationResult {
  const errors: string[] = [];
  for (const effect of effect_classes) {
    const r = assertEffectAllowedAtDepth(effect, sandbox_depth);
    errors.push(...r.errors);
  }
  return errors.length ? fail(...errors) : ok();
}

export function isSealedRootLevel(level: InstructionHierarchyLevel): boolean {
  return (INSTRUCTION_HIERARCHY_SEALED_ROOT_LEVELS as readonly string[]).includes(level);
}

export function hierarchyLevelIndex(level: InstructionHierarchyLevel): number {
  return INSTRUCTION_HIERARCHY_LEVELS.indexOf(level);
}

/**
 * FW-H03 — lower-priority content cannot override higher; sealed roots + authority_issued.
 */
export function assertInstructionHierarchyConstraints(
  binding: InstructionHierarchyBinding["spec"] | InstructionHierarchyBinding,
): V3ValidationResult {
  const spec = "spec" in binding && binding.spec ? binding.spec : (binding as InstructionHierarchyBinding["spec"]);
  const errors: string[] = [];
  const level = spec.level;
  const levelIndex = hierarchyLevelIndex(level);

  if (typeof spec.sealed_root !== "boolean") {
    errors.push("spec.sealed_root must be boolean");
  }
  if (typeof spec.authority_issued !== "boolean") {
    errors.push("spec.authority_issued must be boolean");
  }

  if (isSealedRootLevel(level)) {
    if (spec.sealed_root !== true) {
      errors.push(`spec.sealed_root must be true for sealed root level ${level}`);
    }
    if (spec.authority_issued !== true) {
      errors.push(`spec.authority_issued must be true for sealed root level ${level}`);
    }
  }

  // Levels above external_data require authority-issued provenance (§299–300).
  if (level !== "external_data" && spec.authority_issued !== true) {
    errors.push(`spec.authority_issued must be true for level ${level} (above external_data)`);
  }

  if (level === "external_data") {
    if (spec.sealed_root === true) {
      errors.push("external_data must not set sealed_root=true");
    }
    if (Array.isArray(spec.may_override_levels) && spec.may_override_levels.length > 0) {
      errors.push("external_data must not override any hierarchy level");
    }
  }

  if (Array.isArray(spec.may_override_levels)) {
    for (let i = 0; i < spec.may_override_levels.length; i++) {
      const ov = spec.may_override_levels[i] as InstructionHierarchyLevel;
      const ovIndex = hierarchyLevelIndex(ov);
      if (levelIndex >= 0 && ovIndex >= 0 && ovIndex <= levelIndex) {
        errors.push(
          `spec.may_override_levels[${i}] (${ov}) must be strictly below level ${level} (lower-priority cannot override higher)`,
        );
      }
    }
  }

  return errors.length ? fail(...errors) : ok();
}

/**
 * FW-H04 — annotate V2 MemoryEntry with trust_class without creating MemoryStore2.
 * SEC-006: also redact secret-like content on annotate path.
 */
export function annotateMemoryEntry(
  entry: MemoryEntry,
  trust_class: MemoryTrustClass,
): MemoryEntryWithTrust {
  return {
    timestamp: entry.timestamp,
    source: entry.source,
    type: entry.type,
    content: redactSecretLikeContent(String(entry.content ?? "")),
    trust_class,
  };
}
