/**
 * Journey help (short) vs advanced/legacy groups.
 * V4.3 P1 — status/sessions facade, dual TUI, product copy Orchestrator/Session.
 */

import { V35_USAGE_GROUPS } from "./v35-commands.js";
import { V36_USAGE_GROUPS } from "./v36-commands.js";
import { formatCredentialsCanonicalLines } from "./credentials-paths.js";

/** Product version for advanced help (orchestrator package); legacy label retained. */
export const EVOLVE_CLI_PRODUCT_VERSION = "2.0.0";
export const EVOLVE_CLI_LEGACY_LABEL = "0.1.0-v0-cli";

/**
 * V5-M07 — Simple/Advanced help layer labels.
 * Simple = journey (default); Advanced = full progressive/legacy map.
 */
export const HELP_LAYER_SIMPLE = "simple" as const;
export const HELP_LAYER_ADVANCED = "advanced" as const;

export function describeHelpLayers(): {
  simple: { alias: string; cli: string; description: string };
  advanced: { alias: string; cli: string; description: string };
} {
  return {
    simple: {
      alias: HELP_LAYER_SIMPLE,
      cli: "evolve help",
      description: "Jornada cotidiana (Simple mode)",
    },
    advanced: {
      alias: HELP_LAYER_ADVANCED,
      cli: "evolve help advanced",
      description: "Mapa L2/legado completo (Advanced mode)",
    },
  };
}

/** Short everyday journey help (default `evolve --help` / `evolve help`). = Simple layer */
export function formatJourneyHelp(): string {
  const credLines = formatCredentialsCanonicalLines();
  return [
    "evolve — jornada cotidiana (Simple / V4.3+V5)",
    "",
    "Workspace: o cwd atual (.evolveloop/) — estado da jornada.",
    "           (≠ `evolve workspace` = integration/worktree; alias: `evolve integration`)",
    "",
    "Abrir:     evolve                 # Ink TUI (TTY) / REPL (non-TTY) — default produto",
    "Setup:     evolve setup           # first-run + prefs (Handles OFF)",
    "Iniciar:   descreva a Task em linguagem natural (TUI) ou:",
    "           evolve intent --text \"…\"",
    "Plano:     revise o Plan na TUI; /plan",
    "Status:    evolve status  ·  /status  — Task/Session (produto)",
    "           (outros status = L2, nomes qualificados: help advanced)",
    "Acompanhar:footer Task/Session/Agents · Tokens Orchestrator/Agents",
    "Intervir:  /approvals  /pause  /cancel  (Ctrl+P Pause Task)",
    "           evolve pause | evolve resume",
    "Histórico: /history  ·  evolve history list|show <id>",
    "Prefs:     /config  ·  evolve config prefs|set|validate",
    "           evolve mode simple|advanced  (V5-M07)",
    "Trocar WS: evolve use list|active|<path>  ·  evolve --workspace <path>",
    "Entrega:   /delivery  ·  evolve delivery show|validate",
    "           (PASS só com evidência; adapter ok ≠ PASS)",
    "Agents:    /agents  ·  evolve agents [inspect|attach|logs] <id>",
    "Work:      evolve work list|status|show|attempts  (V5 PWR)",
    "",
    "TUI:       Ink (`evolve`) = jornada default.",
    "           `evolve tui run|status` = ops Core (board/coordinator) — não jornada.",
    "",
    "Credenciais (canónicas):",
    ...credLines.map((l) => `  ${l}`),
    "",
    "Exemplos (jornada):",
    "  evolve config set agent-handles off",
    "  evolve history list && evolve history show <id>",
    "  evolve use ~/proj && evolve --workspace ~/proj",
    "  evolve work list && evolve work status",
    "",
    "Slash TUI: /plan /approvals /agents /pause /cancel /delivery",
    "           /history /status /diff /config /clear",
    "",
    "Handles:   opcionais (default OFF). evolve config set agent-handles on|off",
    "           Session de processo sob Handles: evolve agents attach|inspect",
    "Camadas:   Simple = este help · Advanced = evolve help advanced",
    "           Preferência: evolve mode simple|advanced",
    "Avançado:  evolve help advanced",
    "Guias:     docs/v4/V4.1/user-guide-everyday.md",
    "           docs/v4/V4.3/quickstart.md",
    "           docs/v4/V4.3/compat-matrix.md",
    "           docs/v5/M07/README.md",
  ].join("\n");
}

