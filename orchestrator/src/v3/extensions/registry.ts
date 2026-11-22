/**
 * V5-M08 — Extension registry: register / list / enable / disable + permissions.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXTENSION_CONTRACTS_VERSION } from "./contracts.js";

export type ExtensionKind =
  | "agent_adapter"
  | "model_provider"
  | "tool"
  | "verifier"
  | "other";

export interface ExtensionPermissions {
  /** May register tools into Tool Registry. */
  register_tools?: boolean;
  /** May register custom verifiers. */
  register_verifiers?: boolean;
  /** May declare model provider stubs. */
  register_model_providers?: boolean;
  /** May declare adapter contracts (metadata only). */
  register_adapters?: boolean;
  /** Opaque extra flags — never imply secret access. */
  extra?: string[];
}

export interface ExtensionRecord {
  kind: "ExtensionRecord";
  extension_id: string;
  display_name: string;
  extension_kind: ExtensionKind;
  /** Semver or contract package version this extension targets. */
  contracts_version: string;
  permissions: ExtensionPermissions;
  enabled: boolean;
  /** Optional linked native ids (tool_id / verifier_id / …). */
  provides?: {
    tool_ids?: string[];
    verifier_ids?: string[];
    provider_ids?: string[];
    adapter_ids?: string[];
  };
  notes: string[];
  registered_at: string;
  updated_at: string;
}

export interface ExtensionRegistrySnapshot {
  kind: "ExtensionRegistry";
  version: number;
  updated_at: string;
  contracts_version: typeof EXTENSION_CONTRACTS_VERSION;
  extensions: ExtensionRecord[];
  limitations: string[];
}

export interface RegisterExtensionInput {
  extension_id: string;
  display_name: string;
  extension_kind: ExtensionKind;
  permissions?: ExtensionPermissions;
  provides?: ExtensionRecord["provides"];
  notes?: string[];
  enabled?: boolean;
  contracts_version?: string;
}

export class ExtensionRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExtensionRegistryError";
  }
}

const LIMITATIONS = [
  "Extension registry is a stub host — not a plugin marketplace",
  "enable/disable flips metadata only; does not hot-load code",
  "permissions are declarative gates for registration helpers",
  "Full SDK publish deferred (docs/v5/M08/LIMITATION-sdk.md)",
];

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class ExtensionRegistryStore {
  readonly dir: string;
  readonly path: string;

  constructor(extensionsDir: string) {
    this.dir = extensionsDir;
    this.path = join(extensionsDir, "registry.json");
    mkdirSync(extensionsDir, { recursive: true });
  }

  load(): ExtensionRegistrySnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "ExtensionRegistry",
        version: 1,
        updated_at: nowIso(),
        contracts_version: EXTENSION_CONTRACTS_VERSION,
        extensions: [],
        limitations: [...LIMITATIONS],
      };
    }
    const parsed = JSON.parse(
      readFileSync(this.path, "utf-8"),
    ) as ExtensionRegistrySnapshot;
    if (parsed.kind !== "ExtensionRegistry") {
      throw new ExtensionRegistryError("INVALID", this.path);
    }
    return parsed;
  }

  private save(snap: ExtensionRegistrySnapshot): void {
    snap.updated_at = nowIso();
    atomicWrite(this.path, JSON.stringify(snap, null, 2) + "\n");
  }

  register(input: RegisterExtensionInput): ExtensionRecord {
    const id = input.extension_id.trim();
    if (!id) throw new ExtensionRegistryError("INVALID", "extension_id required");
    const snap = this.load();
    const existing = snap.extensions.find((e) => e.extension_id === id);
    const ts = nowIso();
    const record: ExtensionRecord = {
      kind: "ExtensionRecord",
      extension_id: id,
      display_name: input.display_name.trim() || id,
      extension_kind: input.extension_kind,
      contracts_version: input.contracts_version ?? EXTENSION_CONTRACTS_VERSION,
      permissions: { ...(input.permissions ?? {}) },
      enabled: input.enabled ?? true,
      provides: input.provides ? { ...input.provides } : undefined,
      notes: [...(input.notes ?? [])],
      registered_at: existing?.registered_at ?? ts,
      updated_at: ts,
    };
    if (existing) {
      snap.extensions = snap.extensions.map((e) =>
        e.extension_id === id ? record : e,
      );
    } else {
      snap.extensions.push(record);
    }
    this.save(snap);
    return record;
  }

  list(opts?: { enabledOnly?: boolean }): ExtensionRecord[] {
    const all = this.load().extensions;
    if (opts?.enabledOnly) return all.filter((e) => e.enabled);
    return [...all];
  }

  enable(extensionId: string): ExtensionRecord {
    return this.setEnabled(extensionId, true);
  }

  disable(extensionId: string): ExtensionRecord {
    return this.setEnabled(extensionId, false);
  }

  private setEnabled(extensionId: string, enabled: boolean): ExtensionRecord {
    const snap = this.load();
    const idx = snap.extensions.findIndex((e) => e.extension_id === extensionId);
    if (idx < 0) {
      throw new ExtensionRegistryError("NOT_FOUND", extensionId);
    }
    const next = {
      ...snap.extensions[idx]!,
      enabled,
      updated_at: nowIso(),
    };
    snap.extensions[idx] = next;
    this.save(snap);
    return next;
  }

  get(extensionId: string): ExtensionRecord | undefined {
    return this.load().extensions.find((e) => e.extension_id === extensionId);
  }

  /** True when extension is enabled AND declares the permission flag. */
  hasPermission(
    extensionId: string,
    perm: keyof Omit<ExtensionPermissions, "extra">,
  ): boolean {
    const ext = this.get(extensionId);
    if (!ext || !ext.enabled) return false;
    return Boolean(ext.permissions[perm]);
  }
}
