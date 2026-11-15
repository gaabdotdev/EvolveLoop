/**
 * Orphan blob GC (ADR-V4-0004): crash between put and artifact.registered
 * leaves a blob that no event cites. GC deletes blobs (and meta) that are
 * not referenced by any provided content hash set.
 */

import { existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { isSha256, isValidId } from "../contracts/common.js";
import { resolveUnderRoot } from "../ledger/persistence.js";
import type { FileArtifactStore } from "./artifact-store.js";

export interface GcReport {
  removed_blobs: string[];
  removed_meta: string[];
}

export async function gcOrphanArtifacts(
  store: FileArtifactStore,
  root: string,
  referencedHashes: ReadonlySet<string>,
): Promise<GcReport> {
  const report: GcReport = { removed_blobs: [], removed_meta: [] };
  const blobRoot = resolveUnderRoot(root, "artifacts", "blobs");
  const metaRoot = resolveUnderRoot(root, "artifacts", "meta");

  if (existsSync(blobRoot)) {
    for (const shard of readdirSync(blobRoot)) {
      const shardDir = join(blobRoot, shard);
      for (const name of readdirSync(shardDir)) {
        const blobName: string = name;
        if (blobName.endsWith(".tmp")) {
          unlinkSync(join(shardDir, blobName));
          report.removed_blobs.push(blobName);
          continue;
        }
        if (!isSha256(blobName)) continue;
        if (!referencedHashes.has(blobName)) {
          rmSync(join(shardDir, blobName), { force: true });
          report.removed_blobs.push(blobName);
        }
      }
    }
  }

  if (existsSync(metaRoot)) {
    const metas = await store.listMeta();
    for (const art of metas) {
      if (!isValidId("artifact", art.artifact_id)) continue;
      if (!referencedHashes.has(art.content.sha256)) {
        unlinkSync(join(metaRoot, `${art.artifact_id}.json`));
        report.removed_meta.push(art.artifact_id);
      }
    }
  }

  return report;
}

/** Collect sha256 hashes cited by artifact.registered events. */
export function hashesFromEvents(events: readonly { type: string; payload: Record<string, unknown> }[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.type !== "artifact.registered") continue;
    const content = e.payload.content;
    if (content && typeof content === "object" && "sha256" in content && isSha256((content as { sha256: unknown }).sha256)) {
      out.add((content as { sha256: string }).sha256);
    }
  }
  return out;
}
