/**
 * Anti-replay / single-use store (ADR-V4-0006, TM-V4-D03).
 *
 * Freeze R3: ExecutionCapsule 1.0.0 has no replay_id field. Tokens live here,
 * keyed by capsule_id, never as a filesystem path component of a grant/lease id.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isValidId, type IsoTimestamp } from "../contracts/index.js";
import { CONTINUITY_ERROR, ContinuityError } from "./errors.js";
import { replayIdFor } from "./ids.js";

export interface ReplayRecord {
  replay_id: string;
  capsule_id: string;
  work_id: string;
  consumed_at: IsoTimestamp;
}

export interface ReplayStore {
  consume(input: { capsule_id: string; work_id: string; now: IsoTimestamp }): Promise<ReplayRecord>;
  peek(capsule_id: string): Promise<ReplayRecord | undefined>;
}

function assertWork(work_id: string): string {
  if (!isValidId("work", work_id)) {
    throw new ContinuityError(CONTINUITY_ERROR.ACCEPT_FAILED, "replay store refused work_id", { work_id });
  }
  return work_id;
}

function assertCapsule(capsule_id: string): string {
  if (!isValidId("capsule", capsule_id)) {
    throw new ContinuityError(CONTINUITY_ERROR.ACCEPT_FAILED, "replay store refused capsule_id", { capsule_id });
  }
  return capsule_id;
}

export class InMemoryReplayStore implements ReplayStore {
  private readonly byCapsule = new Map<string, ReplayRecord>();

  async consume(input: { capsule_id: string; work_id: string; now: IsoTimestamp }): Promise<ReplayRecord> {
    const capsule_id = assertCapsule(input.capsule_id);
    const work_id = assertWork(input.work_id);
    if (this.byCapsule.has(capsule_id)) {
      throw new ContinuityError(CONTINUITY_ERROR.REPLAY_REUSED, "capsule replay_id already consumed", {
        capsule_id,
        replay_id: replayIdFor(capsule_id),
      });
    }
    const rec: ReplayRecord = {
      replay_id: replayIdFor(capsule_id),
      capsule_id,
      work_id,
      consumed_at: input.now,
    };
    this.byCapsule.set(capsule_id, rec);
    return rec;
  }

  async peek(capsule_id: string): Promise<ReplayRecord | undefined> {
    return this.byCapsule.get(capsule_id);
  }
}

/**
 * Durable per-work jsonl. Filename is work_id (catalog path-safe). capsule_id is
 * an opaque field inside the record (same posture as grant_ref in M02 tombstones).
 */
export class FileReplayStore implements ReplayStore {
  constructor(private readonly root: string) {
    mkdirSync(this.dir(), { recursive: true });
  }

  private dir(): string {
    return resolve(this.root, "continuity-replay");
  }

  private file(work_id: string): string {
    const safe = assertWork(work_id);
    const p = resolve(this.dir(), `${safe}.jsonl`);
    if (!p.startsWith(this.dir() + sep) && p !== this.dir()) {
      throw new ContinuityError(CONTINUITY_ERROR.ACCEPT_FAILED, "replay path escaped root", { work_id });
    }
    return p;
  }

  private load(work_id: string): ReplayRecord[] {
    const p = this.file(work_id);
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as ReplayRecord);
  }

  async peek(capsule_id: string): Promise<ReplayRecord | undefined> {
    assertCapsule(capsule_id);
    // Scan work files — capsule ids are unique; we never interpolate capsule_id into a path.
    if (!existsSync(this.dir())) return undefined;
    for (const name of readdirSync(this.dir())) {
      if (!name.endsWith(".jsonl")) continue;
      const work_id = name.slice(0, -".jsonl".length);
      if (!isValidId("work", work_id)) continue;
      const hit = this.load(work_id).find((r) => r.capsule_id === capsule_id);
      if (hit) return hit;
    }
    return undefined;
  }

  async consume(input: { capsule_id: string; work_id: string; now: IsoTimestamp }): Promise<ReplayRecord> {
    const capsule_id = assertCapsule(input.capsule_id);
    const work_id = assertWork(input.work_id);
    const existing = this.load(work_id);
    if (existing.some((r) => r.capsule_id === capsule_id)) {
      throw new ContinuityError(CONTINUITY_ERROR.REPLAY_REUSED, "capsule replay_id already consumed", {
        capsule_id,
        replay_id: replayIdFor(capsule_id),
      });
    }
    const rec: ReplayRecord = {
      replay_id: replayIdFor(capsule_id),
      capsule_id,
      work_id,
      consumed_at: input.now,
    };
    const p = this.file(work_id);
    mkdirSync(dirname(p), { recursive: true });
    const body = existing.concat(rec).map((r) => JSON.stringify(r)).join("\n") + "\n";
    const tmp = join(dirname(p), `.${work_id}.jsonl.tmp`);
    writeFileSync(tmp, body, { flag: "w" });
    renameSync(tmp, p);
    return rec;
  }
}
