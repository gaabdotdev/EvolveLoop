import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { OUTCOME_STATUSES } from "../../../src/v3/failure/types.js";
import {
  defaultDemosDir,
  listDemos,
  loadDemo,
  runDemoStub,
  DemoNotFoundError,
  DemoManifestInvalidError,
  validateDemoManifest,
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
} from "../../../src/v3/index.js";
import type { DemoManifest } from "../../../src/v3/index.js";

const EXPECTED_IDS = [
  "DEMO-001",
  "DEMO-002",
  "DEMO-003",
  "DEMO-004",
  "DEMO-005",
  "DEMO-006",
  "DEMO-007",
  "DEMO-008",
] as const;

describe("Meta0 Public Proof — demo catalog", () => {
  it("defaultDemosDir points at orchestrator/demos/v3", () => {
    expect(defaultDemosDir().replace(/\\/g, "/")).toMatch(/demos\/v3$/);
  });

  it("lists exactly DEMO-001..008 with valid DemoManifest schemas", () => {
    const entries = listDemos();
    expect(entries.map((e) => e.demo_id).sort()).toEqual([...EXPECTED_IDS]);
    for (const e of entries) {
      expect(validateDemoManifest(e.manifest).valid).toBe(true);
      expect(e.manifest.spec.result).toBe("NOT_MEASURED");
      expect(e.manifest.spec.requires_sandbox).toBe(true);
      expect(e.manifest.spec.required_capabilities!.length).toBeGreaterThan(0);
    }
  });

  it("loadDemo resolves DEMO-003 and padded DEMO-3 alias", () => {
    const a = loadDemo("DEMO-003");
    const b = loadDemo("demo-003");
    expect(a.metadata.demo_id).toBe("DEMO-003");
    expect(b.metadata.demo_id).toBe("DEMO-003");
    expect(a.spec.title).toMatch(/Missing capability/i);
  });

  it("loadDemo throws DemoNotFoundError for unknown id", () => {
    expect(() => loadDemo("DEMO-999")).toThrow(DemoNotFoundError);
  });

  it("rejects invalid YAML via validateDemoManifest when loading crafted path", () => {
    const bad: DemoManifest = {
      apiVersion: V3_API_VERSION,
      kind: "DemoManifest",
      metadata: { schema_version: V3_SCHEMA_VERSION, demo_id: "DEMO-BAD" },
      spec: {
        title: "x",
        input: "y",
        environment: "z",
        authority: "a",
        constraints: [],
        expected_behavior: "b",
        observable_events: [],
        success_oracle_refs: [],
      },
    };
    // strip required field after cast for negative test
    const broken = structuredClone(bad) as Record<string, unknown>;
    delete (broken.spec as Record<string, unknown>).title;
    expect(validateDemoManifest(broken).valid).toBe(false);
  });
});

describe("Meta0 Public Proof — runDemoStub honesty", () => {
  it("never returns PASS for any catalog demo with empty context", () => {
    for (const id of EXPECTED_IDS) {
      const result = runDemoStub(id);
      expect(result.status).not.toBe("PASS");
      expect(result.measured).toBe(false);
      expect(OUTCOME_STATUSES).toContain(result.status);
      expect(result.status).toBe("NOT_MEASURED");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("reports NOT_MEASURED when required capabilities are missing", () => {
    const result = runDemoStub("DEMO-003", {
      available_capabilities: [],
      sandbox_ready: true,
    });
    expect(result.status).toBe("NOT_MEASURED");
    expect(result.missing_capabilities?.length).toBeGreaterThan(0);
    expect(result.reason).toMatch(/capabilities/i);
  });

  it("reports NOT_MEASURED when sandbox required but not ready", () => {
    const manifest = loadDemo("DEMO-001");
    const result = runDemoStub(manifest, {
      available_capabilities: manifest.spec.required_capabilities,
      sandbox_ready: false,
    });
    expect(result.status).toBe("NOT_MEASURED");
    expect(result.reason).toMatch(/sandbox/i);
  });

  it("still refuses PASS when capabilities + sandbox present (no live runner)", () => {
    const manifest = loadDemo("DEMO-006");
    const result = runDemoStub(manifest, {
      available_capabilities: manifest.spec.required_capabilities,
      sandbox_ready: true,
    });
    expect(result.status).toBe("NOT_MEASURED");
    expect(result.reason).toMatch(/not implemented|NOT_MEASURED/i);
  });

  it("blocks with BLOCKED when runtime_ready is claimed but stub has no oracle path", () => {
    const manifest = loadDemo("DEMO-008");
    const result = runDemoStub(manifest, {
      available_capabilities: manifest.spec.required_capabilities,
      sandbox_ready: true,
      runtime_ready: true,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.status).not.toBe("PASS");
  });

  it("returns BLOCKED for unknown demo id", () => {
    const result = runDemoStub("DEMO-999");
    expect(result.status).toBe("BLOCKED");
    expect(result.measured).toBe(false);
  });

  it("returns BLOCKED for invalid in-memory manifest", () => {
    const result = runDemoStub({
      apiVersion: V3_API_VERSION,
      kind: "DemoManifest",
      metadata: { schema_version: V3_SCHEMA_VERSION, demo_id: "DEMO-X" },
      spec: {
        // missing title etc.
      },
    } as unknown as DemoManifest);
    expect(result.status).toBe("BLOCKED");
    expect(result.validation_errors?.length).toBeGreaterThan(0);
  });

  it("honors custom demosDir option", () => {
    const dir = join(defaultDemosDir());
    const listed = listDemos({ demosDir: dir });
    expect(listed.length).toBe(8);
    const result = runDemoStub("DEMO-002", {}, { demosDir: dir });
    expect(result.demo_id).toBe("DEMO-002");
    expect(result.status).toBe("NOT_MEASURED");
  });
});

describe("Meta0 errors", () => {
  it("exposes DemoManifestInvalidError shape", () => {
    const err = new DemoManifestInvalidError("DEMO-X", ["spec.title must be a non-empty string"]);
    expect(err.code).toBe("DEMO_MANIFEST_INVALID");
    expect(err.errors).toHaveLength(1);
  });
});
