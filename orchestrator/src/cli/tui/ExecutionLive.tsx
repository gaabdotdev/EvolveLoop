/**
 * Live execution HUD — spinner · phase · elapsed · sliding activity · silence.
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

export interface ExecutionLiveProps {
  activity: ActivityWindowState;
  /** Injected clock for tests; defaults to Date.now. */
  nowMs?: number;
}

export function ExecutionLive({
  activity,
  nowMs: nowProp,
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
  const worker = activity.worker ? ` · ${activity.worker}` : "";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color="cyan">{SPINNER[spin]} </Text>
        <Text bold>{activity.phase}</Text>
        <Text dimColor>
          {" "}
          [{elapsed}]{worker} · {formatLastSignalHint(activity, now)}
        </Text>
      </Text>
      {silent ? (
        <Text color="yellow">{formatSilenceHint(activity, now)}</Text>
      ) : null}
      <Box flexDirection="column" marginTop={silent ? 0 : 0}>
        {activity.events.map((ev) => (
          <Text key={ev.id} dimColor>
            {"  "}
            {ev.text}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
