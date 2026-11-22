/**
 * V3-DIST-01 — Mature distribution ops:
 * diagnose, versioned state export/import (NFR-009), backup/restore with integrity.
 *
 * Covers META-DIST-001..006 (ops-facing slices) + NFR-009 portability.
 * Honesty: unit-deterministic; does not claim live installer PASS without host evidence.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWriteJson, nowIso } from "./atomic.js";

/** Current portable state schema (post META-DIST-005 separation). */
export const STATE_SCHEMA_VERSION = 2 as const;
/** Oldest schema still accepted for import + migration. */
export const STATE_SCHEMA_MIN_SUPPORTED = 1 as const;

export const DIST_OPS_KIND = {
  diagnose: "EvolveLoopDiagnoseReport",
  export: "EvolveLoopStateExport",
  backup: "EvolveLoopBackupManifest",
} as const;

export type DiagnoseSeverity = "ok" | "warn" | "error" | "missing";

export interface DiagnoseCheck {
  id: string;
  status: DiagnoseSeverity;
  message: string;
  /** Never include secret values. */
  detail?: Record<string, string | number | boolean | null>;
  /** META-DIST / NFR mapping when applicable. */
  meta_ref?: string;
}

export interface DiagnoseOptions {
  workspace?: string;
  /** Host-global config root (XDG / ~/.evolveloop). Distinct from project state. */
  globalConfigDir?: string;
  /** Per-project durable data dir (.evolveloop or --data-dir). */
  projectDataDir?: string;
  /** Optional host ops dir. */
  opsDir?: string;
  /** Injectable checks for offline unit tests. */
  checks?: DiagnoseCheck[];
  /** Skip spawning node/git (tests). */
  skipRuntimeProbes?: boolean;
}

export interface DiagnoseReport {
  kind: typeof DIST_OPS_KIND.diagnose;
  at: string;
  healthy: boolean;
  schema_version: typeof STATE_SCHEMA_VERSION;
  checks: DiagnoseCheck[];
  /** Human-readable PT summary (META-DIST-004). */
  summary_pt: string;
  /** Separation of global vs project paths (META-DIST-005). */
  layout: {
    global_config_dir: string | null;
    project_data_dir: string | null;
    ops_dir: string | null;
    separation_ok: boolean;
  };
  meta_dist_coverage: Record<string, string>;
}

export interface ProjectStateSlice {
  contracts: Record<string, unknown>[];
  events: Record<string, unknown>[];
  memories: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  /** Opaque project-local files keyed by relative path (text/json only in unit path). */
  files: Record<string, string>;
}

export interface GlobalConfigSlice {
  /** Non-secret config documents keyed by relative path. */
  files: Record<string, string>;
  /** Credential *names* only — never values (META-DIST / privacy). */
  credential_names: string[];
}

/** Legacy flat v1 envelope body (pre separation). */
export interface StateExportV1Body {
  schema_version: 1;
  blob: Record<string, unknown>;
}

export interface StateExportV2Body {
  schema_version: 2;
  global_config: GlobalConfigSlice;
  project_state: ProjectStateSlice;
}

export type StateExportBody = StateExportV1Body | StateExportV2Body;

export interface StateExportEnvelope {
  kind: typeof DIST_OPS_KIND.export;
  schema_version: number;
  exported_at: string;
  /** SHA-256 hex of canonical JSON of `body` (integrity). */
  body_sha256: string;
  body: StateExportBody;
}

export interface ExportStateOptions {
  globalConfigDir: string;
  projectDataDir: string;
  /** Optional in-memory slices (tests / callers that already loaded state). */
  global?: Partial<GlobalConfigSlice>;
  project?: Partial<ProjectStateSlice>;
  /** When true, read JSON files under known subdirs from disk. */
  readFromDisk?: boolean;
}

export interface ImportStateOptions {
  globalConfigDir: string;
  projectDataDir: string;
  /** Apply files to disk under the separated roots. */
  writeToDisk?: boolean;
}

