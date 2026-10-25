import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../types/index.js";
import type { EventBus } from "../events/event-bus.js";
import { assertPathConfined } from "../knowledge/uks/storage-core.js";

export function assertFeatureIdConfined(featureId: string): string {
  if (!featureId || typeof featureId !== "string") {
    throw new Error("SECURITY_PATH_TRAVERSAL_VIOLATION: Invalid featureId: empty or non-string");
  }
  if (featureId.includes("..") || featureId.includes("/") || featureId.includes("\\") || /[\0\r\n\t]/.test(featureId)) {
    throw new Error(`SECURITY_PATH_TRAVERSAL_VIOLATION: Illegal traversal characters in featureId: '${featureId}'`);
  }
  return featureId;
}

export class JsonlEventPersister {
  constructor(private eventsDir: string) {}

  pathFor(featureId: string): string {
    assertFeatureIdConfined(featureId);
    const target = join(this.eventsDir, `${featureId}.jsonl`);
    assertPathConfined(target, this.eventsDir);
    return target;
  }

  append(event: EventEnvelope): void {
    mkdirSync(this.eventsDir, { recursive: true });
    appendFileSync(this.pathFor(event.feature_id), `${JSON.stringify(event)}\n`, "utf-8");
  }

  attach(bus: EventBus, featureId: string): () => void {
    assertFeatureIdConfined(featureId);
    return bus.onEvent((event) => {
      if (event.feature_id === featureId) this.append(event);
    });
  }

  load(featureId: string): EventEnvelope[] {
    const path = this.pathFor(featureId);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EventEnvelope);
  }
}
