import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { VectorIndexStore } from "../../src/v3/embeddings/vector-index.js";
import { probeNomicEmbed, hybridRetrieve } from "../../src/v3/embeddings/index.js";

describe("Durable vector index", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vec-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-vec",
      objective: "vector index acceptance criteria evidence",
      criteria: [
        {
          id: "c-vec",
          description: "acceptance criteria for durable retrieval",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-vec", "gc-vec", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("reports index_missing before build", async () => {
    const paths = resolveV3DataPaths(tmp);
    const search = await new VectorIndexStore(paths).search("w-vec", "criteria");
    expect(search.status).toBe("index_missing");
  });

  it("builds durable index and prefers it in hybrid retrieve when nomic up", async () => {
    const probe = await probeNomicEmbed({ timeoutMs: 8_000 });
    if (!probe.available) return;

    const paths = resolveV3DataPaths(tmp);
    const store = new VectorIndexStore(paths);
    const snap = await store.build(paths, "w-vec");
    expect(snap.kind).toBe("VectorIndex");
    expect(snap.chunks.length).toBeGreaterThan(0);
    expect(snap.embedding_dim).toBe(probe.embedding_dim);

    const search = await store.search("w-vec", "acceptance criteria evidence");
    expect(search.status).toBe("ok");
    expect(search.hits.length).toBeGreaterThan(0);

    const hybrid = await hybridRetrieve(paths, {
      work_id: "w-vec",
      query: "acceptance criteria",
      prefer_durable_index: true,
    });
    expect(hybrid.durable_index_used).toBe(true);
    expect(hybrid.chunks[0]?.rank_method).toBe("durable_index");
  }, 90_000);
});
