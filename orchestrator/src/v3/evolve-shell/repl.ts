/**
 * Permanent conversational input in Portuguese (V0-CLI-02).
 * Operational controls (Ctrl+P / Ctrl+C / Ctrl+D) stay outside the text channel.
 * UX M4–M7: Grill-Me scan/card, local 0-tok tag, capability gate hooks, daemon attach, keybindings.
 */

import * as readline from "node:readline";
import { resolve } from "node:path";
import { runIntentFlow } from "../intake/intent-flow.js";
import { formatQuestionForUser, resolveAnswers, type GrillMeQuestion } from "../grill-me/session.js";
import { grillInterviewBudget } from "../grill-me/adaptive.js";
import { StateDb, defaultStateDbPath } from "../state-db/index.js";
import {
  needsInlineProviderSetup,
  probeProviderReadiness,
  writeFreellmKeySecure,
  pingFreellmWithKey,
  pingOllamaLocal,
} from "./provider-readiness.js";
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
import { probeHudEnvironment } from "./hud-probes.js";
import {
  isProceedAfterConfirmIntent,
  startAuthorizedExecution,
} from "./shell-start-execution.js";
import { renderActiveAgentsTree, type ActiveAgentView } from "./layout.js";
import { buildStatusPanel, renderStatusPanelPt } from "./status-panel.js";
import { detectWorkspaceSession } from "./workspace-session.js";
import { colorEnabled } from "./colors.js";
import { hydrateHarnessConsentFromConfig } from "../security/harness-consent.js";
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
  const capped = questions.slice(0, Math.min(3, questions.length));
  for (let i = 0; i < capped.length; i++) {
    const q = capped[i]!;
    write(formatQuestionForUser(q, i + 1, capped.length));
    if (q.choices?.length) {
      q.choices.forEach((c, ci) => write(`  ${ci + 1}) ${c}`));
    }
    const raw = await withInputLock(bus, onAwaiting, () =>
      ask(rl, "Resposta (Enter/ok = recomendação · nº = escolha)> "),
    );
    const trimmed = raw.trim();
    const asNum = Number(trimmed);
    if (trimmed && Number.isInteger(asNum) && asNum >= 1 && q.choices?.[asNum - 1]) {
      const picked = q.choices[asNum - 1]!;
      answers.push(/^outro/i.test(picked) ? "" : picked);
    } else {
      answers.push(raw);
    }
  }
  return answers;
}

