/**
 * Semantic ANSI colors for EvolveLoop CLI HUD (UX spec §6).
 * Honors NO_COLOR and non-TTY (no ANSI / no animation chrome).
 */

export type SemanticColor = "cyan" | "green" | "yellow" | "red" | "dim" | "reset";

const ANSI: Record<SemanticColor, string> = {
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  dim: "\u001b[90m",
  reset: "\u001b[0m",
};

export interface ColorOptions {
  /** Override env (tests). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Override TTY detection. Defaults to process.stdout.isTTY. */
  isTTY?: boolean;
}

/** True only when stdout is a TTY and NO_COLOR is unset/empty. */
export function colorEnabled(opts: ColorOptions = {}): boolean {
  const env = opts.env ?? process.env;
  const noColor = env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") return false;
  const tty = opts.isTTY ?? Boolean(process.stdout.isTTY);
  return tty;
}

export function paint(
  color: Exclude<SemanticColor, "reset">,
  text: string,
  enabled?: boolean,
): string {
  const on = enabled ?? colorEnabled();
  if (!on) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

export function cyan(text: string, enabled?: boolean): string {
  return paint("cyan", text, enabled);
}

export function green(text: string, enabled?: boolean): string {
  return paint("green", text, enabled);
}

export function yellow(text: string, enabled?: boolean): string {
  return paint("yellow", text, enabled);
}

export function red(text: string, enabled?: boolean): string {
  return paint("red", text, enabled);
}

export function dim(text: string, enabled?: boolean): string {
  return paint("dim", text, enabled);
}
