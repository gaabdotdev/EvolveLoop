/**
 * Resolve the active KnowledgeBackend.
 * 
 * Production default in EvolveLoop V2.5: UKS Core ("uks") (Phase 10 Cutover).
 * 
 * Contingency / Rollback Triggers:
 * - EVOLVELOOP_UKS_DISABLED === "1": Reverts automatically to legacy "wiki" backend.
 * - EVOLVELOOP_UKS_SHADOW === "1": Runs UKS in parallel with primary (Shadow Mode).
 * - KNOWLEDGE_BACKEND=fake: Test-only backend.
 * - KNOWLEDGE_BACKEND=wiki: Explicit legacy wiki selection.
 */

import { FakeKnowledgeBackend } from "./fake-backend.js";
import { WikiKnowledgeBackend } from "./wiki-backend.js";
import { UKSKnowledgeBackend } from "./uks-backend.js";
import { ShadowKnowledgeBackend } from "./shadow-backend.js";
import type { KnowledgeBackend } from "./types.js";

let cached: KnowledgeBackend | null = null;
let cachedKey: string | null = null;

/** Clear cache (tests). */
export function resetKnowledgeBackendCache(): void {
  cached = null;
  cachedKey = null;
}

export function resolveKnowledgeBackend(options?: {
  /** Force backend id (tests). */
  backendId?: string;
  /** Inject instance (tests). */
  instance?: KnowledgeBackend;
  /** Workspace root path */
  workspaceRoot?: string;
}): KnowledgeBackend {
  if (options?.instance) return options.instance;

  const isUksDisabled = process.env.EVOLVELOOP_UKS_DISABLED === "1";
  const isShadowMode = process.env.EVOLVELOOP_UKS_SHADOW === "1";
  const envBackend = (process.env.KNOWLEDGE_BACKEND || "").toLowerCase();

  // If UKS is explicitly disabled by rollback trigger, force wiki unless fake requested
  let targetId: string;
  if (options?.backendId) {
    targetId = options.backendId.toLowerCase();
  } else if (isUksDisabled) {
    targetId = envBackend === "fake" ? "fake" : "wiki";
  } else if (envBackend) {
    targetId = envBackend;
  } else {
    // V2.5 Canonical Production Default: UKS Core!
    targetId = "uks";
  }

  const cacheKey = `${targetId}:disabled=${isUksDisabled}:shadow=${isShadowMode}`;
  if (cached && cachedKey === cacheKey) return cached;

  let finalBackend: KnowledgeBackend;

  if (isShadowMode && targetId !== "shadow") {
    // In shadow mode, primary is legacy wiki (or fake if requested), shadow is UKS
    const primary = targetId === "fake" ? new FakeKnowledgeBackend() : new WikiKnowledgeBackend();
    const shadow = new UKSKnowledgeBackend({ workspaceRoot: options?.workspaceRoot });
    finalBackend = new ShadowKnowledgeBackend({
      primary,
      shadow,
      workspaceRoot: options?.workspaceRoot
    });
  } else {
    switch (targetId) {
      case "shadow": {
        const primary = isUksDisabled ? new WikiKnowledgeBackend() : new FakeKnowledgeBackend();
        const shadow = new UKSKnowledgeBackend({ workspaceRoot: options?.workspaceRoot });
        finalBackend = new ShadowKnowledgeBackend({
          primary,
          shadow,
          workspaceRoot: options?.workspaceRoot
        });
        break;
      }
      case "fake":
        finalBackend = new FakeKnowledgeBackend();
        break;
      case "wiki":
        finalBackend = new WikiKnowledgeBackend();
        break;
      case "uks":
      default:
        if (isUksDisabled) {
          finalBackend = new WikiKnowledgeBackend();
        } else {
          finalBackend = new UKSKnowledgeBackend({ workspaceRoot: options?.workspaceRoot });
        }
        break;
    }
  }

  cached = finalBackend;
  cachedKey = cacheKey;
  return finalBackend;
}
