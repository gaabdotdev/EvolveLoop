/**
 * EvolveLoop Ink TUI — progressive banner · spaced history · live execution · compact footer.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import { resolve } from "node:path";
import { MultilineInput } from "./MultilineInput.js";
import { pushInputHistory } from "./input-history.js";
import { FooterBar } from "./FooterBar.js";
import { GoalContractReview, type GoalReviewAction } from "./GoalContractReview.js";
import { GrillQuestionSelect } from "./GrillQuestionSelect.js";
import { ProviderSetup } from "./ProviderSetup.js";
import { ExecutionLive } from "./ExecutionLive.js";
import { DeliveryCard, type DeliveryStatus } from "./DeliveryCard.js";
import { HistoryLine, type HistoryEntry } from "./HistoryLine.js";
import {
  buildGoalDisplay,
  type GoalDisplayFields,
} from "./goal-display.js";
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

type Phase =
  | "provider"
  | "ready"
  | "grill_q"
  | "review"
  | "busy"
  | "delivery";

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

  const [pendingIntent, setPendingIntent] = useState("");
  const [questions, setQuestions] = useState<GrillMeQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [reviewDisplay, setReviewDisplay] = useState<GoalDisplayFields | null>(null);
  const [draftContractId, setDraftContractId] = useState<string | undefined>();

  const [activity, setActivity] = useState<ActivityWindowState>(() =>
    createActivityWindow(Date.now(), "INIT"),
  );
  const [delivery, setDelivery] = useState<{
    status: DeliveryStatus;
    tokens_mso?: number;
    tokens_workers?: number;
    verification?: { command: string; exit_code: number };
  } | null>(null);

  const providerSnap = useMemo(() => probeProviderReadiness(), []);
  const needProvider = needsInlineProviderSetup(providerSnap);

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
    if (session.message_pt) {
      setHistory([{ id: nextId("sys"), kind: "system", text: session.message_pt }]);
    }
    if (!needProvider) setPhase("ready");
  }, [workspace, hudColor, needProvider, providerSnap.summary]);

  const telemetry: FooterTelemetry = useMemo(() => {
    const session = detectWorkspaceSession(workspace);
    const live = probeHudEnvironment(workspace);
    const tokens = loadHonestTokenTelemetry(workspace);
    return buildFooterTelemetry(session, {
      shortcuts: "Ctrl+P Pause · Ctrl+C Stop · Ctrl+D Detach",
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

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      appendSystem("Interrompido (Ctrl+C).");
      finish({ interrupted: true, exit_code: 130 });
      return;
    }
    if (key.ctrl && input === "d") {
      appendSystem("Detach.");
      finish({ detached: true, exit_code: 0 });
      return;
    }
    if (key.ctrl && input === "p") {
      setPaused((p) => !p);
      appendSystem(paused ? "Retomado." : "Em pausa (Ctrl+P).");
      if (!paused) ringTerminalBell();
    }
  });

  const runSlash = useCallback(
    (cmd: SlashCommandId) => {
      if (cmd === "clear") {
        const result = runSlashHandler("clear");
        setHistory([]);
        appendSystem(result.message);
        return;
      }
      if (cmd === "config") {
        setPhase("provider");
        appendSystem(runSlashHandler("config").message);
        return;
      }
      if (cmd === "diff") {
        appendSystem(runSlashHandler("diff", { workspace }).message);
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
        appendSystem(
          runSlashHandler("status", {
            status: {
              mso_state: mso?.state,
              session_id: mso?.session_id,
              contract_version: contract?.version,
              provider: providersReady || "—",
              tokens_mso: tokMso,
              tokens_workers: tokW,
            },
          }).message,
        );
      }
    },
    [appendSystem, workspace, telemetry, providersReady],
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

      let status: DeliveryStatus = "PASS";
      if (!kick.started || kick.mso_state === "BLOCKED") status = "BLOCKED";
      if (kick.adapter_status && /fail|error/i.test(kick.adapter_status)) {
        status = "FAILED";
      }
      if (kick.message_pt.toLowerCase().includes("bloqueada")) status = "BLOCKED";

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
    const display = buildGoalDisplay({
      objective: drafted.contract.objective,
      scope: drafted.contract.scope,
      criteria: acceptance,
      risks: drafted.contract.out_of_scope.length
        ? `Fora de escopo: ${drafted.contract.out_of_scope.join("; ")}`
        : "—",
      version: `v${drafted.contract.version ?? 1}`,
    });
    setDraftContractId(drafted.contract.goal_contract_id);
    setReviewDisplay(display);
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
      runSlash(slash.command);
      return;
    }

    if (paused) {
      if (/^(continuar|resume|retomar)$/i.test(line)) {
        setPaused(false);
        appendSystem("Retomado.");
      } else {
        appendSystem("Em pausa — digite 'continuar' ou Ctrl+P.");
      }
      return;
    }
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
        appendSystem("Intenção não gerou Goal Contract. Reformule.");
        return;
      }

      setPendingIntent(line);
      const interviewBudget = grillInterviewBudget(line);
      if (interviewBudget === 0) {
        // Detailed intent → single confirmation card (no interrogation).
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
      appendSystem("Confirmação cancelada.");
      setPhase("ready");
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
          setQuestions(preview.questions.slice(0, 3));
        }
      } catch {
        setPhase("ready");
      }
      return;
    }
    void confirmAndExecute(draftContractId);
  };

  const bodyHistory = history.slice(-40);

  return (
    <Box flexDirection="column" width="100%">
      {bannerText ? (
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
          <GoalContractReview display={reviewDisplay} onAction={onReview} />
        ) : null}

        {phase === "busy" ? <ExecutionLive activity={activity} /> : null}

        {phase === "delivery" && delivery ? (
          <DeliveryCard
            status={delivery.status}
            workspace={workspace}
            verification={delivery.verification}
            tokens_mso={delivery.tokens_mso}
            tokens_workers={delivery.tokens_workers}
            onNewTask={() => {
              setDelivery(null);
              setPhase("ready");
            }}
            onQuit={() => finish()}
          />
        ) : null}

        {phase === "ready" ? (
          <Box flexDirection="column">
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
              placeholder="Descreva a tarefa ou digite / para comandos (Enter envia · Shift+Enter quebra linha)"
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
        />
      </Box>
    </Box>
  );
}
