/**
 * Deterministic test-report artifact (V4.0 min verifier input).
 * This is NOT a frozen domain contract; it is a verifier-owned document format.
 */

import { isRecord, isSha256 } from "../contracts/index.js";
import { TEST_REPORT_KIND, TEST_REPORT_SCHEMA_VERSION } from "./constants.js";
import type { EvidenceResult } from "../contracts/index.js";

export interface DeterministicTestCase {
  name: string;
  passed: boolean;
}

export interface DeterministicTestReport {
  kind: typeof TEST_REPORT_KIND;
  schema_version: string;
  criterion_id: string;
  evidence_kind: string;
  tests: DeterministicTestCase[];
  tested_artifact_sha256: string[];
}

export type TestReportParse =
  | { ok: true; report: DeterministicTestReport }
  | { ok: false; error: string };

export function parseTestReport(bytes: Uint8Array): TestReportParse {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: "undecodable_utf8" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  if (!isRecord(value)) return { ok: false, error: "not_object" };
  if (value.kind !== TEST_REPORT_KIND) return { ok: false, error: "wrong_kind" };
  if (value.schema_version !== TEST_REPORT_SCHEMA_VERSION) return { ok: false, error: "unsupported_schema_version" };
  if (typeof value.criterion_id !== "string" || value.criterion_id.length === 0) {
    return { ok: false, error: "missing_criterion_id" };
  }
  if (typeof value.evidence_kind !== "string" || value.evidence_kind.length === 0) {
    return { ok: false, error: "missing_evidence_kind" };
  }
  if (!Array.isArray(value.tests)) return { ok: false, error: "tests_not_array" };
  const tests: DeterministicTestCase[] = [];
  for (const item of value.tests) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0 || typeof item.passed !== "boolean") {
      return { ok: false, error: "invalid_test_entry" };
    }
    tests.push({ name: item.name, passed: item.passed });
  }
  if (!Array.isArray(value.tested_artifact_sha256)) return { ok: false, error: "hashes_not_array" };
  const hashes: string[] = [];
  for (const h of value.tested_artifact_sha256) {
    if (!isSha256(h)) return { ok: false, error: "invalid_artifact_hash" };
    hashes.push(h);
  }
  return {
    ok: true,
    report: {
      kind: TEST_REPORT_KIND,
      schema_version: TEST_REPORT_SCHEMA_VERSION,
      criterion_id: value.criterion_id,
      evidence_kind: value.evidence_kind,
      tests,
      tested_artifact_sha256: hashes,
    },
  };
}

export function evaluateTestReport(report: DeterministicTestReport): EvidenceResult {
  if (report.tests.length === 0) return "INCONCLUSIVE";
  if (report.tests.some((t) => !t.passed)) return "FAIL";
  return "PASS";
}

export function encodeTestReport(report: DeterministicTestReport): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(report));
}
