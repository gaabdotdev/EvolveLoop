/**
 * Projection snapshot persistence. This is NOT the Event Ledger (M02) and is
 * NOT conversation memory. It lets Work be queried after the agent session ends.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkSnapshot } from "./repository.js";

export async function writeWorkSnapshot(path: string, snapshot: WorkSnapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(snapshot), "utf8");
}

export async function readWorkSnapshot(path: string): Promise<WorkSnapshot> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as WorkSnapshot;
}
