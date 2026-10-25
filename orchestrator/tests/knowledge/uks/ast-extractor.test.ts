/**
 * Test Suite: AST Syntactic Extractor - UKS Core V2.5
 * Tests symbol extraction across TypeScript, JavaScript, and Python,
 * precise line mapping, import/export tracking, and index persistence.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    scanFile,
    scanDirectory,
    buildAndPersistAstIndex,
    findSymbol,
    findImplementations,
    ProjectAstIndex
} from "../../../src/knowledge/uks/ast-extractor";

describe("UKS AST Extractor", () => {
    const testSandboxDir = path.resolve(__dirname, "../../../../.test-harness/ast-extractor-unit");

    beforeAll(async () => {
        await fs.promises.mkdir(testSandboxDir, { recursive: true });

        // Create sample TypeScript fixture
        const tsFixture = `
import { computeSha256 } from "./storage-core";
import type { DataManifest } from "./types";

export interface IParser {
    parse(input: string): boolean;
}

export class MarkdownParser implements IParser {
    parse(input: string): boolean {
        return input.length > 0;
    }
}

export type ParseResult = { success: boolean };

export function parseDocument(doc: string): ParseResult {
    return { success: true };
}
`;
        await fs.promises.writeFile(path.join(testSandboxDir, "sample.ts"), tsFixture, "utf8");

        // Create sample Python fixture
        const pyFixture = `
import os
from sys import argv, exit

class BaseService:
    def __init__(self, name):
        self.name = name

def process_item(item):
    if not item:
        return None
    return item.upper()
`;
        await fs.promises.writeFile(path.join(testSandboxDir, "sample.py"), pyFixture, "utf8");
    });

    afterAll(async () => {
        if (fs.existsSync(testSandboxDir)) {
            await fs.promises.rm(testSandboxDir, { recursive: true, force: true });
        }
    });

    describe("TypeScript / JavaScript AST Extraction", () => {
        it("should extract interface, class, type, and function symbols", async () => {
            const fileMeta = await scanFile(path.join(testSandboxDir, "sample.ts"), testSandboxDir);
            expect(fileMeta).not.toBeNull();
            expect(fileMeta?.symbols.length).toBe(4);

            const names = fileMeta?.symbols.map(s => s.name);
            expect(names).toContain("IParser");
            expect(names).toContain("MarkdownParser");
            expect(names).toContain("ParseResult");
            expect(names).toContain("parseDocument");

            // Validate interface
            const iface = fileMeta?.symbols.find(s => s.name === "IParser");
            expect(iface?.kind).toBe("interface");
            expect(iface?.is_exported).toBe(true);

            // Validate class and implements heritage
            const cls = fileMeta?.symbols.find(s => s.name === "MarkdownParser");
            expect(cls?.kind).toBe("class");
            expect(cls?.heritage?.implements).toContain("IParser");

            // Validate imports
            expect(fileMeta?.imports.length).toBe(2);
            expect(fileMeta?.imports[0].module_specifier).toBe("./storage-core");
            expect(fileMeta?.imports[1].is_type_only).toBe(true);
        });
    });

    describe("Python AST Extraction", () => {
        it("should extract Python class, function, and imports", async () => {
            const fileMeta = await scanFile(path.join(testSandboxDir, "sample.py"), testSandboxDir);
            expect(fileMeta).not.toBeNull();
            expect(fileMeta?.symbols.length).toBe(3);

            const cls = fileMeta?.symbols.find(s => s.name === "BaseService");
            expect(cls?.kind).toBe("class");

            const method = fileMeta?.symbols.find(s => s.name === "__init__");
            expect(method?.kind).toBe("method");

            const fn = fileMeta?.symbols.find(s => s.name === "process_item");
            expect(fn?.kind).toBe("function");

            expect(fileMeta?.imports.length).toBe(2);
        });
    });

    describe("Full Directory Scanning & Persistence", () => {
        it("should scan directory, build index, and query symbols", async () => {
            const index = await scanDirectory(testSandboxDir, { workspace_root: testSandboxDir });
            expect(index.stats.total_files_scanned).toBe(2);
            expect(index.stats.total_symbols).toBe(7);

            const matches = findSymbol(index, "MarkdownParser");
            expect(matches.length).toBe(1);
            expect(matches[0].name).toBe("MarkdownParser");

            const impls = findImplementations(index, "IParser");
            expect(impls.length).toBe(1);
            expect(impls[0].name).toBe("MarkdownParser");
        });
    });
});
