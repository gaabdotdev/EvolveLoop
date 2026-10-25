/**
 * Test Suite: Reciprocal Rank Fusion (RRF) Hybrid Fusion - UKS Core V2.5
 * Tests multi-channel fusion (BM25, AST, Vector), mathematical scoring accuracy,
 * graceful degradation mode, and overlapping chunk deduplication.
 */

import { describe, it, expect } from "vitest";
import {
    HybridFusionEngine,
    ChannelHit,
    DEFAULT_RRF_K,
    DEFAULT_CHANNEL_WEIGHTS
} from "../../../src/knowledge/uks/hybrid-fusion";

describe("UKS Hybrid Fusion Engine", () => {
    describe("Mathematical Accuracy of RRF Score", () => {
        it("should calculate exact RRF score: w / (k + rank)", () => {
            const engine = new HybridFusionEngine({ k: 60 });

            const bm25Hits: ChannelHit[] = [
                {
                    item_id: "doc-1",
                    file_path: "src/parser.ts",
                    start_line: 1,
                    end_line: 20,
                    title: "Parser",
                    content: "export class Parser {}",
                    raw_score: 10.5,
                    channel: "bm25"
                }
            ];

            const result = engine.fuse({ bm25: bm25Hits }, { deduplicateOverlaps: false });
            expect(result.hits.length).toBe(1);

            // Expected: 1.0 / (60 + 1) = 1/61 ~= 0.016393
            const expectedScore = Number((1.0 / (60 + 1)).toFixed(6));
            expect(result.hits[0].rrf_score).toBe(expectedScore);
            expect(result.hits[0].contributing_channels).toEqual(["bm25"]);
            expect(result.hits[0].channel_ranks.bm25).toBe(1);
        });

        it("should sum reciprocal ranks when an item appears in multiple channels", () => {
            const engine = new HybridFusionEngine({ k: 60 });

            // Same item retrieved by BM25 (Rank 1) and AST (Rank 1)
            const bm25Hits: ChannelHit[] = [
                {
                    item_id: "doc-storage",
                    file_path: "src/storage.ts",
                    start_line: 1,
                    end_line: 50,
                    title: "Storage",
                    content: "export class Storage {}",
                    raw_score: 8.0,
                    channel: "bm25"
                }
            ];

            const astHits: ChannelHit[] = [
                {
                    item_id: "doc-storage",
                    file_path: "src/storage.ts",
                    start_line: 1,
                    end_line: 50,
                    title: "Storage",
                    content: "export class Storage {}",
                    raw_score: 100.0,
                    channel: "ast"
                }
            ];

            const result = engine.fuse({ bm25: bm25Hits, ast: astHits }, { deduplicateOverlaps: false });
            expect(result.hits.length).toBe(1);

            // BM25: 1.0 / (60 + 1) = 1/61
            // AST:  1.2 / (60 + 1) = 1.2/61
            // Total: 2.2 / 61 ~= 0.036066
            const expectedScore = Number((2.2 / 61).toFixed(6));
            expect(result.hits[0].rrf_score).toBe(expectedScore);
            expect(result.hits[0].contributing_channels).toContain("bm25");
            expect(result.hits[0].contributing_channels).toContain("ast");
        });
    });

    describe("Graceful Degradation Mode", () => {
        it("should activate degraded_mode: true when vector channel is missing/offline", () => {
            const engine = new HybridFusionEngine();

            const bm25Hits: ChannelHit[] = [
                {
                    item_id: "item-1",
                    file_path: "docs/spec.md",
                    start_line: 1,
                    end_line: 10,
                    title: "Spec",
                    content: "Architecture specification.",
                    raw_score: 5.0,
                    channel: "bm25"
                }
            ];

            const result = engine.fuse({ bm25: bm25Hits }, { vectorAvailable: false });
            expect(result.degraded_mode).toBe(true);
            expect(result.active_channels).toEqual(["bm25"]);
            expect(result.hits.length).toBe(1);
        });

        it("should set degraded_mode: false when vector hits are present and vectorAvailable is true", () => {
            const engine = new HybridFusionEngine();

            const bm25Hits: ChannelHit[] = [
                { item_id: "i1", file_path: "a.ts", start_line: 1, end_line: 10, title: "A", content: "A", raw_score: 1, channel: "bm25" }
            ];
            const vectorHits: ChannelHit[] = [
                { item_id: "i2", file_path: "b.ts", start_line: 1, end_line: 10, title: "B", content: "B", raw_score: 0.9, channel: "vector" }
            ];

            const result = engine.fuse({ bm25: bm25Hits, vector: vectorHits }, { vectorAvailable: true });
            expect(result.degraded_mode).toBe(false);
            expect(result.active_channels).toContain("bm25");
            expect(result.active_channels).toContain("vector");
            expect(result.hits.length).toBe(2);
        });
    });

    describe("Snippet Deduplication & Merging", () => {
        it("should merge overlapping line ranges from the same file", () => {
            const engine = new HybridFusionEngine();

            const bm25Hits: ChannelHit[] = [
                {
                    item_id: "chunk-1",
                    file_path: "src/auth.ts",
                    start_line: 10,
                    end_line: 30,
                    title: "Auth Token Part 1",
                    content: "export function generateToken() {",
                    raw_score: 9.0,
                    channel: "bm25"
                }
            ];

            const astHits: ChannelHit[] = [
                {
                    item_id: "chunk-2",
                    file_path: "src/auth.ts",
                    start_line: 25,
                    end_line: 45, // Overlaps lines 25-30
                    title: "Auth Token Part 2",
                    content: "return sign(payload); }",
                    raw_score: 80.0,
                    channel: "ast"
                }
            ];

            const result = engine.fuse({ bm25: bm25Hits, ast: astHits }, { deduplicateOverlaps: true });
            expect(result.hits.length).toBe(1); // Merged into 1 hit
            expect(result.hits[0].file_path).toBe("src/auth.ts");
            expect(result.hits[0].start_line).toBe(10);
            expect(result.hits[0].end_line).toBe(45);
            expect(result.hits[0].citation_ref).toBe("src/auth.ts:10-45");
            expect(result.hits[0].contributing_channels).toContain("bm25");
            expect(result.hits[0].contributing_channels).toContain("ast");
        });
    });
});