export interface ImportStateResult {
  ok: boolean;
  schema_version_in: number;
  schema_version_out: number;
  migrated: boolean;
  migrations_applied: number[];
  body_sha256_verified: boolean;
  written_files: string[];
  global_config: GlobalConfigSlice;
  project_state: ProjectStateSlice;
  error?: string;
}

export interface BackupFileEntry {
  relative_path: string;
  sha256: string;
  bytes: number;
  /** "global" | "project" — META-DIST-005 provenance. */
  scope: "global" | "project";
}

export interface BackupManifest {
  kind: typeof DIST_OPS_KIND.backup;
  backup_id: string;
  schema_version: typeof STATE_SCHEMA_VERSION;
  created_at: string;
  /** SHA-256 of canonical JSON of `files` array (manifest integrity). */
  manifest_sha256: string;
  files: BackupFileEntry[];
  roots: { global: string; project: string };
}

export interface BackupResult {
  ok: true;
  backup_id: string;
  backup_dir: string;
  manifest: BackupManifest;
  file_count: number;
}

export interface RestoreResult {
  ok: boolean;
  backup_id: string;
  verified: boolean;
  restored_files: string[];
  error?: string;
}

export class DistOpsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DistOpsError";
  }
}

function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Stable JSON for hashing (sorted object keys, no whitespace variance). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortKeys(obj[k]);
    }
    return out;
  }
  return value;
}

function emptyGlobal(): GlobalConfigSlice {
  return { files: {}, credential_names: [] };
}

function emptyProject(): ProjectStateSlice {
  return {
    contracts: [],
    events: [],
    memories: [],
    evidence: [],
    files: {},
  };
}

function runCmdVersion(cmd: string, args: string[]): DiagnoseCheck {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf-8", timeout: 5000 });
    if (r.error || r.status !== 0) {
      return {
        id: `runtime:${cmd}`,
        status: "missing",
        message: `${cmd} unavailable`,
        meta_ref: "META-DIST-002",
        detail: { exit: r.status ?? -1 },
      };
    }
    const out = (r.stdout || r.stderr || "").trim().split("\n")[0] ?? "";
    return {
      id: `runtime:${cmd}`,
      status: "ok",
      message: out || `${cmd} ok`,
      meta_ref: "META-DIST-002",
    };
  } catch (err) {
    return {
      id: `runtime:${cmd}`,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      meta_ref: "META-DIST-002",
    };
  }
}

function checkPath(
  id: string,
  path: string | undefined,
  opts: { mustExist?: boolean; writable?: boolean; meta_ref?: string },
): DiagnoseCheck {
  if (!path) {
    return {
      id,
      status: "warn",
      message: `${id} not configured`,
      meta_ref: opts.meta_ref,
    };
  }
  const abs = resolve(path);
  if (!existsSync(abs)) {
    return {
      id,
      status: opts.mustExist ? "error" : "warn",
      message: opts.mustExist ? `missing: ${abs}` : `will be created: ${abs}`,
      detail: { path: abs },
      meta_ref: opts.meta_ref,
    };
  }
  if (opts.writable) {
    try {
      accessSync(abs, constants.W_OK | constants.R_OK);
    } catch {
      return {
        id,
        status: "error",
        message: `not writable: ${abs}`,
        detail: { path: abs },
        meta_ref: opts.meta_ref,
      };
    }
  }
  return {
    id,
    status: "ok",
    message: abs,
    detail: { path: abs },
    meta_ref: opts.meta_ref,
  };
}

/**
 * Host/workspace diagnostics (META-DIST-002..005, NFR-009 readiness).
 * Injectable `checks` short-circuits host probes for unit tests.
 */
