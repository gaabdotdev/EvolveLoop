/**
 * Append-only persistence for inference spans (G1 - Phase B).
 * Target: <memoryRoot>/<featureId>/evidence/inference-spans.jsonl
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertFeatureIdConfined } from "../memory/filesystem-memory-store.js";
import { serializeJsonlForPublish } from "../evidence/publish-sanitize.js";
import type { InferenceSpanRecord } from "./inference-usage.js";

const FORBIDDEN_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "x-api-key",
  "x_api_key",
  "xapikey",
  "headers",
  "raw",
]);

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
 * Removes forbidden keys (apiKey, authorization, x-api-key, headers, raw)
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

export function resolveInferenceSpansPath(
  memoryRoot: string,
  featureId: string,
): string {
  assertFeatureIdConfined(memoryRoot, featureId);
  return join(memoryRoot, featureId, "evidence", "inference-spans.jsonl");
}

/**
 * Appends a single inference span record to inference-spans.jsonl.
 * Never overwrites previous records (append-only).
 */
export function appendInferenceSpan(
  memoryRoot: string,
  featureId: string,
  record: InferenceSpanRecord | Record<string, unknown>,
): string {
  assertFeatureIdConfined(memoryRoot, featureId);
  const filePath = resolveInferenceSpansPath(memoryRoot, featureId);
  mkdirSync(dirname(filePath), { recursive: true });

  const clean = sanitizeSpanRecord(record as Record<string, unknown>);
  const line = serializeJsonlForPublish(clean);
  appendFileSync(filePath, `${line}\n`, "utf-8");
  return filePath;
}

export function readInferenceSpans(
  memoryRoot: string,
  featureId: string,
): InferenceSpanRecord[] {
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
}
