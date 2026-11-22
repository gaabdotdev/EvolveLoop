/**
 * V1-TOK-16 — Constrained decoding (GBNF / XGrammar) plumbing for local models.
 *
 * Request builder attaches grammar options when targeting layer 0.
 * Does not require a live Ollama/llama.cpp process.
 */

import type { ModelLayerId } from "./model-layers.js";
import type { ModelInvokeRequest } from "./types.js";

/** Grammar dialect supported by local runtimes. */
export type GrammarDialect = "gbnf" | "xgrammar" | "json_schema";

export interface ConstrainedGrammar {
  dialect: GrammarDialect;
  /** Raw GBNF / grammar source, or JSON-schema string for json_schema. */
  source: string;
  /** Optional name for logs / cache keys. */
  name?: string;
}

export interface LocalConstrainedOptions {
  /** Ollama /api/generate `format` or grammar hook. */
  format?: "json" | string;
  /** llama.cpp-style grammar string (GBNF). */
  grammar?: string;
  /** XGrammar / structured output payload. */
  xgrammar?: string;
  /** Extra provider-specific keys. */
  extra?: Record<string, unknown>;
}

export interface ConstrainedInvokeRequest extends ModelInvokeRequest {
  layer?: ModelLayerId;
  grammar?: ConstrainedGrammar;
  local_options?: LocalConstrainedOptions;
}

/**
 * Honest enforcement marker — this module never talks to a live decoder.
 * `constrained: true` only means grammar fields were *attached* to the request body.
 */
export type ConstrainedEnforcement = "request_plumbing_only";

export interface BuiltLocalGenerateBody {
  model: string;
  prompt: string;
  stream: false;
  /** Attached only when grammar/options present for layer 0. */
  format?: string;
  options?: Record<string, unknown>;
  grammar?: string;
  /**
   * True when grammar/format options were attached for layer 0.
   * Does NOT mean a live GBNF/XGrammar decoder enforced the grammar.
   */
  constrained: boolean;
  /** Always request_plumbing_only — no silent claim of live decode enforcement. */
  enforcement: ConstrainedEnforcement;
  layer: ModelLayerId;
}

/**
 * Build an Ollama/llama.cpp-style generate body.
 * Grammar is attached only for layer 0; higher layers omit constrained fields.
 */
export function buildConstrainedLocalRequest(
  req: ConstrainedInvokeRequest,
  defaults?: { model?: string },
): BuiltLocalGenerateBody {
  const layer: ModelLayerId = req.layer ?? 0;
  const model = req.model || defaults?.model || "bonsai-64k:latest";
  const base: BuiltLocalGenerateBody = {
    model,
    prompt: req.prompt,
    stream: false,
    constrained: false,
    enforcement: "request_plumbing_only",
    layer,
  };

  if (layer !== 0) {
    return base;
  }

  const grammar = req.grammar;
  const local = req.local_options;
  let constrained = false;

  if (grammar) {
    constrained = true;
    if (grammar.dialect === "gbnf") {
      base.grammar = grammar.source;
      base.options = { ...(base.options ?? {}), grammar: grammar.source };
    } else if (grammar.dialect === "json_schema") {
      base.format = "json";
      base.options = { ...(base.options ?? {}), json_schema: grammar.source };
    } else if (grammar.dialect === "xgrammar") {
      base.options = { ...(base.options ?? {}), xgrammar: grammar.source };
    }
  }

  if (local) {
    if (local.format) {
      base.format = local.format;
      constrained = true;
    }
    if (local.grammar) {
      base.grammar = local.grammar;
      base.options = { ...(base.options ?? {}), grammar: local.grammar };
      constrained = true;
    }
    if (local.xgrammar) {
      base.options = { ...(base.options ?? {}), xgrammar: local.xgrammar };
      constrained = true;
    }
    if (local.extra) {
      base.options = { ...(base.options ?? {}), ...local.extra };
      constrained = true;
    }
  }

  base.constrained = constrained;
  return base;
}

/** Convenience: attach grammar only when selection is layer 0. */
export function attachGrammarIfLayer0(
  req: ModelInvokeRequest,
  layer: ModelLayerId,
  grammar: ConstrainedGrammar | undefined,
): ConstrainedInvokeRequest {
  if (layer !== 0 || !grammar) {
    return { ...req, layer };
  }
  return { ...req, layer, grammar };
}
