/**
 * V1-TOK-19 — Skill-to-Code crystallization v1.
 *
 * When a pattern succeeds N >= 3 times, crystallize to a deterministic script
 * validated by tests. The 4th run uses the script at 0 tokens.
 */

export const CRYSTALLIZE_THRESHOLD = 3;

export interface CrystallizedScript {
  pattern_id: string;
  /** Deterministic script body or argv descriptor. */
  script: string;
  success_count: number;
  crystallized_at: string;
  validated: boolean;
  tokens_on_hit: 0;
}

export interface PatternRunInput {
  pattern_id: string;
  /** Opaque success signal from the caller. */
  success: boolean;
  /** Optional script body when crystallizing (defaults to pattern_id runner). */
  script?: string;
  /** Optional validation hook before crystallize commit. */
  validate?: (script: string) => boolean | Promise<boolean>;
}

export type PatternRunOutcome =
  | {
      kind: "PatternRunOutcome";
      status: "recorded";
      pattern_id: string;
      success_count: number;
      tokens_used: number;
      crystallized: false;
    }
  | {
      kind: "PatternRunOutcome";
      status: "crystallized";
      pattern_id: string;
      success_count: number;
      tokens_used: number;
      crystallized: true;
      script: CrystallizedScript;
    }
  | {
      kind: "PatternRunOutcome";
      status: "zero_token_script";
      pattern_id: string;
      success_count: number;
      tokens_used: 0;
      crystallized: true;
      script: CrystallizedScript;
    }
  | {
      kind: "PatternRunOutcome";
      status: "failed";
      pattern_id: string;
      success_count: number;
      tokens_used: number;
      crystallized: boolean;
      reason: string;
    };

interface PatternState {
  success_count: number;
  script?: CrystallizedScript;
}

/**
 * In-memory crystallizer registry (process-local).
 * Callers may persist separately; this module owns the N≥3 → 0-token gate.
 */
export class CrystallizerRegistry {
  private readonly patterns = new Map<string, PatternState>();
  /** Proxy tokens charged for a non-crystallized successful LLM-backed run. */
  readonly tokensPerLiveRun: number;

  constructor(opts?: { tokensPerLiveRun?: number }) {
    this.tokensPerLiveRun = opts?.tokensPerLiveRun ?? 100;
  }

  get(patternId: string): PatternState | undefined {
    return this.patterns.get(patternId);
  }

  listCrystallized(): CrystallizedScript[] {
    const out: CrystallizedScript[] = [];
    for (const st of this.patterns.values()) {
      if (st.script) out.push(st.script);
    }
    return out;
  }

  /**
   * Record a pattern attempt.
   * - success_count < 3: charge live tokens, increment on success
   * - on reaching N=3 with validate ok: crystallize
   * - subsequent runs: execute crystallized script at 0 tokens
   */
  async run(input: PatternRunInput): Promise<PatternRunOutcome> {
    const st = this.patterns.get(input.pattern_id) ?? { success_count: 0 };

    if (st.script?.validated) {
      this.patterns.set(input.pattern_id, st);
      return {
        kind: "PatternRunOutcome",
        status: "zero_token_script",
        pattern_id: input.pattern_id,
        success_count: st.success_count,
        tokens_used: 0,
        crystallized: true,
        script: st.script,
      };
    }

    if (!input.success) {
      this.patterns.set(input.pattern_id, st);
      return {
        kind: "PatternRunOutcome",
        status: "failed",
        pattern_id: input.pattern_id,
        success_count: st.success_count,
        tokens_used: this.tokensPerLiveRun,
        crystallized: false,
        reason: "pattern_run_failed",
      };
    }

    st.success_count += 1;
    const tokens_used = this.tokensPerLiveRun;

    if (st.success_count >= CRYSTALLIZE_THRESHOLD && !st.script) {
      const scriptBody =
        input.script ?? `crystallized:${input.pattern_id}:v1`;
      let validated = true;
      if (input.validate) {
        validated = await Promise.resolve(input.validate(scriptBody));
      }
      if (!validated) {
        this.patterns.set(input.pattern_id, st);
        return {
          kind: "PatternRunOutcome",
          status: "failed",
          pattern_id: input.pattern_id,
          success_count: st.success_count,
          tokens_used,
          crystallized: false,
          reason: "crystallize_validation_failed",
        };
      }
      const script: CrystallizedScript = {
        pattern_id: input.pattern_id,
        script: scriptBody,
        success_count: st.success_count,
        crystallized_at: new Date().toISOString(),
        validated: true,
        tokens_on_hit: 0,
      };
      st.script = script;
      this.patterns.set(input.pattern_id, st);
      return {
        kind: "PatternRunOutcome",
        status: "crystallized",
        pattern_id: input.pattern_id,
        success_count: st.success_count,
        tokens_used,
        crystallized: true,
        script,
      };
    }

    this.patterns.set(input.pattern_id, st);
    return {
      kind: "PatternRunOutcome",
      status: "recorded",
      pattern_id: input.pattern_id,
      success_count: st.success_count,
      tokens_used,
      crystallized: false,
    };
  }
}
