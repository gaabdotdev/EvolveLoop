/**
 * Canonical id allocation for M01 (ADR-V4-0015 / TM-V4-F08).
 * Never used as a path component until `isValidId` succeeds.
 */

import { randomBytes } from "node:crypto";
import { ID_PREFIX, isValidId, type IdKind } from "../contracts/index.js";

export function allocateId(kind: IdKind): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = randomBytes(12).toString("hex");
    const value = `${ID_PREFIX[kind]}${suffix}`;
    if (isValidId(kind, value)) return value;
  }
  throw new Error(`allocateId: failed to produce a valid ${kind} id`);
}
