/**
 * V2-ORCH-03 — Deterministic idempotency key builder for adapters/tools.
 *
 * Algorithm: SHA-256 over UTF-8 canonical concatenation
 *   `${contract_version}\0${task_id}\0${input_fingerprint}`
 * Digest: full hex (64 chars) — not truncated.
 */

import { createHash } from "node:crypto";

export const IDEMPOTENCY_KEY_DIGEST = "sha256-hex-full" as const;

export interface IdempotencyKeyParts {
  contract_version: string | number;
  task_id: string;
  /** Stable fingerprint of tool/adapter inputs (e.g. hashPayload(input)). */
  input_fingerprint: string;
}

/**
 * Build a deterministic idempotency key:
 * hash(contract_version + task_id + input_fingerprint).
 */
export function buildIdempotencyKey(parts: IdempotencyKeyParts): string {
  const canonical = [
    String(parts.contract_version),
    parts.task_id,
    parts.input_fingerprint,
  ].join("\0");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
