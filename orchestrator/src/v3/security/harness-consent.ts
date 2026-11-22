/**
 * Harness consent for real agent CLI spawn (cursor-agent / agy).
 * Env wins; otherwise ~/.config/evolveloop/config.yaml (or legacy secrets.env).
 * Never logs secret values — consent is a boolean flag only.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_KEY = "EVOLVELOOP_HARNESS_CONSENT";

export function defaultEvolveConfigDir(): string {
  return join(homedir(), ".config", "evolveloop");
}

export function defaultEvolveConfigPath(): string {
  return join(defaultEvolveConfigDir(), "config.yaml");
}

function parseYamlishConsent(raw: string): boolean | undefined {
  const m = raw.match(/^\s*harness_consent\s*:\s*(true|false|yes|no|1|0)\s*$/im);
  if (!m) return undefined;
  const v = m[1]!.toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

function parseEnvFileConsent(raw: string): boolean | undefined {
  const m = raw.match(
    new RegExp(`^(?:export\\s+)?${ENV_KEY}\\s*=\\s*(true|false|yes|no|1|0)\\s*$`, "im"),
  );
  if (!m) return undefined;
  const v = m[1]!.toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

/** True when process env or global config grants harness spawn. */
export function harnessConsentGranted(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[ENV_KEY] === "true") return true;
  if (env[ENV_KEY] === "false") return false;

  const configPath = defaultEvolveConfigPath();
  if (existsSync(configPath)) {
    try {
      const parsed = parseYamlishConsent(readFileSync(configPath, "utf-8"));
      if (parsed !== undefined) return parsed;
    } catch {
      /* ignore */
    }
  }

  const secrets = join(defaultEvolveConfigDir(), "secrets.env");
  if (existsSync(secrets)) {
    try {
      const parsed = parseEnvFileConsent(readFileSync(secrets, "utf-8"));
      if (parsed !== undefined) return parsed;
    } catch {
      /* ignore */
    }
  }

  return false;
}

/** Apply consent into process.env for this process (adapters read env). */
export function applyHarnessConsentEnv(
  granted: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env[ENV_KEY] = granted ? "true" : "false";
}

/**
 * Persist consent to ~/.config/evolveloop/config.yaml and set process env.
 * Preserves other YAML lines when possible.
 */
export function persistHarnessConsent(granted: boolean): { path: string } {
  const dir = defaultEvolveConfigDir();
  mkdirSync(dir, { recursive: true });
  const path = defaultEvolveConfigPath();
  let body = "";
  if (existsSync(path)) {
    try {
      body = readFileSync(path, "utf-8");
    } catch {
      body = "";
    }
  }
  const line = `harness_consent: ${granted ? "true" : "false"}`;
  if (/^\s*harness_consent\s*:/m.test(body)) {
    body = body.replace(/^\s*harness_consent\s*:.*$/m, line);
  } else {
    body = `${body.trimEnd()}${body.trim() ? "\n" : ""}${line}\n`;
  }
  writeFileSync(path, body, { encoding: "utf-8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
  applyHarnessConsentEnv(granted);
  return { path };
}

/** Load file consent into env at CLI boot (idempotent). */
export function hydrateHarnessConsentFromConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const granted = harnessConsentGranted(env);
  if (granted) applyHarnessConsentEnv(true, env);
  return granted;
}
