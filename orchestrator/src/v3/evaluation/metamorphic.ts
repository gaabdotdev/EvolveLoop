/**
 * V3-TEST-01 — Metamorphic & Differential Multi-Model Tests.
 *
 * Detects prompt fragility and routing bias: the same Goal Contract expressed
 * with N equivalent paraphrases must yield a stable decomposition fingerprint
 * and a stable TRUE-FULL-PASS verdict (plan §5.4).
 *
 * Deterministic by default via stub decomposer + stub router — no live LLM.
 */

import { createHash } from "node:crypto";
import type { GoalContract, WorkState } from "../goal-contract/types.js";
import { evaluateTrueFullPass } from "../goal-contract/types.js";
import type { TaskKind } from "../task-graph/types.js";

export const METAMORPHIC_SCHEMA_VERSION = 1;
/** Plan §5.4 requires three equivalent paraphrases. */
export const REQUIRED_PARAPHRASE_COUNT = 3;

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "by",
  "from",
  "into",
  "that",
  "this",
  "is",
  "are",
  "be",
  "as",
  "at",
  "it",
  "its",
  "we",
  "our",
  "please",
  "should",
  "must",
  "need",
  "needs",
  "using",
  "use",
  "via",
  "ensure",
  "ensures",
  "feature",
  "features",
  "page",
  "only",
  "update",
  "um",
  "uma",
  "o",
  "os",
  "as",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "com",
  "sem",
  "que",
  "por",
  "em",
]);

/** Synonym collapse so equivalent paraphrases share one token bag. */
const TOKEN_ALIASES: Record<string, string> = {
  authenticate: "auth",
  authentication: "auth",
  login: "auth",
  signin: "auth",
  endpoint: "api",
  endpoints: "api",
  rest: "api",
  http: "api",
  route: "api",
  routes: "api",
  handler: "api",
  handlers: "api",
  tests: "test",
  testing: "test",
  unit: "test",
  coverage: "test",
  verify: "test",
  verification: "test",
  persist: "db",
  persistence: "db",
  database: "db",
  storage: "db",
  sqlite: "db",
  document: "docs",
  documentation: "docs",
  readme: "docs",
  implement: "code",
  implementation: "code",
  build: "code",
  create: "code",
  add: "code",
  write: "code",
};

export interface ParaphraseVariant {
  paraphrase_id: string;
  /** Equivalent wording of the same objective / Goal Contract intent. */
  objective: string;
}

export interface DecompositionNode {
  /** Stable role id — independent of surface wording. */
  role_id: string;
  task_kind: TaskKind;
  depends_on: string[];
  touch_paths: string[];
}

export interface DecompositionFingerprint {
  fingerprint: string;
  nodes: DecompositionNode[];
  normalized_tokens: string[];
}

export interface StubRouteDecision {
  model_id: string;
  agent_id: string;
  layer: 0 | 1 | 2;
  reason: string;
}

export interface MetamorphicPassVerdict {
  eligible: boolean;
  work_state: Extract<WorkState, "TRUE_FULL_PASS" | "NOT_PASS">;
  reasons: string[];
}

export interface MetamorphicVariantResult {
  paraphrase_id: string;
  objective: string;
  decomposition: DecompositionFingerprint;
  route: StubRouteDecision;
  true_full_pass: MetamorphicPassVerdict;
}

export type MetamorphicGateStatus =
  | "PASS"
  | "FAIL_FRAGILE"
  | "FAIL_ROUTE_BIAS"
  | "FAIL_PASS_DRIFT"
  | "FAIL_COUNT";

export interface DifferentialModelRun {
  model_id: string;
  variants: MetamorphicVariantResult[];
  decomposition_stable: boolean;
  route_agent_ids: string[];
}

export interface DifferentialModelReport {
  kind: "DifferentialModelReport";
  models: DifferentialModelRun[];
  /** True when models disagree on agent_id for the same fingerprint (bias / fragility). */
  routing_bias_detected: boolean;
  /** Models that diverge from the reference model's agent selection. */
  biased_model_ids: string[];
}

export interface MetamorphicHarnessReport {
  kind: "MetamorphicHarnessReport";
  schema_version: number;
  goal_contract_id: string;
  goal_contract_version: number;
  variants: MetamorphicVariantResult[];
  stability: {
    decomposition_stable: boolean;
    route_stable: boolean;
    true_full_pass_stable: boolean;
    reference_fingerprint: string;
    reference_agent_id: string;
    reference_pass_eligible: boolean;
    divergent_paraphrase_ids: string[];
  };
  differential?: DifferentialModelReport;
  status: MetamorphicGateStatus;
  limitations: string[];
}

