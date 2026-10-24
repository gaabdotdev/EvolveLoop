#!/usr/bin/env -S node --experimental-strip-types
/**
 * Standalone Deterministic Test Runner for UKS AST Syntactic Extractor (Phase 3)
 * Tests multi-language AST extraction, symbol mapping, and builds .data/project-ast.json.
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
const astExtractorModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/ast-extractor.ts");
const storageCoreModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/storage-core.ts");

const {
    scanFile,
    scanDirectory,
    buildAndPersistAstIndex,
    findSymbol,
    findImplementations
} = await import(astExtractorModule);

const { computeSha256, writeAtomicJson } = await import(storageCoreModule);

const sandboxDir = path.join(workspaceRoot, ".test-harness/phase3-ast-extractor");
const evidenceTaskDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
const evidenceJsonPath = path.join(evidenceTaskDir, "phase3-ast-extractor.json");
const outputAstJson = path.join(workspaceRoot, ".data/project-ast.json");

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
console.log("UKS AST EXTRACTOR DETERMINISTIC ACCEPTANCE SUITE (Phase 3 Migration)");
console.log("================================================================================");

// Fixture setup
const tsSamplePath = path.join(sandboxDir, "sample.ts");
const pySamplePath = path.join(sandboxDir, "sample.py");

await fs.promises.writeFile(tsSamplePath, `
import { writeAtomicJson } from "./storage-core";
import type { DataManifest } from "./types";

export interface ITokenizer {
    tokenize(input: string): string[];
}

export class Bm25Tokenizer implements ITokenizer {
    tokenize(input: string): string[] {
        return input.toLowerCase().split(/\\s+/);
    }
}

export type TokenResult = { tokens: string[]; count: number };

export async function processDocument(content: string): Promise<TokenResult> {
    const tokens = content.split(" ");
    return { tokens, count: tokens.length };
}

export const extractKeywords = (text: string) => {
    return text.split(",");
};
`, "utf8");

await fs.promises.writeFile(pySamplePath, `
import sys
from os.path import join, dirname

class BaseClassifier:
    def __init__(self, threshold=0.5):
        self.threshold = threshold

    def predict(self, score):
        return score >= self.threshold

def calculate_precision(tp, fp):
    if tp + fp == 0:
        return 0.0
    return tp / (tp + fp)
`, "utf8");

// Test 1: TypeScript AST Symbol Extraction
await test("extracts TypeScript interfaces, classes, types, and functions with precise lines", async () => {
    const meta = await scanFile(tsSamplePath, sandboxDir);
    assert(meta !== null, "Metadata should not be null");
    assert(meta.symbols.length === 5, `Expected 5 symbols, found ${meta.symbols.length}`);

    const iface = meta.symbols.find(s => s.name === "ITokenizer");
    assert(iface && iface.kind === "interface", "ITokenizer interface missing");
    assert(iface.is_exported === true, "ITokenizer should be exported");
    assert(iface.start_line > 0 && iface.end_line >= iface.start_line, "Line range invalid for ITokenizer");

    const cls = meta.symbols.find(s => s.name === "Bm25Tokenizer");
    assert(cls && cls.kind === "class", "Bm25Tokenizer class missing");
    assert(cls.heritage && cls.heritage.implements.includes("ITokenizer"), "Heritage interface implementation missing");

    const fn = meta.symbols.find(s => s.name === "processDocument");
    assert(fn && fn.kind === "function", "processDocument function missing");

    const arrowFn = meta.symbols.find(s => s.name === "extractKeywords");
    assert(arrowFn && arrowFn.kind === "function", "extractKeywords arrow function missing");

    assert(meta.imports.length === 2, "Expected 2 imports");
    assert(meta.imports[1].is_type_only === true, "Second import should be type-only");
});

// Test 2: Python AST Symbol Extraction
await test("extracts Python classes, methods, and functions with indentation block boundaries", async () => {
    const meta = await scanFile(pySamplePath, sandboxDir);
    assert(meta !== null, "Python metadata should not be null");
    assert(meta.symbols.length === 4, `Expected 4 symbols (1 class, 2 methods, 1 function), found ${meta.symbols.length}`);

    const cls = meta.symbols.find(s => s.name === "BaseClassifier");
    assert(cls && cls.kind === "class", "BaseClassifier class missing");
    assert(cls.end_line > cls.start_line, "Class block should span multiple lines");

    const method = meta.symbols.find(s => s.name === "predict");
    assert(method && method.kind === "method", "predict method missing or not typed as method");

    const fn = meta.symbols.find(s => s.name === "calculate_precision");
    assert(fn && fn.kind === "function", "calculate_precision function missing");

    assert(meta.imports.length === 2, "Expected 2 Python imports");
    assert(meta.imports[1].imported_symbols.includes("join"), "join import missing");
});

// Test 3: Directory Scanning & Symbol Queries
await test("findSymbol and findImplementations query extracted symbols correctly", async () => {
    const index = await scanDirectory(sandboxDir, { workspace_root: sandboxDir });
    assert(index.stats.total_symbols === 9, `Expected 9 total symbols in sandbox, got ${index.stats.total_symbols}`);

    const foundClass = findSymbol(index, "Bm25Tokenizer");
    assert(foundClass.length === 1, "Should find Bm25Tokenizer");

    const impls = findImplementations(index, "ITokenizer");
    assert(impls.length === 1 && impls[0].name === "Bm25Tokenizer", "Should find implementation of ITokenizer");
});

// Test 4: Real Production Workspace Scan & Atomic Persistence
let prodIndex;
await test("scans orchestrator/src directory, persists .data/project-ast.json, and satisfies SLOs", async () => {
    const scanStart = Date.now();
    prodIndex = await buildAndPersistAstIndex(workspaceRoot, outputAstJson);
    const scanDuration = Date.now() - scanStart;

    assert(fs.existsSync(outputAstJson), "Persisted project-ast.json must exist");

    const stats = await fs.promises.stat(outputAstJson);
    const sizeKb = stats.size / 1024;

    console.log(`[INFO] Workspace AST Index:`);
    console.log(`       - Files Scanned: ${prodIndex.stats.total_files_scanned}`);
    console.log(`       - Symbols Indexed: ${prodIndex.stats.total_symbols}`);
    console.log(`       - Total Imports: ${prodIndex.stats.total_imports}`);
    console.log(`       - Scan Duration: ${scanDuration} ms (SLO < 2000 ms)`);
    console.log(`       - Index File Size: ${sizeKb.toFixed(2)} KB (SLO < 500 KB)`);

    assert(scanDuration < 2000, `Scan duration ${scanDuration}ms exceeded 2000ms SLO`);
    assert(sizeKb < 500, `Index file size ${sizeKb.toFixed(2)}KB exceeded 500KB SLO`);
    assert(prodIndex.stats.total_symbols > 50, "Should index at least 50 symbols across orchestrator");

    // Spot-check key symbols in the orchestrator
    assert(prodIndex.symbols["writeAtomicJson"] !== undefined, "writeAtomicJson should be indexed");
    assert(prodIndex.symbols["computeSha256"] !== undefined, "computeSha256 should be indexed");
    assert(prodIndex.symbols["assertPathConfined"] !== undefined, "assertPathConfined should be indexed");
});

console.log("================================================================================");
console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("================================================================================");

// Serialize Evidence Record
const evidencePayload = {
    task_id: "phase3-ast-extractor-validation",
    phase: "Phase 3: Native AST Extractor Absorption (ADR-D02)",
    timestamp: new Date().toISOString(),
    status: failedTests === 0 ? "PASSED" : "FAILED",
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    tests: testDetails,
    measurements: {
        total_files_scanned: prodIndex?.stats.total_files_scanned || 0,
        total_symbols: prodIndex?.stats.total_symbols || 0,
        total_imports: prodIndex?.stats.total_imports || 0,
        scan_duration_ms: prodIndex?.stats.duration_ms || 0,
        index_size_bytes: prodIndex?.stats.index_size_bytes || 0,
        index_size_kb: prodIndex ? +(prodIndex.stats.index_size_bytes / 1024).toFixed(2) : 0,
        slo_duration_target_ms: 2000,
        slo_size_target_kb: 500,
        slo_duration_pass: (prodIndex?.stats.duration_ms || 0) < 2000,
        slo_size_pass: ((prodIndex?.stats.index_size_bytes || 0) / 1024) < 500
    },
    artifacts: [
        {
            path: "orchestrator/src/knowledge/uks/ast-extractor.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(astExtractorModule))
        },
        {
            path: "orchestrator/tests/knowledge/uks/ast-extractor.test.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "orchestrator/tests/knowledge/uks/ast-extractor.test.ts")))
        },
        {
            path: ".data/project-ast.json",
            type: "MEASURED",
            sha256: computeSha256(await fs.promises.readFile(outputAstJson))
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
