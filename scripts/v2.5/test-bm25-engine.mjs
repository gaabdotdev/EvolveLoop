#!/usr/bin/env -S node --experimental-strip-types
/**
 * Standalone Deterministic Test Runner for UKS BM25 Engine (Phase 4)
 * Tests tokenization, Okapi BM25 scoring, indexes real repository docs,
 * measures search latency against the sub-15ms SLO, and persists evidence.
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
const bm25Module = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/bm25-engine.ts");
const storageCoreModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/storage-core.ts");

const {
    tokenize,
    chunkMarkdownDocument,
    Bm25Engine
} = await import(bm25Module);

const { computeSha256, writeAtomicJson } = await import(storageCoreModule);

const sandboxDir = path.join(workspaceRoot, ".test-harness/phase4-bm25-engine");
const evidenceTaskDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
const evidenceJsonPath = path.join(evidenceTaskDir, "phase4-bm25-engine.json");
const outputBm25Json = path.join(workspaceRoot, ".data/project-bm25.json");

await fs.promises.mkdir(sandboxDir, { recursive: true });
await fs.promises.mkdir(evidenceTaskDir, { recursive: true });

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];

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
console.log("UKS BM25 LEXICAL ENGINE DETERMINISTIC ACCEPTANCE SUITE (Phase 4 Migration)");
console.log("================================================================================");

// Test 1: Tokenizer Verification
await test("tokenize normalizes text, strips stopwords, and splits compound tokens", async () => {
    const raw = "The Storage-Core module implements atomic_writes with SHA-256 in TypeScript!";
    const tokens = tokenize(raw);

    assert(!tokens.includes("the"), "Stopword 'the' was not filtered");
    assert(!tokens.includes("with"), "Stopword 'with' was not filtered");
    assert(!tokens.includes("in"), "Stopword 'in' was not filtered");

    assert(tokens.includes("storage-core"), "Compound token 'storage-core' missing");
    assert(tokens.includes("storage"), "Sub-token 'storage' missing");
    assert(tokens.includes("core"), "Sub-token 'core' missing");
    assert(tokens.includes("atomic"), "Sub-token 'atomic' missing");
    assert(tokens.includes("writes"), "Sub-token 'writes' missing");
    assert(tokens.includes("typescript"), "Token 'typescript' missing");
});

// Test 2: Markdown Chunking with Line Ranges
await test("chunkMarkdownDocument extracts structured chunks with precise line ranges", async () => {
    const sampleMd = `# Document Title

Introduction paragraph.

## Section Alpha
Line 1 of Alpha.
Line 2 of Alpha.

## Section Beta
Line 1 of Beta.
`;
    const chunks = chunkMarkdownDocument(path.join(sandboxDir, "sample.md"), sampleMd, sandboxDir);
    assert(chunks.length === 3, `Expected 3 chunks, got ${chunks.length}`);

    const alphaChunk = chunks.find(c => c.title === "Section Alpha");
    assert(alphaChunk !== undefined, "Section Alpha chunk missing");
    assert(alphaChunk.start_line === 5 && alphaChunk.end_line === 8, `Alpha chunk lines mismatch: ${alphaChunk.start_line}-${alphaChunk.end_line}`);
});

// Test 3: Okapi BM25 Ranking Fidelity
await test("Bm25Engine ranks documents accurately based on term frequency and length normalization", async () => {
    const engine = new Bm25Engine(sandboxDir);

    engine.addMarkdownDocument(
        "security.md",
        "# Security Policy\nStrict isolation rules and canary token validation to prevent data leaks."
    );
    engine.addMarkdownDocument(
        "storage.md",
        "# Storage Architecture\nAtomic write mechanisms using temp files and POSIX rename for integrity."
    );
    engine.addMarkdownDocument(
        "network.md",
        "# Network Proxy\nReverse proxy configurations and HTTP request headers."
    );

    engine.buildIndex();

    const hits = engine.search("atomic write storage", 5);
    assert(hits.length > 0, "Hits should not be empty");
    assert(hits[0].file_path === "storage.md", `Expected top hit to be storage.md, got ${hits[0].file_path}`);
    assert(hits[0].matched_terms.includes("atomic"), "Matched terms should include 'atomic'");
    assert(hits[0].matched_terms.includes("storage"), "Matched terms should include 'storage'");
});

// Test 4: Real Repository Indexing & Sub-15ms Latency Benchmark
let realEngine;
const latencyMeasurements = [];

await test("indexes repository docs, persists .data/project-bm25.json, and achieves sub-15ms latency", async () => {
    const indexStart = Date.now();

    // Ingest docs/ directory
    realEngine = await Bm25Engine.fromDirectory(path.join(workspaceRoot, "docs"), workspaceRoot);
    const indexDuration = Date.now() - indexStart;

    const stats = realEngine.getStats();
    console.log(`[INFO] Indexed Repository Documentation:`);
    console.log(`       - Total Documents: ${stats.total_documents}`);
    console.log(`       - Total Chunks: ${stats.total_chunks}`);
    console.log(`       - Total Terms: ${stats.total_terms}`);
    console.log(`       - Avg Chunk Length: ${stats.avg_chunk_length} tokens`);
    console.log(`       - Index Ingestion Duration: ${indexDuration} ms`);

    assert(stats.total_documents > 50, "Expected at least 50 markdown documents indexed");
    assert(stats.total_chunks > 100, "Expected at least 100 chunks indexed");

    // Save index atomically
    await realEngine.save(outputBm25Json);
    assert(fs.existsSync(outputBm25Json), "Persisted project-bm25.json must exist");

    // Run 10 realistic evaluation queries and measure latency
    const testQueries = [
        "orchestrator contract operational boundaries",
        "agent delegation protocol acceptance criteria",
        "worktree policy branch isolation",
        "atomic write storage core POSIX rename",
        "failure recovery partial plan reset",
        "truthfence authority hierarchy code ai vault",
        "epistemic taxonomy VERIFIED_IN_CODE MEASURED",
        "subagent depth limit concurrency ceiling",
        "antigravity dangerously-skip-permissions CLI launcher",
        "evidence manifest sha256 checksums"
    ];

    console.log(`[INFO] Running Latency Benchmark on 10 Queries (SLO < 15 ms):`);

    for (const q of testQueries) {
        const start = performance.now();
        const hits = realEngine.search(q, 5);
        const latencyMs = Number((performance.now() - start).toFixed(2));
        latencyMeasurements.push({ query: q, latency_ms: latencyMs, hits_count: hits.length, top_hit: hits[0]?.file_path });

        console.log(`       - [${latencyMs.toFixed(2)} ms] "${q}" -> ${hits.length} hits (top: ${hits[0]?.file_path || "none"})`);
        assert(latencyMs < 15, `Search latency ${latencyMs}ms exceeded 15ms SLO`);
        assert(hits.length > 0, `Query '${q}' should return at least 1 hit`);
    }

    // Compute median and p95 latency
    const sortedLatencies = [...latencyMeasurements.map(m => m.latency_ms)].sort((a, b) => a - b);
    const medianLatency = sortedLatencies[Math.floor(sortedLatencies.length / 2)];
    const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];

    console.log(`[INFO] Latency Summary: Median = ${medianLatency} ms | p95 = ${p95Latency} ms | SLO = < 15 ms`);
    assert(medianLatency < 15, "Median latency must be below 15 ms");
});

console.log("================================================================================");
console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("================================================================================");

// Serialize Evidence Record
const sortedLats = [...latencyMeasurements.map(m => m.latency_ms)].sort((a, b) => a - b);
const medianLat = sortedLats[Math.floor(sortedLats.length / 2)] || 0;
const p95Lat = sortedLats[Math.floor(sortedLats.length * 0.95)] || 0;

const evidencePayload = {
    task_id: "phase4-bm25-engine-validation",
    phase: "Phase 4: Okapi BM25 Lexical Engine Porting (ADR-D01)",
    timestamp: new Date().toISOString(),
    status: failedTests === 0 ? "PASSED" : "FAILED",
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    tests: testDetails,
    measurements: {
        total_documents_indexed: realEngine?.getStats().total_documents || 0,
        total_chunks_indexed: realEngine?.getStats().total_chunks || 0,
        total_terms_indexed: realEngine?.getStats().total_terms || 0,
        avg_chunk_length: realEngine?.getStats().avg_chunk_length || 0,
        search_queries_evaluated: latencyMeasurements.length,
        median_search_latency_ms: medianLat,
        p95_search_latency_ms: p95Lat,
        slo_latency_target_ms: 15.0,
        slo_latency_pass: medianLat < 15.0,
        legacy_v22_subprocess_latency_ms: 1639.0,
        speedup_factor: Number((1639.0 / (medianLat || 1)).toFixed(1)),
        query_details: latencyMeasurements
    },
    artifacts: [
        {
            path: "orchestrator/src/knowledge/uks/bm25-engine.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(bm25Module))
        },
        {
            path: "orchestrator/tests/knowledge/uks/bm25-engine.test.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "orchestrator/tests/knowledge/uks/bm25-engine.test.ts")))
        },
        {
            path: ".data/project-bm25.json",
            type: "MEASURED",
            sha256: computeSha256(await fs.promises.readFile(outputBm25Json))
        }
    ]
};

await writeAtomicJson(evidenceJsonPath, evidencePayload);
console.log(`[+] Evidence persisted to: ${evidenceJsonPath}`);

// Cleanup test harness sandbox
await fs.promises.rm(sandboxDir, { recursive: true, force: true });

if (failedTests > 0) {
    process.exit(1);
}
