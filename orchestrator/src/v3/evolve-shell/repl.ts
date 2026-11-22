/**
 * Permanent conversational input in Portuguese (V0-CLI-02).
 * Operational controls (Ctrl+P / Ctrl+C / Ctrl+D) stay outside the text channel.
 * UX M4–M7: Grill-Me scan/card, local 0-tok tag, capability gate hooks, daemon attach, keybindings.
 */

import * as readline from "node:readline";
import { resolve } from "node:path";
import { runIntentFlow } from "../intake/intent-flow.js";
import { formatQuestionForUser, type GrillMeQuestion } from "../grill-me/session.js";
import { StateDb, defaultStateDbPath } from "../state-db/index.js";
import {
  attachKeybindings,
  attachSigint,
  MSG_DETACH_OFF_WARN,
  MSG_DETACH_OK,
  MSG_INTERRUPT_FORCED,
  MSG_INTERRUPT_GRACEFUL,
  MSG_PAUSE,
  type KeybindingController,
} from "./keybindings.js";
import { renderBootBanner, renderSessionFooter } from "./hud.js";
import { renderActiveAgentsTree, type ActiveAgentView } from "./layout.js";
import { buildStatusPanel, renderStatusPanelPt } from "./status-panel.js";
import { detectWorkspaceSession } from "./workspace-session.js";
import { colorEnabled } from "./colors.js";
import {
  formatDaemonBannerLabel,
  formatInboxStreamLine,
  resolveDaemonInboxForShell,
  type DaemonAttachInfo,
  type ShellInboxBridge,
} from "./daemon-probe.js";
import {
  isGoalContractConfirmAnswer,
  renderGoalContractCard,
  renderWorkspaceScanLine,
  withLocalZeroTokTag,
  LOCAL_ZERO_TOK_TAG,
} from "./grill-ux.js";
import {
  createShellEventBus,
  paintProviderFallbackLine,
  renderCapabilityGatePrompt,
  type ShellEventBus,
  type ShellUxEvent,
} from "./capability-ui.js";

export interface EvolveShellOptions {
  workspace?: string;
  /** Injected lines for unit tests (no stdin). */
  inputLines?: string[];
  output?: (line: string) => void;
  /** When set, skip interactive grill and use these answers (persists). */
  answers?: Array<string | undefined>;
  /** Disable raw-mode keybindings (tests / pipes). */
  disable_raw_mode?: boolean;
  /** Exit after one intent when non-interactive. */
  one_shot?: boolean;
  /** Optional active agents for middle-zone tree (tests / live HUD). */
  active_agents?: ActiveAgentView[];
  /** Force terminal columns for banner (tests). */
  columns?: number;
  /** Inject daemon attach info (skip live UDS probe). */
  daemon_attach?: DaemonAttachInfo;
  /** Inject Inbox bridge (skip live UDS subscribe; tests / mocks). */
  inbox_bridge?: ShellInboxBridge;
  /** Optional EventBus for BLOCKED / provider fault (defaults to internal stub). */
  event_bus?: ShellEventBus;
  /** Seed events emitted once after boot hooks are wired (tests). */
  seed_events?: ShellUxEvent[];
  /** Called after keybindings are attached, before the input loop (tests). */
  on_ready?: (ctrl: KeybindingController) => void;
  /**
   * Called while EventBus input-lock is held, before each turn's input is
   * consumed (tests: emit parallel events; they buffer until flush pós-submit).
   */
  on_awaiting_input?: () => void;
}

export interface EvolveShellResult {
  lines: string[];
  exit_code: number;
  resumed: boolean;
  paused: boolean;
  interrupted: boolean;
  interrupt_forced: boolean;
  detached: boolean;
  daemon_label: string;
  keybindings: { raw_mode_active: boolean };
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolveAsk) => {
    rl.question(prompt, (answer) => resolveAsk(answer));
  });
}

/**
 * Hold EventBus write lock while waiting for a line, then flush buffered
 * events after submit so stream writes never interleave with the prompt.
 */
