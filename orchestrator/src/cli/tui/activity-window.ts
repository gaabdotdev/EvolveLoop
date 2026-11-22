/**
 * Sliding activity window + silence detection for live execution HUD.
 * Pure state machine — Ink layer only consumes snapshots.
 */

export const ACTIVITY_WINDOW_MAX = 5;
export const SILENCE_WARN_MS = 30_000;

export interface ActivityEvent {
  id: string;
  text: string;
  at_ms: number;
}

export interface ActivityWindowState {
  events: ActivityEvent[];
  started_at_ms: number;
  last_signal_at_ms: number;
  phase: string;
  worker?: string;
}

export function createActivityWindow(
  nowMs: number,
  phase = "INIT",
): ActivityWindowState {
  return {
    events: [],
    started_at_ms: nowMs,
    last_signal_at_ms: nowMs,
    phase,
  };
}

export function pushActivityEvent(
  state: ActivityWindowState,
  text: string,
  nowMs: number,
  opts?: { phase?: string; worker?: string; id?: string; max?: number },
): ActivityWindowState {
  const max = opts?.max ?? ACTIVITY_WINDOW_MAX;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return {
      ...state,
      phase: opts?.phase ?? state.phase,
      worker: opts?.worker ?? state.worker,
    };
  }
  const next: ActivityEvent = {
    id: opts?.id ?? `ev-${nowMs}-${state.events.length}`,
    text: trimmed,
    at_ms: nowMs,
  };
  const events = [...state.events, next].slice(-max);
  return {
    events,
    started_at_ms: state.started_at_ms,
    last_signal_at_ms: nowMs,
    phase: opts?.phase ?? state.phase,
    worker: opts?.worker ?? state.worker,
  };
}

/** Parse "MSO → PHASE" style lines into a phase label. */
export function phaseFromWriteLine(line: string): string | undefined {
  const m = line.match(/MSO\s*→\s*([A-Z0-9_-]+)/i);
  return m?.[1]?.toUpperCase();
}

export function silenceMs(state: ActivityWindowState, nowMs: number): number {
  return Math.max(0, nowMs - state.last_signal_at_ms);
}

export function isSilentTooLong(
  state: ActivityWindowState,
  nowMs: number,
  thresholdMs = SILENCE_WARN_MS,
): boolean {
  return silenceMs(state, nowMs) > thresholdMs;
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function formatSilenceHint(state: ActivityWindowState, nowMs: number): string {
  const sec = Math.floor(silenceMs(state, nowMs) / 1000);
  return `aguardando resposta do modelo (${sec}s)...`;
}

export function formatLastSignalHint(state: ActivityWindowState, nowMs: number): string {
  const sec = Math.floor(silenceMs(state, nowMs) / 1000);
  return `último sinal há ${sec}s`;
}

/** Terminal bell — TTY only, fire-and-forget. */
export function ringTerminalBell(stdout: NodeJS.WriteStream = process.stdout): void {
  if (stdout.isTTY) {
    stdout.write("\x07");
  }
}
