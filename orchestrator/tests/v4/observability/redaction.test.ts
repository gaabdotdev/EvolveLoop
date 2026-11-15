import { describe, expect, it } from "vitest";
import { EVIDENCE_SECRET_CANARY } from "../../../src/evidence/secret-redaction.js";
import { wrapInboundEvent, REDACTED } from "../../../src/v4/observability/index.js";

function wrapAttrs(attributes: Record<string, unknown>) {
  const res = wrapInboundEvent(
    {
      event_name: "debug.note",
      source: { component: "test", module: "redaction" },
      attributes,
    },
    "unauthenticated",
  );
  expect(res.ok).toBe(true);
  return res.event!;
}

describe("M12 F11 redaction includes arrays and measurements", () => {
  it("redacts secrets inside attribute arrays (V3 envelope skips arrays)", () => {
    const event = wrapAttrs({
      notes: [`Bearer ${"a".repeat(20)}`, "safe"],
    });
    const notes = event.attributes.notes as string[];
    expect(Array.isArray(notes)).toBe(true);
    expect(notes[0]).toBe(REDACTED);
    expect(notes[1]).toBe("safe");
    expect(JSON.stringify(event)).not.toMatch(/Bearer\s+a{20}/);
  });

  it("redacts nested objects inside arrays", () => {
    const event = wrapAttrs({
      dumps: [{ password: "hunter2", ok: true }],
    });
    const dumps = event.attributes.dumps as Array<Record<string, unknown>>;
    expect(dumps[0].password).toBe(REDACTED);
    expect(dumps[0].ok).toBe(true);
  });

  it("redacts the evidence canary wherever it appears", () => {
    const event = wrapAttrs({ blob: [EVIDENCE_SECRET_CANARY] });
    expect(JSON.stringify(event)).not.toContain(EVIDENCE_SECRET_CANARY);
  });

  it("redacts sk-ant / sk-proj style keys that V3 regex misses", () => {
    const event = wrapAttrs({
      keys: ["sk-ant-api03-abcdefgh", "sk-proj-xyzxyzxyz"],
    });
    const keys = event.attributes.keys as string[];
    expect(keys[0]).toBe(REDACTED);
    expect(keys[1]).toBe(REDACTED);
  });

  it("walks measurement string fields", () => {
    const res = wrapInboundEvent(
      {
        event_name: "usage.reported",
        source: { component: "test", module: "redaction" },
        provenance: { kind: "PROVIDER_REPORTED", reported_by: "provider" },
        measurements: {
          input_tokens: {
            metric: "input_tokens",
            value: 1,
            unit: "tokens",
            provenance: "PROVIDER_REPORTED",
            estimate_method: `Bearer ${"b".repeat(20)}`,
          },
        },
      },
      "unauthenticated",
    );
    expect(res.ok).toBe(true);
    const mv = res.event!.measurements.input_tokens as { estimate_method?: string };
    expect(mv.estimate_method).toBe(REDACTED);
  });
});
