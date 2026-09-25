/**
 * Mutation guards (test-the-tests) for critical fail-closed security functions.
 *
 * Strategy (no permanent production mutation):
 * 1. Import REAL implementations and assert properties that common mutants break.
 * 2. Evaluate the same property tables against in-process "shadow mutants"
 *    (deliberately broken pure functions) and require that ≥1 assertion fails —
 *    proving the suite would detect those mutations if applied to production.
 *
 * Empirical kill scores (file mutate → subset fail → restore) live in
 * memory/evolveloop-v3-hardening/evidence/rt.mutation.json
 */
import { describe, it, expect } from "vitest";
import {
  classifyOutcome,
  isEligibleEvidenceRef,
  coerceSafetyState,
  SAFETY_STATES,
  type SafetyState,
  type ClassifiedOutcome,
} from "../../../../src/v3/index.js";

// ---------------------------------------------------------------------------
// Property tables — inputs that MUST fail-closed / stay ineligible
// ---------------------------------------------------------------------------

const CLASSIFY_MUST_NOT_PASS: unknown[] = [
  null,
  undefined,
  "",
  "   ",
  "\t",
  "UNKNOWN",
  "unknown",
  "Unknown",
  "N/A",
  "NA",
  "NONE",
  "maybe-ok",
  "yolo",
  "true",
  "1",
  0,
  42,
  true,
  false,
  { status: "PASS" },
  ["PASS"],
  "FAIL",
  "FAILURE",
  "BLOCKED",
  "UNCERTAIN",
  "PARTIAL",
  "DEGRADED",
  "NOT_MEASURED",
];

const CLASSIFY_EXPLICIT_PASS = ["PASS", "SUCCESS", "OK", " pass ", "Success"];

const EVIDENCE_MUST_REJECT = [
  "",
  "   ",
  "run:feature:finished",
  "RUN:abc",
  "/tmp/x",
  "artifacts/out/report.json",
  "./evidence/fake.bin",
  "evidance:run1:node1",
  "proof:run1:node1",
  "artifact:out/x",
  "file:/tmp/x",
  "provider:mock",
  "Agent claims done",
  "evidence: agent says done", // whitespace after colon
  "lineage: has space",
  "check:\tok",
  "EvidenceRef:run1:node1",
  "http://evil/evidence:x",
];

const EVIDENCE_MUST_ACCEPT = [
  "evidence:r1:n1",
  "Evidence:R1:N1",
  "lineage:abc",
  "LINEAGE:xyz",
  "check:dod-1",
  "check:DoD",
];

/** Invalid stamps after trim (fail-closed → null). */
const SAFETY_INVALID_AFTER_TRIM: unknown[] = [
  null,
  undefined,
  42,
  true,
  {},
  [],
  "",
  "   ",
  "quarantined",
  "Quarantined",
  "QUARANTINE",
  "NORMAL\0",
  "HACKED",
  "normal",
  "Normal",
  "SUSPECTED",
  "quarantine",
];

const SAFETY_VALID_PADDED: Array<{ raw: string; expected: SafetyState }> = [
  { raw: "QUARANTINED ", expected: "QUARANTINED" },
  { raw: " QUARANTINED", expected: "QUARANTINED" },
  { raw: "QUARANTINED\n", expected: "QUARANTINED" },
  { raw: "\tNORMAL\t", expected: "NORMAL" },
  { raw: " RESTRICTED", expected: "RESTRICTED" },
];

// ---------------------------------------------------------------------------
// Shadow mutants — broken pure twins used only inside this file
// ---------------------------------------------------------------------------

function mutantClassifyAlwaysPass(raw: unknown): ClassifiedOutcome {
  void raw;
  return {
    status: "PASS",
    is_pass: true,
    fail_closed: false,
    raw_kind: "recognized",
  };
}

function mutantClassifyUnknownAsPass(raw: unknown): ClassifiedOutcome {
  if (raw === null || raw === undefined) {
    return { status: "PASS", is_pass: true, fail_closed: false, raw_kind: "nullish" };
  }
  if (typeof raw !== "string") {
    return { status: "PASS", is_pass: true, fail_closed: false, raw_kind: "non_string" };
  }
  const token = raw.trim().toUpperCase();
  if (token === "" || token === "UNKNOWN") {
    return { status: "PASS", is_pass: true, fail_closed: false, raw_kind: "unknown_token" };
  }
  return classifyOutcome(raw);
}

