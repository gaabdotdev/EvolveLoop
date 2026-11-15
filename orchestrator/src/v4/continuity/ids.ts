/**
 * M04 identifiers. Capsule ids use the frozen catalog grammar (ADR-V4-0015).
 * Replay tokens are store-side (freeze R3: not encoded on ExecutionCapsule 1.0.0).
 */

import { randomBytes } from "node:crypto";
import { ID_PREFIX, isValidId } from "../contracts/index.js";

export function newCapsuleId(): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = `${ID_PREFIX.capsule}${randomBytes(12).toString("hex")}`;
    if (isValidId("capsule", value)) return value;
  }
  throw new Error("capsule_id generation failed");
}

/**
 * Anti-replay token for a sealed capsule. Equal to `capsule_id` so it is a
 * catalog id (path-safe grammar) without adding a schema field (R3).
 */
export function replayIdFor(capsule_id: string): string {
  if (!isValidId("capsule", capsule_id)) {
    throw new Error("replay_id requires a valid capsule_id");
  }
  return capsule_id;
}
