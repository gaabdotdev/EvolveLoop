/**
 * V5-M08 — Extensibility: contracts, registry, reference stub.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  EXTENSION_CONTRACTS_VERSION,
  ExtensionRegistryStore,
  extensionContractsManifest,
  installReferenceExtension,
  REFERENCE_EXTENSION_ID,
  REFERENCE_TOOL_ID,
  REFERENCE_VERIFIER_ID,
} from "../../src/v3/extensions/index.js";
import { VerifierRegistryStore } from "../../src/v3/verification/index.js";

describe("V5-M08 Extensibility", () => {
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

  function freshData(tag: string): string {
    const root = mkdtempSync(join(tmpdir(), `v5-m08-${tag}-`));
    dirs.push(root);
    return join(root, "v3");
  }

  it("contracts manifest is versioned and lists public interfaces", () => {
    const m = extensionContractsManifest();
    expect(m.version).toBe(EXTENSION_CONTRACTS_VERSION);
    expect(m.interfaces).toEqual([
      "AgentAdapter",
      "ModelProvider",
      "Tool",
      "Verifier",
    ]);
  });

  it("registry register/list/enable/disable + permissions", () => {
    const dataDir = freshData("reg");
    const paths = resolveV3DataPaths(dataDir);
    expect(paths.extensionsDir).toContain("extensions");

    const store = new ExtensionRegistryStore(paths.extensionsDir);
    const rec = store.register({
      extension_id: "ext.test",
      display_name: "Test Ext",
      extension_kind: "tool",
      permissions: { register_tools: true },
      enabled: true,
    });
    expect(rec.enabled).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.hasPermission("ext.test", "register_tools")).toBe(true);
    expect(store.hasPermission("ext.test", "register_verifiers")).toBe(false);

    store.disable("ext.test");
    expect(store.get("ext.test")?.enabled).toBe(false);
    expect(store.hasPermission("ext.test", "register_tools")).toBe(false);
    expect(store.list({ enabledOnly: true })).toHaveLength(0);

    store.enable("ext.test");
    expect(store.list({ enabledOnly: true })).toHaveLength(1);
  });

  it("reference stub registers verifier (+ tool) via public contract", async () => {
    const dataDir = freshData("stub");
    const result = installReferenceExtension({ dataDir, withTool: true });

    expect(result.extension.extension_id).toBe(REFERENCE_EXTENSION_ID);
    expect(result.verifier_id).toBe(REFERENCE_VERIFIER_ID);
    expect(result.tool_id).toBe(REFERENCE_TOOL_ID);
    expect(result.custom_verifier.verifier_id).toBe(REFERENCE_VERIFIER_ID);

    const paths = resolveV3DataPaths(dataDir);
    const ext = new ExtensionRegistryStore(paths.extensionsDir);
    expect(ext.get(REFERENCE_EXTENSION_ID)?.enabled).toBe(true);
    expect(ext.hasPermission(REFERENCE_EXTENSION_ID, "register_verifiers")).toBe(
      true,
    );

    const verifiers = new VerifierRegistryStore(paths.verificationDir);
    const record = verifiers.get(REFERENCE_VERIFIER_ID);
    expect(record.implementation).toBe("custom");
    expect(record.honesty).toBe("unsupported");

    // Re-bind in-process hook for this store instance (same as install).
    verifiers.registerCustomVerifier(result.custom_verifier);
    const run = await verifiers.run(REFERENCE_VERIFIER_ID, {
      workspace: join(dataDir, ".."),
      command: "noop",
    });
    expect(run.exit_code).toBe(1);
    expect(run.provenance).toBe("external_attestation");
    expect(run.may_contribute_to_pass).toBe(false);
  });
});
