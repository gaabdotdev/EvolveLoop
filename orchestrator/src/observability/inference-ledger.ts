/**
 * Append-only persistence for inference spans (G1 - Phase B).
 * Integrated natively with EvolveLoop V2.5 UKS Core security and storage primitives.
 * Default target: <memoryRoot>/<featureId>/evidence/inference-spans.jsonl
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertPathConfined } from "../knowledge/uks/storage-core.js";
import type { InferenceSpanRecord } from "./inference-usage.js";

export class PathEscapeError extends Error {
  readonly code = "PATH_ESCAPE_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "PathEscapeError";
  }
}

const FORBIDDEN_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "x-api-key",
  "x_api_key",
  "xapikey",
  "headers",
  "raw",
  "prompt",
  "response",
  "user_message",
  "system_prompt",
  "secret",
  "token",
  "password",
]);

/**
 * Asserts that a featureId is confined and does not contain path separators or relative sequences.
 */
export function assertFeatureIdConfined(rootDir: string, featureId: string): void {
  if (typeof featureId !== "string" || featureId.trim().length === 0) {
    throw new PathEscapeError("featureId must be a non-empty string");
  }
  if (featureId.includes("/") || featureId.includes("\\") || featureId.includes("..")) {
    throw new PathEscapeError(`featureId escapes memory root: ${featureId}`);
  }
  const resolvedTarget = join(rootDir, featureId);
  assertPathConfined(resolvedTarget, rootDir);
}

function isForbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase();
  const stripped = normalized.replace(/[-_]/g, "");
  return FORBIDDEN_KEY_NAMES.has(normalized) || FORBIDDEN_KEY_NAMES.has(stripped);
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (typeof value === "object") {
    return sanitizeSpanRecord(value as Record<string, unknown>);
  }
  return value;
}

/**
 * Removes forbidden keys (apiKey, authorization, x-api-key, headers, raw, prompts, responses)
 * before persisting spans to disk.
 */
export function sanitizeSpanRecord<T extends Record<string, unknown>>(
  record: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isForbiddenKey(key)) {
      continue;
    }
    result[key] = sanitizeValue(value);
  }
  return result;
}

/**
 * Resolves the destination file path for inference spans under a given feature scope.
 */
export function resolveInferenceSpansPath(
  memoryRoot: string,
  featureId: string,
): string {
  assertFeatureIdConfined(memoryRoot, featureId);
  const target = join(memoryRoot, featureId, "evidence", "inference-spans.jsonl");
  assertPathConfined(target, memoryRoot);
  return target;
}

/**
 * Appends a single inference span record to inference-spans.jsonl.
 * Never overwrites previous records (append-only).
 * Best-effort: catches I/O errors and returns a status object instead of crashing callers.
 * Note: Path escape / confinement violations throw immediately for security.
 */
export function appendInferenceSpan(
  memoryRoot: string,
  featureId: string,
  record: InferenceSpanRecord | Record<string, unknown>,
): { ok: boolean; path?: string; error?: string } {
  assertFeatureIdConfined(memoryRoot, featureId);
  const filePath = resolveInferenceSpansPath(memoryRoot, featureId);

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const clean = sanitizeSpanRecord(record as Record<string, unknown>);
    const line = JSON.stringify(clean);
    appendFileSync(filePath, `${line}\n`, "utf-8");
    return { ok: true, path: filePath };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Reads all valid inference spans from the feature's evidence ledger.
 * Invalid JSON lines are ignored gracefully without failing the entire file.
 */
export function readInferenceSpans(
  memoryRoot: string,
  featureId: string,
): InferenceSpanRecord[] {
  try {
    assertFeatureIdConfined(memoryRoot, featureId);
    const filePath = resolveInferenceSpansPath(memoryRoot, featureId);
    if (!existsSync(filePath)) {
      return [];
    }
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const records: InferenceSpanRecord[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as InferenceSpanRecord);
      } catch {
        // Ignore invalid JSON lines without failing the entire file
      }
    }
    return records;
  } catch {
    return [];
  }
}