export function diagnose(opts: DiagnoseOptions = {}): DiagnoseReport {
  const at = nowIso();
  const globalConfigDir = opts.globalConfigDir
    ? resolve(opts.globalConfigDir)
    : null;
  const projectDataDir = opts.projectDataDir
    ? resolve(opts.projectDataDir)
    : opts.workspace
      ? resolve(opts.workspace, ".evolveloop")
      : null;
  const opsDir = opts.opsDir ? resolve(opts.opsDir) : null;

  let checks: DiagnoseCheck[];
  if (opts.checks) {
    checks = [...opts.checks];
  } else {
    checks = [];
    if (!opts.skipRuntimeProbes) {
      checks.push(runCmdVersion("node", ["-v"]));
      checks.push(runCmdVersion("git", ["--version"]));
    }
    if (opts.workspace) {
      checks.push(
        checkPath("workspace", opts.workspace, {
          mustExist: true,
          meta_ref: "META-DIST-001",
        }),
      );
    }
    checks.push(
      checkPath("global_config", globalConfigDir ?? undefined, {
        writable: true,
        meta_ref: "META-DIST-005",
      }),
    );
    checks.push(
      checkPath("project_state", projectDataDir ?? undefined, {
        writable: true,
        meta_ref: "META-DIST-005",
      }),
    );
    if (opsDir) {
      checks.push(
        checkPath("ops_dir", opsDir, {
          writable: true,
          meta_ref: "META-DIST-004",
        }),
      );
    }

    // META-DIST-003: discovery ≠ enablement
    const discovered = checks
      .filter((c) => c.id.startsWith("runtime:") && c.status === "ok")
      .map((c) => c.id.replace("runtime:", ""));
    checks.push({
      id: "discovery_vs_enablement",
      status: "ok",
      message:
        "tools discovered are not auto-enabled; health check required before operational",
      detail: {
        discovered: discovered.join(",") || "none",
        enabled_operational: false,
      },
      meta_ref: "META-DIST-003",
    });

    checks.push({
      id: "state_portability",
      status: "ok",
      message: `export/import schema v${STATE_SCHEMA_VERSION} (min supported v${STATE_SCHEMA_MIN_SUPPORTED})`,
      meta_ref: "NFR-009",
    });
  }

  const separation_ok =
    !!globalConfigDir &&
    !!projectDataDir &&
    resolve(globalConfigDir) !== resolve(projectDataDir);

  if (globalConfigDir && projectDataDir && !opts.checks) {
    checks.push({
      id: "global_vs_project_separation",
      status: separation_ok ? "ok" : "error",
      message: separation_ok
        ? "global config and project state paths are distinct"
        : "global config and project state must not share the same path",
      detail: {
        global_config_dir: globalConfigDir,
        project_data_dir: projectDataDir,
      },
      meta_ref: "META-DIST-005",
    });
  }

  const healthy = checks.every((c) => c.status === "ok" || c.status === "warn");
  const errors = checks.filter((c) => c.status === "error" || c.status === "missing");
  const warns = checks.filter((c) => c.status === "warn");
  const summary_pt = healthy
    ? `Diagnóstico OK (${checks.length} checks; ${warns.length} aviso(s)). Layout global≠projeto: ${separation_ok ? "sim" : "n/d"}.`
    : `Diagnóstico com falhas: ${errors.map((e) => e.id).join(", ") || "desconhecido"}.`;

  return {
    kind: DIST_OPS_KIND.diagnose,
    at,
    healthy,
    schema_version: STATE_SCHEMA_VERSION,
    checks,
    summary_pt,
    layout: {
      global_config_dir: globalConfigDir,
      project_data_dir: projectDataDir,
      ops_dir: opsDir,
      separation_ok,
    },
    meta_dist_coverage: {
      "META-DIST-001": "CLI evolve entrypoint assumed; workspace path checked when provided",
      "META-DIST-002": "runtime/dependency probes (node/git) + dir permissions",
      "META-DIST-003": "discovery_vs_enablement check — discovered ≠ operational",
      "META-DIST-004": "diagnose + export/backup APIs",
      "META-DIST-005": "global_config_dir ≠ project_data_dir enforced",
      "META-DIST-006": "conversational first-run lives in evolve-shell (out of this module)",
      "NFR-009": `schema v${STATE_SCHEMA_VERSION} export/import + migrations`,
    },
  };
}

