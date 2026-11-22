/**
 * V0-TOK-02 — Local validation (tsc/test) before any LLM.
 * Operational queries stay on zero-token regex path; validation intents never call a model.
 */

export type LocalValidationKind = "typecheck" | "test" | "validate";

export interface LocalValidationMatch {
  kind: LocalValidationKind;
  tokens_used: 0;
  prefer_llm: false;
  suggested_stages: Array<"syntax_types" | "tests">;
}

const PATTERNS: Array<{ kind: LocalValidationKind; re: RegExp; stages: LocalValidationMatch["suggested_stages"] }> =
  [
    {
      kind: "typecheck",
      re: /^(?:\s*(?:evolve\s+)?)?(?:tsc|typecheck|types?|check\s+types?)\s*$/i,
      stages: ["syntax_types"],
    },
    {
      kind: "test",
      re: /^(?:\s*(?:evolve\s+)?)?(?:test|tests|npm\s+test|vitest|unit)\s*$/i,
      stages: ["tests"],
    },
    {
      kind: "validate",
      re: /^(?:\s*(?:evolve\s+)?)?(?:validate|validar|check|verificar)\s*$/i,
      stages: ["syntax_types", "tests"],
    },
  ];

/**
 * Match intents that must run local tooling instead of invoking an LLM.
 */
export function matchLocalValidationIntent(intent: string): LocalValidationMatch | undefined {
  const text = intent.trim();
  if (!text) return undefined;
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return {
        kind: p.kind,
        tokens_used: 0,
        prefer_llm: false,
        suggested_stages: p.stages,
      };
    }
  }
  return undefined;
}

/** True when routing must not call an LLM for this intent. */
export function mustSkipLlm(intent: string): boolean {
  return Boolean(matchLocalValidationIntent(intent));
}