export interface DecomposerStub {
  decompose(input: {
    contract: GoalContract;
    objective: string;
  }): DecompositionFingerprint;
}

export interface ModelRouterStub {
  readonly model_id: string;
  route(input: {
    objective: string;
    tokens: string[];
    decomposition: DecompositionFingerprint;
  }): StubRouteDecision;
}

export interface MetamorphicHarnessOptions {
  contract: GoalContract;
  paraphrases: ParaphraseVariant[];
  decomposer?: DecomposerStub;
  /** Single-model stub (default: fingerprint-stable stub). */
  router?: ModelRouterStub;
  /**
   * Multi-model differential: each stub is run on all paraphrases.
   * When set, `router` is ignored for the primary variants (first model used).
   */
  models?: ModelRouterStub[];
  /** Override TRUE-FULL-PASS evaluator (defaults to evaluateTrueFullPass on contract). */
  evaluatePass?: (input: {
    contract: GoalContract;
    paraphrase: ParaphraseVariant;
    decomposition: DecompositionFingerprint;
    route: StubRouteDecision;
  }) => MetamorphicPassVerdict;
}

function sha256Short(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Lowercase, strip punctuation, drop stopwords, collapse synonyms, sort unique. */
export function normalizeObjectiveTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/[\s_-]+/)
    .filter(Boolean);

  const out = new Set<string>();
  for (const t of raw) {
    if (STOPWORDS.has(t) || t.length < 2) continue;
    out.add(TOKEN_ALIASES[t] ?? t);
  }
  return [...out].sort();
}

function fingerprintNodes(nodes: DecompositionNode[]): string {
  const canonical = nodes
    .map((n) => ({
      role_id: n.role_id,
      task_kind: n.task_kind,
      depends_on: [...n.depends_on].sort(),
      touch_paths: [...n.touch_paths].sort(),
    }))
    .sort((a, b) => a.role_id.localeCompare(b.role_id));
  return sha256Short(JSON.stringify(canonical));
}

/**
 * Deterministic stub decomposer: keyword bag → fixed task roles.
 * Surface wording that collapses to the same tokens yields the same fingerprint.
 */
export function createStubDecomposer(): DecomposerStub {
  return {
    decompose({ objective }): DecompositionFingerprint {
      const tokens = normalizeObjectiveTokens(objective);
      const tokenSet = new Set(tokens);
      const nodes: DecompositionNode[] = [
        {
          role_id: "plan",
          task_kind: "plan",
          depends_on: [],
          touch_paths: ["docs/"],
        },
      ];

      if (tokenSet.has("auth") || tokenSet.has("api") || tokenSet.has("code") || tokenSet.has("db")) {
        nodes.push({
          role_id: "implement",
          task_kind: "implement",
          depends_on: ["plan"],
          touch_paths: tokenSet.has("db")
            ? ["src/", "src/db/"]
            : tokenSet.has("auth")
              ? ["src/", "src/auth/"]
              : ["src/"],
        });
      }

      if (tokenSet.has("test")) {
        nodes.push({
          role_id: "verify",
          task_kind: "verify",
          depends_on: nodes.some((n) => n.role_id === "implement")
            ? ["implement"]
            : ["plan"],
          touch_paths: ["tests/"],
        });
      }

      if (tokenSet.has("docs")) {
        nodes.push({
          role_id: "document",
          task_kind: "research",
          depends_on: ["plan"],
          touch_paths: ["docs/"],
        });
      }

      // Always close with coordinate when we have 2+ work nodes.
      if (nodes.length >= 3) {
        nodes.push({
          role_id: "coordinate",
          task_kind: "coordinate",
          depends_on: nodes
            .filter((n) => n.role_id !== "plan")
            .map((n) => n.role_id)
            .sort(),
          touch_paths: [],
        });
      }

      return {
        fingerprint: fingerprintNodes(nodes),
        nodes,
        normalized_tokens: tokens,
      };
    },
  };
}

