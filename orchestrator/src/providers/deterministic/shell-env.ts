/**
 * Scrubbed environment for deterministic shell (ADR-V3-0002).
 * Does not inherit full process.env (avoids leaking secrets by default).
 */

export const SHELL_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TERM",
  "COLORTERM",
  "TMPDIR",
  "TMP",
  "TEMP",
  "TZ",
  "PWD",
] as const;

const ALLOW = new Set<string>(SHELL_ENV_ALLOWLIST);

export function buildScrubbedEnv(
  base: NodeJS.ProcessEnv = process.env,
  extra?: Record<string, string>,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of SHELL_ENV_ALLOWLIST) {
    const value = base[key];
    if (value !== undefined) out[key] = value;
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (ALLOW.has(key) || key.startsWith("EVOLVELOOP_SHELL_")) {
        out[key] = value;
      }
    }
  }
  if (!out.PATH) {
    out.PATH = "/usr/bin:/bin";
  }
  return out;
}