function readJsonArrayDir(dir: string): Record<string, unknown>[] {
  if (!existsSync(dir)) return [];
  const out: Record<string, unknown>[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), "utf-8")) as unknown;
      if (raw && typeof raw === "object") {
        out.push(raw as Record<string, unknown>);
      }
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

function readTextTree(
  root: string,
  relBase = "",
): Record<string, string> {
  const abs = resolve(root);
  if (!existsSync(abs)) return {};
  const files: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p, r);
      } else if (st.isFile() && st.size <= 1_000_000) {
        // Skip sqlite binaries and obvious secrets
        if (/\.(db|db-wal|db-shm|zst)$/i.test(name)) continue;
        if (/credentials\.env$/i.test(name)) continue;
        files[r] = readFileSync(p, "utf-8");
      }
    }
  };
  walk(abs, relBase);
  return files;
}

function listCredentialNames(credPath: string): string[] {
  if (!existsSync(credPath)) return [];
  const names: string[] = [];
  for (const line of readFileSync(credPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) names.push(trimmed.slice(0, eq));
  }
  return names;
}

function loadSlices(opts: ExportStateOptions): {
  global_config: GlobalConfigSlice;
  project_state: ProjectStateSlice;
} {
  const global_config: GlobalConfigSlice = {
    ...emptyGlobal(),
    ...opts.global,
    files: { ...emptyGlobal().files, ...(opts.global?.files ?? {}) },
    credential_names: opts.global?.credential_names ?? [],
  };
  const project_state: ProjectStateSlice = {
    ...emptyProject(),
    ...opts.project,
    contracts: opts.project?.contracts ?? [],
    events: opts.project?.events ?? [],
    memories: opts.project?.memories ?? [],
    evidence: opts.project?.evidence ?? [],
    files: { ...emptyProject().files, ...(opts.project?.files ?? {}) },
  };

  if (opts.readFromDisk) {
    const gRoot = resolve(opts.globalConfigDir);
    const pRoot = resolve(opts.projectDataDir);
    mkdirSync(gRoot, { recursive: true });
    mkdirSync(pRoot, { recursive: true });
    Object.assign(global_config.files, readTextTree(gRoot));
    if (global_config.credential_names.length === 0) {
      global_config.credential_names = listCredentialNames(
        join(gRoot, "credentials.env"),
      );
    }
    project_state.contracts =
      project_state.contracts.length > 0
        ? project_state.contracts
        : readJsonArrayDir(join(pRoot, "goal-contracts"));
    project_state.events =
      project_state.events.length > 0
        ? project_state.events
        : readJsonArrayDir(join(pRoot, "events"));
    project_state.memories =
      project_state.memories.length > 0
        ? project_state.memories
        : readJsonArrayDir(join(pRoot, "memories"));
    project_state.evidence =
      project_state.evidence.length > 0
        ? project_state.evidence
        : readJsonArrayDir(join(pRoot, "evidence"));
    Object.assign(project_state.files, readTextTree(pRoot));
  }

  return { global_config, project_state };
}

/** Migrate v1 flat blob → v2 separated slices. */
export function migrateV1toV2(v1: StateExportV1Body): StateExportV2Body {
  const blob = v1.blob ?? {};
  const global_config: GlobalConfigSlice = {
    files:
      (blob.global_files as Record<string, string> | undefined) ??
      (blob.config as Record<string, string> | undefined) ??
      {},
    credential_names: Array.isArray(blob.credential_names)
      ? (blob.credential_names as string[])
      : [],
  };
  const project_state: ProjectStateSlice = {
    contracts: Array.isArray(blob.contracts)
      ? (blob.contracts as Record<string, unknown>[])
      : [],
    events: Array.isArray(blob.events)
      ? (blob.events as Record<string, unknown>[])
      : [],
    memories: Array.isArray(blob.memories)
      ? (blob.memories as Record<string, unknown>[])
      : [],
    evidence: Array.isArray(blob.evidence)
      ? (blob.evidence as Record<string, unknown>[])
      : [],
    files:
      (blob.project_files as Record<string, string> | undefined) ??
      (blob.files as Record<string, string> | undefined) ??
      {},
  };
  return {
    schema_version: 2,
    global_config,
    project_state,
  };
}

