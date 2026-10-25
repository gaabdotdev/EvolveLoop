/**
 * @deprecated Superseded by UKS Core V2.5 (ADR-D01/D02/D03).
 * Flat filesystem storage with YAML frontmatter has been replaced by the Unified Knowledge System:
 * - Atomic persistence via `storage-core.ts` (.data/ layout)
 * - In-process lexical indexing via `bm25-engine.ts`
 * - Native AST syntax analysis via `ast-extractor.ts`
 * - 4-Tier Authority and scope isolation via `scope-enforcer.ts`
 * Retained strictly for backwards compatibility with legacy providers.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { KnowledgeStore } from "./knowledge-store.js";
import type { KnowledgeEntry, ProposedKnowledgeEntry } from "../types/index.js";
import { assertPathConfined } from "./uks/storage-core.js";

export function assertKnowledgeIdConfined(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("SECURITY_PATH_TRAVERSAL_VIOLATION: Invalid knowledge id: empty or non-string");
  }
  if (id.includes("..") || id.includes("/") || id.includes("\\") || /[\0\r\n\t]/.test(id)) {
    throw new Error(`SECURITY_PATH_TRAVERSAL_VIOLATION: Illegal traversal characters in knowledge id: '${id}'`);
  }
  return id;
}

interface KnowledgeIndex {
  entries: Array<{
    id: string;
    kind: KnowledgeEntry["kind"];
    path: string;
    capabilities?: string[];
    tags?: string[];
    confidence?: number;
  }>;
}

function kindDir(kind: KnowledgeEntry["kind"]): string {
  const map: Record<KnowledgeEntry["kind"], string> = {
    pattern: "patterns",
    pitfall: "pitfalls",
    bug: "bugs",
    decision: "decisions",
    lesson: "learned-lessons",
    contract: "contracts",
  };
  return map[kind];
}

function parseMarkdownEntry(filePath: string, id: string): KnowledgeEntry | null {
  const raw = readFileSync(filePath, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const meta = parseYaml(match[1]) as Record<string, unknown>;
  return {
    id: (meta.id as string) ?? id,
    kind: meta.kind as KnowledgeEntry["kind"],
    content: match[2].trim(),
    tags: meta.tags as string[] | undefined,
    capabilities: (meta.capability as string[]) ?? (meta.capabilities as string[] | undefined),
    confidence: meta.confidence as number | undefined,
  };
}

function loadFromDisk(rootDir: string): KnowledgeEntry[] {
  if (!existsSync(rootDir)) return [];

  const indexPath = join(rootDir, "index.yaml");
  if (existsSync(indexPath)) {
    const index = parseYaml(readFileSync(indexPath, "utf-8")) as KnowledgeIndex;
    return index.entries
      .map((e) => {
        assertKnowledgeIdConfined(e.id);
        const resolvedPath = assertPathConfined(join(rootDir, e.path), rootDir);
        return parseMarkdownEntry(resolvedPath, e.id);
      })
      .filter((e): e is KnowledgeEntry => e !== null);
  }

  const entries: KnowledgeEntry[] = [];
  for (const kind of ["patterns", "pitfalls", "bugs", "decisions", "learned-lessons", "contracts"] as const) {
    const dir = join(rootDir, kind);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const id = file.replace(/\.md$/, "");
      assertKnowledgeIdConfined(id);
      const abs = assertPathConfined(join(dir, file), rootDir);
      const entry = parseMarkdownEntry(abs, id);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function writeEntry(rootDir: string, entry: KnowledgeEntry): string {
  assertKnowledgeIdConfined(entry.id);
  const relPath = join(kindDir(entry.kind), `${entry.id}.md`);
  const absPath = assertPathConfined(join(rootDir, relPath), rootDir);
  mkdirSync(join(rootDir, kindDir(entry.kind)), { recursive: true });

  const frontmatter = stringifyYaml({
    id: entry.id,
    kind: entry.kind,
    capability: entry.capabilities,
    tags: entry.tags,
    confidence: entry.confidence ?? 0.5,
    updated_at: new Date().toISOString().slice(0, 10),
  }).trim();

  writeFileSync(absPath, `---\n${frontmatter}\n---\n\n${entry.content}\n`, "utf-8");
  return relPath;
}

function writeIndex(rootDir: string, entries: KnowledgeEntry[]): void {
  mkdirSync(rootDir, { recursive: true });
  const index: KnowledgeIndex = {
    entries: entries.map((e) => {
      assertKnowledgeIdConfined(e.id);
      return {
        id: e.id,
        kind: e.kind,
        path: join(kindDir(e.kind), `${e.id}.md`),
        capabilities: e.capabilities,
        tags: e.tags,
        confidence: e.confidence,
      };
    }),
  };
  const indexPath = assertPathConfined(join(rootDir, "index.yaml"), rootDir);
  writeFileSync(indexPath, stringifyYaml(index), "utf-8");
}

export class FilesystemKnowledgeStore extends KnowledgeStore {
  constructor(private rootDir: string) {
    super(loadFromDisk(rootDir));
  }

  override propose(entry: ProposedKnowledgeEntry): KnowledgeEntry {
    const full = super.propose(entry);
    assertKnowledgeIdConfined(full.id);
    writeEntry(this.rootDir, full);
    writeIndex(this.rootDir, this.getAll());
    return full;
  }

  override verify(entryId: string): void {
    assertKnowledgeIdConfined(entryId);
    super.verify(entryId);
    const entry = this.getAll().find((e) => e.id === entryId);
    if (entry) {
      writeEntry(this.rootDir, entry);
      writeIndex(this.rootDir, this.getAll());
    }
  }
}
