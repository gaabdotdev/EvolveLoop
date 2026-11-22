/**
 * P1-2 — Task pause / resume / cancel labels vs UI-only confusion.
 * Distinguishes destructive vs navigation.
 */

export type TaskControlAction = "pause" | "resume" | "cancel" | "detach" | "interrupt";

export interface TaskControlMessage {
  action: TaskControlAction;
  destructive: boolean;
  message_pt: string;
  shortcut?: string;
}

export const TASK_CONTROL_SHORTCUTS =
  "Ctrl+P Pause Task · Ctrl+C Stop (destrutivo) · Ctrl+D Detach (≠ kill)";

export function taskControlMessage(
  action: TaskControlAction,
  opts?: { wasPaused?: boolean },
): TaskControlMessage {
  switch (action) {
    case "pause":
      return {
        action: "pause",
        destructive: false,
        shortcut: "Ctrl+P",
        message_pt:
          "Task em pausa (Ctrl+P) — StateDb + SIGSTOP em ProcessSessions owned (identidade verificada). Mesmo eixo que `evolve pause`. Digite 'continuar', Ctrl+P ou `evolve resume`. ≠ workflow pause.",
      };
    case "resume":
      return {
        action: "resume",
        destructive: false,
        shortcut: "Ctrl+P",
        message_pt: opts?.wasPaused
          ? "Task retomada — SIGCONT + StateDb limpou a pausa de jornada (mesmo eixo CLI/TUI)."
          : "Task já ativa (resume idempotente).",
      };
    case "cancel":
      return {
        action: "cancel",
        destructive: true,
        message_pt:
          "Cancelar Task pedido — destrutivo (SIGTERM→SIGKILL owned). ≠ detach. Confirme com 'cancelar' de novo ou /cancel.",
      };
    case "detach":
      return {
        action: "detach",
        destructive: false,
        shortcut: "Ctrl+D",
        message_pt:
          "Detach (Ctrl+D) — sair da TUI sem matar Agent / sem cancel de ProcessSession (≠ Ctrl+C / cancel).",
      };
    case "interrupt":
      return {
        action: "interrupt",
        destructive: true,
        shortcut: "Ctrl+C",
        message_pt:
          "Interromper (Ctrl+C) — pedirá confirmação; 2.º Ctrl+C cancela processos owned. ≠ detach (Ctrl+D).",
      };
  }
}

export function parseTaskControlLine(
  line: string,
): TaskControlAction | null {
  const t = line.trim().toLowerCase();
  if (/^(pausar|pause)$/.test(t)) return "pause";
  if (/^(continuar|resume|retomar)$/.test(t)) return "resume";
  if (/^(cancelar(\s+task)?|cancel)$/.test(t)) return "cancel";
  return null;
}
