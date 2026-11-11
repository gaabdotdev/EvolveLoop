import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { loadYamlFile } from "../../src/registry/manifest-loader.js";
import type { ProviderManifest } from "../../src/types/index.js";
import {
  parseProviderMode,
  setupProviders,
  ProviderBootstrapError,
} from "../../src/cli/provider-bootstrap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const providersDir = join(__dirname, "../../providers");
const agentsRoot = join(__dirname, "../../..");

function loadManifests(): ProviderManifest[] {
  const out: ProviderManifest[] = [];
  for (const ent of readdirSync(providersDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    try {
      out.push(loadYamlFile<ProviderManifest>(join(providersDir, ent.name, "provider.yaml")));
    } catch {
      /* skip */
    }
  }
  return out;
}

describe("provider-bootstrap (ADR-V3-0001)", () => {
  const manifests = loadManifests();

  it("parseProviderMode defaults to mock", () => {
    expect(parseProviderMode(undefined)).toBe("mock");
    expect(parseProviderMode("real")).toBe("real");
  });

  it("parseProviderMode rejects invalid values", () => {
    expect(() => parseProviderMode("discovery")).toThrow(ProviderBootstrapError);
  });

  it("mock mode registers MockProvider for every id", () => {
    const result = setupProviders({
      mode: "mock",
      agentsRoot,
      manifests,
      providerIds: ["filesystem", "backend"],
    });
    expect(result.provider_mode).toBe("mock");
    expect(result.registered.every((r) => r.kind === "mock")).toBe(true);
    expect(result.router.get("filesystem")).toBeDefined();
  });

  it("real mode loads deterministic filesystem without mock", () => {
    const result = setupProviders({
      mode: "real",
      agentsRoot,
      manifests,
      providerIds: ["filesystem"],
    });
    expect(result.registered).toEqual([{ id: "filesystem", kind: "real" }]);
    const runtime = result.router.get("filesystem");
    expect(runtime?.id).toBe("filesystem");
    expect(runtime?.constructor.name).not.toBe("MockProvider");
  });

  it("real mode fails closed for cursor-skill without jobs-dir", () => {
    expect(() =>
      setupProviders({
        mode: "real",
        agentsRoot,
        manifests,
        providerIds: ["backend"],
      }),
    ).toThrow(/requires --jobs-dir/);
  });

  it("real mode fails closed when manifest is missing", () => {
    expect(() =>
      setupProviders({
        mode: "real",
        agentsRoot,
        manifests,
        providerIds: ["does-not-exist-provider"],
      }),
    ).toThrow(/no manifest/);
  });
});