export type StateMigrator = (body: StateExportBody) => StateExportBody;

/** Chain: version N migrator upgrades body FROM N TO N+1. */
export const STATE_MIGRATIONS: Record<number, StateMigrator> = {
  1: (body) => {
    if (body.schema_version !== 1) {
      throw new DistOpsError(
        "MIGRATE_TYPE",
        `expected v1 body, got v${body.schema_version}`,
      );
    }
    return migrateV1toV2(body);
  },
};

/**
 * Upgrade `body` from its schema_version up to `targetVersion` (inclusive target).
 */
export function migrateStateBody(
  body: StateExportBody,
  targetVersion: number,
): { body: StateExportBody; migrations_applied: number[] } {
  if (targetVersion < STATE_SCHEMA_MIN_SUPPORTED || targetVersion > STATE_SCHEMA_VERSION) {
    throw new DistOpsError(
      "UNSUPPORTED_TARGET",
      `target version ${targetVersion} not in [${STATE_SCHEMA_MIN_SUPPORTED}..${STATE_SCHEMA_VERSION}]`,
    );
  }
  let current = body;
  const migrations_applied: number[] = [];
  while (current.schema_version < targetVersion) {
    const from = current.schema_version;
    const migrator = STATE_MIGRATIONS[from];
    if (!migrator) {
      throw new DistOpsError(
        "NO_MIGRATOR",
        `no migrator from schema v${from}`,
      );
    }
    current = migrator(current);
    migrations_applied.push(from);
    if (current.schema_version <= from) {
      throw new DistOpsError(
        "MIGRATOR_STALL",
        `migrator from v${from} did not advance schema_version`,
      );
    }
  }
  return { body: current, migrations_applied };
}

function sealEnvelope(body: StateExportBody): StateExportEnvelope {
  const body_sha256 = sha256Hex(canonicalJson(body));
  return {
    kind: DIST_OPS_KIND.export,
    schema_version: body.schema_version,
    exported_at: nowIso(),
    body_sha256,
    body,
  };
}

/**
 * Export portable state at `version` (NFR-009).
 * Loads current slices, then if version < CURRENT, down-level is refused
 * (only forward migration on import). Export always emits CURRENT body,
 * then migrates only when requesting CURRENT after loading older in-memory v1.
 */
export function exportState(
  version: number,
  opts: ExportStateOptions,
): StateExportEnvelope {
  if (version < STATE_SCHEMA_MIN_SUPPORTED || version > STATE_SCHEMA_VERSION) {
    throw new DistOpsError(
      "UNSUPPORTED_VERSION",
      `export version ${version} not in [${STATE_SCHEMA_MIN_SUPPORTED}..${STATE_SCHEMA_VERSION}]`,
    );
  }

  const { global_config, project_state } = loadSlices(opts);

  if (version === 1) {
    // Explicit v1 export for fixtures / down-compat tests
    const body: StateExportV1Body = {
      schema_version: 1,
      blob: {
        global_files: global_config.files,
        credential_names: global_config.credential_names,
        contracts: project_state.contracts,
        events: project_state.events,
        memories: project_state.memories,
        evidence: project_state.evidence,
        project_files: project_state.files,
      },
    };
    return sealEnvelope(body);
  }

  const body: StateExportV2Body = {
    schema_version: 2,
    global_config,
    project_state,
  };
  return sealEnvelope(body);
}

