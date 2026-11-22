/**
 * Zero-token deterministic routing for trivial intents (status / pause / progress / ops).
 * Regex + SQLite — never invokes Grill-Me or LLMs. (V0-TOK-02)
 * UX tag: `[local · 0 tok]` (spec §5.2).
 */

import type { StateDb } from "../state-db/store.js";
import { matchLocalValidationIntent } from "../token-economy/local-validation.js";
import { toTelegraphicEn } from "../token-economy/telegraphic.js";

/** UX spec §5.2 — keep in sync with evolve-shell/grill-ux LOCAL_ZERO_TOK_TAG. */
const LOCAL_ZERO_TOK_TAG = "[local · 0 tok]";

function withLocalZeroTokTag(message: string): string {
  if (message.includes(LOCAL_ZERO_TOK_TAG)) return message;
  return `${message} ${LOCAL_ZERO_TOK_TAG}`;
}

export type TrivialKind = "status" | "pause" | "resume" | "progress" | "ops_help" | "local_validation";

export interface TrivialMatch {
  kind: TrivialKind;
  op_key: string;
  tokens_used: 0;
}

const PATTERNS: Array<{ kind: TrivialKind; re: RegExp }> = [
  {
    kind: "status",
    re: /^(?:\s*(?:evolve\s+)?)?(?:status|estado|st|ps|how\s+am\s+i|como\s+est[aá]|quanto\s+gastou\??)\s*$/i,
  },
  {
    kind: "pause",
    re: /^(?:\s*(?:evolve\s+)?)?(?:pause|pausar|hold|freeze|congelar)\s*$/i,
  },
  {
    kind: "resume",
    re: /^(?:\s*(?:evolve\s+)?)?(?:resume|continuar|retomar|unpause)\s*$/i,
  },
  {
    kind: "progress",
    re: /^(?:\s*(?:evolve\s+)?)?(?:progress|progresso|andamento|how\s+far|pct|percent(?:age)?|quais\s+tarefas(?:\s+(?:estão|estao)\s+rodando)?\??)\s*$/i,
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
  // Local tsc/test/validate — zero-token; must not call LLM (V0-TOK-02).
  const local = matchLocalValidationIntent(text);
  if (local) {
    return { kind: "local_validation", op_key: `trivial:local:${local.kind}`, tokens_used: 0 };
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
      internal_en: toTelegraphicEn({
        op: "status",
        contracts: contracts.length,
        journal: db.journalMode(),
        tokens: 0,
      }),
    };
    message_pt =
      contracts.length === 0
        ? "Nenhum Goal Contract validado no SQLite ainda."
        : `Status: ${contracts.length} Goal Contract(s) validado(s). Último: ${contracts[0]!.goal_contract_id} v${contracts[0]!.version}.`;
  } else if (match.kind === "pause") {
    data = {
      kind: "pause",
      acknowledged: true,
      mso: "PAUSED",
      internal_en: toTelegraphicEn({ op: "pause", mso: "PAUSED", tokens: 0 }),
    };
    message_pt = "Operação pause registada (zero tokens). MSO não dispara.";
  } else if (match.kind === "resume") {
    data = {
      kind: "resume",
      acknowledged: true,
      mso: "READY",
      internal_en: toTelegraphicEn({ op: "resume", mso: "READY", tokens: 0 }),
    };
    message_pt = "Resume registado (zero tokens). Use `evolve intent` para novo Goal Contract.";
  } else if (match.kind === "progress") {
    const contracts = db.listValidatedGoalContracts();
    const nodes = contracts[0]?.work_id ? db.listTaskGraphNodes(contracts[0].work_id) : [];
    const done = nodes.filter((n) =>
      /TRUE|PASS|DONE|COMPLETE/i.test(n.state),
    ).length;
    const total = nodes.length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    data = {
      kind: "progress",
      task_nodes: total,
      done,
      pct,
      journal_mode: db.journalMode(),
      internal_en: toTelegraphicEn({
        op: "progress",
        done,
        total,
        pct,
        tokens: 0,
      }),
    };
    message_pt =
      total === 0
        ? "Progresso: nenhum nó de TaskGraph no SQLite ainda (0 tokens)."
        : `Progresso: ${done}/${total} nós concluidos (${pct}%).`;
  } else if (match.kind === "local_validation") {
    const local = matchLocalValidationIntent(intent)!;
    data = {
      kind: "local_validation",
      validation: local.kind,
      stages: local.suggested_stages,
      prefer_llm: false,
      internal_en: toTelegraphicEn({
        op: "local_validation",
        kind: local.kind,
        stages: local.suggested_stages.join(","),
        prefer_llm: false,
        tokens: 0,
      }),
    };
    message_pt = `Validação local (${local.kind}): executar ${local.suggested_stages.join(" → ")} sem LLM (0 tokens).`;
  } else {
    data = {
      kind: "ops_help",
      commands: [
        "evolve intent --text <intenção>",
        "evolve status",
        "evolve pause",
        "evolve resume",
        "progress",
        "tsc|test|validate",
      ],
      internal_en: toTelegraphicEn({ op: "ops_help", tokens: 0 }),
    };
    message_pt =
      "Comandos: evolve intent --text … | status | pause | resume | progress | tsc/test (bypass trivial, 0 tokens).";
  }

  db.putTrivialOp(match.op_key, data);

  return {
    bypassed: true,
    kind: match.kind,
    tokens_used: 0,
    grill_me: false,
    message_pt: withLocalZeroTokTag(message_pt),
    data,
  };
}
