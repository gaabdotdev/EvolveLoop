/**
 * Canonical id allocation for M08 (ADR-V4-0015 / TM-V4-F08).
 * Never used as a path component until `isValidId` succeeds.
 */

import { randomBytes } from "node:crypto";
import { ID_PREFIX, isValidId } from "../contracts/index.js";

export function allocateProfileId(): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = `${ID_PREFIX.capability_profile}${randomBytes(8).toString("hex")}`;
    if (isValidId("capability_profile", value)) return value;
  }
  throw new Error("allocateProfileId: failed to produce a valid capability_profile id");
}

/** Deterministic ids for tests (`cprof_m0800000001`, …). */
export function sequentialProfileId(n: number, tag = "m08"): string {
  const suffix = `${tag}${String(n).padStart(8, "0")}`;
  const id = `${ID_PREFIX.capability_profile}${suffix}`;
  if (!isValidId("capability_profile", id)) throw new Error(`invalid sequential id ${id}`);
  return id;
}