function mutantEvidenceAlwaysTrue(_ref: string): boolean {
  return true;
}

function mutantEvidenceAcceptRun(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;
  if (/\s/.test(trimmed)) return false;
  // Mutant: allow run: (production forbids it)
  return /^(evidence|lineage|check|run):/i.test(trimmed);
}

function mutantEvidenceDropWhitespaceCheck(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return false;
  if (/^run:/i.test(trimmed)) return false;
  return /^(evidence|lineage|check):/i.test(trimmed);
}

function mutantCoerceAlwaysNormal(_raw: unknown): SafetyState | null {
  return "NORMAL";
}

function mutantCoerceCaseInsensitive(raw: unknown): SafetyState | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if ((SAFETY_STATES as readonly string[]).includes(upper)) {
    return upper as SafetyState;
  }
  return null;
}

function mutantCoercePassthrough(raw: unknown): SafetyState | null {
  if (typeof raw !== "string") return null;
  return raw.trim() as SafetyState;
}

/** Count how many property expectations fail against a candidate classifyOutcome. */
function killScoreClassify(
  fn: (raw: unknown) => ClassifiedOutcome,
): { kills: number; total: number; samples: string[] } {
  const samples: string[] = [];
  let kills = 0;
  let total = 0;

  for (const raw of CLASSIFY_MUST_NOT_PASS) {
    total += 1;
    const r = fn(raw);
    if (r.is_pass === true || r.status === "PASS") {
      kills += 1;
      samples.push(`must_not_pass:${JSON.stringify(raw)}`);
    }
  }
  for (const raw of CLASSIFY_EXPLICIT_PASS) {
    total += 1;
    const r = fn(raw);
    if (r.is_pass !== true || r.status !== "PASS") {
      kills += 1;
      samples.push(`must_pass:${JSON.stringify(raw)}`);
    }
  }
  return { kills, total, samples };
}

function killScoreEvidence(
  fn: (ref: string) => boolean,
): { kills: number; total: number; samples: string[] } {
  const samples: string[] = [];
  let kills = 0;
  let total = 0;
  for (const ref of EVIDENCE_MUST_REJECT) {
    total += 1;
    if (fn(ref) !== false) {
      kills += 1;
      samples.push(`must_reject:${JSON.stringify(ref)}`);
    }
  }
  for (const ref of EVIDENCE_MUST_ACCEPT) {
    total += 1;
    if (fn(ref) !== true) {
      kills += 1;
      samples.push(`must_accept:${JSON.stringify(ref)}`);
    }
  }
  return { kills, total, samples };
}

