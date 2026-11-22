import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { routeResources, routeResourcesDeterministic } from "../../src/v3/routing/router.js";
import { probeDecisionModel } from "../../src/v3/routing/decision-model.js";

describe("Deterministic routing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "route-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("selects local/enabled candidates without inventing Jev choice", () => {
    const paths = resolveV3DataPaths(tmp);
    const decision = routeResourcesDeterministic(paths, {
      work_id: "w-r",
      prefer_local: true,
      role_hint: "coding",
    });
    expect(decision.status).toBe("selected");
    expect(decision.selected).toBeTruthy();
    expect(decision.rejected.some((r) => r.id.includes("openrouter") || r.reason.includes("remote"))).toBe(
      true,
    );
  });

  it("fails closed when use_decision_model is requested but endpoint missing", async () => {
    const paths = resolveV3DataPaths(tmp);
    const probe = await probeDecisionModel();
    const decision = await routeResources(paths, {
      work_id: "w-r",
      use_decision_model: true,
    });
    if (!probe.available) {
      expect(decision.status).toBe("decision_model_unavailable");
      expect(decision.candidates.length).toBeGreaterThan(0);
    } else {
      expect(["selected", "decision_model_unavailable"]).toContain(decision.status);
    }
  });
});
