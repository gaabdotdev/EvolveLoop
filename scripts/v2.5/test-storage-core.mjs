#!/usr/bin/env -S node --experimental-strip-types
/**
 * Standalone Deterministic Test Runner for Storage Core (Phase 2)
 * Tests atomic writes, directory traversal protection, SHA-256,
 * and .data/ initialization without requiring vitest.
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
const storageCoreModule = path.join(workspaceRoot, "orchestrator/src/knowledge/uks/storage-core.ts");

// Dynamic import of the storage core TypeScript module
const {
    computeSha256,
    assertPathConfined,
    writeAtomicJson,
    readJson,
    initializeDataDirectory
} = await import(storageCoreModule);

const sandboxDir = path.join(workspaceRoot, ".test-harness/phase2-storage-core");
const evidenceTaskDir = path.join(workspaceRoot, ".evidence/v2.5/tasks");
const evidenceJsonPath = path.join(evidenceTaskDir, "phase2-storage-core.json");

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
console.log("UKS STORAGE CORE DETERMINISTIC ACCEPTANCE SUITE (Phase 2 Migration)");
console.log("================================================================================");

// Test 1: SHA-256 Hashing
await test("computeSha256 produces valid cryptographic hashes", async () => {
    const hashEmpty = computeSha256("");
    assert(hashEmpty === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "Empty string hash mismatch");

    const hashHello = computeSha256("hello world");
    assert(hashHello === "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9", "'hello world' hash mismatch");
});

// Test 2: assertPathConfined - Valid
await test("assertPathConfined allows authorized nested paths", async () => {
    const root = path.join(sandboxDir, "project-root");
    const safeFile = path.join(root, "src/index.ts");
    const result = assertPathConfined(safeFile, root);
    assert(result === path.resolve(safeFile), "Safe path should resolve cleanly");
});

// Test 3: assertPathConfined - Directory Traversal Rejection
await test("assertPathConfined blocks directory traversal attacks", async () => {
    const root = path.join(sandboxDir, "project-root");
    const roguePath = path.join(root, "../../etc/shadow");
    let caught = false;
    try {
        assertPathConfined(roguePath, root);
    } catch (e) {
        if (e.message.includes("SECURITY_PATH_TRAVERSAL_VIOLATION")) {
            caught = true;
        }
    }
    assert(caught, "Directory traversal attack must be intercepted");
});

// Test 4: writeAtomicJson and readJson
await test("writeAtomicJson persists data atomically and readJson retrieves it", async () => {
    const targetFile = path.join(sandboxDir, "atomic-test.json");
    const payload = {
        item_id: "uks-doc-042",
        title: "Atomic Verification",
        scores: [0.95, 0.88, 0.99],
        nested: { secure: true, mode: "atomic" }
    };

    await writeAtomicJson(targetFile, payload);
    assert(fs.existsSync(targetFile), "Target file should exist on disk");

    const retrieved = await readJson(targetFile);
    assert(JSON.stringify(retrieved) === JSON.stringify(payload), "Retrieved payload must match written data");

    // Check that no leftover temp files exist
    const files = await fs.promises.readdir(sandboxDir);
    const tempFiles = files.filter(f => f.startsWith(".tmp-"));
    assert(tempFiles.length === 0, "No leftover .tmp-* files should remain after atomic rename");
});

// Test 5: readJson handles non-existent files gracefully
await test("readJson returns null for missing files without throwing", async () => {
    const missing = path.join(sandboxDir, "does-not-exist.json");
    const res = await readJson(missing);
    assert(res === null, "Missing file should return null");
});

// Test 6: initializeDataDirectory
await test("initializeDataDirectory initializes .data/ with integrity-manifest.json", async () => {
    const testDataDir = path.join(sandboxDir, ".data");
    const init1 = await initializeDataDirectory(testDataDir, sandboxDir);
    assert(init1.created === true, "First initialization must create manifest");
    assert(fs.existsSync(init1.manifestPath), "Manifest file must exist");

    const manifest = await readJson(init1.manifestPath);
    assert(manifest.schema_version === "2.5.0", "Manifest schema version must be 2.5.0");
    assert(manifest.status === "INITIALIZED", "Manifest status must be INITIALIZED");
    assert(manifest.storage_engine === "UKS_STORAGE_CORE_ATOMIC", "Manifest storage engine mismatch");

    const init2 = await initializeDataDirectory(testDataDir, sandboxDir);
    assert(init2.created === false, "Second initialization must not overwrite existing manifest");
});

// Also initialize real workspace .data/
const realDataInit = await initializeDataDirectory(path.join(workspaceRoot, ".data"), workspaceRoot);

console.log("================================================================================");
console.log(`TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log("================================================================================");

// Serialize Evidence Record
const evidencePayload = {
    task_id: "phase2-storage-core-validation",
    phase: "Phase 2: Storage Core & .data Foundation",
    timestamp: new Date().toISOString(),
    status: failedTests === 0 ? "PASSED" : "FAILED",
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    tests: testDetails,
    artifacts: [
        {
            path: "orchestrator/src/knowledge/uks/storage-core.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(storageCoreModule))
        },
        {
            path: "orchestrator/tests/knowledge/uks/storage-core.test.ts",
            type: "VERIFIED_IN_CODE",
            sha256: computeSha256(await fs.promises.readFile(path.join(workspaceRoot, "orchestrator/tests/knowledge/uks/storage-core.test.ts")))
        },
        {
            path: ".data/integrity-manifest.json",
            type: "MEASURED",
            sha256: computeSha256(await fs.promises.readFile(realDataInit.manifestPath))
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
