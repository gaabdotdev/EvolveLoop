import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArtifactFabric } from "../../../src/v3/fabric/artifacts/registry.js";
import { LeaseManager } from "../../../src/v3/fabric/leases/lease-manager.js";
import { bindV37LedgerAdapters } from "../../../src/v4/adapters/v37/ledger.js";
import { FileArtifactStore } from "../../../src/v4/artifacts/index.js";
import { WORK, tempRoot } from "../ledger/helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M02 V3.7 ledger adapter — delegates, does not reimplement", () => {
  it("returns the live ArtifactFabric and LeaseManager instances", () => {
    const fabricDir = mkdtempSync(join(tmpdir(), "v4-m02-fabric-"));
    roots.push(fabricDir);
    const bound = bindV37LedgerAdapters(fabricDir);
    expect(bound.artifacts).toBeInstanceOf(ArtifactFabric);
    expect(bound.leases).toBeInstanceOf(LeaseManager);
  });

  it("puts bytes through ArtifactFabric.putLocalFile and records v37_artifact_id", async () => {
    const fabricDir = mkdtempSync(join(tmpdir(), "v4-m02-fabric-"));
    const dataRoot = tempRoot();
    roots.push(fabricDir, dataRoot);
    const bound = bindV37LedgerAdapters(fabricDir);
    const store = new FileArtifactStore({ root: dataRoot, v37: bound.artifacts });
    const art = await store.put({
      work_id: WORK,
      bytes: new TextEncoder().encode("via-fabric"),
      media_type: "text/plain",
      origin: {},
    });
    expect(art.v37_artifact_id).toMatch(/^art_/);
    expect(art.integrity_status).toBe("VERIFIED");
    const rec = bound.artifacts.get(art.v37_artifact_id!);
    expect(rec?.content_hash_sha256).toBe(art.content.sha256);
  });
});