async function withInputLock<T>(
  bus: ShellEventBus,
  onAwaiting: (() => void) | undefined,
  read: () => Promise<T> | T,
): Promise<T> {
  bus.setAwaitingInput(true);
  try {
    onAwaiting?.();
    return await read();
  } finally {
    bus.flush();
    bus.setAwaitingInput(false);
  }
}

async function collectAnswersInteractive(
  rl: readline.Interface,
  questions: GrillMeQuestion[],
  write: (s: string) => void,
  bus: ShellEventBus,
  onAwaiting?: () => void,
): Promise<string[]> {
  const answers: string[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    write(formatQuestionForUser(q, i + 1, questions.length));
    const raw = await withInputLock(bus, onAwaiting, () =>
      ask(rl, "Resposta (Enter/ok = recomendação)> "),
    );
    answers.push(raw);
  }
  return answers;
}

function writeGoalOutcome(
  write: (s: string) => void,
  out: Extract<ReturnType<typeof runIntentFlow>, { kind: "goal_contract" }>,
): void {
  write(out.summary_lines.join("\n"));
  if (out.goal_document_id) {
    write(`Goal Document: ${out.goal_document_id}`);
  }
  write(
    `Planeamento: ${out.planning.planning_authorized ? "autorizado" : "bloqueado"} (scale=${out.scale})`,
  );
}

function cardFromGoalOut(
  out: Extract<ReturnType<typeof runIntentFlow>, { kind: "goal_contract" }>,
): string {
  const acceptance =
    out.contract.criteria.find((c) => c.id === "c-accept")?.description ??
    out.contract.criteria[0]?.description ??
    "—";
  return renderGoalContractCard({
    objective: out.contract.objective,
    scope: out.contract.scope.join("; ") || "—",
    criteria: acceptance,
    risks: out.contract.out_of_scope.length
      ? `Fora de escopo / risco: ${out.contract.out_of_scope.join("; ")}`
      : "—",
    version: `v${out.contract.version ?? 1}`,
  });
}

