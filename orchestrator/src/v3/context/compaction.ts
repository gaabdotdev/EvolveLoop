/**
 * Context View compaction + gated reinject (V3).
 * Only operates on disposable views — never deletes Goal/Evidence/Events/Checkpoints.
 * Reuses extractive line rules; reinject requires fidelity PASS.
 */

import { condenseExtractive } from "../../context/extractive-condenser.js";
import type { ContextView, ContextViewSection } from "./types.js";

export type FidelityStatus = "PASS" | "FAIL";

export interface CompactionLossCriteria {
  /** Minimum fraction of must-keep anchors that must remain (0..1). */
  min_anchor_fidelity: number;
  /** Acceptable: dropping unlabeled prose / omitted sections already marked. */
  acceptable_loss: string[];
  /** Forbidden: losing criterion ids, task ids, negations, paths in must-keep. */
  must_preserve: string[];
}

export const DEFAULT_LOSS_CRITERIA: CompactionLossCriteria = {
  min_anchor_fidelity: 1.0,
  acceptable_loss: [
    "redundant_prose_outside_labeled_lines",
    "empty_lines",
    "omitted_sections_already_declared",
  ],
  must_preserve: [
    "criterion_ids",
    "task_ids",
    "agent_ids",
    "negations",
    "path_citations",
    "goal_contract_id",
  ],
};

export interface CompactedContextView {
  kind: "CompactedContextView";
  source: ContextView;
  compact_text: string;
  lines_before: number;
  lines_after: number;
  lines_dropped: number;
  must_keep: string[];
  missing_must_keep: string[];
  fidelity: number;
  fidelity_status: FidelityStatus;
  loss_criteria: CompactionLossCriteria;
  reinject_allowed: boolean;
  limitations: string[];
  generated_at: string;
}

export interface ReinjectResult {
  kind: "ReinjectResult";
  allowed: boolean;
  reason: string;
  /** Working context text only — never a mutation of canonical stores. */
  working_context?: string;
  compacted?: CompactedContextView;
}

function collectMustKeep(view: ContextView): string[] {
  const keep = new Set<string>();
  keep.add(view.work_id);
  for (const gap of view.gaps) {
    if (/\b(?:not|never|NOT_|GAP|n[aã]o)\b/i.test(gap)) keep.add(gap.slice(0, 120));
  }
  for (const section of view.sections) {
    if (!section.included) continue;
    walkCollect(section.content, keep);
  }
  return [...keep].filter((s) => s.length > 0);
}

function walkCollect(value: unknown, keep: Set<string>, key?: string): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (
      key === "id" ||
      key === "task_id" ||
      key === "agent_id" ||
      key === "goal_contract_id" ||
      key === "criterion_id" ||
      key?.endsWith("_id")
    ) {
      keep.add(value);
    }
    if (/\/[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/.test(value)) keep.add(value);
    if (/\b(?:must not|never|n[aã]o|NOT_IMPLEMENTED|do not)\b/i.test(value)) keep.add(value.slice(0, 160));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkCollect(item, keep);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "id" && typeof v === "string") keep.add(v);
      walkCollect(v, keep, k);
    }
  }
}

function viewToText(view: ContextView): string {
  const lines: string[] = [
    `work_id: ${view.work_id}`,
    `role: ${view.role}`,
    `agent_id: ${view.agent_id ?? ""}`,
    "requirement: preserve criterion and task identifiers",
  ];
  for (const s of view.sections) {
    if (!s.included) {
      lines.push(`omitted_section: ${s.id} reason=${s.reason ?? ""}`);
      continue;
    }
    lines.push(`# section ${s.id} — ${s.title}`);
    lines.push(JSON.stringify(s.content, null, 2));
  }
  for (const o of view.omitted) {
    lines.push(`restriction: omitted ${o.id} — ${o.reason}`);
  }
  for (const g of view.gaps) {
    lines.push(`restriction: GAP ${g}`);
  }
  return lines.join("\n");
}

export function compactContextView(
  view: ContextView,
  criteria: CompactionLossCriteria = DEFAULT_LOSS_CRITERIA,
): CompactedContextView {
  const mustKeep = collectMustKeep(view);
  const before = viewToText(view);
  const condensed = condenseExtractive({ text: before, mustKeep }, true);
  const fidelity =
    mustKeep.length === 0
      ? 1
      : (mustKeep.length - condensed.missing_must_keep.length) / mustKeep.length;
  const fidelity_status: FidelityStatus =
    fidelity >= criteria.min_anchor_fidelity && condensed.missing_must_keep.length === 0
      ? "PASS"
      : "FAIL";

  return {
    kind: "CompactedContextView",
    source: view,
    compact_text: condensed.after_text,
    lines_before: condensed.lines_before,
    lines_after: condensed.lines_kept,
    lines_dropped: condensed.lines_dropped,
    must_keep: mustKeep,
    missing_must_keep: condensed.missing_must_keep,
    fidelity,
    fidelity_status,
    loss_criteria: criteria,
    reinject_allowed: fidelity_status === "PASS",
    limitations: [
      "Compacts disposable ContextView text only — canonical stores untouched",
      "Reinject means returning working_context string, not rewriting Goal/Evidence/Events",
      "V22 product-wide compaction-contract remains separate (ADR-0013 / ADR-DR-0005)",
      "Token counts not invented — line metrics only unless tokenizer measured separately",
    ],
    generated_at: new Date().toISOString(),
  };
}

/**
 * Reinject compacted working context only when fidelity PASS.
 * Does not mutate --data-dir canonical artefacts.
 */
export function reinjectCompactedView(compacted: CompactedContextView): ReinjectResult {
  if (compacted.fidelity_status !== "PASS" || !compacted.reinject_allowed) {
    return {
      kind: "ReinjectResult",
      allowed: false,
      reason: `fidelity_${compacted.fidelity_status.toLowerCase()}_reinject_denied`,
      compacted,
    };
  }
  return {
    kind: "ReinjectResult",
    allowed: true,
    reason: "fidelity_pass_disposable_working_context",
    working_context: compacted.compact_text,
    compacted,
  };
}

/** Drop bulky section content when already summarized — used by optional structural slim. */
export function slimSections(
  sections: ContextViewSection[],
  keepIds: Set<string>,
): { kept: ContextViewSection[]; dropped: string[] } {
  const kept: ContextViewSection[] = [];
  const dropped: string[] = [];
  for (const s of sections) {
    if (keepIds.has(s.id) || s.id.startsWith("goal_")) {
      kept.push(s);
    } else {
      dropped.push(s.id);
      kept.push({
        ...s,
        included: false,
        reason: "slimmed_in_compaction",
        content: { slimmed: true, keys: Object.keys(s.content) },
      });
    }
  }
  return { kept, dropped };
}
