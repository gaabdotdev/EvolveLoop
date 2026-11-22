/**
 * EvolveLoop Ink TUI — V4.1 P0 journey (home → Task → Plan → state → Delivery).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import { resolve } from "node:path";
import { MultilineInput } from "./MultilineInput.js";
import { pushInputHistory } from "./input-history.js";
import { FooterBar } from "./FooterBar.js";
import { GoalContractReview, type GoalReviewAction } from "./GoalContractReview.js";
import { GrillQuestionSelect } from "./GrillQuestionSelect.js";
import { ProviderSetup } from "./ProviderSetup.js";
import { ExecutionLive } from "./ExecutionLive.js";
import { DeliveryCard } from "./DeliveryCard.js";
import { deriveDeliveryStatus, type DeliveryStatus } from "./delivery-status.js";
import {
  deriveDeliveryFromWorkspace,
  validateDelivery,
} from "./delivery-verify.js";
import { HistoryLine, type HistoryEntry } from "./HistoryLine.js";
import { HomeResume } from "./HomeResume.js";
import { buildHomeResumeView, type HomeResumeView } from "./home-resume.js";
import { buildPlanDisplay, type PlanDisplayFields } from "./plan-display.js";
import { resolveLayoutMode } from "./layout-narrow.js";
import { ApprovalPanel, type ApprovalPanelAction } from "./ApprovalPanel.js";
import {
  TASK_CONTROL_SHORTCUTS,
  parseTaskControlLine,
  taskControlMessage,
} from "./task-controls.js";
import {
  clearJourneyPauseOnCancel,
  formatJourneyRunControlMessage,
  getJourneyPause,
  pauseJourneyTask,
  resumeJourneyTask,
} from "./journey-pause.js";
import { INTERRUPT_FORCE_WINDOW_MS } from "../../v3/evolve-shell/keybindings.js";
import { ApprovalFacade } from "../../v3/approvals/facade.js";
import { ApprovalStore } from "../../v3/approvals/store.js";
import type { ApprovalCardView } from "../../v3/approvals/facade.js";
import { resolveV3DataPaths } from "../../v3/paths.js";
import {
  defaultWorkspaceV3DataDir,
  formatAgentsListHuman,
  isAgentHandlesEnabled,
} from "../../v3/agent-handles/index.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  createActivityWindow,
  phaseFromWriteLine,
  pushActivityEvent,
  ringTerminalBell,
  type ActivityWindowState,
} from "./activity-window.js";
import {
  parseSlashCommand,
  SLASH_COMMANDS,
  type SlashCommandId,
} from "./slash-commands.js";
import { runSlashHandler } from "./slash-handlers.js";
import { renderBootBanner } from "../../v3/evolve-shell/hud.js";
import {
  buildFooterTelemetry,
  type FooterTelemetry,
} from "../../v3/evolve-shell/footer.js";
import { detectWorkspaceSession } from "../../v3/evolve-shell/workspace-session.js";
import { probeHudEnvironment } from "../../v3/evolve-shell/hud-probes.js";
import {
  needsInlineProviderSetup,
  probeProviderReadiness,
} from "../../v3/evolve-shell/provider-readiness.js";
import { runIntentFlow } from "../../v3/intake/intent-flow.js";
import { grillInterviewBudget } from "../../v3/grill-me/adaptive.js";
import { resolveAnswers, type GrillMeQuestion } from "../../v3/grill-me/session.js";
import { StateDb, defaultStateDbPath } from "../../v3/state-db/index.js";
import { loadHonestTokenTelemetry } from "../../v3/token-economy/honest-telemetry.js";
import {
  isProceedAfterConfirmIntent,
  startAuthorizedExecution,
} from "../../v3/evolve-shell/shell-start-execution.js";
import { colorEnabled } from "../../v3/evolve-shell/colors.js";
import { hydrateHarnessConsentFromConfig } from "../../v3/security/harness-consent.js";
import type { EvolveShellResult } from "../../v3/evolve-shell/repl.js";
import { shortObjectiveTitle } from "./goal-display.js";

type Phase =
  | "provider"
  | "ready"
  | "grill_q"
  | "review"
  | "approval"
  | "busy"
  | "delivery";

function resolveApprovalsDir(workspace: string): string {
  const envDir = process.env.EVOLVELOOP_DATA_DIR?.trim();
  if (envDir) return resolveV3DataPaths(envDir).approvalsDir;
  const v3 = defaultWorkspaceV3DataDir(workspace);
  if (existsSync(join(v3, "approvals"))) {
    return resolveV3DataPaths(v3).approvalsDir;
  }
  return resolveV3DataPaths(v3).approvalsDir;
}

export interface InkAppProps {
  workspace: string;
  onDone: (result: EvolveShellResult) => void;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function EvolveInkApp({ workspace: wsIn, onDone }: InkAppProps): React.ReactElement {
  const workspace = resolve(wsIn);
  const { exit } = useApp();
  const hudColor = colorEnabled({ isTTY: true });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [bannerText, setBannerText] = useState("");
  const [phase, setPhase] = useState<Phase>("provider");
  const [executing, setExecuting] = useState(false);
  const [exitCode, setExitCode] = useState(0);
  const [paused, setPaused] = useState(false);
  const [footerTick, setFooterTick] = useState(0);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [slashHint, setSlashHint] = useState<string | null>(null);
  const [providersReady, setProvidersReady] = useState("");
  const [homeView, setHomeView] = useState<HomeResumeView | null>(null);
  const [columns, setColumns] = useState(process.stdout.columns ?? 80);
  const [rows, setRows] = useState(process.stdout.rows ?? 24);

  const [pendingIntent, setPendingIntent] = useState("");
  const [questions, setQuestions] = useState<GrillMeQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [reviewDisplay, setReviewDisplay] = useState<PlanDisplayFields | null>(null);
  const [draftContractId, setDraftContractId] = useState<string | undefined>();
  const [activeTaskLabel, setActiveTaskLabel] = useState<string | undefined>();

  const [activity, setActivity] = useState<ActivityWindowState>(() =>
    createActivityWindow(Date.now(), "INIT"),
  );
  const [delivery, setDelivery] = useState<{
    status: DeliveryStatus;
    tokens_mso?: number;
    tokens_workers?: number;
    verification?: { command: string; exit_code: number };
  } | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalCardView | null>(
    null,
  );
  const [phaseBeforeApproval, setPhaseBeforeApproval] = useState<Phase>("ready");
  const [taskCancelArmed, setTaskCancelArmed] = useState(false);
  const [deferredApprovalIds, setDeferredApprovalIds] = useState<string[]>([]);
  /** Ctrl+C first press arms cancel; second within window confirms (≠ Ctrl+D detach). */
  const interruptArmedAt = useRef(0);

  const providerSnap = useMemo(() => probeProviderReadiness(), []);
  const needProvider = needsInlineProviderSetup(providerSnap);
  const layout = useMemo(() => resolveLayoutMode(columns, rows), [columns, rows]);

  const refreshHome = useCallback(() => {
    const session = detectWorkspaceSession(workspace);
    setHomeView(buildHomeResumeView(session));
  }, [workspace]);

  const appendSystem = useCallback((text: string) => {
    setHistory((prev) => [
      ...prev,
      { id: nextId("sys"), kind: "system", text },
    ]);
  }, []);

  const appendUser = useCallback((text: string) => {
    setHistory((prev) => [
      ...prev,
      { id: nextId("usr"), kind: "user", text },
    ]);
  }, []);

  useEffect(() => {
    hydrateHarnessConsentFromConfig();
    const session = detectWorkspaceSession(workspace);
    const probe = probeHudEnvironment(workspace);
    setProvidersReady(
      probe.providers !== "UNAVAILABLE" ? probe.providers : providerSnap.summary,
    );
    const banner = renderBootBanner(
      session,
      { ...probe.banner },
      { columns: process.stdout.columns ?? 80, color: hudColor, isTTY: true },
    );
    setBannerText(banner);
    setHomeView(buildHomeResumeView(session));
    // V4.3 P0-1 — hydrate pause from StateDb (same axis as evolve pause|resume).
    const jp = getJourneyPause(workspace);
    if (jp.paused) {
      setPaused(true);
      appendSystem(
        `Task em pausa (StateDb) — retomada via Ctrl+P / continuar / evolve resume. desde ${jp.paused_at ?? "?"}`,
      );
    }
    // V4.3 P0-2 — re-derive Delivery card only when evidence exists (no inventar PASS).
    try {
      const derived = deriveDeliveryFromWorkspace(workspace);
      if (derived.from_evidence) {
        setDelivery({
          status: derived.status,
          verification: derived.verification,
        });
      }
    } catch {
      /* no state.db yet */
    }
    if (!needProvider) setPhase("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate once per workspace
  }, [workspace, hudColor, needProvider, providerSnap.summary]);

  useEffect(() => {
    const onResize = () => {
      setColumns(process.stdout.columns ?? 80);
      setRows(process.stdout.rows ?? 24);
    };
    process.stdout.on?.("resize", onResize);
    return () => {
      process.stdout.off?.("resize", onResize);
    };
  }, []);

  const telemetry: FooterTelemetry = useMemo(() => {
    const session = detectWorkspaceSession(workspace);
    const live = probeHudEnvironment(workspace);
    const tokens = loadHonestTokenTelemetry(workspace);
    return buildFooterTelemetry(session, {
      shortcuts: TASK_CONTROL_SHORTCUTS,
      ...live.footer,
      tok_mso: tokens.tok_mso,
      tok_workers: tokens.tok_workers,
      executing,
      idle: executing ? false : undefined,
      mso_state: executing ? session.latest_mso_session?.state : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, executing, footerTick]);

  useEffect(() => {
    const t = setInterval(() => setFooterTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const finish = useCallback(
    (partial?: Partial<EvolveShellResult>) => {
      onDone({
        lines: history.map((h) => h.text),
        exit_code: exitCode,
        resumed: detectWorkspaceSession(workspace).initialized,
        paused,
        interrupted: false,
        interrupt_forced: false,
        detached: false,
        daemon_label: "OFF",
        keybindings: { raw_mode_active: true },
        ...partial,
      });
      exit();
    },
    [history, exitCode, paused, workspace, onDone, exit],
  );

  useEffect(() => {
    if (phase !== "approval") setPhaseBeforeApproval(phase);
  }, [phase]);

  const refreshPendingApproval = useCallback(() => {
    try {
      const facade = new ApprovalFacade(
        new ApprovalStore(resolveApprovalsDir(workspace)),
      );
      const pending = facade
        .listPending()
        .find((p) => !deferredApprovalIds.includes(p.approval_id));
      if (!pending) return;
      setPendingApproval(pending);
      setPhase((prev) => (prev === "approval" ? prev : "approval"));
    } catch {
      /* approvals dir may be empty / unreadable */
    }
  }, [workspace, deferredApprovalIds]);

  useEffect(() => {
    refreshPendingApproval();
    const t = setInterval(refreshPendingApproval, 3000);
    return () => clearInterval(t);
  }, [refreshPendingApproval]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      const now = Date.now();
      if (
        interruptArmedAt.current > 0 &&
        now - interruptArmedAt.current <= INTERRUPT_FORCE_WINDOW_MS
      ) {
        interruptArmedAt.current = 0;
        // Confirmed cancel — evidence via ProcessSession cancel before TUI exit.
        const cancelled = clearJourneyPauseOnCancel(workspace, "tui");
        setPaused(false);
        appendSystem(
          formatJourneyRunControlMessage({
            ...cancelled,
            run_control: cancelled.run_control,
          }),
        );
        appendSystem("Cancel confirmado (2× Ctrl+C) — ≠ detach.");
        finish({ interrupted: true, interrupt_forced: true, exit_code: 130 });
        return;
      }
      interruptArmedAt.current = now;
      appendSystem(taskControlMessage("interrupt").message_pt);
      return;
    }
    if (key.ctrl && input === "d") {
      // Navigation / detach — NEVER kill Agent or session-cancel (ADR Q3/Q4).
      interruptArmedAt.current = 0;
      appendSystem(taskControlMessage("detach").message_pt);
      finish({ detached: true, exit_code: 0 });
      return;
    }
    if (key.ctrl && input === "p") {
      // Ctrl+P = pause/resume only — never cancel/detach.
      interruptArmedAt.current = 0;
      if (paused) {
        const resumed = resumeJourneyTask(workspace, "tui");
        setPaused(false);
        appendSystem(formatJourneyRunControlMessage(resumed));
      } else {
        const pausedState = pauseJourneyTask(workspace, "tui");
        setPaused(true);
        appendSystem(formatJourneyRunControlMessage(pausedState));
        ringTerminalBell();
      }
    }
  });

  const onApprovalAction = useCallback(
    (action: ApprovalPanelAction) => {
      if (!pendingApproval) return;
      const facade = new ApprovalFacade(
        new ApprovalStore(resolveApprovalsDir(workspace)),
      );
      try {
        if (action === "approve") {
          const card = facade.approve(pendingApproval.approval_id, "tui");
          appendSystem(`Approval aprovado: ${card.what}`);
        } else if (action === "reject") {
          const card = facade.reject(pendingApproval.approval_id, "tui");
          appendSystem(`Approval rejeitado: ${card.what}`);
        } else {
          setDeferredApprovalIds((ids) =>
            ids.includes(pendingApproval.approval_id)
              ? ids
              : [...ids, pendingApproval.approval_id],
          );
          appendSystem("Approval adiado — permanece na fila (não reabre já).");
        }
      } catch (err) {
        appendSystem(
          `Approval falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      setPendingApproval(null);
      setPhase(phaseBeforeApproval === "approval" ? "ready" : phaseBeforeApproval);
      refreshPendingApproval();
    },
    [
      pendingApproval,
      workspace,
      appendSystem,
      phaseBeforeApproval,
      refreshPendingApproval,
    ],
  );

  const runSlash = useCallback(
    (cmd: SlashCommandId, slashArgs = "") => {
      if (cmd === "clear") {
        const result = runSlashHandler("clear");
        setHistory([]);
        appendSystem(result.message);
        return;
      }
      if (cmd === "config") {
        const result = runSlashHandler("config", {
          workspace,
          args: slashArgs,
        });
        appendSystem(result.message);
        if (result.command === "config" && result.open_provider) {
          setPhase("provider");
        }
        return;
      }
      if (cmd === "history") {
        appendSystem(
          runSlashHandler("history", { workspace, args: slashArgs }).message,
        );
        return;
      }
      if (cmd === "diff") {
        appendSystem(runSlashHandler("diff", { workspace }).message);
        return;
      }
      if (cmd === "plan") {
        appendSystem(runSlashHandler("plan", { plan: reviewDisplay }).message);
        return;
      }
      if (cmd === "approvals") {
        try {
          const facade = new ApprovalFacade(
            new ApprovalStore(resolveApprovalsDir(workspace)),
          );
          const pending = facade.listPending();
          appendSystem(
            runSlashHandler("approvals", { approvals: pending }).message,
          );
          if (pending[0]) {
            setPendingApproval(pending[0]);
            setPhase("approval");
          }
        } catch {
          appendSystem(
            runSlashHandler("approvals", { approvals: [] }).message,
          );
        }
        return;
      }
      if (cmd === "agents") {
        const handlesOn = isAgentHandlesEnabled({ workspace });
        let agentsLines: string[] | null = null;
        try {
          const paths = resolveV3DataPaths(defaultWorkspaceV3DataDir(workspace));
          const human = formatAgentsListHuman(paths, { workspace });
          if (human.agents.length > 0) {
            agentsLines = human.lines;
          }
        } catch {
          agentsLines = null;
        }
        appendSystem(
          runSlashHandler("agents", {
            agentsLines,
            handlesEnabled: handlesOn,
          }).message,
        );
        return;
      }
      if (cmd === "pause") {
        const pausedState = pauseJourneyTask(workspace, "slash");
        setPaused(true);
        appendSystem(formatJourneyRunControlMessage(pausedState));
        ringTerminalBell();
        return;
      }
      if (cmd === "cancel") {
        if (!taskCancelArmed) {
          setTaskCancelArmed(true);
          appendSystem(runSlashHandler("cancel").message);
          return;
        }
        const cancelled = clearJourneyPauseOnCancel(workspace, "slash");
        appendSystem(formatJourneyRunControlMessage(cancelled));
        appendSystem("Task cancelada (confirmação via /cancel). Voltando ao ready.");
        setTaskCancelArmed(false);
        setPaused(false);
        setExecuting(false);
        setPendingIntent("");
        setReviewDisplay(null);
        setPhase("ready");
        refreshHome();
        return;
      }
      if (cmd === "delivery") {
        const argsLower = (slashArgs ?? "").trim().toLowerCase();
        if (argsLower === "validate" || argsLower.startsWith("validate ")) {
          const runMatch = slashArgs?.match(/--run\s+(.+)$/i);
          if (!runMatch?.[1]?.trim()) {
            appendSystem(
              [
                "Uso: /delivery validate --run \"<comando>\"",
                "  → EvolveLoop executa; PASS só com local_execution exit 0",
                "CLI atestado: evolve delivery validate --command \"…\" --exit-code 0 → ATTESTED",
                "Sem --run → provenance=absent (não inventar PASS).",
              ].join("\n"),
            );
            return;
          }
          const view = validateDelivery(workspace, {
            run: runMatch[1].trim(),
          });
          setDelivery({
            status: view.status,
            verification: view.verification,
          });
          appendSystem(view.lines.join("\n"));
          setPhase("delivery");
          return;
        }
        // Re-derive from evidence (not session-only memory).
        const derived = deriveDeliveryFromWorkspace(workspace);
        const status = derived.from_evidence
          ? derived.status
          : delivery?.status ?? derived.status;
        const verification = derived.verification ?? delivery?.verification;
        if (derived.from_evidence) {
          setDelivery({
            status: derived.status,
            verification: derived.verification,
          });
        }
        appendSystem(
          runSlashHandler("delivery", {
            delivery: {
              status,
              detail: verification
                ? `verification: ${verification.command} (exit ${verification.exit_code})`
                : derived.message_pt,
            },
          }).message,
        );
        return;
      }
      if (cmd === "status") {
        const session = detectWorkspaceSession(workspace);
        const mso = session.latest_mso_session;
        const contract = session.latest_contract;
        const tokMso =
          telemetry.tok_mso.provenance !== "UNAVAILABLE" &&
          typeof telemetry.tok_mso.value === "number"
            ? String(telemetry.tok_mso.value)
            : "—";
        const tokW =
          telemetry.tok_workers.provenance !== "UNAVAILABLE" &&
          typeof telemetry.tok_workers.value === "number"
            ? String(telemetry.tok_workers.value)
            : "—";
        const taskLabel = contract
          ? shortObjectiveTitle(contract.objective)
          : activeTaskLabel ?? "—";
        appendSystem(
          runSlashHandler("status", {
            status: {
              mso_state: mso?.state,
              session_id: mso?.session_id,
              contract_version: contract?.version,
              provider: providersReady || "—",
              tokens_mso: tokMso,
              tokens_workers: tokW,
              task_label: taskLabel,
            },
          }).message,
        );
      }
    },
    [
      appendSystem,
      workspace,
      telemetry,
      providersReady,
      activeTaskLabel,
      reviewDisplay,
      delivery,
      taskCancelArmed,
      refreshHome,
    ],
  );

  const confirmAndExecute = async (goalContractId?: string) => {
    if (goalContractId) {
      const db = new StateDb(defaultStateDbPath(workspace));
      try {
        db.confirmMso(goalContractId);
      } finally {
        db.close();
      }
    }
    const started = Date.now();
    setActivity(createActivityWindow(started, "LOADING_GOALS"));
    setPhase("busy");
    setExecuting(true);
    setDelivery(null);

    const writeLive = (line: string) => {
      const phaseHit = phaseFromWriteLine(line);
      setActivity((prev) =>
        pushActivityEvent(prev, line, Date.now(), {
          phase: phaseHit ?? prev.phase,
        }),
      );
    };

    try {
      const kick = await startAuthorizedExecution({
        workspace,
        write: writeLive,
      });
      writeLive(kick.message_pt);
      setFooterTick((n) => n + 1);

      // P0-5: never default PASS without verification (ADR Q1).
      const status = deriveDeliveryStatus({
        kick_started: kick.started,
        mso_state: kick.mso_state,
        adapter_status: kick.adapter_status,
        message_pt: kick.message_pt,
        // Kick path does not attach Evidence Validator result — leave undefined.
        verification: undefined,
      });

      const rollup = loadHonestTokenTelemetry(workspace).aggregate;
      ringTerminalBell();
      setDelivery({
        status,
        tokens_mso: rollup && rollup.honesty !== "UNAVAILABLE" ? rollup.tokens_mso : undefined,
        tokens_workers:
          rollup && rollup.honesty !== "UNAVAILABLE" ? rollup.tokens_workers : undefined,
      });
      setPhase("delivery");
    } catch (err) {
      writeLive(`Erro ao iniciar execução: ${err instanceof Error ? err.message : String(err)}`);
      setExitCode(1);
      ringTerminalBell();
      const rollup = loadHonestTokenTelemetry(workspace).aggregate;
      setDelivery({
        status: "FAILED",
        tokens_mso: rollup && rollup.honesty !== "UNAVAILABLE" ? rollup.tokens_mso : undefined,
        tokens_workers:
          rollup && rollup.honesty !== "UNAVAILABLE" ? rollup.tokens_workers : undefined,
      });
      setPhase("delivery");
    } finally {
      setExecuting(false);
      setPendingIntent("");
      setQuestions([]);
      setAnswers([]);
      setReviewDisplay(null);
      refreshHome();
    }
  };

  const materializeDraft = (intent: string, rawAnswers: string[]) => {
    const drafted = runIntentFlow({
      workspace,
      intent,
      answers: rawAnswers,
      confirm_mso: false,
      persist: true,
    });
    if (drafted.kind !== "goal_contract") {
      if ("message_pt" in drafted) appendSystem(String(drafted.message_pt));
      setPhase("ready");
      return;
    }
    const acceptance =
      drafted.contract.criteria.find((c) => c.id === "c-accept")?.description ??
      drafted.contract.criteria[0]?.description ??
      "—";
    const plan = buildPlanDisplay({
      objective: drafted.contract.objective,
      scope: drafted.contract.scope,
      criteria: acceptance,
      risks: drafted.contract.out_of_scope.length
        ? `Fora de escopo: ${drafted.contract.out_of_scope.join("; ")}`
        : "—",
      version: `v${drafted.contract.version ?? 1}`,
      steps: drafted.contract.scope,
      agents: [],
      approval_needed: true,
    });
    setDraftContractId(drafted.contract.goal_contract_id);
    setActiveTaskLabel(plan.objective_title);
    setReviewDisplay(plan);
    setPhase("review");
  };

  const handleIntent = (raw: string) => {
    const line = raw.trim();
    if (!line) return;

    setInputHistory((h) => pushInputHistory(h, line));
    appendUser(line);
    setSlashHint(null);

    const slash = parseSlashCommand(line);
    if (slash.kind === "slash") {
      runSlash(slash.command, slash.args);
      return;
    }

    const control = parseTaskControlLine(line);
    if (control === "pause") {
      const pausedState = pauseJourneyTask(workspace, "tui");
      setPaused(true);
      appendSystem(formatJourneyRunControlMessage(pausedState));
      ringTerminalBell();
      return;
    }
    if (control === "resume" || (paused && control === null && /^(continuar|resume|retomar)$/i.test(line))) {
      const resumed = resumeJourneyTask(workspace, "tui");
      setPaused(false);
      setTaskCancelArmed(false);
      appendSystem(formatJourneyRunControlMessage(resumed));
      return;
    }
    if (control === "cancel") {
      if (!taskCancelArmed) {
        setTaskCancelArmed(true);
        appendSystem(taskControlMessage("cancel").message_pt);
        return;
      }
      const cancelled = clearJourneyPauseOnCancel(workspace, "tui");
      appendSystem(formatJourneyRunControlMessage(cancelled));
      appendSystem("Task cancelada (confirmação). Voltando ao ready.");
      setTaskCancelArmed(false);
      setPaused(false);
      setExecuting(false);
      setPendingIntent("");
      setReviewDisplay(null);
      setDelivery(null);
      setPhase("ready");
      refreshHome();
      return;
    }
    if (paused) {
      appendSystem("Task em pausa — digite 'continuar' / Ctrl+P, ou 'cancelar' (destrutivo).");
      return;
    }
    setTaskCancelArmed(false);
    if (/^(sair|exit|quit)$/i.test(line)) {
      appendSystem("Até breve. Estado permanece em .evolveloop/");
      finish();
      return;
    }
    if (isProceedAfterConfirmIntent(line)) {
      void confirmAndExecute();
      return;
    }

    try {
      const preview = runIntentFlow({
        workspace,
        intent: line,
        answers: [],
        persist: false,
      });
      if ("bypassed" in preview && preview.bypassed) {
        appendSystem(preview.message_pt);
        return;
      }
      if (preview.kind !== "goal_contract") {
        appendSystem("A intenção não gerou uma Task. Reformule o objetivo.");
        return;
      }

      setPendingIntent(line);
      setActiveTaskLabel(shortObjectiveTitle(line));
      // Grill-Me only when interview budget says questions are needed (P0-2).
      const interviewBudget = grillInterviewBudget(line);
      if (interviewBudget === 0) {
        const defaults = resolveAnswers(
          preview.questions,
          preview.questions.map(() => "ok"),
        );
        materializeDraft(
          line,
          defaults.map((a) => a.value),
        );
        return;
      }

      const qs = preview.questions.slice(
        0,
        Math.min(interviewBudget, preview.questions.length),
      );
      setQuestions(qs);
      setQIndex(0);
      setAnswers([]);
      setPhase("grill_q");
    } catch (err) {
      appendSystem(`Erro: ${err instanceof Error ? err.message : String(err)}`);
      setExitCode(1);
    }
  };

  const onGrillAnswer = (value: string) => {
    const next = [...answers, value];
    setAnswers(next);
    if (qIndex + 1 >= questions.length) {
      materializeDraft(pendingIntent, next);
    } else {
      setQIndex(qIndex + 1);
    }
  };

  const onReview = (action: GoalReviewAction) => {
    if (action === "cancel") {
      appendSystem("Confirmação do Plan cancelada.");
      setPhase("ready");
      refreshHome();
      return;
    }
    if (action === "edit") {
      setPhase("grill_q");
      setQIndex(0);
      setAnswers([]);
      try {
        const preview = runIntentFlow({
          workspace,
          intent: pendingIntent,
          answers: [],
          persist: false,
        });
        if (preview.kind === "goal_contract") {
          const budget = grillInterviewBudget(pendingIntent);
          const n = budget === 0 ? Math.min(3, preview.questions.length) : budget;
          setQuestions(preview.questions.slice(0, Math.min(n, preview.questions.length)));
        }
      } catch {
        setPhase("ready");
      }
      return;
    }
    void confirmAndExecute(draftContractId);
  };

  const bodyHistory = history.slice(-40);
  const sessionSnap = detectWorkspaceSession(workspace);
  const blockReason =
    activity.phase === "BLOCKED"
      ? "Session bloqueada — intervenção necessária"
      : undefined;
  const footerTask =
    activeTaskLabel ??
    (sessionSnap.latest_contract
      ? shortObjectiveTitle(sessionSnap.latest_contract.objective)
      : undefined);

  return (
    <Box flexDirection="column" width="100%">
      {layout.degradation_notice ? (
        <Box marginBottom={0}>
          <Text color="yellow">AVISO: {layout.degradation_notice}</Text>
        </Box>
      ) : null}

      {bannerText && !layout.narrow && !layout.short_height ? (
        <Box flexDirection="column" marginBottom={1}>
          <Static items={[bannerText]}>
            {(line, i) => (
              <Box key={`b-${i}`} flexDirection="column">
                {line.split("\n").map((l, j) => (
                  <Text key={`bl-${j}`}>{l}</Text>
                ))}
              </Box>
            )}
          </Static>
        </Box>
      ) : null}

      <Box flexDirection="column" flexGrow={1}>
        {bodyHistory.map((entry) => (
          <HistoryLine key={entry.id} entry={entry} />
        ))}

        {phase === "provider" ? (
          <Box marginBottom={1}>
            <ProviderSetup
              snapshot={probeProviderReadiness()}
              onReady={(summary) => {
                appendSystem(summary);
                setProvidersReady((prev) => prev || summary);
                refreshHome();
                setPhase("ready");
              }}
              onAbort={() => finish({ exit_code: 1 })}
            />
          </Box>
        ) : null}

        {phase === "grill_q" && questions[qIndex] ? (
          <GrillQuestionSelect
            question={questions[qIndex]!}
            index={qIndex + 1}
            total={questions.length}
            onAnswer={onGrillAnswer}
          />
        ) : null}

        {phase === "review" && reviewDisplay ? (
          <GoalContractReview
            display={reviewDisplay}
            onAction={onReview}
            narrow={layout.narrow}
          />
        ) : null}

        {phase === "approval" && pendingApproval ? (
          <ApprovalPanel
            card={pendingApproval}
            onAction={onApprovalAction}
            narrow={layout.narrow}
          />
        ) : null}

        {phase === "busy" ? (
          <ExecutionLive
            activity={activity}
            task_label={footerTask}
            show_technical={false}
            narrow={layout.narrow}
          />
        ) : null}

        {phase === "delivery" && delivery ? (
          <DeliveryCard
            status={delivery.status}
            workspace={workspace}
            verification={delivery.verification}
            tokens_mso={delivery.tokens_mso}
            tokens_workers={delivery.tokens_workers}
            narrow={layout.narrow}
            onNewTask={() => {
              setDelivery(null);
              refreshHome();
              setPhase("ready");
            }}
            onQuit={() => finish()}
          />
        ) : null}

        {phase === "ready" ? (
          <Box flexDirection="column">
            {homeView ? <HomeResume view={homeView} narrow={layout.narrow} /> : null}
            {slashHint ? (
              <Box flexDirection="column" marginBottom={0}>
                {SLASH_COMMANDS.filter(
                  (c) =>
                    !slashHint ||
                    c.id.startsWith(slashHint) ||
                    slashHint === "/",
                ).map((c) => (
                  <Text key={c.id} dimColor>
                    {c.label} — {c.hint}
                  </Text>
                ))}
              </Box>
            ) : null}
            <MultilineInput
              block
              prompt="→ "
              placeholder="Descreva a Task ou digite / para comandos (Enter envia · Shift+Enter quebra linha)"
              history={inputHistory}
              onSlashPrefix={(v) => {
                const t = v.trim();
                if (t === "/" || /^\/[a-z]*$/i.test(t)) {
                  setSlashHint(t === "/" ? "/" : t.slice(1).toLowerCase());
                } else {
                  setSlashHint(null);
                }
              }}
              onSubmit={handleIntent}
            />
          </Box>
        ) : null}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <FooterBar
          telemetry={telemetry}
          color={hudColor}
          providers_ready={providersReady}
          task_label={executing && footerTask ? `Task: ${footerTask}` : undefined}
          block_reason={blockReason}
          narrow={layout.narrow}
        />
      </Box>
    </Box>
  );
}
