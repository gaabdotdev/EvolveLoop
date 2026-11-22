/**
 * Live execution HUD — L1 Task/Session/Agents; technical stream off by default.
 * V4.1 P0-4: estado antes de log (D4).
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import {
  formatElapsed,
  formatLastSignalHint,
  formatSilenceHint,
  isSilentTooLong,
  type ActivityWindowState,
} from "./activity-window.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const SESSION_PT: Record<string, string> = {
  INIT: "início",
  LOADING_GOALS: "carregando",
  ANALYZING: "analisando",
  DECOMPOSING: "decompondo",
  DELEGATING: "delegando",
  WAITING_AGENTS: "aguardando agents",
  VALIDATING: "validando",
  BLOCKED: "bloqueada",
  RECOVERING: "recuperando",
  "TRUE-FULL-PASS": "concluída (verificada)",
};

export interface ExecutionLiveProps {
  activity: ActivityWindowState;
  /** Injected clock for tests; defaults to Date.now. */
  nowMs?: number;
  task_label?: string;
  /** Show raw activity events (L5). Default off. */
  show_technical?: boolean;
  narrow?: boolean;
}

export function ExecutionLive({
  activity,
  nowMs: nowProp,
  task_label,
  show_technical = false,
  narrow = false,
}: ExecutionLiveProps): React.ReactElement {
  const [tick, setTick] = useState(0);
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      setSpin((n) => (n + 1) % SPINNER.length);
    }, 200);
    return () => clearInterval(t);
  }, []);

  void tick;
  const now = nowProp ?? Date.now();
  const elapsed = formatElapsed(now - activity.started_at_ms);
  const silent = isSilentTooLong(activity, now);
  const sessionPt = SESSION_PT[activity.phase] ?? activity.phase;
  const agent = activity.worker ? ` · Agent: ${activity.worker}` : "";
  const blocked = activity.phase === "BLOCKED";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="cyan">{SPINNER[spin]} </Text>
        {task_label ? (
          <Text>
            Task <Text bold>{task_label}</Text>
            {" · "}
          </Text>
        ) : null}
        <Text bold>Session: {sessionPt}</Text>
        <Text dimColor>
          {" "}
          [{elapsed}]{agent} · {formatLastSignalHint(activity, now)}
        </Text>
      </Text>
      {blocked ? (
        <Text color="yellow">
          ■ Bloqueio: Session precisa de intervenção (veja /status)
        </Text>
      ) : null}
      {silent ? (
        <Text color="yellow">{formatSilenceHint(activity, now)}</Text>
      ) : null}
      {show_technical ? (
        <Box flexDirection="column" marginTop={0}>
          {activity.events.map((ev) => (
            <Text key={ev.id} dimColor>
              {"  "}
              {ev.text}
            </Text>
          ))}
        </Box>
      ) : activity.events.length > 0 && !narrow ? (
        <Text dimColor>
          {"  "}último sinal:{" "}
          {activity.events[activity.events.length - 1]!.text.slice(0, 72)}
        </Text>
      ) : null}
    </Box>
  );
}
