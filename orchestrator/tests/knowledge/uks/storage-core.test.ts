/**
 * Test Suite: Storage Core - UKS Core V2.5
 * Tests atomic persistence, directory traversal confinement,
 * cryptographic hashing, and .data/ initialization.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
    computeSha256,
    assertPathConfined,
    writeAtomicJson,
    readJson,
    initializeDataDirectory,
    DataManifest
} from "../../../src/knowledge/uks/storage-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("UKS Storage Core", () => {
    const testSandboxDir = path.resolve(__dirname, "../../../../.test-harness/storage-core-unit");

    beforeAll(async () => {
        await fs.promises.mkdir(testSandboxDir, { recursive: true });
    });

    afterAll(async () => {
        if (fs.existsSync(testSandboxDir)) {
            await fs.promises.rm(testSandboxDir, { recursive: true, force: true });
        }
    });

    describe("computeSha256", () => {
        it("should compute correct SHA-256 hash for known inputs", () => {
            const hashEmpty = computeSha256("");
            expect(hashEmpty).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

            const hashHello = computeSha256("hello world");
            expect(hashHello).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
        });
    });

    describe("assertPathConfined", () => {
        it("should accept valid nested paths within authorized root", () => {
            const root = path.join(testSandboxDir, "project");
            const target = path.join(testSandboxDir, "project/src/file.ts");
            const result = assertPathConfined(target, root);
            expect(result).toBe(path.resolve(target));
        });

        it("should throw error when directory traversal is attempted", () => {
            const root = path.join(testSandboxDir, "project");
            const rogue = path.join(testSandboxDir, "project/../../etc/passwd");
            expect(() => assertPathConfined(rogue, root)).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
        });

        it("should throw error when target is outside root directory entirely", () => {
            const root = path.join(testSandboxDir, "project");
            const foreign = "/var/log/syslog";
            expect(() => assertPathConfined(foreign, root)).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
        });
    });

    describe("writeAtomicJson and readJson", () => {
        it("should write and read JSON object atomically with full fidelity", async () => {
            const targetFile = path.join(testSandboxDir, "sample-doc.json");
            const payload = {
                id: "test-001",
                title: "Atomic Unit Test",
                values: [1, 2, 3, 4],
                nested: { enabled: true, score: 0.99 }
            };

            await writeAtomicJson(targetFile, payload);
            expect(fs.existsSync(targetFile)).toBe(true);

            // Read back
            const retrieved = await readJson<typeof payload>(targetFile);
            expect(retrieved).toEqual(payload);

            // Ensure no leftover temp files exist
            const files = await fs.promises.readdir(testSandboxDir);
            const tempFiles = files.filter(f => f.startsWith(".tmp-"));
            expect(tempFiles.length).toBe(0);
        });

        it("should return null for non-existent files", async () => {
            const nonExistent = path.join(testSandboxDir, "missing-file.json");
            const result = await readJson(nonExistent);
            expect(result).toBeNull();
        });
    });

    describe("initializeDataDirectory", () => {
        it("should initialize .data directory with integrity-manifest.json", async () => {
            const customDataDir = path.join(testSandboxDir, ".data");
            const initResult = await initializeDataDirectory(customDataDir, testSandboxDir);

            expect(initResult.created).toBe(true);
            expect(fs.existsSync(initResult.manifestPath)).toBe(true);

            const manifest = await readJson<DataManifest>(initResult.manifestPath);
            expect(manifest).not.toBeNull();
            expect(manifest?.schema_version).toBe("2.5.0");
            expect(manifest?.status).toBe("INITIALIZED");
            expect(manifest?.storage_engine).toBe("UKS_STORAGE_CORE_ATOMIC");

            // Calling again should not overwrite
            const secondCall = await initializeDataDirectory(customDataDir, testSandboxDir);
            expect(secondCall.created).toBe(false);
        });
    });
});
