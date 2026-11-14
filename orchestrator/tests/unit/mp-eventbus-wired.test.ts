/**
 * ISSUE-MP-WIRING-001 — ExecutionEngine auto-wires attachEventBusAdapter when dataPaths is set.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ExecutionEngine,
  ProviderRouter,
  createMockProvider,
  FilesystemMemoryStore,
  resolveDataPaths,
} from "../../src/index.js";
import { attachEventBusAdapter } from "../../src/telemetry/measurement-plane/adapters/event-bus-adapter.js";
import { loginDashboardIR, testRegistry } from "../fixtures/login-dashboard.js";

describe("ISSUE-MP-WIRING-001 — EventBus → Measurement Plane auto-wire", () => {
  it("exports attachEventBusAdapter (production adapter reachable)", () => {
    expect(typeof attachEventBusAdapter).toBe("function");
  });

  it("with dataPaths, run creates measurement/events and persists mapped bus events", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "mp-wiring-"));
    try {
      const paths = resolveDataPaths(dataRoot);
      const featureId = "mp-wiring-feature";

      const router = new ProviderRouter();
      for (const id of ["planner", "backend", "frontend-pro", "testing"]) {
        router.register(createMockProvider(id));
      }

      const engine = new ExecutionEngine({
        registry: testRegistry,
        providers: router,
        dataPaths: paths,
        memory: new FilesystemMemoryStore(paths.memoryDir),
      });

      const result = await engine.run({
        ir: loginDashboardIR,
        policy_id: "rapid-prototype",
        feature_id: featureId,
      });

      expect(result.finished).toBe(true);

      const measurementEventsDir = join(dataRoot, "measurement", "events");
      expect(existsSync(measurementEventsDir)).toBe(true);

      const jsonlFiles = readdirSync(measurementEventsDir).filter((f) => f.endsWith(".jsonl"));
      expect(jsonlFiles.length).toBeGreaterThan(0);

      const eventsPath = join(measurementEventsDir, `${featureId}.jsonl`);
      expect(existsSync(eventsPath)).toBe(true);

      const lines = readFileSync(eventsPath, "utf-8").trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);

      const events = lines.map((l) => JSON.parse(l) as { event_name: string; source?: { module?: string } });
      expect(events.some((e) => e.event_name === "run.started")).toBe(true);
      expect(events.some((e) => e.source?.module === "event-bus-adapter")).toBe(true);
    } finally {
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });

  it("measurementPlane: false skips measurement dir even with dataPaths", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "mp-wiring-off-"));
    try {
      const paths = resolveDataPaths(dataRoot);
      const featureId = "mp-wiring-off";

      const router = new ProviderRouter();
      for (const id of ["planner", "backend", "frontend-pro", "testing"]) {
        router.register(createMockProvider(id));
      }

      const engine = new ExecutionEngine({
        registry: testRegistry,
        providers: router,
        dataPaths: paths,
        memory: new FilesystemMemoryStore(paths.memoryDir),
        measurementPlane: false,
      });

      await engine.run({
        ir: loginDashboardIR,
        policy_id: "rapid-prototype",
        feature_id: featureId,
      });

      const measurementEventsDir = join(dataRoot, "measurement", "events");
      expect(existsSync(measurementEventsDir)).toBe(false);
      expect(existsSync(join(measurementEventsDir, `${featureId}.jsonl`))).toBe(false);
    } finally {
      rmSync(dataRoot, { recursive: true, force: true });
    }
  });
});
