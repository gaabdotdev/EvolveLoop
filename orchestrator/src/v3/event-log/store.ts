/**
 * Durable append-only coordination event log (V3).
 * Distinct from in-memory EventBus per Capability IR run.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CoordinationEvent {
  ts: string;
  work_id: string;
  type: string;
  actor?: string;
  payload?: Record<string, unknown>;
}

export class CoordinationEventLog {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.rootDir, `${workId}.jsonl`);
  }

  append(event: Omit<CoordinationEvent, "ts"> & { ts?: string }): CoordinationEvent {
    const full: CoordinationEvent = {
      ...event,
      ts: event.ts ?? new Date().toISOString(),
    };
    appendFileSync(this.pathFor(event.work_id), JSON.stringify(full) + "\n", "utf-8");
    return full;
  }

  read(workId: string): CoordinationEvent[] {
    const path = this.pathFor(workId);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CoordinationEvent);
  }
}
