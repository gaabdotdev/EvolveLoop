/**
 * Test Suite: BM25 Lexical Engine - UKS Core V2.5
 * Tests tokenization, chunking, Okapi BM25 scoring, and sub-15ms search latency.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
    tokenize,
    chunkMarkdownDocument,
    Bm25Engine
} from "../../../src/knowledge/uks/bm25-engine";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("UKS BM25 Engine", () => {
    const testSandboxDir = path.resolve(__dirname, "../../../../.test-harness/bm25-unit");

    beforeAll(async () => {
        await fs.promises.mkdir(testSandboxDir, { recursive: true });
    });

    afterAll(async () => {
        if (fs.existsSync(testSandboxDir)) {
            await fs.promises.rm(testSandboxDir, { recursive: true, force: true });
        }
    });

    describe("tokenize", () => {
        it("should lowercase, strip punctuation, filter stopwords, and split compound tokens", () => {
            const raw = "The Storage-Core module implements atomic_writes with SHA-256!";
            const tokens = tokenize(raw);

            // "the" and "with" are stopwords
            expect(tokens).not.toContain("the");
            expect(tokens).not.toContain("with");

            // Compound token splits
            expect(tokens).toContain("storage-core");
            expect(tokens).toContain("storage");
            expect(tokens).toContain("core");
            expect(tokens).toContain("atomic_writes");
            expect(tokens).toContain("atomic");
            expect(tokens).toContain("writes");
            expect(tokens).toContain("sha-256");
        });
    });

    describe("chunkMarkdownDocument", () => {
        it("should chunk markdown by headings with start and end lines", () => {
            const md = `# Document Title

This is introductory paragraph.

## Section Alpha
Content inside section alpha.
Line 2 of alpha.

### Subsection Beta
Content inside beta.
`;
            const chunks = chunkMarkdownDocument("docs/sample.md", md, process.cwd());
            expect(chunks.length).toBeGreaterThanOrEqual(2);

            const alphaChunk = chunks.find(c => c.title === "Section Alpha");
            expect(alphaChunk).toBeDefined();
            expect(alphaChunk?.start_line).toBe(5);
            expect(alphaChunk?.end_line).toBe(8);
        });
    });

    describe("Bm25Engine Scoring and Performance", () => {
        it("should rank documents by relevance and achieve sub-15ms search latency", () => {
            const engine = new Bm25Engine(testSandboxDir);

            engine.addMarkdownDocument("doc1.md", "# Security Policy\nStrict isolation rules and canary token validation.");
            engine.addMarkdownDocument("doc2.md", "# Storage Architecture\nAtomic write mechanisms using temp files and POSIX rename.");
            engine.addMarkdownDocument("doc3.md", "# Network Proxy\nReverse proxy configurations and HTTP headers.");

            engine.buildIndex();

            const start = performance.now();
            const hits = engine.search("atomic write storage", 5);
            const durationMs = performance.now() - start;

            expect(hits.length).toBeGreaterThan(0);
            expect(hits[0].file_path).toBe("doc2.md");
            expect(hits[0].score).toBeGreaterThan(0);
            expect(durationMs).toBeLessThan(15);
        });
    });
});
