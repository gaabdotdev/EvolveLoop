/**
 * Artifact Fabric — content-addressed storage with hash verification.
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import type { FabricDataPaths } from "../paths.js";
import type { ArtifactRecord, InventoryProvenance } from "../types.js";

export class ArtifactFabric {
  constructor(private readonly paths: FabricDataPaths) {
    mkdirSync(this.paths.artifactBlobDir, { recursive: true });
  }

  private metaPath(id: string): string {
    return join(this.paths.artifactsDir, `${id}.json`);
  }

  private blobPath(hash: string): string {
    return join(this.paths.artifactBlobDir, hash.slice(0, 2), hash);
  }

  get(artifactId: string): ArtifactRecord | undefined {
    const p = this.metaPath(artifactId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as ArtifactRecord;
  }

  async putLocalFile(input: {
    filePath: string;
    content_type: string;
    origin_worker_node_id: string;
    origin_task_id?: string;
    origin_agent_id?: string;
    project_ids: string[];
    allow_cross_project?: boolean;
    provenance?: InventoryProvenance;
  }): Promise<ArtifactRecord> {
    const hash = await sha256File(input.filePath);
    const size = statSync(input.filePath).size;
    const dest = this.blobPath(hash);
    mkdirSync(join(dest, ".."), { recursive: true });
    if (!existsSync(dest)) {
      await pipeline(createReadStream(input.filePath), createWriteStream(dest));
    }
    const rec: ArtifactRecord = {
      kind: "ArtifactRecord",
      artifact_id: `art_${randomUUID()}`,
      content_hash_sha256: hash,
      size_bytes: size,
      content_type: input.content_type,
      origin_worker_node_id: input.origin_worker_node_id,
      origin_task_id: input.origin_task_id,
      origin_agent_id: input.origin_agent_id,
      provenance: input.provenance ?? "OBSERVED",
      access_policy: {
        project_ids: input.project_ids,
        allow_cross_project: input.allow_cross_project ?? false,
      },
      created_at: nowIso(),
      transfer_state: "available",
      integrity_status: "verified",
      storage_path: dest,
    };
    atomicWriteJson(this.metaPath(rec.artifact_id), rec);
    return rec;
  }

  putBytes(input: {
    bytes: Buffer;
    content_type: string;
    origin_worker_node_id: string;
    origin_task_id?: string;
    project_ids: string[];
    allow_cross_project?: boolean;
  }): ArtifactRecord {
    const hash = createHash("sha256").update(input.bytes).digest("hex");
    const dest = this.blobPath(hash);
    mkdirSync(join(dest, ".."), { recursive: true });
    if (!existsSync(dest)) writeFileSync(dest, input.bytes);
    const rec: ArtifactRecord = {
      kind: "ArtifactRecord",
      artifact_id: `art_${randomUUID()}`,
      content_hash_sha256: hash,
      size_bytes: input.bytes.length,
      content_type: input.content_type,
      origin_worker_node_id: input.origin_worker_node_id,
      origin_task_id: input.origin_task_id,
      provenance: "OBSERVED",
      access_policy: {
        project_ids: input.project_ids,
        allow_cross_project: input.allow_cross_project ?? false,
      },
      created_at: nowIso(),
      transfer_state: "available",
      integrity_status: "verified",
      storage_path: dest,
    };
    atomicWriteJson(this.metaPath(rec.artifact_id), rec);
    return rec;
  }

  verify(artifactId: string): ArtifactRecord {
    const rec = this.get(artifactId);
    if (!rec || !rec.storage_path) throw new Error("artifact_not_found");
    const buf = readFileSync(rec.storage_path);
    const hash = createHash("sha256").update(buf).digest("hex");
    if (hash !== rec.content_hash_sha256) {
      rec.integrity_status = "mismatch";
      atomicWriteJson(this.metaPath(artifactId), rec);
      throw new Error("hash_mismatch");
    }
    rec.integrity_status = "verified";
    atomicWriteJson(this.metaPath(artifactId), rec);
    return rec;
  }

  authorizeRead(artifactId: string, projectId: string): boolean {
    const rec = this.get(artifactId);
    if (!rec) return false;
    if (rec.access_policy.allow_cross_project) return true;
    return rec.access_policy.project_ids.includes(projectId);
  }

  /** Chunked transfer helpers for protocol */
  readChunk(artifactId: string, offset: number, length: number): Buffer {
    const rec = this.get(artifactId);
    if (!rec?.storage_path) throw new Error("artifact_not_found");
    const fd = readFileSync(rec.storage_path);
    return fd.subarray(offset, offset + length);
  }
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(path);
    s.on("data", (c) => h.update(c));
    s.on("error", reject);
    s.on("end", () => resolve(h.digest("hex")));
  });
}