function verifyEnvelopeIntegrity(envelope: StateExportEnvelope): boolean {
  return envelope.body_sha256 === sha256Hex(canonicalJson(envelope.body));
}

function writeTree(
  root: string,
  files: Record<string, string>,
): string[] {
  const written: string[] = [];
  mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    if (rel.includes("..") || rel.startsWith("/") || rel.includes(`..${sep}`)) {
      throw new DistOpsError("PATH_ESCAPE", `refusing path: ${rel}`);
    }
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, { encoding: "utf-8", mode: 0o600 });
    written.push(dest);
  }
  return written;
}

function writeJsonSlice(
  dir: string,
  items: Record<string, unknown>[],
  prefix: string,
): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  items.forEach((item, i) => {
    const id =
      (typeof item.id === "string" && item.id) ||
      (typeof item.goal_contract_id === "string" && item.goal_contract_id) ||
      (typeof item.event_id === "string" && item.event_id) ||
      (typeof item.memory_id === "string" && item.memory_id) ||
      `${prefix}-${i}`;
    const path = join(dir, `${id}.json`);
    atomicWriteJson(path, item);
    written.push(path);
  });
  return written;
}

/**
 * Import envelope, verifying integrity and migrating to `version` (NFR-009).
 */
export function importState(
  version: number,
  envelope: StateExportEnvelope,
  opts: ImportStateOptions,
): ImportStateResult {
  if (envelope.kind !== DIST_OPS_KIND.export) {
    return {
      ok: false,
      schema_version_in: envelope.schema_version,
      schema_version_out: version,
      migrated: false,
      migrations_applied: [],
      body_sha256_verified: false,
      written_files: [],
      global_config: emptyGlobal(),
      project_state: emptyProject(),
      error: "INVALID_KIND",
    };
  }

  const body_sha256_verified = verifyEnvelopeIntegrity(envelope);
  if (!body_sha256_verified) {
    return {
      ok: false,
      schema_version_in: envelope.schema_version,
      schema_version_out: version,
      migrated: false,
      migrations_applied: [],
      body_sha256_verified: false,
      written_files: [],
      global_config: emptyGlobal(),
      project_state: emptyProject(),
      error: "INTEGRITY_FAILED",
    };
  }

  if (envelope.schema_version < STATE_SCHEMA_MIN_SUPPORTED) {
    return {
      ok: false,
      schema_version_in: envelope.schema_version,
      schema_version_out: version,
      migrated: false,
      migrations_applied: [],
      body_sha256_verified: true,
      written_files: [],
      global_config: emptyGlobal(),
      project_state: emptyProject(),
      error: "SCHEMA_TOO_OLD",
    };
  }

  if (envelope.schema_version > STATE_SCHEMA_VERSION) {
    return {
      ok: false,
      schema_version_in: envelope.schema_version,
      schema_version_out: version,
      migrated: false,
      migrations_applied: [],
      body_sha256_verified: true,
      written_files: [],
      global_config: emptyGlobal(),
      project_state: emptyProject(),
      error: "SCHEMA_TOO_NEW",
    };
  }

  try {
    const { body, migrations_applied } = migrateStateBody(
      envelope.body,
      version,
    );

    // Disk layout is always META-DIST-005 separated (v2). In-memory may stay at `version`.
    const v2: StateExportV2Body =
      body.schema_version === 2
        ? (body as StateExportV2Body)
        : migrateV1toV2(body as StateExportV1Body);

    const written_files: string[] = [];

    if (opts.writeToDisk) {
      const gRoot = resolve(opts.globalConfigDir);
      const pRoot = resolve(opts.projectDataDir);
      if (resolve(gRoot) === resolve(pRoot)) {
        throw new DistOpsError(
          "SEPARATION",
          "globalConfigDir and projectDataDir must differ (META-DIST-005)",
        );
      }
      written_files.push(...writeTree(gRoot, v2.global_config.files));
      written_files.push(
        ...writeJsonSlice(
          join(pRoot, "goal-contracts"),
          v2.project_state.contracts,
          "contract",
        ),
      );
      written_files.push(
        ...writeJsonSlice(join(pRoot, "events"), v2.project_state.events, "event"),
      );
      written_files.push(
        ...writeJsonSlice(
          join(pRoot, "memories"),
          v2.project_state.memories,
          "memory",
        ),
      );
      written_files.push(
        ...writeJsonSlice(
          join(pRoot, "evidence"),
          v2.project_state.evidence,
          "evidence",
        ),
      );
      written_files.push(...writeTree(pRoot, v2.project_state.files));
    }

    return {
      ok: true,
      schema_version_in: envelope.schema_version,
      schema_version_out: body.schema_version,
      migrated: migrations_applied.length > 0,
      migrations_applied,
      body_sha256_verified: true,
      written_files,
      global_config: v2.global_config,
      project_state: v2.project_state,
    };
  } catch (err) {
    return {
      ok: false,
      schema_version_in: envelope.schema_version,
      schema_version_out: version,
      migrated: false,
      migrations_applied: [],
      body_sha256_verified: true,
      written_files: [],
      global_config: emptyGlobal(),
      project_state: emptyProject(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function listFilesRecursive(root: string): string[] {
  const abs = resolve(root);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) out.push(p);
    }
  };
  walk(abs);
  return out;
}

function safeRel(root: string, file: string): string {
  const rel = relative(resolve(root), resolve(file));
  if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new DistOpsError("PATH_ESCAPE", `unsafe relative path from ${root}: ${file}`);
  }
  return rel.split(sep).join("/");
}