export interface StubRouterOptions {
  model_id: string;
  /**
   * When true, route from raw objective surface (first token / length) —
   * deliberately fragile; used to prove bias detection.
   */
  surface_biased?: boolean;
  /** Fixed agent when not surface-biased. */
  agent_id?: string;
  layer?: 0 | 1 | 2;
}

/**
 * Deterministic stub router. Default: agent chosen from decomposition fingerprint
 * (paraphrase-invariant). Surface-biased mode exposes routing bias for differential tests.
 */
export function createStubRouter(opts: StubRouterOptions): ModelRouterStub {
  const model_id = opts.model_id;
  const defaultAgent = opts.agent_id ?? "agent-stable";
  const layer = opts.layer ?? 1;
  const surfaceBiased = opts.surface_biased === true;

  return {
    model_id,
    route({ objective, decomposition }): StubRouteDecision {
      if (surfaceBiased) {
        const first = objective.trim().split(/\s+/)[0]?.toLowerCase() ?? "x";
        const agent_id = `agent-surface-${first.slice(0, 12)}`;
        return {
          model_id,
          agent_id,
          layer,
          reason: "surface_biased_first_token",
        };
      }
      const agent_id = `${defaultAgent}:${decomposition.fingerprint.slice(0, 8)}`;
      return {
        model_id,
        agent_id,
        layer,
        reason: "fingerprint_stable",
      };
    },
  };
}

function defaultPass(
  contract: GoalContract,
): MetamorphicPassVerdict {
  const r = evaluateTrueFullPass(contract);
  return {
    eligible: r.eligible,
    work_state: r.work_state === "TRUE_FULL_PASS" ? "TRUE_FULL_PASS" : "NOT_PASS",
    reasons: r.reasons,
  };
}

function runVariant(
  contract: GoalContract,
  paraphrase: ParaphraseVariant,
  decomposer: DecomposerStub,
  router: ModelRouterStub,
  evaluatePass: MetamorphicHarnessOptions["evaluatePass"],
): MetamorphicVariantResult {
  const decomposition = decomposer.decompose({
    contract,
    objective: paraphrase.objective,
  });
  const route = router.route({
    objective: paraphrase.objective,
    tokens: decomposition.normalized_tokens,
    decomposition,
  });
  const true_full_pass = evaluatePass
    ? evaluatePass({ contract, paraphrase, decomposition, route })
    : defaultPass(contract);

  return {
    paraphrase_id: paraphrase.paraphrase_id,
    objective: paraphrase.objective,
    decomposition,
    route,
    true_full_pass,
  };
}

function stabilityOf(variants: MetamorphicVariantResult[]): MetamorphicHarnessReport["stability"] {
  const ref = variants[0]!;
  const divergent: string[] = [];
  let decomposition_stable = true;
  let route_stable = true;
  let true_full_pass_stable = true;

  for (const v of variants) {
    if (v.decomposition.fingerprint !== ref.decomposition.fingerprint) {
      decomposition_stable = false;
      divergent.push(v.paraphrase_id);
    }
    if (v.route.agent_id !== ref.route.agent_id) {
      route_stable = false;
      if (!divergent.includes(v.paraphrase_id)) divergent.push(v.paraphrase_id);
    }
    if (v.true_full_pass.eligible !== ref.true_full_pass.eligible) {
      true_full_pass_stable = false;
      if (!divergent.includes(v.paraphrase_id)) divergent.push(v.paraphrase_id);
    }
  }

  return {
    decomposition_stable,
    route_stable,
    true_full_pass_stable,
    reference_fingerprint: ref.decomposition.fingerprint,
    reference_agent_id: ref.route.agent_id,
    reference_pass_eligible: ref.true_full_pass.eligible,
    divergent_paraphrase_ids: divergent,
  };
}

function gateStatus(
  paraphraseCount: number,
  stability: MetamorphicHarnessReport["stability"],
  differential?: DifferentialModelReport,
): MetamorphicGateStatus {
  if (paraphraseCount !== REQUIRED_PARAPHRASE_COUNT) return "FAIL_COUNT";
  if (!stability.decomposition_stable) return "FAIL_FRAGILE";
  if (!stability.true_full_pass_stable) return "FAIL_PASS_DRIFT";
  if (!stability.route_stable || differential?.routing_bias_detected) {
    return "FAIL_ROUTE_BIAS";
  }
  return "PASS";
}

/**
 * Run the metamorphic harness: 3 equivalent paraphrases → stability report.
 * Optional multi-model differential detects routing bias across stub models.
 */
