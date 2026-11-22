import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { probeNomicEmbed, embedTexts, hybridRetrieve } from "../../src/v3/embeddings/index.js";

describe("Nomic embeddings + hybrid retrieve", () => {
  it("probes Ollama nomic-embed-text honestly", async () => {
    const probe = await probeNomicEmbed({ timeoutMs: 10_000 });
    expect(probe.kind).toBe("EmbeddingProbeResult");
    expect(probe.backend).toBe("ollama");
    if (probe.available) {
      expect(probe.embedding_dim).toBeGreaterThan(0);
      const emb = await embedTexts(["EvolveLoop context intelligence"], { timeoutMs: 20_000 });
      expect(emb.status).toBe("ok");
      expect(emb.vectors?.[0]?.length).toBe(probe.embedding_dim);
    } else {
      expect(probe.error).toBeTruthy();
    }
  }, 30_000);

  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "emb-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-emb",
      objective: "retrieve goal contract criteria evidence",
      criteria: [
        {
          id: "c-emb",
          description: "acceptance criteria for embedding retrieval",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-emb", "gc-emb", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("hybrid retrieves with keyword fallback even if semantic skipped", async () => {
    const paths = resolveV3DataPaths(tmp);
    const result = await hybridRetrieve(paths, {
      work_id: "w-emb",
      query: "acceptance criteria goal",
      use_embeddings: false,
    });
    expect(result.kind).toBe("HybridRetrieveResult");
    expect(result.semantic_used).toBe(false);
    expect(result.embedding_status).toBe("skipped");
    expect(result.durable_index_used).toBe(false);
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("uses nomic hybrid rank when Ollama available", async () => {
    const probe = await probeNomicEmbed({ timeoutMs: 8_000 });
    if (!probe.available) return;
    const paths = resolveV3DataPaths(tmp);
    const result = await hybridRetrieve(paths, {
      work_id: "w-emb",
      query: "acceptance criteria evidence",
      use_embeddings: true,
    });
    expect(result.semantic_used).toBe(true);
    expect(result.embedding_status).toBe("ok");
    expect(result.chunks[0]?.rank_method).toBe("hybrid");
  }, 60_000);
});
