#!/usr/bin/env -S node --experimental-strip-types
/**
 * Standalone Deterministic Test Runner for UKS Hybrid Fusion Engine (Phase 6)
 * Validates Reciprocal Rank Fusion (RRF k=60), mathematical accuracy,
 * AST + BM25 synergistic ranking, graceful degradation (offline vector),
 * overlapping chunk deduplication, sub-5ms in-process latency SLO, and persists evidence.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";

// If executed by plain 'node' without strip-types support, re-spawn with --experimental-strip-types
if (!process.execArgv.includes("--experimental-strip-types")) {
    const child = cp.spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], {
        stdio: "inherit",
        env: process.env
    });
    process.exit(child.status ?? 0);
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const hybridFusionModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/hybrid-fusion.ts");
const storageCoreModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/storage-core.ts");

const {
    HybridFusionEngine,
    DEFAULT_RRF_K,
    DEFAULT_CHANNEL_WEIGHTS
} = await import(hybridFusionModule);

const { computeSha256, writeAtomicJson } = await import(storageCoreModule);

const evidenceTaskDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
const evidenceJsonPath = path.join(evidenceTaskDir, "phase6-hybrid-fusion.json");

await fs.promises.mkdir(evidenceTaskDir, { recursive: true });

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];
const latencyMeasurements = [];

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function test(name, fn) {
    totalTests++;
    const start = Date.now();
    try {
        await fn();
        const duration = Date.now() - start;
        passedTests++;
        console.log(`[✓ PASS] ${name} (${duration}ms)`);
        testDetails.push({ name, status: "PASS", duration_ms: duration });
    } catch (err) {
        const duration = Date.now() - start;
        failedTests++;
        console.error(`[✗ FAIL] ${name} (${duration}ms):`, err.message);
        testDetails.push({ name, status: "FAIL", duration_ms: duration, error: err.message });
    }
}

console.log("================================================================================");
console.log("UKS HYBRID FUSION & RRF DETERMINISTIC ACCEPTANCE SUITE (Phase 6)");
console.log("================================================================================");

// Test 1: Mathematical precision of RRF formula w / (k + rank)
await test("RRF mathematical precision: w / (k + rank) for single channel", async () => {
    const engine = new HybridFusionEngine({ k: 60 });
    const bm25Hits = [
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
    assert(result.hits.length === 1, `Expected 1 hit, got ${result.hits.length}`);
    
    // Formula: 1.0 / (60 + 1) = 1/61 = 0.01639344... -> rounded to 6 dec: 0.016393
    const expectedScore = Number((1.0 / (60 + 1)).toFixed(6));
    assert(
        Math.abs(result.hits[0].rrf_score - expectedScore) < 0.000001,
        `Expected score ${expectedScore}, got ${result.hits[0].rrf_score}`
    );
    assert(result.hits[0].channel_ranks.bm25 === 1, "BM25 rank should be 1");
    assert(result.hits[0].contributing_channels.includes("bm25"), "BM25 should be in contributing channels");
});

// Test 2: Multi-channel score summation across BM25 and AST
await test("RRF multi-channel score summation: BM25 + AST", async () => {
    const engine = new HybridFusionEngine({ k: 60 });

    const bm25Hits = [
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

    const astHits = [
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
    assert(result.hits.length === 1, `Expected 1 combined hit, got ${result.hits.length}`);

    // BM25: 1.0 / 61, AST: 1.2 / 61 -> Total: 2.2 / 61 = 0.03606557... -> 0.036066
    const expected = Number((2.2 / 61).toFixed(6));
    assert(
        Math.abs(result.hits[0].rrf_score - expected) < 0.000001,
        `Expected multi-channel score ${expected}, got ${result.hits[0].rrf_score}`
    );
    assert(result.hits[0].contributing_channels.length === 2, "Expected 2 contributing channels");
    assert(result.hits[0].contributing_channels.includes("bm25"), "Missing bm25 channel");
    assert(result.hits[0].contributing_channels.includes("ast"), "Missing ast channel");
});

// Test 3: AST + BM25 synergistic ranking elevation
await test("Synergistic ranking: Joint AST + BM25 hit elevates above isolated BM25 hits", async () => {
    const engine = new HybridFusionEngine({ k: 60 });

    // Item A: Only BM25 rank 1 (pure textual mention, e.g. docstring)
    // Item B: BM25 rank 2 + AST rank 1 (exact code definition + lexical match)
    const bm25Hits = [
        {
            item_id: "item-a",
            file_path: "docs/readme.md",
            start_line: 10,
            end_line: 20,
            title: "Readme mention",
            content: "We use writeAtomicJson for safe disk writes.",
            raw_score: 15.0,
            channel: "bm25"
        },
        {
            item_id: "item-b",
            file_path: "src/storage.ts",
            start_line: 45,
            end_line: 75,
            title: "writeAtomicJson definition",
            content: "export async function writeAtomicJson(filePath, data) { ... }",
            raw_score: 12.0,
            channel: "bm25"
        }
    ];

    const astHits = [
        {
            item_id: "item-b",
            file_path: "src/storage.ts",
            start_line: 45,
            end_line: 75,
            title: "writeAtomicJson definition",
            content: "export async function writeAtomicJson(filePath, data) { ... }",
            raw_score: 95.0,
            channel: "ast"
        }
    ];

    const result = engine.fuse({ bm25: bm25Hits, ast: astHits }, { deduplicateOverlaps: false });
    assert(result.hits.length === 2, `Expected 2 hits, got ${result.hits.length}`);

    // Item A score = 1.0 / (60 + 1) = 0.016393
    // Item B score = 1.2 / (60 + 1) + 1.0 / (60 + 2) = 0.019672 + 0.016129 = 0.035801
    // Item B must be ranked #1
    assert(result.hits[0].item_id === "item-b", `Expected item-b at rank 1, but got ${result.hits[0].item_id}`);
    assert(result.hits[1].item_id === "item-a", `Expected item-a at rank 2, but got ${result.hits[1].item_id}`);
    assert(result.hits[0].rrf_score > result.hits[1].rrf_score, "Item B score should be higher than Item A score");
});

// Test 4: Graceful Degradation when Vector engine is offline/unavailable
await test("Graceful degradation: degraded_mode is true when vector unavailable without crashing", async () => {
    const engine = new HybridFusionEngine();

    const bm25Hits = [
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

    // Case 1: vector channel completely omitted and vectorAvailable=false
    const result1 = engine.fuse({ bm25: bm25Hits }, { vectorAvailable: false });
    assert(result1.degraded_mode === true, "degraded_mode should be true when vector unavailable");
    assert(result1.active_channels.length === 1 && result1.active_channels[0] === "bm25", "Only bm25 should be active");
    assert(result1.hits.length === 1, "Hits should still be returned in degraded mode");

    // Case 2: vectorHits empty array
    const result2 = engine.fuse({ bm25: bm25Hits, vector: [] }, { vectorAvailable: true });
    assert(result2.degraded_mode === true, "degraded_mode should be true when vector hits are empty");

    // Case 3: vector hits present and vectorAvailable=true
    const vectorHits = [
        {
            item_id: "item-2",
            file_path: "docs/spec2.md",
            start_line: 1,
            end_line: 10,
            title: "Spec 2",
            content: "Vector match content.",
            raw_score: 0.92,
            channel: "vector"
        }
    ];
    const result3 = engine.fuse({ bm25: bm25Hits, vector: vectorHits }, { vectorAvailable: true });
    assert(result3.degraded_mode === false, "degraded_mode should be false when vector is available and populated");
    assert(result3.active_channels.includes("vector"), "vector channel should be active");
    assert(result3.hits.length === 2, "Both hits should be present");
});

// Test 5: Overlapping snippet deduplication and citation formatting
await test("Overlapping chunk deduplication and surgical citation references", async () => {
    const engine = new HybridFusionEngine();

    const bm25Hits = [
        {
            item_id: "chunk-a",
            file_path: "src/auth/token.ts",
            start_line: 10,
            end_line: 30,
            title: "Auth Token Gen",
            content: "export function generateToken(user: User) {\n    const payload = { sub: user.id };",
            raw_score: 8.5,
            channel: "bm25"
        }
    ];

    const astHits = [
        {
            item_id: "chunk-b",
            file_path: "src/auth/token.ts",
            start_line: 28,
            end_line: 45, // Overlaps with 28-30
            title: "Auth Token Sign",
            content: "    const payload = { sub: user.id };\n    return signJwt(payload, SECRET);\n}",
            raw_score: 90.0,
            channel: "ast"
        }
    ];

    const result = engine.fuse({ bm25: bm25Hits, ast: astHits }, { deduplicateOverlaps: true });
    assert(result.hits.length === 1, `Expected chunks to be merged into 1 hit, got ${result.hits.length}`);
    
    const merged = result.hits[0];
    assert(merged.file_path === "src/auth/token.ts", "File path should be src/auth/token.ts");
    assert(merged.start_line === 10, `Expected start_line 10, got ${merged.start_line}`);
    assert(merged.end_line === 45, `Expected end_line 45, got ${merged.end_line}`);
    assert(merged.citation_ref === "src/auth/token.ts:10-45", `Expected citation_ref src/auth/token.ts:10-45, got ${merged.citation_ref}`);
    assert(merged.contributing_channels.includes("bm25") && merged.contributing_channels.includes("ast"), "Both channels should contribute to merged hit");
});

// Test 6: In-process latency benchmark against sub-5ms SLO
await test("In-process fusion latency benchmark adheres strictly to sub-5ms SLO", async () => {
    const engine = new HybridFusionEngine();

    // Prepare realistic multi-channel candidate lists (25 BM25 hits, 15 AST hits, 20 Vector hits)
    const mockBm25 = Array.from({ length: 25 }, (_, i) => ({
        item_id: `item-${i}`,
        file_path: `src/module_${i % 5}.ts`,
        start_line: i * 10 + 1,
        end_line: i * 10 + 20,
        title: `Symbol ${i}`,
        content: `export function symbol_${i}() { return ${i}; }`,
        raw_score: 25 - i,
        channel: "bm25"
    }));

    const mockAst = Array.from({ length: 15 }, (_, i) => ({
        item_id: `item-${i * 2}`, // Matches every second BM25 hit
        file_path: `src/module_${(i * 2) % 5}.ts`,
        start_line: (i * 2) * 10 + 1,
        end_line: (i * 2) * 10 + 20,
        title: `Symbol ${i * 2}`,
        content: `export function symbol_${i * 2}() { return ${i * 2}; }`,
        raw_score: 100 - i,
        channel: "ast"
    }));

    const mockVector = Array.from({ length: 20 }, (_, i) => ({
        item_id: `item-${i + 5}`,
        file_path: `src/module_${(i + 5) % 5}.ts`,
        start_line: (i + 5) * 10 + 1,
        end_line: (i + 5) * 10 + 20,
        title: `Symbol ${i + 5}`,
        content: `export function symbol_${i + 5}() { return ${i + 5}; }`,
        raw_score: 0.95 - (i * 0.02),
        channel: "vector"
    }));

    // Warm-up run
    engine.fuse({ bm25: mockBm25, ast: mockAst, vector: mockVector }, { vectorAvailable: true });

    // 100 benchmark iterations
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const res = engine.fuse(
            { bm25: mockBm25, ast: mockAst, vector: mockVector },
            { vectorAvailable: true, maxResults: 10, deduplicateOverlaps: true }
        );
        const duration = performance.now() - start;
        latencyMeasurements.push(duration);
        assert(res.hits.length === 10, `Expected 10 hits, got ${res.hits.length}`);
    }

    const sortedLats = [...latencyMeasurements].sort((a, b) => a - b);
    const medianLat = sortedLats[Math.floor(sortedLats.length / 2)];
    const p95Lat = sortedLats[Math.floor(sortedLats.length * 0.95)];

    console.log(`    [BENCHMARK] 100 iterations of 3-channel fusion:`);
    console.log(`    - Median latency: ${medianLat.toFixed(3)} ms (Target: < 5.0 ms)`);
    console.log(`    - P95 latency:    ${p95Lat.toFixed(3)} ms`);
    console.log(`    - Legacy V2.2:    1639.0 ms`);
    console.log(`    - Speedup factor: ${(1639.0 / (medianLat || 0.001)).toFixed(1)}x faster`);

    assert(medianLat < 5.0, `Median latency ${medianLat.toFixed(3)}ms exceeds 5.0ms SLO target!`);
});

console.log("================================================================================");
console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("================================================================================");

// Serialize Evidence Record
const sortedLats = [...latencyMeasurements].sort((a, b) => a - b);
const medianLat = sortedLats[Math.floor(sortedLats.length / 2)] || 0;
const p95Lat = sortedLats[Math.floor(sortedLats.length * 0.95)] || 0;

const evidencePayload = {
    task_id: "phase6-hybrid-fusion-validation",
    phase: "Phase 6: Reciprocal Rank Fusion (RRF) Hybrid Fusion and Graceful Degradation",
    timestamp: new Date().toISOString(),
    status: failedTests === 0 ? "PASSED" : "FAILED",
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    tests: testDetails,
    measurements: {
        fusion_algorithm: "Reciprocal Rank Fusion (RRF)",
        rrf_constant_k: DEFAULT_RRF_K,
        default_weights: DEFAULT_CHANNEL_WEIGHTS,
        channels_tested: ["bm25", "ast", "vector"],
        benchmark_iterations: latencyMeasurements.length,
        median_fusion_latency_ms: Number(medianLat.toFixed(3)),
        p95_fusion_latency_ms: Number(p95Lat.toFixed(3)),
        slo_latency_target_ms: 5.0,
        slo_latency_pass: medianLat < 5.0,
        legacy_v22_subprocess_latency_ms: 1639.0,
        speedup_factor: Number((1639.0 / (medianLat || 0.001)).toFixed(1)),
        degraded_mode_support: true,
        snippet_deduplication_support: true
    },
    artifacts: [
        {
            path: "orchestrator/src/knowledge/uks/hybrid-fusion.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(hybridFusionModule))
        },
        {
            path: "orchestrator/tests/knowledge/uks/hybrid-fusion.test.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "orchestrator/tests/knowledge/uks/hybrid-fusion.test.ts")))
        },
        {
            path: "scripts/v2.5/test-hybrid-fusion.mjs",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "scripts/v2.5/test-hybrid-fusion.mjs")))
        }
    ]
};

await writeAtomicJson(evidenceJsonPath, evidencePayload);
console.log(`[+] Evidence persisted to: ${evidenceJsonPath}`);

if (failedTests > 0) {
    process.exit(1);
}
