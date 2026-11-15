import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkEventStream } from "../../../src/v4/contracts/index.js";
import { CRASH_ORACLE, workPath } from "../../../src/v4/ledger/index.js";
import { recoverWork } from "../../../src/v4/checkpoint/index.js";
import { gcOrphanArtifacts, hashesFromEvents } from "../../../src/v4/artifacts/index.js";
import { EFFECT, TASK, WORK, draft, runtime, workCreated } from "./helpers.js";
import { putAndRegisterArtifact } from "../../../src/v4/ledger/runtime.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M02 crash recovery — confirmed progress (ADR-V4-0004)", () => {
  it("documents the crash oracle", () => {
    expect(CRASH_ORACLE.crash_after_event_before_projection.confirmed_progress).toBe("preserved");
    expect(CRASH_ORACLE.crash_during_event_batch.confirmed_progress).toBe("preserved");
    expect(CRASH_ORACLE.crash_after_artifact_put_before_event.leftover).toMatch(/orphan/);
  });

  it("rebuilds projection from the log after dropping the cache", async () => {
    const opened = runtime();
    roots.push(opened.root);
    const { ledger } = opened.rt;
    await ledger.append(WORK, [workCreated(), draft("task.planned", { task_id: TASK, state: "PENDING" })], {
      expected_head_seq: 0,
    });
    ledger.dropProjectionCache(WORK);
    const rebuilt = await ledger.rebuildProjection(WORK);
    expect(rebuilt.event_seq).toBe(2);
    expect(rebuilt.task_states).toEqual([{ task_id: TASK, state: "PENDING" }]);
    const events = await ledger.read(WORK);
    expect(checkEventStream(events)).toEqual([]);
    expect(rebuilt.event_seq).toBe(events[events.length - 1].seq);
  });

  it("ignores torn tmp files and keeps the committed jsonl (all-or-nothing batch)", async () => {
    const opened = runtime();
    roots.push(opened.root);
    const { ledger } = opened.rt;
    await ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const dir = workPath(opened.root, WORK);
    writeFileSync(join(dir, "events.jsonl.999.tmp"), "{this is not committed\n");
    const events = await ledger.read(WORK);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("work.created");
    expect(readdirSync(dir).some((n) => n.endsWith(".tmp"))).toBe(false);
  });

  it("leaves an orphan blob when put completes before artifact.registered, then GC collects it", async () => {
    const opened = runtime();
    roots.push(opened.root);
    await opened.rt.ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const orphan = await opened.rt.artifacts.put({
      work_id: WORK,
      bytes: new Uint8Array([1, 2, 3]),
      media_type: "application/octet-stream",
      origin: {},
    });
    const events = await opened.rt.ledger.read(WORK);
    expect(events.some((e) => e.type === "artifact.registered")).toBe(false);
    const cited = hashesFromEvents(events);
    expect(cited.has(orphan.content.sha256)).toBe(false);
    const report = await gcOrphanArtifacts(opened.rt.artifacts, opened.root, cited);
    expect(report.removed_blobs).toContain(orphan.content.sha256);
    expect(await opened.rt.artifacts.verify({ sha256: orphan.content.sha256 })).toBe("MISSING");
  });

  it("discards incomplete blobs from a crash during put", async () => {
    const opened = runtime();
    roots.push(opened.root);
    const shard = join(opened.root, "artifacts", "blobs", "aa");
    mkdirSync(shard, { recursive: true });
    writeFileSync(join(shard, "partial.tmp"), "not a real blob");
    const report = await gcOrphanArtifacts(opened.rt.artifacts, opened.root, new Set());
    expect(report.removed_blobs).toContain("partial.tmp");
    expect(existsSync(join(shard, "partial.tmp"))).toBe(false);
  });

  it("write-then-reference never cites a missing hash", async () => {
    const opened = runtime();
    roots.push(opened.root);
    await opened.rt.ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const { artifact, outcome } = await putAndRegisterArtifact(opened.rt, {
      work_id: WORK,
      bytes: new TextEncoder().encode("hello"),
      media_type: "text/plain",
      origin: {},
    });
    expect(outcome.status).toBe("APPENDED");
    expect(await opened.rt.artifacts.verify({ sha256: artifact.content.sha256 })).toBe("VERIFIED");
    const events = await opened.rt.ledger.read(WORK);
    const registered = events.find((e) => e.type === "artifact.registered");
    expect(registered).toBeDefined();
    const sha = (registered!.payload.content as { sha256: string }).sha256;
    expect(sha).toBe(artifact.content.sha256);
    expect(await opened.rt.artifacts.verify({ sha256: sha })).toBe("VERIFIED");
  });

  it("recovers VERIFIED checkpoint state without context_hint (INV-CKPT-02)", async () => {
    const opened = runtime();
    roots.push(opened.root);
    await opened.rt.ledger.append(
      WORK,
      [
        workCreated(),
        draft("task.planned", { task_id: TASK, state: "PENDING" }),
        draft("effect.planned", { effect_id: EFFECT, state: "PLANNED" }),
      ],
      { expected_head_seq: 0 },
    );
    const ckpt = await opened.rt.checkpoints.create(WORK, 3);
    expect(ckpt.consistency).toBe("VERIFIED");
    expect(ckpt.context_hint).toBeUndefined();
    const recovered = await recoverWork({
      work_id: WORK,
      ledger: opened.rt.ledger,
      checkpoints: opened.rt.checkpoints,
      tombstones: opened.rt.tombstones,
    });
    expect(recovered.recovered_without_context_hint).toBe(true);
    expect(recovered.checkpoint?.checkpoint_id).toBe(ckpt.checkpoint_id);
    expect(recovered.checkpoint && "context_hint" in recovered.checkpoint && recovered.checkpoint.context_hint).toBeFalsy();
    expect(recovered.projection.task_states).toEqual([{ task_id: TASK, state: "PENDING" }]);
    expect(recovered.stream_issues).toEqual([]);
  });
});
