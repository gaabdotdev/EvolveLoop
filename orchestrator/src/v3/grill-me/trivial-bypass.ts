/**
 * Zero-token deterministic routing for trivial intents (status / pause / ops).
 * Regex + SQLite — never invokes Grill-Me or LLMs.
 */

import type { StateDb } from "../state-db/store.js";

export type TrivialKind = "status" | "pause" | "resume" | "ops_help";

export interface TrivialMatch {
  kind: TrivialKind;
  op_key: string;
  tokens_used: 0;
}

const PATTERNS: Array<{ kind: TrivialKind; re: RegExp }> = [
  {
    kind: "status",
    re: /^(?:\s*(?:evolve\s+)?)?(?:status|estado|st|ps|how\s+am\s+i|como\s+est[aá])\s*$/i,
  },
  {
    kind: "pause",
    re: /^(?:\s*(?:evolve\s+)?)?(?:pause|pausar|hold|freeze| congelar)\s*$/i,
  },
  {
    kind: "resume",
    re: /^(?:\s*(?:evolve\s+)?)?(?:resume|continuar|retomar|unpause)\s*$/i,
  },
  {
    kind: "ops_help",
    re: /^(?:\s*(?:evolve\s+)?)?(?:help|ajuda|ops|comandos)\s*$/i,
  },
];

export function matchTrivialIntent(intent: string): TrivialMatch | undefined {
  const text = intent.trim();
  if (!text) return undefined;
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return { kind: p.kind, op_key: `trivial:${p.kind}`, tokens_used: 0 };
    }
  }
  return undefined;
}

export interface TrivialBypassResult {
  bypassed: true;
  kind: TrivialKind;
  tokens_used: 0;
  grill_me: false;
  message_pt: string;
  data: unknown;
}

export function applyTrivialBypass(intent: string, db: StateDb): TrivialBypassResult | undefined {
  const match = matchTrivialIntent(intent);
  if (!match) return undefined;

  const cached = db.getTrivialOp(match.op_key);
  let data: unknown;
  let message_pt: string;

  if (match.kind === "status") {
    const contracts = db.listValidatedGoalContracts();
    data = {
      kind: "status",
      validated_goal_contracts: contracts.length,
      latest: contracts[0] ?? null,
      journal_mode: db.journalMode(),
      db_path: db.path,
      from_cache: Boolean(cached),
    };
    message_pt =
      contracts.length === 0
        ? "Nenhum Goal Contract validado no SQLite ainda."
        : `Status: ${contracts.length} Goal Contract(s) validado(s). Último: ${contracts[0]!.goal_contract_id} v${contracts[0]!.version}.`;
  } else if (match.kind === "pause") {
    data = { kind: "pause", acknowledged: true, mso: "PAUSED" };
    message_pt = "Operação pause registada (zero tokens). MSO não dispara.";
  } else if (match.kind === "resume") {
    data = { kind: "resume", acknowledged: true, mso: "READY" };
    message_pt = "Resume registado (zero tokens). Use `evolve intent` para novo Goal Contract.";
  } else {
    data = {
      kind: "ops_help",
      commands: ["evolve intent --text <intenção>", "evolve status", "evolve pause", "evolve resume"],
    };
    message_pt =
      "Comandos: evolve intent --text … | evolve status | evolve pause | evolve resume (bypass trivial, 0 tokens).";
  }

  db.putTrivialOp(match.op_key, data);

  return {
    bypassed: true,
    kind: match.kind,
    tokens_used: 0,
    grill_me: false,
    message_pt,
    data,
  };
}