/** Full progressive / legacy group map (`evolve help advanced`). */
export function formatAdvancedHelp(): string {
  const groups: Record<string, string[]> = {
    shell: ["conversational REPL (default when no args; non-TTY)"],
    setup: ["first-run guided detection + readiness report (V1-PROD-01)"],
    config: [
      "prefs|show",
      "set agent-handles on|off",
      "validate (ficheiro/chave/correção)",
    ],
    history: [
      "list",
      "show <id> — estado/evidências/limitações do Workspace (cwd)",
    ],
    use: [
      "list|active|<path> — trocar/confirmar Workspace produto",
      "alias: switch",
      "abrir: evolve --workspace <path>",
    ],
    switch: ["alias → use (Workspace produto)"],
    daemon: ["start|status|ping via Unix Domain Socket (V1-ORCH-01)"],
    freellm: ["catalog|health FreeLLMAPI (V1-PROD-02)"],
    intent: ["<text|--text> → silent scan + Grill-Me ≤5 → Goal Document+Contract SQLite"],
    status: [
      "produto Task/Session (zero-token StateDb) — default jornada",
      "≠ coordinator|runtime|service|tui status (L2 qualificados)",
    ],
    pause: ["journey Task pause → StateDb (mesmo eixo TUI; ≠ workflow)"],
    resume: ["limpa journey pause + session detect (idempotente)"],
    delivery: [
      "show — re-deriva Delivery de evidências (absent → UNVERIFIED)",
      "validate --run — execução local EvolveLoop (PASS só local_execution exit 0)",
      "validate --exit-code — atestado externo → ATTESTED (nunca PASS)",
    ],
    progress: ["trivial zero-token progress from TaskGraph/SQLite"],
    circuit: [
      "probe (1+1+1 health)",
      "run --task-id … --intent …",
      "fire-5 [--offline-fixture]",
      "ledger [--work-id]",
    ],
    grill: ["apply", "validate"],
    goal: ["create", "show", "evaluate", "criterion"],
    work: [
      "list|status|show|attempts — Persistent Work Runtime (V5-M07)",
      "init — legado (--data-dir)",
    ],
    mode: [
      "simple|advanced|show — Experience preference (V5-M07)",
      "Simple = journey help; Advanced = this map",
    ],
    hierarchy: ["spawn", "approve", "aux"],
    task: ["add", "approve-plan", "show"],
    agents: [
      "list|inspect|attach|logs (produto)",
      "register",
      "heartbeat",
      "reconcile",
      "adopt",
    ],
    agent: ["alias → agents"],
    continuity: [
      "handoff",
      "apply",
      "show — ≠ history de Tasks; REPLACED → preservado/perdido/próximo",
    ],
    exec: ["run"],
    coordinator: ["start", "stop", "tick", "status — L2 coordinator (≠ Task/Session)"],
    ...V36_USAGE_GROUPS,
    ...V35_USAGE_GROUPS,
    integration: [
      "alias → workspace (integration/worktree V3.5)",
      "DEPRECATED label path: prefer `evolve integration` for clarity; `workspace` kept for compat",
      "NOT product Workspace — that is cwd / evolve use / --workspace",
    ],
    events: ["list"],
    ledger: ["show", "rebuild"],
    adapters: [
      "list",
      "show",
      "drivers",
      "invoke",
      "handoff-envelope",
      "handoff-apply",
      "probe",
      "sessions — L2 process sessions (adapter driver; ≠ harness sessions)",
      "session-cancel",
    ],
    tui: [
      "status — ops Core StatusBoard (coordinator/works; ≠ /status Task/Session)",
      "run — ops Core interactive (≠ Ink jornada default)",
    ],
    models: ["seed", "list", "show", "enable"],
    context: ["view", "compact", "reinject", "savings"],
    route: ["decide", "probe-decision", "probe-openrouter"],
    budget: ["show", "record", "stuck", "hierarchical"],
    limits: ["classify", "handoff"],
    embeddings: ["probe", "embed", "retrieve", "index-build", "index-search"],
    lock: ["acquire", "renew", "release", "status", "fence-check"],
    recovery: ["plan", "apply"],
    worktree: ["create", "list", "remove"],
    cancel: ["apply"],
    parallel: ["schedule", "ready"],
    battery: ["run", "engineering", "eval"],
    engineering: ["run", "show"],
    harness: [
      "matrix",
      "list",
      "inspect",
      "sessions — L2 harness sessions (≠ adapters sessions; ≠ product Session)",
    ],
    eval: ["battery"],
  };

  return JSON.stringify(
    {
      name: "evolve",
      version: EVOLVE_CLI_PRODUCT_VERSION,
      legacy_cli_label: EVOLVE_CLI_LEGACY_LABEL,
      layer: "advanced",
      everyday: "evolve help  ·  docs/v4/V4.3/quickstart.md",
      default:
        "evolve  → Ink TUI (TTY) / REPL (non-TTY); Workspace = cwd (.evolveloop/)",
      glossary: {
        Workspace:
          "cwd + .evolveloop/ state — jornada cotidiana (Home/footer); trocar: evolve use / --workspace",
        "evolve workspace":
          "integration/worktree (V3.5 IntegrationCoordinator) — não troca o Workspace ativo",
        "evolve integration":
          "alias preferido (claridade) de `evolve workspace`; mesmo grupo; deprecation note no rótulo ambíguo",
        "evolve project": "registry ops (v36) — paralelo ao cwd",
        "evolve history": "Tasks/contratos do Workspace — ≠ continuity handoff",
        "evolve continuity":
          "handoff Agent REPLACED — preservado/perdido/próximo passo",
        "evolve status":
          "produto Task/Session (StateDb) — default jornada",
        "evolve progress": "TaskGraph progress (L2 companion de status)",
        "/status": "Ink slash Task/Session/Plan/tokens — mesmo eixo produto",
        "evolve tui status":
          "ops Core StatusBoard (coordinator) — NÃO jornada",
        "evolve tui run": "ops Core interactive — NÃO Ink default",
        "coordinator status": "L2 coordinator lifecycle",
        "runtime status": "L2 runtime service",
        "service status": "L2 service",
        "adapters sessions":
          "L2 process sessions (driver) — Session de processo sob adapters",
        "harness sessions":
          "L2 harness sessions — distinto de adapters sessions e de Session produto",
        "agents attach":
          "Session de processo sob Handles (opcional; default OFF)",
        Orchestrator: "rótulo UI do motor MSO (literais MSO só L5/verbose)",
        Plan: "rótulo UI do Goal Contract (IDs runtime intactos)",
        Agents: "rótulo UI (campo interno tokens_workers / Workers)",
      },
      credentials: formatCredentialsCanonicalLines(),
      groups,
      notes: [
        "Camada progressiva/legado — não é a jornada cotidiana.",
        `Versão produto ${EVOLVE_CLI_PRODUCT_VERSION} (orchestrator); label legado help antigo: ${EVOLVE_CLI_LEGACY_LABEL}.`,
        "V4.3: Ink = default; `tui run|status` = ops; status produto = Task/Session.",
        "V0-CLI: `evolve` (no args) opens PT conversational shell; Ctrl+P pause, Ctrl+C interrupt.",
        "V0-CLI-03: re-running evolve in the same cwd auto-detects .evolveloop/state.db session/contracts.",
        "V1-PROD-01: `evolve setup` → readiness report; credentials written 0600, never logged.",
        "V1-ORCH-01: `evolve daemon start` listens on .evolveloop/runtime.sock; client disconnect ≠ kill runs.",
        "Handles default OFF: preferences.agent_handles.enabled; EVOLVELOOP_AGENT_HANDLES overrides.",
        "V4.2: `evolve config prefs|set|validate` · `evolve history list|show` · `evolve use|switch`.",
        "Ambiguity: product Workspace = cwd; `evolve workspace` kept (compat) = integration; prefer `evolve integration`.",
        "Isolamento: state.db por path — Tasks não vazam entre Workspaces.",
        "Trivial ops (status|pause|resume|progress|help|tsc|test) bypass Grill-Me with zero tokens.",
        "Install: bash scripts/install-evolve-cli.sh (symlink bin/evolve onto PATH).",
        "Node suportado: >=22.5.0 (package engines; node:sqlite); ver docs/v4/V4.3/compat-matrix.md.",
        "Identity map: docs/v4/V4.3/identity-copy-map.md",
      ],
      journey_examples: [
        "evolve config set agent-handles off",
        "evolve history list && evolve history show <id>",
        "evolve use ~/proj && evolve --workspace ~/proj",
      ],
    },
    null,
    2,
  );
}
