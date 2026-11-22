/**
 * V5-M03 — Model selection by scope with documented precedence.
 * Precedence: work > workspace (never silent).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ModelPreference,
  ModelSelectionResolved,
  ModelSelectionScope,
  ScopedModelPreference,
  SelectionStoreSnapshot,
} from "./types.js";

export class ModelSelectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ModelSelectionError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export interface ResolveModelSelectionInput {
  /** When set, work preference overrides workspace. */
  work_id?: string;
}

/**
 * Documented precedence (V5-M03):
 * 1. work (if work_id provided and preference exists)
 * 2. workspace
 *
 * Missing both → error with explicit reason (not a silent default provider).
 */
export const MODEL_SELECTION_PRECEDENCE: readonly ModelSelectionScope[] = [
  "work",
  "workspace",
] as const;

export class ModelSelectionStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "selection.json");
  }

  load(): SelectionStoreSnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "ModelSelectionStore",
        version: 0,
        updated_at: nowIso(),
        works: {},
      };
    }
    const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as SelectionStoreSnapshot;
    if (parsed.kind !== "ModelSelectionStore") {
      throw new ModelSelectionError("INVALID", this.path);
    }
    return parsed;
  }

  private save(snap: SelectionStoreSnapshot): void {
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
  }

  setPreference(
    scope: ModelSelectionScope,
    preference: ModelPreference,
    opts?: { work_id?: string },
  ): SelectionStoreSnapshot {
    const snap = this.load();
    const entry: ScopedModelPreference = {
      scope,
      work_id: opts?.work_id,
      preference,
      updated_at: nowIso(),
    };
    if (scope === "workspace") {
      snap.workspace = entry;
    } else {
      if (!opts?.work_id) {
        throw new ModelSelectionError("WORK_ID_REQUIRED", "work scope requires work_id");
      }
      entry.work_id = opts.work_id;
      snap.works[opts.work_id] = entry;
    }
    snap.version += 1;
    snap.updated_at = nowIso();
    this.save(snap);
    return snap;
  }

  /**
   * Resolve preference with explicit reasons.
   * Precedence: work > workspace.
   */
  resolveModelSelection(input: ResolveModelSelectionInput = {}): ModelSelectionResolved {
    const snap = this.load();
    const reasons: string[] = [
      "precedence=work>workspace",
    ];

    if (input.work_id) {
      const workPref = snap.works[input.work_id];
      if (workPref) {
        reasons.push(
          `work_id=${input.work_id} preference found provider=${workPref.preference.provider_id}`,
        );
        reasons.push("resolved_from=work (overrides workspace)");
        return {
          kind: "ModelSelectionResolved",
          preference: { ...workPref.preference },
          resolved_from: "work",
          reasons,
        };
      }
      reasons.push(`work_id=${input.work_id} preference absent — fall through to workspace`);
    } else {
      reasons.push("work_id not provided — skip work scope");
    }

    if (snap.workspace) {
      reasons.push(
        `workspace preference found provider=${snap.workspace.preference.provider_id}`,
      );
      reasons.push("resolved_from=workspace");
      return {
        kind: "ModelSelectionResolved",
        preference: { ...snap.workspace.preference },
        resolved_from: "workspace",
        reasons,
      };
    }

    reasons.push("no preference at work or workspace scopes");
    throw new ModelSelectionError(
      "NO_PREFERENCE",
      `NO_PREFERENCE: No model preference resolved (${reasons.join("; ")})`,
    );
  }
}

/** Functional alias matching the public API name from the M03 contract. */
export function resolveModelSelection(
  store: ModelSelectionStore,
  input?: ResolveModelSelectionInput,
): ModelSelectionResolved {
  return store.resolveModelSelection(input);
}
