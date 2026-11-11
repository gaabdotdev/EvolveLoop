import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { ModelCatalogStore } from "../../src/v3/model-catalog/store.js";

describe("ModelCatalogStore", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "models-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("seeds local Ollama enabled and remote decision model disabled", () => {
    const paths = resolveV3DataPaths(tmp);
    const store = new ModelCatalogStore(paths.modelCatalogDir);
    const snap = store.seed();
    expect(snap.kind).toBe("ModelCatalog");
    expect(snap.models.length).toBeGreaterThanOrEqual(3);
    const remote = snap.models.find((m) => m.model_id === "openrouter:jev-style-decision")!;
    expect(remote.enabled).toBe(false);
    expect(remote.requires_explicit_enable).toBe(true);
    expect(remote.locality).toBe("remote");
    expect(snap.limitations.some((l) => /invented token/i.test(l))).toBe(true);
  });

  it("enableModel opts in remote without inventing usage metrics", () => {
    const paths = resolveV3DataPaths(tmp);
    const store = new ModelCatalogStore(paths.modelCatalogDir);
    store.seed();
    const after = store.enableModel("openrouter:jev-style-decision", true);
    expect(after.models.find((m) => m.model_id === "openrouter:jev-style-decision")!.enabled).toBe(
      true,
    );
    const entry = store.get("openrouter:jev-style-decision");
    expect(entry).not.toHaveProperty("tokens_used");
  });
});
