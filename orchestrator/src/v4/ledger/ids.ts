/**
 * Trust-boundary identifier enforcement (ADR-V4-0015, TM-V4-F08).
 *
 * Stores refuse ids outside the grammar before any filesystem join.
 * Residual R5: grant / approval / lease / correlation ids are NOT in ID_PREFIX
 * and MUST NOT be used as path components. They may appear as opaque fields
 * inside records.
 */

import { ID_PREFIX, isValidId, type IdKind } from "../contracts/common.js";

export class BoundaryIdError extends Error {
  readonly code = "INVALID_ID" as const;
  constructor(
    readonly kind: IdKind | "refused_path_kind",
    readonly value: unknown,
  ) {
    super(`refused id at store boundary kind=${String(kind)} value=${String(value)}`);
    this.name = "BoundaryIdError";
  }
}

/** Kinds this store is allowed to interpolate into a path. */
export const PATH_SAFE_ID_KINDS = ["work", "event", "checkpoint", "artifact", "task", "effect"] as const satisfies readonly IdKind[];

export type PathSafeIdKind = (typeof PATH_SAFE_ID_KINDS)[number];

const PATH_SAFE = new Set<string>(PATH_SAFE_ID_KINDS);

export function assertPathSafeId(kind: IdKind, value: unknown): asserts value is string {
  if (!PATH_SAFE.has(kind)) {
    throw new BoundaryIdError("refused_path_kind", kind);
  }
  if (!isValidId(kind, value)) {
    throw new BoundaryIdError(kind, value);
  }
}

export function requireId(kind: IdKind, value: unknown): string {
  if (!isValidId(kind, value)) {
    throw new BoundaryIdError(kind, value);
  }
  return value;
}

/** Residual R5 — these names must never become path segments in M02 stores. */
export const FORBIDDEN_PATH_ID_KINDS = ["grant", "approval", "lease", "correlation", "corr"] as const;

export function isForbiddenPathIdKind(kind: string): boolean {
  return (FORBIDDEN_PATH_ID_KINDS as readonly string[]).includes(kind);
}

export function pathPrefix(kind: PathSafeIdKind): string {
  return ID_PREFIX[kind];
}
