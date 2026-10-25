#!/usr/bin/env -S node --experimental-strip-types
/**
 * Standalone Deterministic Test Runner for UKS Context Pack Builder (Phase 7)
 * Validates the complete 10-step retrieval pipeline, ContextBudget slicing,
 * TruthFence authority arbitration, adversarial canary containment,
 * proves Hypothesis H-01 (>= 60% token reduction), and persists canonical evidence.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const loaderPath = path.join(__dirname, "ts-loader.mjs");

// If executed by plain 'node' without strip-types support, re-spawn with --experimental-strip-types and ts-loader
if (!process.execArgv.includes("--experimental-strip-types") || !process.execArgv.includes(loaderPath)) {
    const child = cp.spawnSync(process.execPath, [
        "--experimental-strip-types",
        "--loader", loaderPath,
        ...process.argv.slice(1)
    ], {
        stdio: "inherit",
        env: process.env
    });
    process.exit(child.status ?? 0);
}
const builderModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/context-pack-builder.ts");
const storageCoreModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/storage-core.ts");
const scopeEnforcerModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/scope-enforcer.ts");

const {
    ContextPackBuilder,
    estimateTokens,
    extractLineRange
} = await import(builderModule);

const { computeSha256, writeAtomicJson } = await import(storageCoreModule);
const { resolveProjectScopeId } = await import(scopeEnforcerModule);

const evidenceTaskDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
const evidenceJsonPath = path.join(evidenceTaskDir, "phase7-context-pack-builder.json");

await fs.promises.mkdir(evidenceTaskDir, { recursive: true });

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];
const benchmarkResults = [];

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
console.log("UKS CONTEXT PACK BUILDER & CONTEXTBUDGET SUITE (Phase 7 Migration)");
console.log("================================================================================");

const projectScope = resolveProjectScopeId(workspaceRoot);

// Test 1: End-to-End Pipeline Execution
await test("End-to-end 10-step pipeline produces structured UKSQueryResponse", async () => {
    const builder = new ContextPackBuilder();

    const mockItems = [
        {
            id: "note-storage",
            title: "Storage Core Architecture",
            content: "export async function writeAtomicJson(filePath, data) {\n  // POSIX atomic write\n}",
            scope: projectScope,
            tier: "code",
            status: "active",
            source_paths: ["orchestrator/src/knowledge/uks/storage-core.ts"],
            start_line: 45,
            end_line: 55
        }
    ];

    const response = await builder.buildContextPack({
        query: "writeAtomicJson storage core",
        workspace_root: workspaceRoot,
        max_tokens: 1500,
        custom_items: mockItems
    });

    assert(response.query_id && response.query_id.length > 0, "Missing query_id");
    assert(response.scope_enforced === projectScope, `Scope mismatch: ${response.scope_enforced} vs ${projectScope}`);
    assert(response.hits.length === 1, `Expected 1 hit, got ${response.hits.length}`);
    assert(response.context_pack_markdown.includes("<!-- BEGIN UKS CONTEXT PACK"), "Header envelope missing");
    assert(response.context_pack_markdown.includes("<!-- END UKS CONTEXT PACK -->"), "Footer envelope missing");
    assert(response.context_pack_markdown.includes("`orchestrator/src/knowledge/uks/storage-core.ts:45-55`"), "Surgical citation missing");
    assert(response.token_count_estimated <= 1500, "Token count exceeds 1500 limit");
    assert(response.degraded_mode === true, "degraded_mode should be true with offline vector");
});

// Test 2: Strict ContextBudget Enforcement & Overflow Handling
await test("ContextBudget ceiling is strictly respected; overflow hits discarded gracefully", async () => {
    const builder = new ContextPackBuilder();

    // 6 items with ~120 tokens each = ~720 tokens total
    const mockItems = Array.from({ length: 6 }, (_, i) => ({
        id: `item-${i}`,
        title: `Module Component ${i}`,
        content: `// Implementation section ${i}\n`.repeat(20),
        scope: projectScope,
        tier: "code",
        status: "active",
        source_paths: [`src/mod_${i}.ts`],
        start_line: 1,
        end_line: 20
    }));

    // Extremely tight budget: 200 tokens
    const maxTokens = 200;
    const response = await builder.buildContextPack({
        query: "Module Component",
        workspace_root: workspaceRoot,
        max_tokens: maxTokens,
        custom_items: mockItems
    });

    assert(
        response.token_count_estimated <= maxTokens,
        `Token ceiling violated: ${response.token_count_estimated} > ${maxTokens}`
    );
    assert(response.hits.length < 6, "Not all items should fit in 200 tokens");
    assert(response.discarded_hits.length > 0, "Discarded hits should be populated");
    assert(
        response.discarded_hits.some(d => d.reason.includes("exceeds_token_budget")),
        "Discarded reason should mention exceeds_token_budget"
    );
});

// Test 3: Hypothesis H-01 Proof: >= 60% Token Reduction
await test("Hypothesis H-01 validation: Surgical snippet reduces input tokens by >= 60%", async () => {
    const builder = new ContextPackBuilder();

    // Surgical snippet of storage-core.ts (15 lines vs ~110 lines full file)
    const mockItems = [
        {
            id: "storage-snippet",
            title: "Storage Core Atomic Write",
            content: "export async function writeAtomicJson(filePath: string, data: unknown): Promise<void> {\n  const tempPath = `${filePath}.${Date.now()}.tmp`;\n  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');\n  await fs.promises.rename(tempPath, filePath);\n}",
            scope: projectScope,
            tier: "code",
            status: "active",
            source_paths: ["orchestrator/src/knowledge/uks/storage-core.ts"],
            start_line: 45,
            end_line: 60
        }
    ];

    const response = await builder.buildContextPack({
        query: "writeAtomicJson",
        workspace_root: workspaceRoot,
        max_tokens: 2000,
        custom_items: mockItems
    });

    const contextTokens = response.token_count_estimated;
    const fullFileTokens = response.raw_files_tokens_estimated;
    const reductionPct = response.token_reduction_pct;

    console.log(`    [HYPOTHESIS H-01] Token Metrics:`);
    console.log(`    - Full File Tokens (read_file):  ${fullFileTokens}`);
    console.log(`    - UKS Context Pack Tokens:       ${contextTokens}`);
    console.log(`    - Token Reduction Achieved:      ${reductionPct}% (SLO: >= 60.0%)`);

    assert(reductionPct >= 60.0, `Hypothesis H-01 Falsified! Reduction ${reductionPct}% is below 60.0% threshold`);
});

// Test 4: TruthFence 4-Tier Authority Arbitration & Obsolete Filtering
await test("TruthFence prioritizes Tier 0 Code over Tier 1 Docs and suppresses obsolete items", async () => {
    const builder = new ContextPackBuilder();

    const mockItems = [
        {
            id: "doc-spec",
            title: "Outdated Spec",
            content: "Spec: Sync disk writes.",
            scope: projectScope,
            tier: "ai", // Tier 1
            status: "active",
            topic_key: "disk_write_contract",
            source_paths: ["docs/storage.md"]
        },
        {
            id: "code-impl",
            title: "Actual Implementation",
            content: "export async function writeAtomicJson() { /* POSIX atomic rename */ }",
            scope: projectScope,
            tier: "code", // Tier 0
            status: "active",
            topic_key: "disk_write_contract",
            source_paths: ["orchestrator/src/knowledge/uks/storage-core.ts"]
        },
        {
            id: "obsolete-item",
            title: "Legacy Deprecated Function",
            content: "function legacyWrite() {}",
            scope: projectScope,
            tier: "code",
            status: "obsoleto", // Should be completely rejected
            topic_key: "legacy_function",
            source_paths: ["src/legacy.ts"]
        }
    ];

    const response = await builder.buildContextPack({
        query: "write contract",
        workspace_root: workspaceRoot,
        max_tokens: 2000,
        custom_items: mockItems
    });

    assert(response.hits.length === 1, `Expected exactly 1 surviving hit, got ${response.hits.length}`);
    assert(response.hits[0].item.id === "code-impl", `Expected Tier 0 code-impl to win, got ${response.hits[0].item.id}`);
    assert(response.hits[0].epistemic_tier === "code", "Winner tier must be 'code'");

    // Check discarded reasons
    const obsoleteDiscard = response.discarded_hits.find(d => d.hit.item.id === "obsolete-item");
    assert(obsoleteDiscard && obsoleteDiscard.reason.includes("obsolete"), "Obsolete item was not discarded with obsolete reason");

    const docDiscard = response.discarded_hits.find(d => d.hit.item.id === "doc-spec");
    assert(docDiscard && docDiscard.reason.includes("superseded_by_higher_tier"), "Doc spec was not superseded by higher tier");
});

