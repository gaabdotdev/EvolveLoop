/**
 * V5-M03 — Model & Provider Freedom (ADR-002).
 * No invented costs; registries ≠ Agent Registry; routing reasons explicit.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  assertRuntimeModelControl,
  createUsageRecord,
  CustomModelProviderStub,
  MODEL_SELECTION_PRECEDENCE,
  mapCostProvenance,
  openModelProviderFreedom,
  resolveExecutionModelControl,
  resolveModelSelection,
  routeWithFallback,
} from "../../src/v3/model-registry/index.js";
import { PersistentWorkRuntime } from "../../src/v3/work-runtime/index.js";

describe("V5-M03 Model & Provider Freedom", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshRoot(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m03-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("Model Registry is separate from Agent Registry (kinds + paths)", () => {
    const root = freshRoot("sep");
    const paths = resolveV3DataPaths(join(root, "v3"));
    expect(paths.modelRegistryDir).toContain("model-registry");
    expect(paths.agentsDir).toContain("agents");
    expect(paths.modelRegistryDir).not.toBe(paths.agentsDir);

    const { providers, models } = openModelProviderFreedom(paths.modelRegistryDir);
    const pSnap = providers.seed();
    const mSnap = models.seed();
    expect(pSnap.kind).toBe("ProviderRegistry");
    expect(mSnap.kind).toBe("ModelRegistry");

    const agents = new AgentRegistryStore(paths.agentsDir);
    const aSnap = agents.ensure("work-sep");
    expect(aSnap.kind).toBe("AgentRegistry");
    expect(aSnap.kind).not.toBe(mSnap.kind);
    expect(aSnap.kind).not.toBe(pSnap.kind);
  });

  it("Provider Registry seeds freellmapi + ollama + custom stub with honest caps", () => {
    const { providers } = openModelProviderFreedom(freshRoot("prov"));
    const snap = providers.seed();
    const ids = snap.providers.map((p) => p.provider_id);
    expect(ids).toEqual(["freellmapi", "ollama", "custom"]);

    const free = providers.get("freellmapi");
    expect(free.implementation).toBe("live");
    expect(free.enabled).toBe(true);
    expect(free.capabilities.some((c) => c.key === "sla" && c.honesty === "unsupported")).toBe(
      true,
    );

    const ollama = providers.get("ollama");
    expect(ollama.implementation).toBe("live");
    expect(ollama.locality).toBe("local");
    expect(
      ollama.capabilities.some((c) => c.key === "cost_reporting" && c.honesty === "unsupported"),
    ).toBe(true);

    const custom = providers.get("custom");
    expect(custom.implementation).toBe("stub");
    expect(custom.enabled).toBe(false);
    expect(
      custom.capabilities.some(
        (c) => c.key === "chat_completions" && c.honesty === "unsupported",
      ),
    ).toBe(true);

    const stub = new CustomModelProviderStub();
    expect(stub.provider_id).toBe("custom");

    const refs = providers.exportCredentialRefs("freellmapi");
    expect(refs.env_vars).toContain("EVOLVELOOP_FREELLMAPI_API_KEY");
    // Never dump secret values — only boolean presence
    for (const v of Object.values(refs.present)) {
      expect(typeof v).toBe("boolean");
    }
  });

  it("resolveModelSelection: work overrides workspace; reasons explicit", () => {
    expect(MODEL_SELECTION_PRECEDENCE).toEqual(["work", "workspace"]);
    const { selection } = openModelProviderFreedom(freshRoot("sel"));
    selection.setPreference("workspace", {
      provider_id: "ollama",
      model_id: "ollama:local-default",
    });
    selection.setPreference(
      "work",
      { provider_id: "freellmapi", model_id: "freellmapi:default" },
      { work_id: "w-1" },
    );

    const forWork = resolveModelSelection(selection, { work_id: "w-1" });
    expect(forWork.resolved_from).toBe("work");
    expect(forWork.preference.provider_id).toBe("freellmapi");
    expect(forWork.reasons.some((r) => r.includes("work>workspace"))).toBe(true);
    expect(forWork.reasons.some((r) => r.includes("overrides workspace"))).toBe(true);

    const wsOnly = resolveModelSelection(selection, { work_id: "missing-work" });
    expect(wsOnly.resolved_from).toBe("workspace");
    expect(wsOnly.preference.provider_id).toBe("ollama");
    expect(wsOnly.reasons.some((r) => r.includes("fall through to workspace"))).toBe(true);

    const empty = openModelProviderFreedom(freshRoot("sel-empty")).selection;
    expect(() => resolveModelSelection(empty, {})).toThrow(/NO_PREFERENCE/);
  });

  it("routeWithFallback: explicit reasons; never silent when policy forbids", async () => {
    const decision = await routeWithFallback({
      primary_provider_id: "freellmapi",
      policy: {
        allow_fallback: true,
        fallback_provider_ids: ["ollama", "custom"],
        blocked_provider_ids: ["custom"],
      },
      tryProvider: async (id) => {
        if (id === "freellmapi") return { ok: false, detail: "unreachable" };
        if (id === "ollama") return { ok: true, detail: "local ok" };
        return { ok: false, detail: "stub" };
      },
    });
    expect(decision.selected_provider_id).toBe("ollama");
    expect(decision.fallback_used).toBe(true);
    expect(decision.reasons.some((r) => r.outcome === "failed" && r.provider_id === "freellmapi")).toBe(
      true,
    );
    expect(decision.reasons.some((r) => r.outcome === "selected" && r.provider_id === "ollama")).toBe(
      true,
    );
    expect(decision.reasons.some((r) => r.outcome === "blocked" && r.provider_id === "custom")).toBe(
      true,
    );

    const blocked = await routeWithFallback({
      primary_provider_id: "freellmapi",
      policy: {
        allow_fallback: false,
        fallback_provider_ids: ["ollama"],
      },
      tryProvider: async (id) =>
        id === "freellmapi"
          ? { ok: false, detail: "needsKey" }
          : { ok: true, detail: "should-not-run" },
    });
    expect(blocked.selected_provider_id).toBeNull();
    expect(blocked.fallback_used).toBe(false);
    expect(blocked.policy_blocked_silent_fallback).toBe(true);
    expect(
      blocked.reasons.some((r) => r.reason.includes("allow_fallback=false")),
    ).toBe(true);
    // ollama must NOT have been selected silently
    expect(blocked.reasons.every((r) => r.provider_id !== "ollama" || r.outcome !== "selected")).toBe(
      true,
    );
  });

  it("execution_model_control: harness_owned vs runtime_owned", () => {
    const cursor = resolveExecutionModelControl("cursor");
    expect(cursor.execution_model_control).toBe("harness_owned");
    expect(() => assertRuntimeModelControl("cursor")).toThrow(/HARNESS_OWNED/);

    const free = resolveExecutionModelControl("freellmapi");
    expect(free.execution_model_control).toBe("runtime_owned");
    expect(() => assertRuntimeModelControl("freellmapi")).not.toThrow();

    const ollama = resolveExecutionModelControl("ollama");
    expect(ollama.execution_model_control).toBe("runtime_owned");

    const unknown = resolveExecutionModelControl("mystery-host");
    expect(unknown.execution_model_control).toBe("harness_owned");
  });

  it("usage record: measured|estimated|unavailable — never invents costs", () => {
    expect(mapCostProvenance("reported")).toBe("measured");
    expect(mapCostProvenance("estimated")).toBe("estimated");
    expect(mapCostProvenance("UNAVAILABLE")).toBe("unavailable");

    const none = createUsageRecord({ provider_id: "ollama" });
    expect(none.provenance).toBe("unavailable");
    expect(none.cost_usd).toBeNull();
    expect(none.tokens_in).toBeNull();

    const measured = createUsageRecord({
      provider_id: "freellmapi",
      tokens_in: 10,
      tokens_out: 20,
      provenance: "measured",
      // cost omitted on purpose — do not invent
    });
    expect(measured.provenance).toBe("measured");
    expect(measured.tokens_in).toBe(10);
    expect(measured.cost_usd).toBeNull();

    const fromLegacy = createUsageRecord({
      provider_id: "freellmapi",
      tokens_in: 5,
      cost_provenance: "UNAVAILABLE",
    });
    expect(fromLegacy.provenance).toBe("unavailable");
    expect(fromLegacy.cost_usd).toBeNull();
    expect(fromLegacy.tokens_in).toBeNull();
  });

  it("FreeLLMAPI provider down does not mark Work FAIL (Gate C honesty)", async () => {
    const ws = freshRoot("work");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    const opened = rt.open({
      work_id: "w-m03",
      objective: "prove provider health ≠ work fail",
    });
    expect(opened.work_state).toBe("IN_PROGRESS");

    // Simulate freellmapi down via routing (no Work mutation)
    const decision = await routeWithFallback({
      primary_provider_id: "freellmapi",
      policy: { allow_fallback: false, fallback_provider_ids: [] },
      tryProvider: async () => ({ ok: false, detail: "UNREACHABLE" }),
    });
    expect(decision.selected_provider_id).toBeNull();

    const again = rt.read("w-m03");
    expect(again.work_state).toBe("IN_PROGRESS");
    expect(again.work_state).toBe(opened.work_state);
    rt.close();
  });
});
