/**
 * V5-M03 — Provider Registry (extensível).
 * Seeds: freellmapi (live first-class), ollama (live), custom (stub honest).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderRecord, ProviderRegistrySnapshot } from "./types.js";

export class ProviderRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRegistryError";
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
  "Provider Registry is metadata + honesty — not a live SLA",
  "custom provider is a typed stub until an operator registers a live implementation",
  "Credential env var names only — secret values never stored here",
  "Agent Registry is separate (ADR-002)",
];

/** Honest seed — freellmapi first; ollama live; custom stub. */
export function defaultProviderSeed(): ProviderRecord[] {
  return [
    {
      kind: "ProviderRecord",
      provider_id: "freellmapi",
      display_name: "FreeLLMAPI",
      locality: "remote",
      implementation: "live",
      capabilities: [
        {
          key: "chat_completions",
          honesty: "supported",
          notes: "OpenAI-compatible /chat/completions via FreeLLMAPIModelProvider",
        },
        {
          key: "catalog_discovery",
          honesty: "supported",
          notes: "GET /models; states ready|needsKey|exhausted|unreachable",
        },
        {
          key: "cost_reporting",
          honesty: "partial",
          notes: "Tokens may be reported; cost_usd often null → provenance unavailable",
        },
        {
          key: "sla",
          honesty: "unsupported",
          notes: "Best-effort remote gateway; no SLA assumed",
        },
      ],
      limitations: [
        "Remote — project data requires operator enable + keys",
        "Unreachable host is tolerated; does not fail Work",
      ],
      credential_env_vars: [
        "EVOLVELOOP_FREELLMAPI_API_KEY",
        "FREELLMAPI_API_KEY",
      ],
      enabled: true,
    },
    {
      kind: "ProviderRecord",
      provider_id: "ollama",
      display_name: "Ollama (local)",
      locality: "local",
      implementation: "live",
      capabilities: [
        {
          key: "chat_completions",
          honesty: "supported",
          notes: "OllamaModelProvider /api/generate",
        },
        {
          key: "catalog_discovery",
          honesty: "partial",
          notes: "Health via /api/tags; preferred model may be missing",
        },
        {
          key: "cost_reporting",
          honesty: "unsupported",
          notes: "Local inference — no USD cost stream; tokens may be estimated/unavailable",
        },
        {
          key: "sla",
          honesty: "unsupported",
          notes: "Depends on local daemon availability",
        },
      ],
      limitations: [
        "Local only — no FreeLLMAPI gateway",
        "Availability probed via GET /api/tags",
      ],
      credential_env_vars: [],
      enabled: true,
    },
    {
      kind: "ProviderRecord",
      provider_id: "custom",
      display_name: "Custom provider (stub)",
      locality: "unknown",
      implementation: "stub",
      capabilities: [
        {
          key: "chat_completions",
          honesty: "unsupported",
          notes: "Stub — invoke blocked until a live custom provider is registered",
        },
        {
          key: "catalog_discovery",
          honesty: "unsupported",
          notes: "No catalog until operator implements custom provider",
        },
        {
          key: "cost_reporting",
          honesty: "unknown",
          notes: "No usage stream for stub",
        },
      ],
      limitations: [
        "Typed stub only — not invoked for production traffic",
        "Register a live implementation before enabling routing",
      ],
      credential_env_vars: [],
      enabled: false,
    },
  ];
}

export class ProviderRegistryStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "providers.json");
  }

  load(): ProviderRegistrySnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "ProviderRegistry",
        version: 0,
        updated_at: nowIso(),
        providers: [],
        limitations: [...LIMITATIONS, "providers file absent — call seed()"],
      };
    }
    const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as ProviderRegistrySnapshot;
    if (parsed.kind !== "ProviderRegistry") {
      throw new ProviderRegistryError("INVALID", this.path);
    }
    return parsed;
  }

  seed(force = false): ProviderRegistrySnapshot {
    if (existsSync(this.path) && !force) {
      return this.load();
    }
    const snap: ProviderRegistrySnapshot = {
      kind: "ProviderRegistry",
      version: 1,
      updated_at: nowIso(),
      providers: defaultProviderSeed(),
      limitations: [...LIMITATIONS],
    };
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  get(providerId: string): ProviderRecord {
    const snap = this.load();
    const entry = snap.providers.find((p) => p.provider_id === providerId);
    if (!entry) throw new ProviderRegistryError("NOT_FOUND", providerId);
    return entry;
  }

  listEnabled(): ProviderRecord[] {
    return this.load().providers.filter((p) => p.enabled);
  }

  upsert(record: ProviderRecord): ProviderRegistrySnapshot {
    const snap = existsSync(this.path) ? this.load() : this.seed();
    const idx = snap.providers.findIndex((p) => p.provider_id === record.provider_id);
    if (idx >= 0) snap.providers[idx] = record;
    else snap.providers.push(record);
    snap.version += 1;
    snap.updated_at = nowIso();
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  /** Export credential *references* only — never secret values. */
  exportCredentialRefs(providerId: string): {
    provider_id: string;
    env_vars: string[];
    present: Record<string, boolean>;
  } {
    const rec = this.get(providerId);
    const present: Record<string, boolean> = {};
    for (const name of rec.credential_env_vars) {
      const v = process.env[name];
      present[name] = typeof v === "string" && v.length > 0;
    }
    return {
      provider_id: providerId,
      env_vars: [...rec.credential_env_vars],
      present,
    };
  }
}