// Test 5: Adversarial Canary Detection & Zero Leakage
await test("Adversarial foreign canary triggers SECURITY_LEAK_PREVENTED abort", async () => {
    const builder = new ContextPackBuilder();
    const foreignCanary = "CANARY_FOREIGN_ALPHA_LEAK_XYZ777";

    const rogueItems = [
        {
            id: "rogue-note",
            title: "Infiltrated Note",
            content: `Internal foreign secret: ${foreignCanary}`,
            scope: projectScope,
            tier: "code",
            status: "active",
            source_paths: ["src/rogue.ts"]
        }
    ];

    let caughtError = null;
    try {
        await builder.buildContextPack({
            query: "infiltrated note",
            workspace_root: workspaceRoot,
            registered_canaries: [foreignCanary],
            custom_items: rogueItems
        });
    } catch (err) {
        caughtError = err;
    }

    assert(caughtError !== null, "Expected canary audit to throw an exception!");
    assert(
        caughtError.message.includes("SECURITY_LEAK_PREVENTED"),
        `Expected SECURITY_LEAK_PREVENTED, got: ${caughtError.message}`
    );
});

// Test 6: Full Repository Live Index Query & Latency Benchmark (SLO < 50ms)
await test("Live query against repository AST & BM25 indexes meets sub-50ms latency SLO", async () => {
    const builder = new ContextPackBuilder();
    await builder.initialize(workspaceRoot);

    const testQueries = [
        { query: "writeAtomicJson storage core", required_symbols: ["writeAtomicJson"] },
        { query: "ast extractor symbols typescript", required_symbols: ["extractTsJsAst"] },
        { query: "bm25 lexical engine tokenization", required_symbols: ["Bm25Engine"] },
        { query: "reciprocal rank fusion hybrid", required_symbols: ["HybridFusionEngine"] }
    ];

    for (const q of testQueries) {
        const start = performance.now();
        const res = await builder.buildContextPack({
            query: q.query,
            workspace_root: workspaceRoot,
            max_tokens: 2000,
            required_symbols: q.required_symbols
        });
        const duration = Number((performance.now() - start).toFixed(2));
        benchmarkResults.push({
            query: q.query,
            duration_ms: duration,
            hits_count: res.hits.length,
            tokens: res.token_count_estimated,
            reduction_pct: res.token_reduction_pct
        });

        assert(res.hits.length > 0, `No hits retrieved for query '${q.query}'`);
        assert(res.token_count_estimated <= 2000, `Token limit exceeded for query '${q.query}'`);
        assert(duration < 50.0, `Latency ${duration}ms exceeds sub-50ms SLO!`);
    }

    const avgLat = Number((benchmarkResults.reduce((acc, b) => acc + b.duration_ms, 0) / benchmarkResults.length).toFixed(2));
    const avgReduction = Number((benchmarkResults.reduce((acc, b) => acc + b.reduction_pct, 0) / benchmarkResults.length).toFixed(2));

    console.log(`    [BENCHMARK] Live Index UKS Pipeline:`);
    console.log(`    - Average Query Latency:    ${avgLat} ms (SLO: < 50.0 ms)`);
    console.log(`    - Average Token Reduction:  ${avgReduction}% (Hypothesis H-01: >= 60.0%)`);
    console.log(`    - Queries Executed:         ${benchmarkResults.length}`);
});

