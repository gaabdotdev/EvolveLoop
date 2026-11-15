import { describe, expect, it } from "vitest";
import {
  assertConforms,
  checkEventStream,
  computeEventDigest,
  decideRetry,
  deriveFinalStatus,
  isIndependent,
  isValidId,
  validateExecutionCapsule,
  validateEvidence,
  validateWork,
  validateWorkEvent,
  ID_PREFIX,
} from "../../../src/v4/contracts/index.js";
import { validCapsule, validEvent, validEvidence, validWork, SHA } from "./fixtures.js";

describe("M00 contracts — identifier grammar (TM-V4-F08 / ADR-V4-0015)", () => {
  it("accepts prefix + opaque suffix", () => {
    expect(isValidId("work", "work_abc123def")).toBe(true);
    expect(isValidId("event", "evt_01HQZXAABB")).toBe(true);
  });

  it("rejects path traversal and encoded forms at every prefix", () => {
    const attacks = ["../etc/passwd", "/tmp/x", "foo/bar", "foo\\bar", "foo%2fbar", "foo..bar", "foo\0bar", "."];
    for (const kind of Object.keys(ID_PREFIX) as (keyof typeof ID_PREFIX)[]) {
      for (const attack of attacks) {
        expect(isValidId(kind, `${ID_PREFIX[kind]}${attack}`), `${kind} ${JSON.stringify(attack)}`).toBe(false);
      }
    }
  });
});

describe("M00 contracts — capsule ≠ grant (TM-V4-F01 / INV-CAP-07/08)", () => {
  it("accepts a sealed capsule with policy-rederived authority model", () => {
    const res = validateExecutionCapsule(validCapsule());
    expect(res.issues).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it("rejects V3 permission/state/control fields copied onto the capsule", () => {
    for (const field of ["permissions", "verified_task_state", "next_action", "objective", "credentials"]) {
      const res = validateExecutionCapsule(validCapsule({ [field]: { admin: true } }));
      expect(res.valid).toBe(false);
      expect(res.issues.some((i) => i.code === "INV-CAP-07" && i.path === field)).toBe(true);
    }
  });

  it("rejects secret material in capsule body", () => {
    const res = validateExecutionCapsule(validCapsule({ pending_items: ["token sk-ant-api03-AAAAAAAAAAAAAAAA"] }));
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-CAP-02")).toBe(true);
  });
});

describe("M00 contracts — event hash chain (TM-V4-F07 / INV-EVT-06)", () => {
  it("validates a genesis event", () => {
    const e = validEvent();
    expect(validateWorkEvent(e).valid).toBe(true);
    expect(checkEventStream([e])).toEqual([]);
  });

  it("detects payload mutation via digest mismatch", () => {
    const e = validEvent();
    const tampered = { ...e, payload: { note: "mutated" } };
    const res = validateWorkEvent(tampered);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-EVT-03" || i.code === "INV-EVT-06")).toBe(true);
  });

  it("detects chain breaks and reordering", () => {
    const a = validEvent();
    const b = validEvent({
      event_id: "evt_bbbbbbbb",
      seq: 2,
      prev_event_digest: a.event_digest,
      type: "work.state_changed",
    });
    expect(checkEventStream([a, b])).toEqual([]);
    expect(checkEventStream([b, a]).some((i) => i.code === "INV-EVT-01" || i.code === "INV-EVT-06")).toBe(true);
    const forged = validEvent({
      event_id: "evt_cccccccc",
      seq: 2,
      prev_event_digest: SHA,
      type: "work.state_changed",
    });
    expect(checkEventStream([a, forged]).some((i) => i.code === "INV-EVT-06")).toBe(true);
  });

  it("rejects self-asserted trust on events (TM-V4-F09)", () => {
    const res = validateWorkEvent(validEvent({ trust_level: "trusted_fixture" } as never));
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-EVT-05")).toBe(true);
  });
});

describe("M00 contracts — evidence trust & honesty (TM-V4-F09 / F16)", () => {
  it("accepts independent observed evidence", () => {
    expect(validateEvidence(validEvidence).valid).toBe(true);
    expect(isIndependent(validEvidence)).toBe(true);
  });

  it("rejects payload-asserted trust labels", () => {
    const res = validateEvidence({ ...validEvidence, trust: "trusted_fixture", gate_source_kind: "controlled_fixture" });
    expect(res.valid).toBe(false);
    expect(res.issues.filter((i) => i.code === "INV-EVD-04").length).toBeGreaterThanOrEqual(1);
  });

  it("SELF_REPORTED never qualifies as independent", () => {
    const self = {
      ...validEvidence,
      method: { kind: "SELF_REPORTED" as const, description: "I passed" },
      provenance: "SELF_REPORTED" as const,
      produced_by: validEvidence.subject_executor_ref,
    };
    expect(validateEvidence(self).valid).toBe(true);
    expect(isIndependent(self)).toBe(false);
  });

  it("requires limitations (INV-EVD-02)", () => {
    const res = validateEvidence({ ...validEvidence, limitations: [] });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-EVD-02")).toBe(true);
  });
});

describe("M00 contracts — tenancy (ADR-V4-0014)", () => {
  it("rejects non-local tenant_id in V4.0–V4.2", () => {
    const res = validateWork({ ...validWork, tenant_id: "acme" });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-TENANT-01")).toBe(true);
  });
});

describe("M00 contracts — normative functions", () => {
  it("UNKNOWN without reconciliation path escalates (no exactly-once, no blind retry)", () => {
    const d = decideRetry({
      state: "UNKNOWN",
      idempotency_key: undefined,
      integration: { integration_id: "git", capabilities: { supports_idempotency_key: false, supports_status_query: false, supports_compensation: false } },
      authorization: { policy_decision_id: "pdec_abc123def" },
      fork_inherited: false,
      effect_class: "EXTERNAL",
    });
    expect(d.action).toBe("ESCALATE");
  });

  it("fork-inherited external effects are forbidden to re-dispatch", () => {
    const d = decideRetry({
      state: "AUTHORIZED",
      integration: { integration_id: "git", capabilities: { supports_idempotency_key: true, supports_status_query: true, supports_compensation: false } },
      authorization: { policy_decision_id: "pdec_abc123def" },
      fork_inherited: true,
      effect_class: "EXTERNAL",
    });
    expect(d.action).toBe("FORBIDDEN");
  });

  it("WorkProof honesty: unresolved effects cap PROVEN at PARTIAL", () => {
    expect(deriveFinalStatus([{ mandatory: true, status: "PROVEN" }], [{ state: "UNKNOWN" }])).toBe("PARTIAL");
    expect(deriveFinalStatus([{ mandatory: true, status: "PROVEN" }], [{ state: "COMMITTED" }])).toBe("PROVEN");
  });

  it("computeEventDigest is stable for the same canonical body", () => {
    const e = validEvent();
    expect(computeEventDigest(e)).toBe(e.event_digest);
  });
});

describe("M00 catalog — assertConforms", () => {
  it("routes by kind", () => {
    expect(assertConforms(validWork).valid).toBe(true);
    expect(assertConforms(validCapsule()).valid).toBe(true);
    expect(assertConforms({ kind: "NotAKind" }).valid).toBe(false);
  });
});
