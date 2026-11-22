/**
 * Pure multiline input state machine — bracketed paste + ↑/↓ history.
 * Ink `useInput` drives this; unit tests exercise paste/history without a TTY.
 */

export const PASTE_START = "\x1b[200~";
export const PASTE_END = "\x1b[201~";

export interface MultilineKeyFlags {
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  backspace?: boolean;
  delete?: boolean;
  shift?: boolean;
  meta?: boolean;
  ctrl?: boolean;
}

export interface MultilineInputState {
  value: string;
  pasting: boolean;
  histIdx: number | null;
  draftBeforeHist: string;
}

export type MultilineInputEffect =
  | { type: "none" }
  | { type: "submit"; value: string };

export function createMultilineInputState(
  value = "",
): MultilineInputState {
  return {
    value,
    pasting: false,
    histIdx: null,
    draftBeforeHist: "",
  };
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Apply one stdin chunk (Ink `useInput` event) to multiline state.
 * During bracketed paste, Enter becomes newline and never submits.
 */
export function applyMultilineInput(
  state: MultilineInputState,
  input: string,
  key: MultilineKeyFlags,
  history: readonly string[] = [],
): { state: MultilineInputState; effect: MultilineInputEffect } {
  // Bracketed paste markers may arrive as raw escape chunks.
  if (input.includes(PASTE_START) || input.includes(PASTE_END)) {
    let buf = input;
    let pasting = state.pasting;
    if (buf.includes(PASTE_START)) {
      pasting = true;
      buf = buf.split(PASTE_START).join("");
    }
    if (buf.includes(PASTE_END)) {
      pasting = false;
      buf = buf.split(PASTE_END).join("");
    }
    return {
      state: {
        ...state,
        pasting,
        value: buf ? state.value + normalizeNewlines(buf) : state.value,
      },
      effect: { type: "none" },
    };
  }

  if (key.upArrow) {
    const lines = state.value.split("\n");
    if (lines.length <= 1 && history.length > 0) {
      if (state.histIdx === null) {
        const next = history.length - 1;
        return {
          state: {
            ...state,
            draftBeforeHist: state.value,
            histIdx: next,
            value: history[next]!,
          },
          effect: { type: "none" },
        };
      }
      if (state.histIdx > 0) {
        const next = state.histIdx - 1;
        return {
          state: { ...state, histIdx: next, value: history[next]! },
          effect: { type: "none" },
        };
      }
    }
    return { state, effect: { type: "none" } };
  }

  if (key.downArrow) {
    const lines = state.value.split("\n");
    if (lines.length <= 1 && state.histIdx !== null) {
      if (state.histIdx < history.length - 1) {
        const next = state.histIdx + 1;
        return {
          state: { ...state, histIdx: next, value: history[next]! },
          effect: { type: "none" },
        };
      }
      return {
        state: {
          ...state,
          histIdx: null,
          value: state.draftBeforeHist,
        },
        effect: { type: "none" },
      };
    }
    return { state, effect: { type: "none" } };
  }

  if (key.return) {
    // Shift+Enter / Alt+Enter → newline; plain Enter submits (unless pasting).
    if (state.pasting || key.shift || key.meta) {
      return {
        state: { ...state, value: state.value + "\n" },
        effect: { type: "none" },
      };
    }
    const trimmed = state.value;
    return {
      state: {
        ...state,
        histIdx: null,
        value: "",
        pasting: false,
      },
      effect: { type: "submit", value: trimmed },
    };
  }

  if (key.backspace || key.delete) {
    return {
      state: {
        ...state,
        histIdx: null,
        value: state.value.slice(0, -1),
      },
      effect: { type: "none" },
    };
  }

  if (key.ctrl && input === "u") {
    return {
      state: { ...state, histIdx: null, value: "" },
      effect: { type: "none" },
    };
  }

  if (input && !key.ctrl && !key.meta) {
    // Multi-char chunk without paste markers → treat as paste blob (no submit).
    if (input.length > 1 && /[\r\n]/.test(input)) {
      return {
        state: {
          ...state,
          histIdx: null,
          value: state.value + normalizeNewlines(input),
        },
        effect: { type: "none" },
      };
    }
    return {
      state: {
        ...state,
        histIdx: null,
        value: state.value + input,
      },
      effect: { type: "none" },
    };
  }

  return { state, effect: { type: "none" } };
}