export function runMetamorphicHarness(
  opts: MetamorphicHarnessOptions,
): MetamorphicHarnessReport {
  const limitations: string[] = [
    "stub_decomposer_no_live_llm",
    "stub_router_deterministic",
    `schema_version=${METAMORPHIC_SCHEMA_VERSION}`,
    `required_paraphrases=${REQUIRED_PARAPHRASE_COUNT}`,
  ];

  const decomposer = opts.decomposer ?? createStubDecomposer();
  const models =
    opts.models && opts.models.length > 0
      ? opts.models
      : [opts.router ?? createStubRouter({ model_id: "stub-stable" })];

  const primary = models[0]!;
  const variants = opts.paraphrases.map((p) =>
    runVariant(opts.contract, p, decomposer, primary, opts.evaluatePass),
  );

  let differential: DifferentialModelReport | undefined;
  if (opts.models && opts.models.length > 1) {
    const modelRuns: DifferentialModelRun[] = opts.models.map((m) => {
      const vs = opts.paraphrases.map((p) =>
        runVariant(opts.contract, p, decomposer, m, opts.evaluatePass),
      );
      const st = stabilityOf(vs);
      return {
        model_id: m.model_id,
        variants: vs,
        decomposition_stable: st.decomposition_stable,
        route_agent_ids: vs.map((v) => v.route.agent_id),
      };
    });

    const refAgents = new Set(modelRuns[0]!.route_agent_ids);
    const biased_model_ids: string[] = [];
    for (let i = 1; i < modelRuns.length; i++) {
      const run = modelRuns[i]!;
      const same =
        run.route_agent_ids.length === modelRuns[0]!.route_agent_ids.length &&
        run.route_agent_ids.every((a, idx) => a === modelRuns[0]!.route_agent_ids[idx]);
      // Also flag intra-model surface instability as bias.
      const uniqueAgents = new Set(run.route_agent_ids);
      if (!same || uniqueAgents.size > 1) {
        biased_model_ids.push(run.model_id);
      }
      for (const a of run.route_agent_ids) refAgents.add(a);
    }

    differential = {
      kind: "DifferentialModelReport",
      models: modelRuns,
      routing_bias_detected: biased_model_ids.length > 0,
      biased_model_ids,
    };
    limitations.push("differential_multi_model_enabled");
  }

  const stability = stabilityOf(variants);
  const status = gateStatus(opts.paraphrases.length, stability, differential);

  return {
    kind: "MetamorphicHarnessReport",
    schema_version: METAMORPHIC_SCHEMA_VERSION,
    goal_contract_id: opts.contract.goal_contract_id,
    goal_contract_version: opts.contract.version,
    variants,
    stability,
    differential,
    status,
    limitations,
  };
}

/** Convenience: gate passes only on full metamorphic stability (status === PASS). */
export function evaluateMetamorphicGate(report: MetamorphicHarnessReport): {
  passed: boolean;
  status: MetamorphicGateStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (report.variants.length !== REQUIRED_PARAPHRASE_COUNT) {
    reasons.push(
      `paraphrase_count:${report.variants.length}!=${REQUIRED_PARAPHRASE_COUNT}`,
    );
  }
  if (!report.stability.decomposition_stable) {
    reasons.push(
      `decomposition_unstable:${report.stability.divergent_paraphrase_ids.join(",")}`,
    );
  }
  if (!report.stability.route_stable) {
    reasons.push("route_unstable_across_paraphrases");
  }
  if (!report.stability.true_full_pass_stable) {
    reasons.push("true_full_pass_drift");
  }
  if (report.differential?.routing_bias_detected) {
    reasons.push(
      `routing_bias:${report.differential.biased_model_ids.join(",")}`,
    );
  }
  return {
    passed: report.status === "PASS",
    status: report.status,
    reasons,
  };
}

/** Fixture: three English paraphrases of the same auth+api+test goal. */
export function fixtureEquivalentParaphrases(): ParaphraseVariant[] {
  return [
    {
      paraphrase_id: "p1",
      objective:
        "Implement authentication API endpoints with unit tests and documentation",
    },
    {
      paraphrase_id: "p2",
      objective:
        "Build login REST handlers, add verification tests, and write the README",
    },
    {
      paraphrase_id: "p3",
      objective:
        "Create auth HTTP routes, ensure test coverage, and document the feature",
    },
  ];
}