export async function runEvolveShell(opts: EvolveShellOptions = {}): Promise<EvolveShellResult> {
  const workspace = resolve(opts.workspace ?? process.cwd());
  const lines: string[] = [];
  const write = (line: string) => {
    lines.push(line);
    (opts.output ?? console.log)(line);
  };

  let paused = false;
  let interrupted = false;
  let interrupt_forced = false;
  let detached = false;
  let exit_code = 0;
  let pendingDetachConfirm = false;

  const session = detectWorkspaceSession(workspace);
  const hudColor = colorEnabled({
    isTTY: Boolean(process.stdout.isTTY) && !opts.inputLines && !opts.disable_raw_mode,
  });

  const { info: daemonInfo, bridge: inboxBridge } =
    await resolveDaemonInboxForShell({
      workspace,
      daemon_attach: opts.daemon_attach,
      inbox_bridge: opts.inbox_bridge,
    });
  const daemon_label = formatDaemonBannerLabel(daemonInfo);
  let unsubInbox: (() => void) | undefined;
  if (inboxBridge && daemonInfo.inbox_sync === "enabled") {
    unsubInbox = inboxBridge.subscribe((ev) => {
      write(formatInboxStreamLine(ev));
    });
  }

  // M1 — Núcleo+Órbita banner once at boot (no ANSI when NO_COLOR / non-TTY / test inject).
  write(
    renderBootBanner(
      session,
      { daemon: daemon_label },
      {
        columns: opts.columns ?? process.stdout.columns ?? 80,
        color: hudColor,
        isTTY: hudColor,
      },
    ),
  );
  write(session.message_pt);

  let keyCtrl: KeybindingController | undefined;
  let detachSigint: (() => void) | undefined = undefined;
  let unsubBus: (() => void) | undefined = undefined;

  const eventBus = opts.event_bus ?? createShellEventBus();
  unsubBus = eventBus.on((event) => {
    if (event.type === "BLOCKED") {
      write(
        renderCapabilityGatePrompt(
          { agent: event.agent, action: event.action, reason: event.reason },
          { color: hudColor, isTTY: hudColor },
        ),
      );
      return;
    }
    if (event.type === "PROVIDER_FAULT") {
      write(
        paintProviderFallbackLine(
          {
            provider: event.provider,
            code: event.code,
            cooldown_s: event.cooldown_s,
            fallback_to: event.fallback_to,
            attempts: event.attempts,
          },
          { color: hudColor, isTTY: hudColor },
        ),
      );
    }
  });

  for (const ev of opts.seed_events ?? []) {
    eventBus.emit(ev);
  }

  const writeMiddleAndFooter = (snap = detectWorkspaceSession(workspace)) => {
    const agents = opts.active_agents ?? [];
    const tree = renderActiveAgentsTree(agents);
    if (tree) write(tree);
    const shortcuts = daemonInfo.active
      ? "Ctrl+P Pause · Ctrl+C Stop · Ctrl+D Detach"
      : "Ctrl+P Pause · Ctrl+C Stop";
    write(
      renderSessionFooter(
        snap,
        { shortcuts },
        { color: hudColor, isTTY: hudColor },
      ),
    );
  };

  const onPause = () => {
    paused = true;
    write(MSG_PAUSE);
  };
  const onResume = () => {
    paused = false;
    write("Retomado.");
  };
  const onInterrupt = () => {
    interrupted = true;
    exit_code = 130;
    write(MSG_INTERRUPT_GRACEFUL);
  };
  const onInterruptForced = () => {
    interrupted = true;
    interrupt_forced = true;
    exit_code = 130;
    write(MSG_INTERRUPT_FORCED);
  };
  const onDetach = () => {
    if (daemonInfo.active && daemonInfo.attached) {
      detached = true;
      interrupted = true;
      exit_code = 0;
      write(MSG_DETACH_OK);
      return;
    }
    pendingDetachConfirm = true;
    write(MSG_DETACH_OFF_WARN);
  };

  if (!opts.disable_raw_mode && !opts.inputLines) {
    keyCtrl = attachKeybindings(process.stdin, {
      onPause,
      onResume,
      onInterrupt,
      onInterruptForced,
      onDetach,
    });
    detachSigint = attachSigint(onInterrupt);
  } else {
    keyCtrl = {
      raw_mode_active: false,
      emit: (action) => {
        if (action === "pause") onPause();
        else if (action === "resume") onResume();
        else if (action === "interrupt") onInterrupt();
        else if (action === "interrupt_forced") onInterruptForced();
        else if (action === "detach") onDetach();
      },
      dispose: () => undefined,
    };
  }

  const handleLine = async (
    raw: string,
    rl?: readline.Interface,
  ): Promise<"continue" | "quit"> => {
    if (interrupted) return "quit";
    const line = raw.trim();
    if (!line && !pendingDetachConfirm) return "continue";

    if (pendingDetachConfirm) {
      pendingDetachConfirm = false;
      if (isGoalContractConfirmAnswer(line)) {
        detached = true;
        interrupted = true;
        exit_code = 0;
        write("Sessão encerrada (daemon OFF).");
        return "quit";
      }
      write("Detach cancelado.");
      return "continue";
    }

    if (paused) {
      if (/^(continuar|resume|retomar)$/i.test(line)) {
        onResume();
        return "continue";
      }
      write("Em pausa — digite 'continuar' ou use controlos operacionais.");
      return "continue";
    }

    if (/^(sair|exit|quit)$/i.test(line)) {
      write("Até breve. Estado permanece em .evolveloop/");
      return "quit";
    }

    // Conversational line (not quit): publish to shared Inbox when attached.
    if (
      inboxBridge &&
      daemonInfo.inbox_sync === "enabled" &&
      daemonInfo.attached
    ) {
      try {
        await inboxBridge.publish(line);
      } catch {
        /* best-effort sync — local intent still proceeds */
      }
    }

    if (/^(status|estado|painel)$/i.test(line)) {
      const snap = detectWorkspaceSession(workspace);
      write(withLocalZeroTokTag(renderStatusPanelPt(buildStatusPanel(snap))));
      write(withLocalZeroTokTag(snap.message_pt));
      writeMiddleAndFooter(snap);
      return "continue";
    }

    if (/^(pause|pausar)$/i.test(line)) {
      onPause();
      write(LOCAL_ZERO_TOK_TAG);
      return "continue";
    }

    if (/^(help|ajuda)$/i.test(line)) {
      write(
        withLocalZeroTokTag(
          "Ajuda local: status · pausar · continuar · sair · Ctrl+P/C/D",
        ),
      );
      return "continue";
    }

    try {
      const interactive = Boolean(rl) && !opts.answers;

      if (interactive && rl) {
        write(
          renderWorkspaceScanLine({
            env: process.env,
            isTTY: hudColor,
            animated: hudColor,
          }),
        );
        const preview = runIntentFlow({
          workspace,
          intent: line,
          answers: [],
          persist: false,
        });
        if ("bypassed" in preview && preview.bypassed) {
          write(preview.message_pt);
          return opts.one_shot ? "quit" : "continue";
        }
        if (preview.kind !== "goal_contract") {
          return "continue";
        }
        write("Entrevista Grill-Me (3–5 perguntas). Enter/ok aceita a recomendação.");
        const collected = await collectAnswersInteractive(
          rl,
          preview.questions,
          write,
          eventBus,
          opts.on_awaiting_input,
        );
        const drafted = runIntentFlow({
          workspace,
          intent: line,
          answers: collected,
          confirm_mso: false,
          persist: true,
        });
        if (drafted.kind === "goal_contract") {
          write(cardFromGoalOut(drafted));
          const conf = await withInputLock(eventBus, opts.on_awaiting_input, () =>
            ask(rl, "Confirmar Goal Contract? (Enter/sim)> "),
          );
          if (isGoalContractConfirmAnswer(conf)) {
            const db = new StateDb(defaultStateDbPath(workspace));
            try {
              db.confirmMso(drafted.contract.goal_contract_id);
            } finally {
              db.close();
            }
            writeGoalOutcome(write, drafted);
            write("MSO marcado como confirmado (pronto para planeamento autorizado).");
          } else {
            write("Confirmação cancelada — Goal Contract guardado sem MSO confirmado.");
            writeGoalOutcome(write, drafted);
          }
        } else if ("message_pt" in drafted) {
          write(drafted.message_pt);
        }
      } else {
        const out = runIntentFlow({
          workspace,
          intent: line,
          answers: opts.answers ?? [],
          confirm_mso: true,
          persist: true,
        });
        if ("bypassed" in out && out.bypassed) {
          write(out.message_pt);
        } else if (out.kind === "goal_contract") {
          write(out.grill_prompts_pt.join("\n---\n"));
          writeGoalOutcome(write, out);
        }
      }

      writeMiddleAndFooter();
      return opts.one_shot ? "quit" : "continue";
    } catch (err) {
      write(`Erro: ${err instanceof Error ? err.message : String(err)}`);
      exit_code = exit_code === 130 ? 130 : 1;
    }
    return "continue";
  };

  opts.on_ready?.(keyCtrl);

  try {
    if (opts.inputLines) {
      for (const line of opts.inputLines) {
        if (interrupted) break;
        // Buffer EventBus writes during "awaiting input", flush after submit.
        await withInputLock(eventBus, opts.on_awaiting_input, () => line);
        const r = await handleLine(line);
        if (r === "quit") break;
      }
    } else {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: Boolean(process.stdin.isTTY),
      });
      write("Digite a intenção (ou status / pausar / sair):");
      while (!interrupted) {
        const answer = await withInputLock(eventBus, opts.on_awaiting_input, () =>
          ask(rl, "evolve> "),
        );
        const r = await handleLine(answer, rl);
        if (r === "quit") break;
      }
      rl.close();
    }
  } finally {
    keyCtrl?.dispose();
    detachSigint?.();
    unsubBus?.();
    unsubInbox?.();
    await inboxBridge?.close().catch(() => undefined);
  }

  return {
    lines,
    exit_code,
    resumed: session.initialized,
    paused,
    interrupted,
    interrupt_forced,
    detached,
    daemon_label,
    keybindings: { raw_mode_active: keyCtrl?.raw_mode_active ?? false },
  };
}