export interface BackupOptions {
  globalConfigDir: string;
  projectDataDir: string;
  backupRoot: string;
  /** Optional backup id (tests). */
  backupId?: string;
}

/**
 * Full backup of global config + project state with per-file SHA-256 manifest.
 */
export function backup(opts: BackupOptions): BackupResult {
  const gRoot = resolve(opts.globalConfigDir);
  const pRoot = resolve(opts.projectDataDir);
  if (gRoot === pRoot) {
    throw new DistOpsError(
      "SEPARATION",
      "globalConfigDir and projectDataDir must differ (META-DIST-005)",
    );
  }

  const backup_id = opts.backupId ?? `bak-${randomUUID()}`;
  const backup_dir = join(resolve(opts.backupRoot), backup_id);
  const dataDir = join(backup_dir, "data");
  mkdirSync(join(dataDir, "global"), { recursive: true });
  mkdirSync(join(dataDir, "project"), { recursive: true });

  const files: BackupFileEntry[] = [];

  const copyScope = (srcRoot: string, scope: "global" | "project") => {
    for (const abs of listFilesRecursive(srcRoot)) {
      // Never backup credential values into portable archives without redaction —
      // skip credentials.env (names-only belongs in exportState).
      if (/credentials\.env$/i.test(abs)) continue;
      const rel = safeRel(srcRoot, abs);
      const dest = join(dataDir, scope, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(abs, dest);
      const buf = readFileSync(dest);
      files.push({
        relative_path: `${scope}/${rel}`,
        sha256: sha256Hex(buf),
        bytes: buf.byteLength,
        scope,
      });
    }
  };

  copyScope(gRoot, "global");
  copyScope(pRoot, "project");

  files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  const manifest_sha256 = sha256Hex(canonicalJson(files));
  const manifest: BackupManifest = {
    kind: DIST_OPS_KIND.backup,
    backup_id,
    schema_version: STATE_SCHEMA_VERSION,
    created_at: nowIso(),
    manifest_sha256,
    files,
    roots: { global: gRoot, project: pRoot },
  };
  atomicWriteJson(join(backup_dir, "manifest.json"), manifest);

  return {
    ok: true,
    backup_id,
    backup_dir,
    manifest,
    file_count: files.length,
  };
}

export interface RestoreOptions {
  backupDir: string;
  globalConfigDir: string;
  projectDataDir: string;
  /** Default true — refuse restore on hash mismatch. */
  verifyIntegrity?: boolean;
}

/**
 * Restore from backup directory after verifying every file hash.
 */
export function restore(opts: RestoreOptions): RestoreResult {
  const backup_dir = resolve(opts.backupDir);
  const manifestPath = join(backup_dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      backup_id: "unknown",
      verified: false,
      restored_files: [],
      error: "MANIFEST_MISSING",
    };
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as BackupManifest;
  } catch {
    return {
      ok: false,
      backup_id: "unknown",
      verified: false,
      restored_files: [],
      error: "MANIFEST_INVALID",
    };
  }

  if (manifest.kind !== DIST_OPS_KIND.backup) {
    return {
      ok: false,
      backup_id: manifest.backup_id ?? "unknown",
      verified: false,
      restored_files: [],
      error: "INVALID_KIND",
    };
  }

  const expectedManifestHash = sha256Hex(canonicalJson(manifest.files));
  if (expectedManifestHash !== manifest.manifest_sha256) {
    return {
      ok: false,
      backup_id: manifest.backup_id,
      verified: false,
      restored_files: [],
      error: "MANIFEST_INTEGRITY_FAILED",
    };
  }

  const verify = opts.verifyIntegrity !== false;
  const dataDir = join(backup_dir, "data");

  for (const entry of manifest.files) {
    const src = join(dataDir, entry.relative_path);
    if (!existsSync(src)) {
      return {
        ok: false,
        backup_id: manifest.backup_id,
        verified: false,
        restored_files: [],
        error: `MISSING_FILE:${entry.relative_path}`,
      };
    }
    if (verify) {
      const hash = sha256Hex(readFileSync(src));
      if (hash !== entry.sha256) {
        return {
          ok: false,
          backup_id: manifest.backup_id,
          verified: false,
          restored_files: [],
          error: `INTEGRITY_FAILED:${entry.relative_path}`,
        };
      }
    }
  }

  const gRoot = resolve(opts.globalConfigDir);
  const pRoot = resolve(opts.projectDataDir);
  if (gRoot === pRoot) {
    return {
      ok: false,
      backup_id: manifest.backup_id,
      verified: true,
      restored_files: [],
      error: "SEPARATION",
    };
  }

  const restored_files: string[] = [];
  for (const entry of manifest.files) {
    const src = join(dataDir, entry.relative_path);
    const scopeRoot = entry.scope === "global" ? gRoot : pRoot;
    const relInScope = entry.relative_path.replace(/^(global|project)\//, "");
    if (relInScope.includes("..")) {
      return {
        ok: false,
        backup_id: manifest.backup_id,
        verified: true,
        restored_files,
        error: `PATH_ESCAPE:${entry.relative_path}`,
      };
    }
    const dest = join(scopeRoot, relInScope);
    mkdirSync(dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    copyFileSync(src, tmp);
    renameSync(tmp, dest);
    restored_files.push(dest);
  }

  return {
    ok: true,
    backup_id: manifest.backup_id,
    verified: true,
    restored_files,
  };
}

/** Roundtrip helper used by evidence probes / tests. */
export function backupRestoreRoundtrip(opts: {
  globalConfigDir: string;
  projectDataDir: string;
  backupRoot: string;
  restoreGlobalDir: string;
  restoreProjectDir: string;
}): {
  backup: BackupResult;
  restore: RestoreResult;
  integrity_ok: boolean;
} {
  const bak = backup({
    globalConfigDir: opts.globalConfigDir,
    projectDataDir: opts.projectDataDir,
    backupRoot: opts.backupRoot,
  });
  const res = restore({
    backupDir: bak.backup_dir,
    globalConfigDir: opts.restoreGlobalDir,
    projectDataDir: opts.restoreProjectDir,
    verifyIntegrity: true,
  });
  return {
    backup: bak,
    restore: res,
    integrity_ok: bak.ok && res.ok && res.verified,
  };
}
