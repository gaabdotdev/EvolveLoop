/**
 * Test Suite: UKS Context Pack Builder & ContextBudget Slicing (Phase 7)
 * Validates the 10-step retrieval pipeline, strict token budget enforcement,
 * Hypothesis H-01 token efficiency (>= 60% reduction), and TruthFence authority ranking.
 */

import { describe, it, expect } from "vitest";
import {
    ContextPackBuilder,
    estimateTokens,
    type UKSQueryRequest,
    type UKSKnowledgeItem
} from "../../../src/knowledge/uks/context-pack-builder";

describe("UKS ContextPackBuilder", () => {
    const workspaceRoot = "/home/gaab/orca/workspaces/EvolveLoop/v.2.5";

    describe("End-to-End Pipeline Execution", () => {
        it("should execute the 10-step pipeline and produce a valid UKSQueryResponse", async () => {
            const builder = new ContextPackBuilder();

            const mockItems: UKSKnowledgeItem[] = [
                {
                    id: "item-storage",
                    title: "Storage Core Implementation",
                    content: "export async function writeAtomicJson(p: string, d: unknown) { ... }",
                    scope: "project:auto", // will be adapted or match
                    tier: "code",
                    status: "active",
                    source_paths: ["orchestrator/src/knowledge/uks/storage-core.ts"],
                    start_line: 45,
                    end_line: 60
                }
            ];

            const request: UKSQueryRequest = {
                query: "writeAtomicJson storage core",
                workspace_root: workspaceRoot,
                max_tokens: 1500,
                custom_items: mockItems
            };

            const response = await builder.buildContextPack(request);

            expect(response.query_id).toBeDefined();
            expect(response.scope_enforced).toMatch(/^project:[a-f0-9]{16}$/);
            expect(response.hits.length).toBeGreaterThan(0);
            expect(response.context_pack_markdown).toContain("<!-- BEGIN UKS CONTEXT PACK");
            expect(response.context_pack_markdown).toContain("<!-- END UKS CONTEXT PACK -->");
            expect(response.token_count_estimated).toBeLessThanOrEqual(1500);
            expect(response.degraded_mode).toBe(true); // Vector is offline
        });
    });

    describe("ContextBudget Strict Enforcement", () => {
        it("should never exceed max_tokens and correctly move overflow hits to discarded_hits", async () => {
            const builder = new ContextPackBuilder();

            // Create 5 relatively large mock items (~150 tokens each)
            const mockItems: UKSKnowledgeItem[] = Array.from({ length: 5 }, (_, i) => ({
                id: `item-${i}`,
                title: `Large Module Definition ${i}`,
                content: `// Code implementation chunk ${i}\n`.repeat(25), // ~600 chars ~= 150 tokens
                scope: "project:auto",
                tier: "code",
                status: "active",
                source_paths: [`src/module_${i}.ts`],
                start_line: 1,
                end_line: 25
            }));

            // Tight budget of only 250 tokens
            const request: UKSQueryRequest = {
                query: "Module Definition",
                workspace_root: workspaceRoot,
                max_tokens: 250,
                custom_items: mockItems
            };

            const response = await builder.buildContextPack(request);

            // Assert strict budget ceiling
            expect(response.token_count_estimated).toBeLessThanOrEqual(250);
            expect(response.hits.length).toBeLessThan(5);
            expect(response.discarded_hits.length).toBeGreaterThan(0);
            expect(response.discarded_hits[0].reason).toContain("exceeds_token_budget");
        });
    });

    describe("Hypothesis H-01 Validation (>= 60% Token Reduction)", () => {
        it("should achieve >= 60% token reduction via surgical snippet extraction vs full files", async () => {
            const builder = new ContextPackBuilder();

            // A surgical snippet of 15 lines from storage-core.ts
            const mockItems: UKSKnowledgeItem[] = [
                {
                    id: "item-storage-core",
                    title: "writeAtomicJson Contract",
                    content: "export async function writeAtomicJson(filePath: string, data: unknown): Promise<void> {\n    await fs.promises.writeFile(tmp, JSON.stringify(data));\n    await fs.promises.rename(tmp, filePath);\n}",
                    scope: "project:auto",
                    tier: "code",
                    status: "active",
                    source_paths: ["orchestrator/src/knowledge/uks/storage-core.ts"],
                    start_line: 45,
                    end_line: 60
                }
            ];

            const request: UKSQueryRequest = {
                query: "writeAtomicJson",
                workspace_root: workspaceRoot,
                max_tokens: 2000,
                custom_items: mockItems
            };

            const response = await builder.buildContextPack(request);

            expect(response.hits.length).toBe(1);
            expect(response.raw_files_tokens_estimated).toBeGreaterThan(response.token_count_estimated);
            // Hypothesis H-01 acceptance threshold: >= 60% reduction
            expect(response.token_reduction_pct).toBeGreaterThanOrEqual(60.0);
        });
    });

    describe("TruthFence Authority Prioritization", () => {
        it("should order Tier 0 (code) before Tier 1 (docs) and resolve topic conflicts", async () => {
            const builder = new ContextPackBuilder();

            const mockItems: UKSKnowledgeItem[] = [
                {
                    id: "doc-spec",
                    title: "Storage Core Documentation",
                    content: "Old specification: storage uses synchronous writes.",
                    scope: "project:auto",
                    tier: "ai", // Tier 1
                    status: "active",
                    topic_key: "storage_contract",
                    source_paths: ["docs/storage.md"]
                },
                {
                    id: "code-impl",
                    title: "Storage Core Code Implementation",
                    content: "export async function writeAtomicJson(): Promise<void> { /* asynchronous POSIX rename */ }",
                    scope: "project:auto",
                    tier: "code", // Tier 0
                    status: "active",
                    topic_key: "storage_contract",
                    source_paths: ["src/storage.ts"]
                }
            ];

            const request: UKSQueryRequest = {
                query: "Storage Core",
                workspace_root: workspaceRoot,
                max_tokens: 2000,
                custom_items: mockItems
            };

            const response = await builder.buildContextPack(request);

            // Conflicting topic: Tier 0 must supersede Tier 1
            expect(response.hits.length).toBe(1);
            expect(response.hits[0].epistemic_tier).toBe("code");
            expect(response.hits[0].item.id).toBe("code-impl");
            expect(response.discarded_hits.some(d => d.reason.includes("superseded_by_higher_tier"))).toBe(true);
        });
    });

    describe("Canary Leakage Prevention", () => {
        it("should throw SECURITY_LEAK_PREVENTED when foreign canary is present in candidate payload", async () => {
            const builder = new ContextPackBuilder();
            const foreignCanary = "CANARY_FOREIGN_LEAK_SECRET_999";

            const mockItems: UKSKnowledgeItem[] = [
                {
                    id: "leaked-item",
                    title: "Leaked Token Item",
                    content: `Here is the leaked secret: ${foreignCanary}`,
                    scope: "project:auto",
                    tier: "code",
                    status: "active",
                    source_paths: ["src/leak.ts"]
                }
            ];

            const request: UKSQueryRequest = {
                query: "leak",
                workspace_root: workspaceRoot,
                registered_canaries: [foreignCanary],
                custom_items: mockItems
            };

            await expect(builder.buildContextPack(request)).rejects.toThrow("SECURITY_LEAK_PREVENTED");
        });
    });
});
