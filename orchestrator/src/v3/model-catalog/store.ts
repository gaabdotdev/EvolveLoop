import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelCatalogEntry, ModelCatalogSnapshot } from "./types.js";

export class ModelCatalogError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ModelCatalogError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

/** Seed entries — declared metadata only; no fake benchmarks. */
export function defaultModelSeed(): ModelCatalogEntry[] {
  return [
    {
      model_id: "ollama:local-default",
      display_name: "Ollama local default (operator-chosen tag)",
      backend: "ollama",
      locality: "local",
      role_hints: ["general", "coding"],
      notes: [
        "placeholder id — replace with a real Ollama tag after hardware profile",
        "Core does not auto-pull or auto-select models yet",
      ],
      enabled: true,
      requires_explicit_enable: false,
    },
    {
      model_id: "ollama:embedding-nomic",
      display_name: "Nomic Embed Text via Ollama (when installed)",
      backend: "ollama",
      locality: "local",
      role_hints: ["embedding"],
      notes: [
        "Use evolve embeddings probe|embed|retrieve when Ollama has nomic-embed-text",
        "Hybrid retrieve corpus is ephemeral Context Views — not a durable vector DB",
      ],
      enabled: true,
      requires_explicit_enable: false,
    },
    {
      model_id: "openrouter:jev-style-decision",
      display_name: "Jev-style decision model via OpenRouter",
      backend: "openrouter",
      locality: "remote",
      role_hints: ["decision"],
      notes: [
        "remote — project data must not be sent without explicit enable + user keys",
        "not invoked by Core routing yet",
      ],
      enabled: false,
      requires_explicit_enable: true,
    },
  ];
}

const LIMITATIONS = [
  "Catalog is metadata only — not a live availability probe",
  "No invented token usage; measured telemetry is separate and currently sparse",
  "Remote models stay disabled until enableModel()",
  "Decision routing (Jev/OmniRoute) is NOT_IMPLEMENTED",
];

export class ModelCatalogStore {
  private readonly catalogPath: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.catalogPath = join(rootDir, "catalog.json");
  }

  load(): ModelCatalogSnapshot {
    if (!existsSync(this.catalogPath)) {
      return {
        kind: "ModelCatalog",
        version: 0,
        updated_at: nowIso(),
        models: [],
        limitations: [...LIMITATIONS, "catalog file absent — call seed()"],
      };
    }
    const parsed = JSON.parse(readFileSync(this.catalogPath, "utf-8")) as ModelCatalogSnapshot;
    if (parsed.kind !== "ModelCatalog") {
      throw new ModelCatalogError("INVALID", this.catalogPath);
    }
    return parsed;
  }

  seed(force = false): ModelCatalogSnapshot {
    if (existsSync(this.catalogPath) && !force) {
      return this.load();
    }
    const snap: ModelCatalogSnapshot = {
      kind: "ModelCatalog",
      version: 1,
      updated_at: nowIso(),
      models: defaultModelSeed(),
      limitations: [...LIMITATIONS],
    };
    atomicWrite(this.catalogPath, JSON.stringify(snap, null, 2));
    return snap;
  }

  get(modelId: string): ModelCatalogEntry {
    const snap = this.load();
    const entry = snap.models.find((m) => m.model_id === modelId);
    if (!entry) throw new ModelCatalogError("NOT_FOUND", modelId);
    return entry;
  }

  listEnabled(): ModelCatalogEntry[] {
    return this.load().models.filter((m) => m.enabled);
  }

  enableModel(modelId: string, enabled: boolean): ModelCatalogSnapshot {
    const snap = this.load();
    const entry = snap.models.find((m) => m.model_id === modelId);
    if (!entry) throw new ModelCatalogError("NOT_FOUND", modelId);
    if (enabled && entry.requires_explicit_enable && entry.locality === "remote") {
      // Still allow when operator calls enable — that IS the explicit enable.
      entry.notes = [
        ...entry.notes.filter((n) => !n.startsWith("enabled_at=")),
        `enabled_at=${nowIso()} by operator`,
      ];
    }
    entry.enabled = enabled;
    snap.version += 1;
    snap.updated_at = nowIso();
    atomicWrite(this.catalogPath, JSON.stringify(snap, null, 2));
    return snap;
  }

  upsert(entry: ModelCatalogEntry): ModelCatalogSnapshot {
    const snap = this.exists() ? this.load() : this.seed();
    const idx = snap.models.findIndex((m) => m.model_id === entry.model_id);
    if (idx >= 0) snap.models[idx] = entry;
    else snap.models.push(entry);
    snap.version += 1;
    snap.updated_at = nowIso();
    atomicWrite(this.catalogPath, JSON.stringify(snap, null, 2));
    return snap;
  }

  private exists(): boolean {
    return existsSync(this.catalogPath);
  }
}
