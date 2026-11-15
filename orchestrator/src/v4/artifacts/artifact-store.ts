/**
 * Content-addressed artifact store (ADR-V4-0004, INV-ART-01).
 *
 * Write-then-reference: put() makes bytes durable and verifies the hash
 * *before* returning. Callers then append `artifact.registered`. An event
 * never cites a missing hash. Crash during put leaves a .tmp blob that
 * recovery discards. Crash after put before the event leaves an orphan
 * (GC-able).
 *
 * When a V37ArtifactPort is supplied, blob storage is delegated to
 * ArtifactFabric (ADR-V4-0002). V4 Artifact metadata stays in this store
 * under path-safe artifact ids (R5 / F08).
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { V37ArtifactPort } from "../contracts/adapters-v37.js";
import {
  ARTIFACT_SCHEMA_VERSION,
  type Artifact,
  validateArtifact,
} from "../contracts/artifact.js";
import type { ArtifactStorePort } from "../contracts/ports.js";
import {
  DEFAULT_TENANT_ID,
  isSha256,
  isValidId,
  type ContentRef,
} from "../contracts/common.js";
import { atomicWriteFsync, discardTmpFiles, ensureDir, resolveUnderRoot } from "../ledger/persistence.js";
import { requireId } from "../ledger/ids.js";

export const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

export interface ArtifactStoreOptions {
  root: string;
  clock?: () => string;
  v37?: V37ArtifactPort;
  maxBytes?: number;
  originWorkerNodeId?: string;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mapIntegrity(status: Artifact["integrity_status"] | string): Artifact["integrity_status"] {
  if (status === "verified" || status === "VERIFIED") return "VERIFIED";
  if (status === "mismatch" || status === "MISMATCH") return "MISMATCH";
  return "UNVERIFIED";
}

export class FileArtifactStore implements ArtifactStorePort {
  private readonly root: string;
  private readonly clock: () => string;
  private readonly v37: V37ArtifactPort | undefined;
  private readonly maxBytes: number;
  private readonly originWorkerNodeId: string;

  constructor(opts: ArtifactStoreOptions) {
    this.root = opts.root;
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.v37 = opts.v37;
    this.maxBytes = opts.maxBytes ?? MAX_ARTIFACT_BYTES;
    this.originWorkerNodeId = opts.originWorkerNodeId ?? "v4-control-plane";
    ensureDir(this.metaDir());
    ensureDir(this.blobDir());
  }

  private metaDir(): string {
    return resolveUnderRoot(this.root, "artifacts", "meta");
  }

  private blobDir(): string {
    return resolveUnderRoot(this.root, "artifacts", "blobs");
  }

  private metaPath(artifact_id: string): string {
    return resolveUnderRoot(this.root, "artifacts", "meta", `${requireId("artifact", artifact_id)}.json`);
  }

  private blobPath(sha256: string): string {
    if (!isSha256(sha256)) throw new Error("invalid_content_hash");
    return resolveUnderRoot(this.root, "artifacts", "blobs", sha256.slice(0, 2), sha256);
  }

  async put(input: { work_id: string; bytes: Uint8Array; media_type: string; origin: Artifact["origin"] }): Promise<Artifact> {
    requireId("work", input.work_id);
    if (input.origin.task_id !== undefined) requireId("task", input.origin.task_id);
    if (input.origin.execution_id !== undefined) requireId("execution", input.origin.execution_id);
    if (input.bytes.byteLength > this.maxBytes) {
      throw new Error(`artifact_too_large:${input.bytes.byteLength}`);
    }
    const hash = sha256Bytes(input.bytes);
    let v37_artifact_id: string | undefined;
    let locator: string | undefined;

    discardTmpFiles(this.blobDir());

    if (this.v37) {
      const tmp = join(tmpdir(), `v4-art-${randomUUID()}`);
      writeFileSync(tmp, input.bytes);
      try {
        const rec = await this.v37.putLocalFile({
          filePath: tmp,
          content_type: input.media_type,
          origin_worker_node_id: this.originWorkerNodeId,
          origin_task_id: input.origin.task_id,
          project_ids: [input.work_id],
          allow_cross_project: false,
        });
        if (rec.content_hash_sha256 !== hash) {
          throw new Error("v37_hash_mismatch");
        }
        v37_artifact_id = rec.artifact_id;
        locator = rec.artifact_id;
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          // tmp cleanup is best-effort
        }
      }
    } else {
      const dest = this.blobPath(hash);
      ensureDir(dirname(dest));
      if (!existsSync(dest)) {
        atomicWriteFsync(dest, input.bytes);
      }
      const onDisk = sha256Bytes(new Uint8Array(readFileSync(dest)));
      if (onDisk !== hash) {
        try {
          unlinkSync(dest);
        } catch {
          // discard mismatch
        }
        throw new Error("blob_hash_mismatch");
      }
    }

    const artifact_id = `art_${randomUUID()}`;
    const artifact: Artifact = {
      kind: "Artifact",
      schema_version: ARTIFACT_SCHEMA_VERSION,
      tenant_id: DEFAULT_TENANT_ID,
      artifact_id,
      work_id: input.work_id,
      content: {
        sha256: hash,
        size_bytes: input.bytes.byteLength,
        media_type: input.media_type,
        locator,
      },
      origin: input.origin,
      access: { classification: "INTERNAL", project_ids: [input.work_id] },
      retention: { policy: "WORK_LIFETIME" },
      integrity_status: "VERIFIED",
      created_at: this.clock(),
      ...(v37_artifact_id ? { v37_artifact_id } : {}),
    };
    const validation = validateArtifact(artifact);
    if (!validation.valid) {
      throw new Error(`invalid_artifact:${validation.issues.map((i) => i.code).join(",")}`);
    }
    atomicWriteFsync(this.metaPath(artifact_id), JSON.stringify(artifact));
    return artifact;
  }

  async get(artifact_id: string): Promise<Artifact | undefined> {
    if (!isValidId("artifact", artifact_id)) return undefined;
    const p = this.metaPath(artifact_id);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as Artifact;
  }

  async verify(ref: ContentRef): Promise<"VERIFIED" | "MISMATCH" | "MISSING"> {
    if (!isSha256(ref.sha256)) return "MISSING";
    if (this.v37 && ref.locator) {
      try {
        const rec = this.v37.verify(ref.locator);
        const mapped = mapIntegrity(rec.integrity_status);
        if (rec.content_hash_sha256 !== ref.sha256) return "MISMATCH";
        return mapped === "VERIFIED" ? "VERIFIED" : mapped === "MISMATCH" ? "MISMATCH" : "MISSING";
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not_found")) return "MISSING";
        if (msg.includes("mismatch")) return "MISMATCH";
        return "MISSING";
      }
    }
    const p = this.blobPath(ref.sha256);
    if (!existsSync(p)) return "MISSING";
    const hash = sha256Bytes(new Uint8Array(readFileSync(p)));
    return hash === ref.sha256 ? "VERIFIED" : "MISMATCH";
  }

  async listMeta(): Promise<Artifact[]> {
    const dir = this.metaDir();
    if (!existsSync(dir)) return [];
    const out: Artifact[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      if (!isValidId("artifact", id)) continue;
      const art = await this.get(id);
      if (art) out.push(art);
    }
    return out;
  }
}