async function ensureProviderReadyClassic(
  rl: readline.Interface,
  write: (s: string) => void,
  bus: ShellEventBus,
  onAwaiting?: () => void,
): Promise<boolean> {
  const snap = probeProviderReadiness();
  if (!needsInlineProviderSetup(snap)) return true;
  write(`Provider readiness: ${snap.summary}`);
  write("1) Inserir API Key do FreeLLMAPI agora");
  write("2) Usar Ollama local (localhost:11434)");
  write("3) Configurar outra API Key");
  const choice = await withInputLock(bus, onAwaiting, () => ask(rl, "Escolha [1-3]> "));
  const n = choice.trim();
  if (n === "2") {
    const ping = pingOllamaLocal();
    write(ping.message);
    return ping.ok;
  }
  if (n === "1" || n === "3") {
    const key = await withInputLock(bus, onAwaiting, () => ask(rl, "API Key (não será ecoada em logs)> "));
    if (!key.trim()) {
      write("Chave vazia — provider não configurado.");
      return false;
    }
    writeFreellmKeySecure(key);
    process.env.FREELLMAPI_API_KEY = key.trim();
    process.env.EVOLVELOOP_FREELLMAPI_API_KEY = key.trim();
    const ping = await pingFreellmWithKey(key.trim());
    write(ping.message);
    return ping.ok;
  }
  write("Opção inválida.");
  return false;
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
    scope: out.contract.scope,
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
  hydrateHarnessConsentFromConfig();
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

  // Live probes (bwrap / providers / git) — absent metrics stay UNAVAILABLE.
  const hudProbe = probeHudEnvironment(workspace);

  // M1 — Núcleo+Órbita banner once at boot (no ANSI when NO_COLOR / non-TTY / test inject).
  write(
    renderBootBanner(
      session,
      { daemon: daemon_label, ...hudProbe.banner },
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
    // Refresh cheap probes each footer paint (bwrap/git/providers).
    const live = probeHudEnvironment(workspace);
    write(
      renderSessionFooter(
        snap,
        { shortcuts, ...live.footer },
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

    // Post–Grill-Me: "ok/continuar" starts MSO execution instead of re-grilling.
    if (isProceedAfterConfirmIntent(line)) {
      try {
        const canAskConsent = Boolean(rl) && !opts.answers;
        const kick = await startAuthorizedExecution({
          workspace,
          write,
          requestConsent:
            canAskConsent && rl
              ? async () => {
                  write(
                    "Isto autoriza spawn real do cursor-agent/agy neste host (só para EvolveLoop).",
                  );
                  const ans = await withInputLock(eventBus, opts.on_awaiting_input, () =>
                    ask(rl, "Autorizar harness? (Enter/sim)> "),
                  );
                  return isGoalContractConfirmAnswer(ans);
                }
              : undefined,
        });
        write(kick.message_pt);
        writeMiddleAndFooter();
        return opts.one_shot ? "quit" : "continue";
      } catch (err) {
        write(`Erro ao iniciar execução: ${err instanceof Error ? err.message : String(err)}`);
        exit_code = exit_code === 130 ? 130 : 1;
        writeMiddleAndFooter();
        return "continue";
      }
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
          write(
            `Intenção não gerou Plan. Reformule ou use 'continuar' se a execução já estiver confirmada.`,
          );
          writeMiddleAndFooter();
          return "continue";
        }

        const interviewBudget = grillInterviewBudget(line);
        let collected: string[];
        if (interviewBudget === 0) {
          write("Intenção detalhada — revisão única antes de executar:");
          collected = resolveAnswers(
            preview.questions,
            preview.questions.map(() => "ok"),
          ).map((a) => a.value);
        } else {
          write("Preciso de 2–3 esclarecimentos. Enter/ok aceita a recomendação.");
          const qs = preview.questions.slice(
            0,
            Math.min(interviewBudget, preview.questions.length),
          );
          collected = await collectAnswersInteractive(
            rl,
            qs,
            write,
            eventBus,
            opts.on_awaiting_input,
          );
        }

        const drafted = runIntentFlow({
          workspace,
          intent: line,
          answers: collected,
          confirm_mso: false,
          persist: true,
        });
        if (drafted.kind === "goal_contract") {
          const card = cardFromGoalOut(drafted);
          if (/Bloco\s*3/i.test(card)) {
            write("Erro interno: jargão de domínio vazou para o card — abortado.");
            writeMiddleAndFooter();
            return "continue";
          }
          write(card);
          write("[Enter] Confirmar e executar agora · [E] Ajustar · [Esc/n] Cancelar");
          const conf = await withInputLock(eventBus, opts.on_awaiting_input, () =>
            ask(rl, "Ação> "),
          );
          const t = conf.trim().toLowerCase();
          if (t === "e" || t === "edit" || t === "ajustar") {
            write("Ajuste: responda 2–3 perguntas.");
            const edited = await collectAnswersInteractive(
              rl,
              drafted.questions,
              write,
              eventBus,
              opts.on_awaiting_input,
            );
            const redrafted = runIntentFlow({
              workspace,
              intent: line,
              answers: edited,
              confirm_mso: false,
              persist: true,
            });
            if (redrafted.kind === "goal_contract") {
              write(cardFromGoalOut(redrafted));
              const conf2 = await withInputLock(eventBus, opts.on_awaiting_input, () =>
                ask(rl, "[Enter] Confirmar e executar agora> "),
              );
              if (isGoalContractConfirmAnswer(conf2)) {
                const db = new StateDb(defaultStateDbPath(workspace));
                try {
                  db.confirmMso(redrafted.contract.goal_contract_id);
                } finally {
                  db.close();
                }
                writeGoalOutcome(write, redrafted);
                const kick = await startAuthorizedExecution({
                  workspace,
                  write,
                  requestConsent: async () => {
                    write(
                      "Isto autoriza spawn real do cursor-agent/agy neste host (só para EvolveLoop).",
                    );
                    const ans = await withInputLock(eventBus, opts.on_awaiting_input, () =>
                      ask(rl, "Autorizar harness? (Enter/sim)> "),
                    );
                    return isGoalContractConfirmAnswer(ans);
                  },
                });
                write(kick.message_pt);
              } else {
                write("Confirmação cancelada.");
                writeGoalOutcome(write, redrafted);
              }
            }
          } else if (t === "n" || t === "nao" || t === "não" || t === "cancel" || t === "esc") {
            write("Confirmação cancelada — Plan guardado sem execução confirmada.");
            writeGoalOutcome(write, drafted);
          } else if (isGoalContractConfirmAnswer(conf) || t === "") {
            const db = new StateDb(defaultStateDbPath(workspace));
            try {
              db.confirmMso(drafted.contract.goal_contract_id);
            } finally {
              db.close();
            }
            writeGoalOutcome(write, drafted);
            const kick = await startAuthorizedExecution({
              workspace,
              write,
              requestConsent: async () => {
                write(
                  "Isto autoriza spawn real do cursor-agent/agy neste host (só para EvolveLoop).",
                );
                const ans = await withInputLock(eventBus, opts.on_awaiting_input, () =>
                  ask(rl, "Autorizar harness? (Enter/sim)> "),
                );
                return isGoalContractConfirmAnswer(ans);
              },
            });
            write(kick.message_pt);
          } else {
            write("Confirmação cancelada — Plan guardado sem execução confirmada.");
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
        } else {
          write("Sem ação para esta linha (não foi Plan nem bypass trivial).");
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
      const providerOk = await ensureProviderReadyClassic(
        rl,
        write,
        eventBus,
        opts.on_awaiting_input,
      );
      if (!providerOk) {
        write("Sem provider validado — configure uma chave ou Ollama antes de aceitar tarefas.");
        exit_code = exit_code === 130 ? 130 : 1;
        rl.close();
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
