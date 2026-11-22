/**
 * V3-MEM-01 — Content-Addressed Cold Storage (Zstd + SHA-256).
 *
 * Active SQLite keeps only cas_hash + metadata/summary; raw payloads live as
 * content-addressed `.zst` blobs under a configurable root.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compress, decompress } from "@mongodb-js/zstd";

export const CAS_HASH_PREFIX = "sha256:" as const;
export const COLD_STORAGE_BLOB_EXT = ".zst";

/**
 * AUD-MEM-05 honesty — full ≥100k cold-scale probe is out of budget for the
 * audit batch session. Prior EXIT-03 evidence (`docs/v3/evidence/20261122T005507Z`)
 * already proved SCALE_N=100000; this session revalidates with a measured sample + p95.
 */
export const COLD_SCALE_100K_THIS_SESSION = "NÃO_HABILITADO" as const;

export class ColdStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ColdStorageError";
  }
}

export interface ColdStorageOptions {
  /** Root directory for content-addressed blobs. */
  rootDir: string;
  /** Zstd compression level (1–22). Default 3. */
  compressionLevel?: number;
}

export interface ColdPutResult {
  cas_hash: string;
  raw_bytes: number;
  compressed_bytes: number;
  /** Absolute path of the blob on disk. */
  blob_path: string;
  /** True when the blob already existed (idempotent put). */
  deduped: boolean;
}

/** Shape of a SQLite memory row eligible for cold migration. */
export interface ColdMigrateSqliteRecord {
  memory_id: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  source?: string;
  memory_type?: string;
  created_at?: string;
  /** Optional precomputed summary; defaults to a truncated title/body preview. */
  summary?: string | null;
  cas_hash?: string | null;
}

export interface ColdMigrateResult {
  memory_id: string;
  cas_hash: string;
  summary: string;
  /** Metadata retained in the active DB (no raw body/payload). */
  metadata: Record<string, unknown>;
  raw_bytes: number;
  compressed_bytes: number;
  /** Bytes that were archived (JSON envelope). */
  archived: Buffer;
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function formatCasHash(hex: string): string {
  const clean = hex.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new ColdStorageError(
      "INVALID_CAS_HASH",
      `cas_hash must be 64 hex chars (optionally prefixed sha256:); got ${hex}`,
    );
  }
  return `${CAS_HASH_PREFIX}${clean}`;
}

export function parseCasHash(cas_hash: string): string {
  return formatCasHash(cas_hash).slice(CAS_HASH_PREFIX.length);
}

function defaultSummary(record: ColdMigrateSqliteRecord): string {
  if (record.summary && record.summary.trim()) return record.summary.trim();
  const body = record.body?.trim() ?? "";
  const preview = body.length > 240 ? `${body.slice(0, 237)}...` : body;
  return preview || record.title || "(empty)";
}

/**
 * Content-addressed Zstd blob store.
 * Layout: `<root>/cas/<aa>/<bb>/<sha256>.zst`
 */
export class ColdStorage {
  readonly rootDir: string;
  readonly compressionLevel: number;

  constructor(opts: ColdStorageOptions) {
    if (!opts.rootDir || !opts.rootDir.trim()) {
      throw new ColdStorageError("ROOT_REQUIRED", "ColdStorage requires rootDir");
    }
    this.rootDir = resolve(opts.rootDir.trim());
    this.compressionLevel = opts.compressionLevel ?? 3;
    mkdirSync(join(this.rootDir, "cas"), { recursive: true });
  }

  /** Absolute blob path for a cas_hash (sha256 hex or sha256:hex). */
  blobPath(cas_hash: string): string {
    const hex = parseCasHash(cas_hash);
    return join(this.rootDir, "cas", hex.slice(0, 2), hex.slice(2, 4), `${hex}${COLD_STORAGE_BLOB_EXT}`);
  }

  exists(cas_hash: string): boolean {
    return existsSync(this.blobPath(cas_hash));
  }