function killScoreCoerce(
  fn: (raw: unknown) => SafetyState | null,
): { kills: number; total: number; samples: string[] } {
  const samples: string[] = [];
  let kills = 0;
  let total = 0;
  for (const raw of SAFETY_INVALID_AFTER_TRIM) {
    total += 1;
    if (fn(raw) !== null) {
      kills += 1;
      samples.push(`must_null:${JSON.stringify(raw)}`);
    }
  }
  for (const { raw, expected } of SAFETY_VALID_PADDED) {
    total += 1;
    if (fn(raw) !== expected) {
      kills += 1;
      samples.push(`must_coerce:${JSON.stringify(raw)}→${expected}`);
    }
  }
  for (const s of SAFETY_STATES) {
    total += 1;
    if (fn(s) !== s) {
      kills += 1;
      samples.push(`must_exact:${s}`);
    }
  }
  return { kills, total, samples };
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

describe("Mutation guards — classifyOutcome (real)", () => {
  it("fail-closed: CLASSIFY_MUST_NOT_PASS never yields is_pass / PASS", () => {
    for (const raw of CLASSIFY_MUST_NOT_PASS) {
      const r = classifyOutcome(raw);
      expect(r.is_pass, `raw=${JSON.stringify(raw)}`).toBe(false);
      expect(r.status, `raw=${JSON.stringify(raw)}`).not.toBe("PASS");
    }
  });

  it("UNKNOWN family (incl. N/A slash) maps to NOT_MEASURED — kills silent-PASS + N/A→UNCERTAIN mutants", () => {
    for (const raw of [null, undefined, "", "  ", "UNKNOWN", "unknown", "N/A", "n-a", "none", "NA"]) {
      const r = classifyOutcome(raw);
      expect(r.status, `raw=${JSON.stringify(raw)}`).toBe("NOT_MEASURED");
      expect(r.is_pass).toBe(false);
      expect(r.fail_closed).toBe(true);
    }
  });

  it("explicit PASS aliases remain PASS", () => {
    for (const raw of CLASSIFY_EXPLICIT_PASS) {
      const r = classifyOutcome(raw);
      expect(r.status, `raw=${JSON.stringify(raw)}`).toBe("PASS");
      expect(r.is_pass, `raw=${JSON.stringify(raw)}`).toBe(true);
    }
  });

  it("shadow mutants are killed by the same property table", () => {
    const always = killScoreClassify(mutantClassifyAlwaysPass);
    expect(always.kills, `always-pass samples=${always.samples.join("|")}`).toBeGreaterThan(0);

    const unknownPass = killScoreClassify(mutantClassifyUnknownAsPass);
    expect(
      unknownPass.kills,
      `unknown-as-pass samples=${unknownPass.samples.join("|")}`,
    ).toBeGreaterThan(0);

    // Real implementation must score 0 kills against its own table
    const real = killScoreClassify(classifyOutcome);
    expect(real.kills, `real leaks=${real.samples.join("|")}`).toBe(0);
  });
});

describe("Mutation guards — isEligibleEvidenceRef (real)", () => {
  it("rejects evil / synthetic / narrative refs", () => {
    for (const ref of EVIDENCE_MUST_REJECT) {
      expect(isEligibleEvidenceRef(ref), `ref=${JSON.stringify(ref)}`).toBe(false);
    }
  });

  it("accepts evidence|lineage|check prefixed refs", () => {
    for (const ref of EVIDENCE_MUST_ACCEPT) {
      expect(isEligibleEvidenceRef(ref), `ref=${JSON.stringify(ref)}`).toBe(true);
    }
  });

  it("shadow mutants are killed by the same property table", () => {
    expect(killScoreEvidence(mutantEvidenceAlwaysTrue).kills).toBeGreaterThan(0);
    expect(killScoreEvidence(mutantEvidenceAcceptRun).kills).toBeGreaterThan(0);
    expect(killScoreEvidence(mutantEvidenceDropWhitespaceCheck).kills).toBeGreaterThan(0);
    expect(killScoreEvidence(isEligibleEvidenceRef).kills).toBe(0);
  });
});

describe("Mutation guards — coerceSafetyState (real)", () => {
  it("invalid / wrong-case stamps → null", () => {
    for (const raw of SAFETY_INVALID_AFTER_TRIM) {
      expect(coerceSafetyState(raw), `raw=${JSON.stringify(raw)}`).toBeNull();
    }
  });

  it("whitespace-padded valid enums coerce to canonical SafetyState", () => {
    for (const { raw, expected } of SAFETY_VALID_PADDED) {
      expect(coerceSafetyState(raw), `raw=${JSON.stringify(raw)}`).toBe(expected);
    }
  });

  it("exact SAFETY_STATES round-trip", () => {
    for (const s of SAFETY_STATES) {
      expect(coerceSafetyState(s)).toBe(s);
    }
  });

  it("shadow mutants are killed by the same property table", () => {
    expect(killScoreCoerce(mutantCoerceAlwaysNormal).kills).toBeGreaterThan(0);
    expect(killScoreCoerce(mutantCoercePassthrough).kills).toBeGreaterThan(0);

    // Case-insensitive coerce: "quarantined" → QUARANTINED (production: null).
    // Kill table requires null for wrong-case → mutant dies.
    const caseInsensitive = killScoreCoerce(mutantCoerceCaseInsensitive);
    expect(
      caseInsensitive.kills,
      `case-insensitive samples=${caseInsensitive.samples.join("|")}`,
    ).toBeGreaterThan(0);

    expect(killScoreCoerce(coerceSafetyState).kills).toBe(0);
  });

  it("invalid list must not include trim-valid SAFETY_STATES", () => {
    for (const raw of SAFETY_INVALID_AFTER_TRIM) {
      if (typeof raw === "string" && raw.trim().length > 0) {
        const trimmed = raw.trim();
        expect(
          (SAFETY_STATES as readonly string[]).includes(trimmed),
          `invalid list accidentally includes valid enum after trim: ${JSON.stringify(raw)}`,
        ).toBe(false);
      }
    }
  });
});
