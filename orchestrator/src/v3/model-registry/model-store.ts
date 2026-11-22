/**
 * V5-M03 — Model Registry store (JSON). Separate from Agent Registry.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelRecord, ModelRegistrySnapshot } from "./types.js";

export class ModelRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ModelRegistryError";
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

const LIMITATIONS = [
  "Model Registry ≠ Agent Registry (ADR-002)",
  "Metadata only — not live availability; probe via ModelProvider.healthCheck",
  "No invented token/cost metrics in this store",
  "Remote models stay disabled until enableModel()",
];

export function defaultModelRegistrySeed(): ModelRecord[] {
  return [
    {
      kind: "ModelRecord",
      model_id: "freellmapi:default",
      display_name: "FreeLLMAPI default (operator-chosen)",
      provider_id: "freellmapi",
      enabled: false,
      requires_explicit_enable: true,
      notes: [
        "Remote — requires explicit enable + credentials",
        "Replace id with a real FreeLLMAPI catalog model after discovery",
      ],
    },
    {
      kind: "ModelRecord",
      model_id: "ollama:local-default",
      display_name: "Ollama local default (operator-chosen tag)",
      provider_id: "ollama",
      enabled: true,
      requires_explicit_enable: false,
      notes: [
        "Placeholder — replace with a real Ollama tag after hardware profile",
        "Aligned with model-catalog seed id for continuity",
      ],
    },
    {
      kind: "ModelRecord",
      model_id: "custom:stub",
      display_name: "Custom stub model (not invokable)",
      provider_id: "custom",
      enabled: false,
      requires_explicit_enable: true,
      notes: ["Stub provider — invoke blocked"],
    },
  ];
}

export class ModelRegistryStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "models.json");
  }

  load(): ModelRegistrySnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "ModelRegistry",
        version: 0,
        updated_at: nowIso(),
        models: [],
        limitations: [...LIMITATIONS, "models file absent — call seed()"],
      };
    }
    const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as ModelRegistrySnapshot;
    if (parsed.kind !== "ModelRegistry") {
      throw new ModelRegistryError("INVALID", this.path);
    }
    return parsed;
  }

  seed(force = false): ModelRegistrySnapshot {
    if (existsSync(this.path) && !force) {
      return this.load();
    }
    const snap: ModelRegistrySnapshot = {
      kind: "ModelRegistry",
      version: 1,
      updated_at: nowIso(),
      models: defaultModelRegistrySeed(),
      limitations: [...LIMITATIONS],
    };
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  get(modelId: string): ModelRecord {
    const snap = this.load();
    const entry = snap.models.find((m) => m.model_id === modelId);
    if (!entry) throw new ModelRegistryError("NOT_FOUND", modelId);
    return entry;
  }

  listEnabled(): ModelRecord[] {
    return this.load().models.filter((m) => m.enabled);
  }

  enableModel(modelId: string, enabled: boolean): ModelRegistrySnapshot {
    const snap = this.load();
    const entry = snap.models.find((m) => m.model_id === modelId);
    if (!entry) throw new ModelRegistryError("NOT_FOUND", modelId);
    if (enabled && entry.requires_explicit_enable) {
      entry.notes = [
        ...entry.notes.filter((n) => !n.startsWith("enabled_at=")),
        `enabled_at=${nowIso()} by operator`,
      ];
    }
    entry.enabled = enabled;
    snap.version += 1;
    snap.updated_at = nowIso();
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  upsert(entry: ModelRecord): ModelRegistrySnapshot {
    const snap = existsSync(this.path) ? this.load() : this.seed();
    const idx = snap.models.findIndex((m) => m.model_id === entry.model_id);
    if (idx >= 0) snap.models[idx] = entry;
    else snap.models.push(entry);
    snap.version += 1;
    snap.updated_at = nowIso();
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }
}
