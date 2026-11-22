import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { MeasurementDataPaths } from "./paths.js";
import type { MeasurementEvent } from "./types.js";
import { redactSecrets } from "../../evidence/secret-redaction.js";

export class MeasurementEventStore {
  constructor(private paths: MeasurementDataPaths) {}

  private runPath(runId: string): string {
    return join(this.paths.eventsDir, `${runId}.jsonl`);
  }

  append(runId: string, event: MeasurementEvent): void {
    mkdirSync(this.paths.eventsDir, { recursive: true });
    const line = redactSecrets(JSON.stringify(event), { redactSensitivePaths: true });
    appendFileSync(this.runPath(runId), `${line}\n`, "utf-8");
  }

  load(runId: string): MeasurementEvent[] {
    const path = this.runPath(runId);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MeasurementEvent);
  }

  listRunIds(): string[] {
    if (!existsSync(this.paths.eventsDir)) return [];
    return readdirSync(this.paths.eventsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(/\.jsonl$/, ""));
  }

  exportJsonl(runId: string): string {
    return this.load(runId)
      .map((e) => JSON.stringify(e))
      .join("\n");
  }

  query(opts: {
    run_id?: string;
    event_name?: string;
    agent_id?: string;
    task_id?: string;
    experiment_id?: string;
    since?: string;
    until?: string;
  }): MeasurementEvent[] {
    const runs = opts.run_id ? [opts.run_id] : this.listRunIds();
    const out: MeasurementEvent[] = [];
    for (const runId of runs) {
      for (const e of this.load(runId)) {
        if (opts.event_name && e.event_name !== opts.event_name) continue;
        if (opts.agent_id && e.correlation.agent_id !== opts.agent_id) continue;
        if (opts.task_id && e.correlation.task_id !== opts.task_id) continue;
        if (opts.experiment_id && e.correlation.experiment_id !== opts.experiment_id) continue;
        if (opts.since && e.occurred_at < opts.since) continue;
        if (opts.until && e.occurred_at > opts.until) continue;
        out.push(e);
      }
    }
    return out;
  }
}

export class ArtifactStore {
  constructor(private paths: MeasurementDataPaths) {}

  put(content: string | Buffer, meta: Record<string, unknown> = {}): { artifact_id: string; hash: string; path: string } {
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const hash = createHash("sha256").update(buf).digest("hex");
    const artifact_id = `art_${hash.slice(0, 16)}`;
    const dir = join(this.paths.artifactsDir, artifact_id);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "content.bin");
    writeFileSync(path, buf);
    writeFileSync(
      join(dir, "meta.json"),
      redactSecrets(JSON.stringify({ artifact_id, hash, size: buf.length, ...meta }, null, 2)),
      "utf-8",
    );
    return { artifact_id, hash, path };
  }

  getMeta(artifactId: string): Record<string, unknown> | null {
    const metaPath = join(this.paths.artifactsDir, artifactId, "meta.json");
    if (!existsSync(metaPath)) return null;
    return JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
  }
}