console.log("================================================================================");
console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("================================================================================");

// Serialize Canonical Evidence Record
const sortedLats = [...benchmarkResults.map(b => b.duration_ms)].sort((a, b) => a - b);
const medianLat = sortedLats[Math.floor(sortedLats.length / 2)] || 0;
const p95Lat = sortedLats[Math.floor(sortedLats.length * 0.95)] || 0;
const avgReduction = Number((benchmarkResults.reduce((acc, b) => acc + b.reduction_pct, 0) / (benchmarkResults.length || 1)).toFixed(2));

const evidencePayload = {
    task_id: "phase7-context-pack-builder-validation",
    phase: "Phase 7: Context Pack Assembly & ContextBudget Slicing (ADR-D01/D04, Hypothesis H-01)",
    timestamp: new Date().toISOString(),
    status: failedTests === 0 ? "PASSED" : "FAILED",
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    tests: testDetails,
    hypothesis_h01: {
        enunciation: "Surgical snippet injection (file:start_line-end_line) reduces input tokens by >= 60% compared to full file reading",
        acceptance_threshold_pct: 60.0,
        achieved_average_reduction_pct: avgReduction,
        status: avgReduction >= 60.0 ? "VERIFIED" : "FALSIFIED"
    },
    performance_metrics: {
        median_query_latency_ms: medianLat,
        p95_query_latency_ms: p95Lat,
        slo_latency_target_ms: 50.0,
        slo_latency_pass: medianLat < 50.0,
        queries_evaluated: benchmarkResults.length,
        query_telemetry: benchmarkResults
    },
    artifacts: [
        {
            path: "orchestrator/src/knowledge/uks/context-pack-builder.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(builderModule))
        },
        {
            path: "orchestrator/tests/knowledge/uks/context-pack-builder.test.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "orchestrator/tests/knowledge/uks/context-pack-builder.test.ts")))
        },
        {
            path: "scripts/v2.5/test-context-pack-builder.mjs",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "scripts/v2.5/test-context-pack-builder.mjs")))
        }
    ]
};

await writeAtomicJson(evidenceJsonPath, evidencePayload);
console.log(`[+] Evidence persisted to: ${evidenceJsonPath}`);

if (failedTests > 0) {
    process.exit(1);
}