  /**
   * Compress `bytes` with Zstd, address by SHA-256 of the *raw* payload, write blob.
   * Idempotent: existing matching blob is left untouched.
   */
  async put(bytes: Uint8Array | Buffer): Promise<ColdPutResult> {
    const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const hex = sha256Hex(raw);
    const cas_hash = formatCasHash(hex);
    const blob_path = this.blobPath(cas_hash);

    if (existsSync(blob_path)) {
      return {
        cas_hash,
        raw_bytes: raw.length,
        compressed_bytes: readFileSync(blob_path).length,
        blob_path,
        deduped: true,
      };
    }

    const compressed = await compress(raw, this.compressionLevel);
    mkdirSync(dirname(blob_path), { recursive: true });
    const tmp = `${blob_path}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(tmp, compressed);
      renameSync(tmp, blob_path);
    } catch (err) {
      try {
        if (existsSync(tmp)) unlinkSync(tmp);
      } catch {
        /* ignore cleanup */
      }
      throw err;
    }

    return {
      cas_hash,
      raw_bytes: raw.length,
      compressed_bytes: compressed.length,
      blob_path,
      deduped: false,
    };
  }

  /**
   * Read + decompress blob; verify SHA-256 of raw bytes against cas_hash.
   * Throws ColdStorageError on missing blob or integrity mismatch.
   */
  async get(cas_hash: string): Promise<Buffer> {
    const hex = parseCasHash(cas_hash);
    const expected = formatCasHash(hex);
    const blob_path = this.blobPath(expected);

    if (!existsSync(blob_path)) {
      throw new ColdStorageError("BLOB_NOT_FOUND", `missing cold blob for ${expected}`);
    }

    const compressed = readFileSync(blob_path);
    let raw: Buffer;
    try {
      raw = await decompress(compressed);
    } catch (err) {
      throw new ColdStorageError(
        "DECOMPRESS_FAILED",
        `zstd decompress failed for ${expected}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const actualHex = sha256Hex(raw);
    if (actualHex !== hex) {
      throw new ColdStorageError(
        "INTEGRITY_MISMATCH",
        `SHA-256 mismatch for ${expected}: expected ${hex}, got ${actualHex}`,
      );
    }

    return raw;
  }

  /**
   * Archive the raw SQLite payload into CAS and return the active-row pointer shape.
   * Caller persists cas_hash + summary/metadata and clears body/payload from SQLite.
   */
  async migrateToCold(sqliteRecord: ColdMigrateSqliteRecord): Promise<ColdMigrateResult> {
    if (!sqliteRecord?.memory_id) {
      throw new ColdStorageError("MEMORY_ID_REQUIRED", "migrateToCold requires memory_id");
    }
    if (sqliteRecord.cas_hash) {
      throw new ColdStorageError(
        "ALREADY_COLD",
        `memory_id=${sqliteRecord.memory_id} already has cas_hash=${sqliteRecord.cas_hash}`,
      );
    }

    const envelope = {
      memory_id: sqliteRecord.memory_id,
      title: sqliteRecord.title,
      body: sqliteRecord.body,
      payload: sqliteRecord.payload ?? {},
      source: sqliteRecord.source ?? null,
      memory_type: sqliteRecord.memory_type ?? null,
      created_at: sqliteRecord.created_at ?? null,
      archived_at: new Date().toISOString(),
    };
    const archived = Buffer.from(JSON.stringify(envelope), "utf8");
    const put = await this.put(archived);
    const summary = defaultSummary(sqliteRecord);

    return {
      memory_id: sqliteRecord.memory_id,
      cas_hash: put.cas_hash,
      summary,
      metadata: {
        cold: true,
        title: sqliteRecord.title,
        source: sqliteRecord.source ?? null,
        memory_type: sqliteRecord.memory_type ?? null,
        created_at: sqliteRecord.created_at ?? null,
        raw_bytes: put.raw_bytes,
        compressed_bytes: put.compressed_bytes,
      },
      raw_bytes: put.raw_bytes,
      compressed_bytes: put.compressed_bytes,
      archived,
    };
  }
}

export function defaultColdStorageRoot(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".evolveloop", "cold-cas");
}
