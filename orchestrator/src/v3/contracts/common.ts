/**
 * EvolveLoop V3 first-wave contract commons.
 * Schema version 0.1.2 — additive; does not replace V2 capability contracts.
 * 0.1.1: GoalLifecycle aligned to EVOLVELOOP_V3.md §176.
 * 0.1.2: FW-H01–H04 enforcement (Governor matrix, SandboxDepthRequirement,
 *        InstructionHierarchy sealed_root, MemoryEntryWithTrust bridge).
 */

export const V3_SCHEMA_VERSION = "0.1.2" as const;
export const V3_API_VERSION = "evolveloop.io/v3" as const;

export type V3SchemaVersion = typeof V3_SCHEMA_VERSION;
export type V3ApiVersion = typeof V3_API_VERSION;

export interface V3ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface V3SchemaContractMeta {
  id: string;
  version: V3SchemaVersion;
  status?: "draft" | "active" | "deprecated" | "retired";
  owners?: string[];
}

/** YAML schema-contract envelope (parallel to ContractDocument; not a capability Contract). */
export interface V3SchemaContractDocument {
  apiVersion: V3ApiVersion;
  kind: "SchemaContract";
  metadata: V3SchemaContractMeta;
  spec: Record<string, unknown>;
}

export function ok(): V3ValidationResult {
  return { valid: true, errors: [] };
}

export function fail(...errors: string[]): V3ValidationResult {
  return { valid: false, errors };
}

export function requireString(value: unknown, field: string, errors: string[]): value is string {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return false;
  }
  return true;
}

export function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  errors: string[],
): value is T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    errors.push(`${field} must be one of: ${allowed.join(", ")}`);
    return false;
  }
  return true;
}

export function requireArray(value: unknown, field: string, errors: string[]): value is unknown[] {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return false;
  }
  return true;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, field: string, errors: string[]): value is Record<string, unknown> {
  if (!isObject(value)) {
    errors.push(`${field} must be an object`);
    return false;
  }
  return true;
}

export function mergeResults(...results: V3ValidationResult[]): V3ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  return { valid: errors.length === 0, errors };
}
