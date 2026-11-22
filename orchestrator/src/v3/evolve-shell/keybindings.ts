/**
 * Operational controls outside the text channel (V0-CLI-02 / UX spec §7).
 *
 * Node TTY raw-mode is limited under Vitest / non-TTY CI. Production shell
 * attaches stdin keypress when `process.stdin.isTTY`; tests inject hooks via
 * `KeybindingController.emit`.
 *
 * Documented bindings:
 *   Ctrl+P  → pause / resume toggle
 *   Ctrl+C  → graceful interrupt (1×); force within 2s (2×)
 *   Ctrl+D  → detach (daemon ON) or warn+confirm path (daemon OFF)
 *
 * See docs/v0/CLI-KEYBINDINGS.md
 */

import { emitKeypressEvents } from "node:readline";

export type KeybindingAction =
  | "pause"
  | "resume"
  | "interrupt"
  | "interrupt_forced"
  | "detach";

export const INTERRUPT_FORCE_WINDOW_MS = 2000;

export const MSG_INTERRUPT_GRACEFUL =
  "⏹ Interrompendo… (Ctrl+C novamente para forçar)";

export const MSG_INTERRUPT_FORCED =
  "✖ Encerramento forçado; execute evolve novamente para reconciliar.";

export const MSG_PAUSE =
  "⏸ Novas delegações pausadas (aguardando tarefas ativas)";

export const MSG_DETACH_OK =
  "↪ Desconectado do daemon (Orchestrator continua em background).";

export const MSG_DETACH_OFF_WARN =
  "Daemon OFF: fechar o terminal encerrará a sessão. Confirme detach/saída (sim/Enter) ou cancele.";

export interface KeybindingHooks {
  onPause: () => void;
  onResume?: () => void;
  onInterrupt: () => void;
  onInterruptForced?: () => void;
  onDetach?: () => void;
}

export interface KeybindingController {
  /** True when raw-mode keypress listener is active. */
  raw_mode_active: boolean;
  /** Test / programmatic injection. */
  emit: (action: KeybindingAction) => void;
  dispose: () => void;
}

export function attachKeybindings(
  stdin: NodeJS.ReadStream,
  hooks: KeybindingHooks,
): KeybindingController {
  let disposed = false;
  let lastInterruptAt = 0;
  let paused = false;

  const emit = (action: KeybindingAction) => {
    if (disposed) return;
    if (action === "pause") {
      paused = true;
      hooks.onPause();
      return;
    }
    if (action === "resume") {
      paused = false;
      hooks.onResume?.();
      return;
    }
    if (action === "interrupt") {
      hooks.onInterrupt();
      return;
    }
    if (action === "interrupt_forced") {
      (hooks.onInterruptForced ?? hooks.onInterrupt)();
      return;
    }
    if (action === "detach") {
      hooks.onDetach?.();
    }
  };

  const handleInterruptKey = () => {
    const now = Date.now();
    if (lastInterruptAt > 0 && now - lastInterruptAt <= INTERRUPT_FORCE_WINDOW_MS) {
      lastInterruptAt = 0;
      emit("interrupt_forced");
      return;
    }
    lastInterruptAt = now;
    emit("interrupt");
  };

  const canRaw = Boolean(stdin.isTTY && typeof stdin.setRawMode === "function");
  if (!canRaw) {
    return {
      raw_mode_active: false,
      emit,
      dispose: () => {
        disposed = true;
      },
    };
  }

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const onKeypress = (
    _str: string | undefined,
    key: { ctrl?: boolean; name?: string; sequence?: string } | undefined,
  ) => {
    if (!key) return;
    if (key.ctrl && key.name === "p") {
      if (paused) emit("resume");
      else emit("pause");
      return;
    }
    if (key.ctrl && key.name === "c") {
      handleInterruptKey();
      return;
    }
    if (key.ctrl && key.name === "d") {
      emit("detach");
    }
  };

  stdin.on("keypress", onKeypress);

  return {
    raw_mode_active: true,
    emit,
    dispose: () => {
      disposed = true;
      stdin.off("keypress", onKeypress);
      try {
        stdin.setRawMode(false);
      } catch {
        /* ignore */
      }
    },
  };
}

/** SIGINT → graceful interrupt (works even when raw mode is off). */
export function attachSigint(onInterrupt: () => void): () => void {
  const handler = () => onInterrupt();
  process.on("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
}
