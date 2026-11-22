/**
 * Suppress only node:sqlite ExperimentalWarning noise on the evolve CLI.
 * Real errors and other warnings still surface.
 */

const SQLITE_EXP_RE = /sqlite/i;

/** True only for ExperimentalWarning whose message mentions sqlite. */
export function isSqliteExperimentalWarning(
  warning: string | Error,
  ...rest: unknown[]
): boolean {
  if (typeof warning === "string") {
    const name = rest[0];
    const nameStr =
      typeof name === "string"
        ? name
        : name && typeof name === "object" && "type" in name
          ? String((name as { type?: unknown }).type ?? "")
          : "";
    return nameStr === "ExperimentalWarning" && SQLITE_EXP_RE.test(warning);
  }
  if (warning && typeof warning === "object") {
    const w = warning as { name?: string; message?: string };
    return w.name === "ExperimentalWarning" && SQLITE_EXP_RE.test(String(w.message ?? ""));
  }
  return false;
}

let installed = false;

/** Idempotent patch of process.emitWarning (CLI entry + vitest setup). */
export function installSilenceExperimentalSqlite(): void {
  if (installed) return;
  installed = true;
  const orig = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (isSqliteExperimentalWarning(warning, ...args)) return;
    return (orig as (...a: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;
}

installSilenceExperimentalSqlite();
