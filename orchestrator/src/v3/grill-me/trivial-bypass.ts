/**
 * Zero-token deterministic routing for trivial intents (status / pause / progress / ops).
 * Regex + SQLite — never invokes Grill-Me or LLMs. (V0-TOK-02)
 * UX tag: `[local · 0 tok]` (spec §5.2).
 */

import type { StateDb } from "../state-db/store.js";
import { matchLocalValidationIntent } from "../token-economy/local-validation.js";
import { toTelegraphicEn } from "../token-economy/telegraphic.js";
import {
  pauseJourneyTaskOnDb,
  resumeJourneyTaskOnDb,
} from "../../cli/tui/journey-pause.js";
import { dirname } from "node:path";

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

export function applyTrivialBypass(
  intent: string,
  db: StateDb,
  opts?: { workspace?: string },
): TrivialBypassResult | undefined {
  const match = matchTrivialIntent(intent);
  if (!match) return undefined;

  const cached = db.getTrivialOp(match.op_key);
  // Prefer explicit workspace; fallback: parent of .evolveloop/ when path is …/state.db
  const workspace =
    opts?.workspace?.trim() ||
    (db.path.includes(".evolveloop")
      ? dirname(dirname(db.path))
      : dirname(db.path));
  let data: unknown;
  let message_pt: string;

  if (match.kind === "status") {
    const contracts = db.listValidatedGoalContracts();
    const latest = contracts[0] ?? null;
    const latestSession = db.getLatestMsoSessionForWorkspace(workspace);
    // V4.3 P1-1 — product facade: Task/Session (runtime IDs intact in JSON).
    data = {
      kind: "status",
      product: "task_session",
      task: latest
        ? {
            plan_id: latest.goal_contract_id,
            version: latest.version,
            work_id: latest.work_id ?? null,
          }
        : null,
      session: latestSession
        ? {
            session_id: latestSession.session_id,
            state: latestSession.state,
          }
        : null,
      validated_goal_contracts: contracts.length,
      latest,
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
    if (contracts.length === 0 && !latestSession) {
      message_pt = "Status (Task/Session): nenhuma Task/Plan validada no Workspace ainda.";
    } else if (latestSession) {
      const sessLabel =
        latestSession.state === "TRUE-FULL-PASS"
          ? "concluída (verificada)"
          : latestSession.state;
      message_pt = latest
        ? `Status (Task/Session): Plan ${latest.goal_contract_id} v${latest.version} · Session ${latestSession.session_id.slice(0, 12)}… (${sessLabel}).`
        : `Status (Task/Session): Session ${latestSession.session_id.slice(0, 12)}… (${sessLabel}); sem Plan validado.`;
    } else {
      message_pt = `Status (Task/Session): ${contracts.length} Plan(s) validado(s). Último: ${latest!.goal_contract_id} v${latest!.version}.`;
    }
  } else if (match.kind === "pause") {
    // V4.3 P0-1 — same axis as TUI Ctrl+P / /pause (StateDb journey flag).
    const pauseState = pauseJourneyTaskOnDb(db, workspace, "cli");
    data = {
      kind: "pause",
      acknowledged: true,
      mso: "PAUSED",
      journey_pause: pauseState,
      axis: "journey_task",
      internal_en: toTelegraphicEn({ op: "pause", mso: "PAUSED", tokens: 0 }),
    };
    message_pt =
      "Task em pausa persistida em StateDb (zero tokens; mesmo eixo TUI). Orchestrator de workflow não dispara. ≠ workflow pause.";
  } else if (match.kind === "resume") {
    const resumeState = resumeJourneyTaskOnDb(db, workspace, "cli");
    data = {
      kind: "resume",
      acknowledged: true,
      mso: "READY",
      journey_pause: resumeState,
      was_paused: !resumeState.paused && Boolean(resumeState.paused_at),
      axis: "journey_task",
      internal_en: toTelegraphicEn({ op: "resume", mso: "READY", tokens: 0 }),
    };
    message_pt =
      "Task retomada — pausa de jornada limpa no StateDb (idempotente; zero tokens). Mesmo eixo que TUI.";
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
