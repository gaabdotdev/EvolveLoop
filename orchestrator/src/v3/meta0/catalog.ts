/**
 * Load / list Meta0 DemoManifest fixtures from orchestrator/demos/v3.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { validateDemoManifest } from "../contracts/validators.js";
import type { DemoManifest } from "../contracts/types.js";
import { DemoManifestInvalidError, DemoNotFoundError } from "./errors.js";
import type { DemoCatalogEntry, LoadDemoOptions } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Canonical catalog root relative to this module (src/v3/meta0 → orchestrator/demos/v3). */
export function defaultDemosDir(): string {
  return join(__dirname, "../../../demos/v3");
}

function resolveDemosDir(options?: LoadDemoOptions): string {
  return options?.demosDir ?? defaultDemosDir();
}

function padDemoId(demoId: string): string {
  const trimmed = demoId.trim();
  const m = trimmed.toUpperCase().match(/^DEMO-(\d+)$/);
  if (m) return `DEMO-${String(Number(m[1])).padStart(3, "0")}`;
  return trimmed;
}

/** Accept DEMO-001, demo-001, DEMO-1 → file DEMO-001.yaml when present. */
function candidateFilenames(demoId: string): string[] {
  const raw = demoId.trim();
  const upper = raw.toUpperCase();
  const padded = padDemoId(raw);
  const names = new Set<string>();
  names.add(`${raw}.yaml`);
  names.add(`${upper}.yaml`);
  names.add(`${padded}.yaml`);
  return [...names];
}

function parseAndValidate(path: string, expectedId?: string): DemoManifest {
  const raw = parseYaml(readFileSync(path, "utf-8")) as unknown;
  const result = validateDemoManifest(raw);
  if (!result.valid) {
    const id =
      expectedId ??
      (typeof raw === "object" &&
      raw !== null &&
      "metadata" in raw &&
      typeof (raw as { metadata?: { demo_id?: string } }).metadata?.demo_id === "string"
        ? (raw as { metadata: { demo_id: string } }).metadata.demo_id
        : path);
    throw new DemoManifestInvalidError(id, result.errors);
  }
  const manifest = raw as DemoManifest;
  if (expectedId) {
    const want = padDemoId(expectedId).toUpperCase();
    const got = padDemoId(manifest.metadata.demo_id).toUpperCase();
    if (want !== got) {
      throw new DemoManifestInvalidError(expectedId, [
        `metadata.demo_id "${manifest.metadata.demo_id}" does not match requested "${expectedId}"`,
      ]);
    }
  }
  return manifest;
}

/**
 * Load a single demo by id (e.g. DEMO-003) from the catalog directory.
 * Validates with validateDemoManifest — invalid fixtures are rejected.
 */
export function loadDemo(demoId: string, options?: LoadDemoOptions): DemoManifest {
  const demosDir = resolveDemosDir(options);
  if (!existsSync(demosDir)) {
    throw new DemoNotFoundError(demoId, demosDir);
  }
  for (const name of candidateFilenames(demoId)) {
    const path = join(demosDir, name);
    if (existsSync(path)) {
      return parseAndValidate(path, padDemoId(demoId));
    }
  }
  throw new DemoNotFoundError(demoId, demosDir);
}

/**
 * List all DemoManifest YAML files under the catalog directory.
 * Invalid files are skipped from the list only when `skipInvalid` is true;
 * default: throw on first invalid (fail-closed catalog integrity).
 */
export function listDemos(
  options?: LoadDemoOptions & { skipInvalid?: boolean },
): DemoCatalogEntry[] {
  const demosDir = resolveDemosDir(options);
  if (!existsSync(demosDir)) {
    return [];
  }
  const files = readdirSync(demosDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const entries: DemoCatalogEntry[] = [];
  for (const file of files) {
    const path = join(demosDir, file);
    try {
      const manifest = parseAndValidate(path);
      entries.push({ demo_id: manifest.metadata.demo_id, path, manifest });
    } catch (err) {
      if (options?.skipInvalid) continue;
      throw err;
    }
  }
  return entries;
}
