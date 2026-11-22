/**
 * V2-MEM-01 — Memory Consolidation Engine.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  ConsolidationEngine,
  ConsolidationBackgroundRunner,
  StubLessonExtractor,
  OllamaLessonAdapter,
  extractRulesHeuristic,
  lessonDedupeKey,
  createOfflineConsolidationEngine,
  type VerifiedEpisode,
  type LessonExtractorPort,
  type ConsolidationProposal,
} from "../../src/v3/memory/index.js";

function episode(partial: Partial<VerifiedEpisode> & Pick<VerifiedEpisode, "episode_id" | "summary">): VerifiedEpisode {
  return {
    evidence_ids: partial.evidence_ids ?? [`ev-${partial.episode_id}`],
    ...partial,
  };
}

describe("V2-MEM-01 Memory Consolidation Engine", () => {
  let engine: ConsolidationEngine;

  beforeEach(() => {
    engine = createOfflineConsolidationEngine();
  });

  it("extracts lessons with direct evidence_ids link", async () => {
    const ep = episode({
      episode_id: "ep-1",
      summary: [
        "- Prefer bubblewrap over docker for local agent sandboxes",
        "- Always gate promotion behind validator|human|mso",
      ].join("\n"),
      evidence_ids: ["ev-sandbox-01", "ev-promo-02"],
    });

    const proposals = await engine.ingestVerifiedEpisodes([ep]);
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    for (const p of proposals) {
      expect(p.evidence_ids).toEqual(["ev-sandbox-01", "ev-promo-02"]);
      expect(p.source_episode_ids).toContain("ep-1");
      expect(p.action).toBe("create");
      expect(p.lesson.length).toBeGreaterThan(0);
      expect(p.dedupe_key).toBe(lessonDedupeKey(p.lesson));
    }
  });

  it("dedupes identical lessons to skip on second ingest", async () => {
    const ep = episode({
      episode_id: "ep-dup",
      summary: "- Never auto-promote memory without an explicit gate actor",
      evidence_ids: ["ev-dup"],
    });

    const first = await engine.ingestVerifiedEpisodes([ep]);
    expect(first).toHaveLength(1);
    expect(first[0]!.action).toBe("create");

    const second = await engine.ingestVerifiedEpisodes([
      episode({
        episode_id: "ep-dup-2",
        summary: "- Never auto-promote memory without an explicit gate actor",
        evidence_ids: ["ev-dup-2"],
      }),
    ]);
    expect(second).toHaveLength(1);
    expect(second[0]!.action).toBe("skip");
    expect(second[0]!.dedupe_key).toBe(first[0]!.dedupe_key);
    expect(second[0]!.reason).toBe("exact_dedupe_key");
  });

  it("never auto-promotes to VERIFIED — status stays PROPOSED", async () => {
    const proposals = await engine.ingestVerifiedEpisodes([
      episode({
        episode_id: "ep-status",
        summary: "- Consolidation proposals remain proposed until a gate promotes them",
        evidence_ids: ["ev-status"],
      }),
    ]);
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(p.status).toBe("PROPOSED");
      expect((p as ConsolidationProposal & { status: string }).status).not.toBe("VERIFIED");
      expect((p as ConsolidationProposal & { status: string }).status).not.toBe("ACTIVE");
    }
  });

  it("runOnce is idempotent under the same input", async () => {
    const runner = new ConsolidationBackgroundRunner({ engine });
    const batch = [
      episode({
        episode_id: "ep-once",
        summary: "- Use runOnce for tests instead of real timers",
        evidence_ids: ["ev-once"],
      }),
    ];

    runner.enqueue(batch);
    const a = await runner.runOnce();
    expect(a).toHaveLength(1);
    expect(a[0]!.action).toBe("create");
    expect(runner.pendingCount).toBe(0);

    // Same logical input again — queue empty first, then re-enqueue identical episode.
    const empty = await runner.runOnce();
    expect(empty).toEqual([]);

    runner.enqueue(batch);
    const b = await runner.runOnce();
    expect(b).toHaveLength(1);
    expect(b[0]!.action).toBe("skip");
    expect(b[0]!.dedupe_key).toBe(a[0]!.dedupe_key);
    expect(b[0]!.proposal_id).toBe(a[0]!.proposal_id);
  });

  it("failed Ollama adapter falls back to heuristic extractRules", async () => {
    const failing: LessonExtractorPort = {
      extractor_id: "ollama-lesson",
      async extractLessons() {
        throw new Error("Ollama unreachable");
      },
    };
    const withFail = new ConsolidationEngine({ extractor: failing });
    const summary = [
      "- Bubblewrap is mandatory for implement phase",
      "- Credential proxy must strip secrets from agent env",
    ].join("\n");

    const proposals = await withFail.ingestVerifiedEpisodes([
      episode({
        episode_id: "ep-fail",
        summary,
        evidence_ids: ["ev-fail"],
      }),
    ]);

    expect(proposals.length).toBeGreaterThanOrEqual(2);
    expect(proposals.every((p) => p.extraction === "heuristic")).toBe(true);
    expect(proposals.map((p) => p.lesson)).toEqual(extractRulesHeuristic(summary));
  });

  it("OllamaLessonAdapter throws on HTTP failure so engine can fall back", async () => {
    const adapter = new OllamaLessonAdapter({
      baseUrl: "http://127.0.0.1:9",
      timeoutMs: 50,
      fetchFn: async () => {
        throw new Error("connection refused");
      },
    });
    await expect(
      adapter.extractLessons(
        episode({
          episode_id: "ep-ollama",
          summary: "- Something durable worth remembering for later sessions",
          evidence_ids: ["ev-o"],
        }),
      ),
    ).rejects.toThrow(/connection refused/);
  });

  it("near-duplicate lessons propose update against seeded memory", async () => {
    engine.seedKnownLessons([
      {
        lesson: "Prefer bubblewrap over docker for local agent sandboxes",
        memory_id: "mem-sandbox",
      },
    ]);

    const proposals = await engine.ingestVerifiedEpisodes([
      episode({
        episode_id: "ep-sim",
        // High Jaccard overlap, different hash → update (not exact skip).
        summary: "- Always prefer bubblewrap over docker for local agent sandboxes",
        evidence_ids: ["ev-sim"],
      }),
    ]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.action).toBe("update");
    expect(proposals[0]!.target_memory_id).toBe("mem-sandbox");
    expect(proposals[0]!.status).toBe("PROPOSED");
    expect(proposals[0]!.dedupe_key).not.toBe(
      lessonDedupeKey("Prefer bubblewrap over docker for local agent sandboxes"),
    );
  });

  it("StubLessonExtractor is deterministic offline", async () => {
    const stub = new StubLessonExtractor();
    const ep = episode({
      episode_id: "ep-stub",
      summary: "- Alpha rule one is durable\n- Beta rule two is durable",
      evidence_ids: ["ev-stub"],
    });
    const a = await stub.extractLessons(ep);
    const b = await stub.extractLessons(ep);
    expect(a).toEqual(b);
    expect(a).toEqual(extractRulesHeuristic(ep.summary));
  });

  it("start/stop toggles without requiring a real timer tick", () => {
    let cleared = 0;
    const runner = new ConsolidationBackgroundRunner({
      engine,
      interval_ms: 10_000,
      setIntervalFn: ((fn: () => void, _ms: number) => {
        // Do not invoke fn — tests must not depend on wall clock.
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearIntervalFn: ((_id: ReturnType<typeof setInterval>) => {
        cleared += 1;
      }) as typeof clearInterval,
    });

    expect(runner.isRunning).toBe(false);
    runner.start();
    expect(runner.isRunning).toBe(true);
    runner.start(); // idempotent
    expect(runner.isRunning).toBe(true);
    runner.stop();
    expect(runner.isRunning).toBe(false);
    expect(cleared).toBe(1);
  });

  it("20+ verified episodes: extract without exact-dupe creates; evidence links preserved", async () => {
    // §4.3: consolidation over 20+ episodes, no duplication, evidence link.
    // Distinct vocab per lesson so Jaccard near-dupe does not collapse the batch.
    const verbs = [
      "Prefer", "Avoid", "Require", "Reject", "Isolate", "Pin", "Fence",
      "Quarantine", "Scrub", "Throttle", "Serialize", "Compensate", "Replay",
      "Abstain", "Calibrate", "Mutate", "Review", "Consolidate", "Expand",
      "Measure", "Rollback", "Prefetch",
    ];
    const nouns = [
      "bubblewrap", "landlock", "cgroup", "outbox", "fencing", "taint",
      "holdout", "mergiraf", "saga", "backpressure", "laya", "mutant",
      "reviewer", "episode", "hop", "recall", "precision", "proxy",
      "allowlist", "worktree", "lease", "seed",
    ];
    expect(verbs.length).toBe(22);
    expect(nouns.length).toBe(22);

    const episodes: VerifiedEpisode[] = [];
    for (let i = 0; i < 22; i++) {
      episodes.push(
        episode({
          episode_id: `ep-batch-${i}`,
          summary: `- ${verbs[i]} ${nouns[i]} marker${i} exclusively`,
          evidence_ids: [`ev-batch-${i}`],
        }),
      );
    }
    // Exact duplicate of episode 0 → must skip, not double-create.
    episodes.push(
      episode({
        episode_id: "ep-batch-dup-0",
        summary: `- ${verbs[0]} ${nouns[0]} marker0 exclusively`,
        evidence_ids: ["ev-batch-0-replay"],
      }),
    );

    const proposals = await engine.ingestVerifiedEpisodes(episodes);
    expect(episodes.length).toBeGreaterThanOrEqual(20);
    expect(proposals.length).toBe(23);

    const creates = proposals.filter((p) => p.action === "create");
    const skips = proposals.filter((p) => p.action === "skip");
    expect(creates).toHaveLength(22);
    expect(skips).toHaveLength(1);
    expect(skips[0]!.reason).toBe("exact_dedupe_key");
    expect(skips[0]!.dedupe_key).toBe(
      creates.find((c) => c.source_episode_ids.includes("ep-batch-0"))!.dedupe_key,
    );

    for (const p of creates) {
      expect(p.status).toBe("PROPOSED");
      expect(p.evidence_ids.length).toBeGreaterThan(0);
      expect(p.source_episode_ids.length).toBeGreaterThan(0);
      const epId = p.source_episode_ids[0]!;
      const src = episodes.find((e) => e.episode_id === epId)!;
      expect(p.evidence_ids).toEqual(src.evidence_ids);
    }
  });
});
