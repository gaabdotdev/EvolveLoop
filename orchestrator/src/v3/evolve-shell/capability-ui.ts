/**
 * BLOCKED / Capability Gate UI + provider fallback line (UX spec §5.3–§5.4).
 * Pure renderers + minimal EventBus stub for REPL hooks.
 */

import { colorEnabled, red, yellow } from "./colors.js";

export interface CapabilityGatePromptInput {
  agent: string;
  action: string;
  reason: string;
}

export interface CapabilityGateRenderOptions {
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  color?: boolean;
}

/**
 * Highlighted BLOCKED / Capability Gate block with [A]/ar · [N]egar · [C]ancelar.
 */
export function renderCapabilityGatePrompt(
  input: CapabilityGatePromptInput,
  opts: CapabilityGateRenderOptions = {},
): string {
  const color =
    opts.color ?? colorEnabled({ env: opts.env, isTTY: opts.isTTY });
  const title = red("BLOCKED · Capability Gate", color);
  const rule = color ? "═".repeat(56) : "=".repeat(56);
  return [
    rule,
    title,
    `Agente: ${input.agent}`,
    `Ação: ${input.action}`,
    `Motivo: ${input.reason}`,
    "",
    "[A]provar uma vez · [N]egar e instruir alternativa · [C]ancelar tarefa",
    rule,
  ].join("\n");
}

export type CapabilityGateChoice = "approve" | "deny" | "cancel";

/** Parse A/N/C (or full words) into a choice; undefined if unrecognized. */
export function parseCapabilityGateChoice(
  raw: string,
): CapabilityGateChoice | undefined {
  const t = raw.trim().toLowerCase();
  if (t === "a" || t === "aprovar" || t === "approve" || t === "yes" || t === "y") {
    return "approve";
  }
  if (t === "n" || t === "negar" || t === "deny" || t === "no") {
    return "deny";
  }
  if (t === "c" || t === "cancelar" || t === "cancel") {
    return "cancel";
  }
  return undefined;
}

export interface ProviderFallbackLineInput {
  provider: string;
  code: string | number;
  cooldown_s: number;
  fallback_to: string;
  /** Attempts already consumed (0–3). */
  attempts: number;
}

/**
 * One-line infra fallback / cooldown (UX spec §5.4):
 * ⚠ Infra: … (cooldown …) → fallback para … (checkpoint preservado · N/3 tentativas consumidas)
 */
export function renderProviderFallbackLine(
  input: ProviderFallbackLineInput,
): string {
  const attempts = Math.max(0, Math.min(3, Math.floor(input.attempts)));
  return (
    `⚠ Infra: ${input.provider} ${input.code} (cooldown ${input.cooldown_s}s)` +
    ` → fallback para ${input.fallback_to}` +
    ` (checkpoint preservado · ${attempts}/3 tentativas consumidas)`
  );
}

export type ShellUxEvent =
  | {
      type: "BLOCKED";
      agent: string;
      action: string;
      reason: string;
    }
  | {
      type: "PROVIDER_FAULT";
      provider: string;
      code: string | number;
      cooldown_s: number;
      fallback_to: string;
      attempts: number;
    };

/**
 * EventBus for REPL BLOCKED / fault hooks.
 *
 * Contract (§8.2): while awaiting user input (`setAwaitingInput(true)`),
 * `emit` buffers events instead of writing through listeners — avoids
 * cursor corruption / flicker mid-typing. Call `flush()` after submit
 * (before processing the line) to deliver pending events in order.
 */
export interface ShellEventBus {
  on(listener: (event: ShellUxEvent) => void): () => void;
  emit(event: ShellUxEvent): void;
  /** When true, emit buffers; when false, emit delivers immediately. */
  setAwaitingInput(awaiting: boolean): void;
  /** Number of buffered events not yet flushed. */
  pendingCount(): number;
  /** Deliver all buffered events in FIFO order (no-op if empty). */
  flush(): void;
}

/** Minimal EventBus for REPL BLOCKED / fault hooks (stub-friendly). */
export function createShellEventBus(): ShellEventBus {
  const listeners = new Set<(event: ShellUxEvent) => void>();
  const pending: ShellUxEvent[] = [];
  let awaitingInput = false;

  const deliver = (event: ShellUxEvent): void => {
    for (const listener of listeners) listener(event);
  };

  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event) {
      if (awaitingInput) {
        pending.push(event);
        return;
      }
      deliver(event);
    },
    setAwaitingInput(awaiting: boolean) {
      awaitingInput = awaiting;
    },
    pendingCount() {
      return pending.length;
    },
    flush() {
      const batch = pending.splice(0, pending.length);
      for (const event of batch) deliver(event);
    },
  };
}

/** Paint fallback line yellow when color is enabled. */
export function paintProviderFallbackLine(
  input: ProviderFallbackLineInput,
  opts: CapabilityGateRenderOptions = {},
): string {
  const color =
    opts.color ?? colorEnabled({ env: opts.env, isTTY: opts.isTTY });
  return yellow(renderProviderFallbackLine(input), color);
}
