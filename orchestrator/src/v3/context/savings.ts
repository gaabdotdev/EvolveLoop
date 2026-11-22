/**
 * Compaction savings measurement — never invents tokens.
 * Uses tiktoken when available; otherwise reports PROXY:whitespace_split + line metrics.
 */

import { countTokens, requireTiktokenCounts } from "../../context/tokenizer.js";
import type { CompactedContextView } from "./compaction.js";
import { compactContextView } from "./compaction.js";
import type { ContextView } from "./types.js";

export interface CompactionSavingsReport {
  kind: "CompactionSavingsReport";
  work_id: string;
  generated_at: string;
  fidelity_status: CompactedContextView["fidelity_status"];
  fidelity: number;
  lines_before: number;
  lines_after: number;
  lines_dropped: number;
  line_reduction_ratio: number;
  tokens_before: number | "NOT_MEASURED";
  tokens_after: number | "NOT_MEASURED";
  token_delta: number | "NOT_MEASURED";
  token_reduction_ratio: number | "NOT_MEASURED";
  tokenizer: string;
  tokenizer_status: "MEASURED" | "PROXY" | "UNAVAILABLE";
  reinject_allowed: boolean;
  savings_status: "PASS" | "LIMITED" | "NOT_MEASURED";
  limitations: string[];
}

function viewPlainText(view: ContextView): string {
  return JSON.stringify(view);
}

export function measureCompactionSavings(
  view: ContextView,
  opts?: { require_tiktoken?: boolean },
): CompactionSavingsReport {
  const compacted = compactContextView(view);
  const beforeText = viewPlainText(view);
  const afterText = compacted.compact_text;
  const line_reduction_ratio =
    compacted.lines_before === 0 ? 0 : compacted.lines_dropped / compacted.lines_before;

  let tokens_before: number | "NOT_MEASURED" = "NOT_MEASURED";
  let tokens_after: number | "NOT_MEASURED" = "NOT_MEASURED";
  let token_delta: number | "NOT_MEASURED" = "NOT_MEASURED";
  let token_reduction_ratio: number | "NOT_MEASURED" = "NOT_MEASURED";
  let tokenizer = "UNAVAILABLE";
  let tokenizer_status: CompactionSavingsReport["tokenizer_status"] = "UNAVAILABLE";
  const limitations = [
    ...compacted.limitations,
    "Token savings reported only when tokenizer measurement succeeds — never invented",
  ];

  try {
    if (opts?.require_tiktoken) {
      const [tb, ta] = requireTiktokenCounts([beforeText, afterText]);
      tokens_before = tb!;
      tokens_after = ta!;
      token_delta = tb! - ta!;
      token_reduction_ratio = tb === 0 ? 0 : token_delta / tb!;
      tokenizer = "tiktoken:cl100k_base";
      tokenizer_status = "MEASURED";
    } else {
      const before = countTokens(beforeText);
      const after = countTokens(afterText);
      tokens_before = before.tokens;
      tokens_after = after.tokens;
      token_delta = before.tokens - after.tokens;
      token_reduction_ratio = before.tokens === 0 ? 0 : token_delta / before.tokens;
      tokenizer = before.tokenizer;
      tokenizer_status = before.tokenizer.startsWith("tiktoken") ? "MEASURED" : "PROXY";
      if (tokenizer_status === "PROXY") {
        limitations.push("PROXY:whitespace_split is not product token accounting — mark LIMITED");
      }
    }
  } catch (err) {
    limitations.push(
      `tokenizer_unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    tokenizer_status = "UNAVAILABLE";
  }

  let savings_status: CompactionSavingsReport["savings_status"] = "NOT_MEASURED";
  if (compacted.fidelity_status !== "PASS") {
    savings_status = "NOT_MEASURED";
    limitations.push("fidelity FAIL → token savings not claimed");
  } else if (tokenizer_status === "MEASURED" && typeof token_delta === "number") {
    savings_status = token_delta >= 0 ? "PASS" : "LIMITED";
  } else if (tokenizer_status === "PROXY") {
    savings_status = "LIMITED";
  }

  return {
    kind: "CompactionSavingsReport",
    work_id: view.work_id,
    generated_at: new Date().toISOString(),
    fidelity_status: compacted.fidelity_status,
    fidelity: compacted.fidelity,
    lines_before: compacted.lines_before,
    lines_after: compacted.lines_after,
    lines_dropped: compacted.lines_dropped,
    line_reduction_ratio,
    tokens_before,
    tokens_after,
    token_delta,
    token_reduction_ratio,
    tokenizer,
    tokenizer_status,
    reinject_allowed: compacted.reinject_allowed,
    savings_status,
    limitations,
  };
}
