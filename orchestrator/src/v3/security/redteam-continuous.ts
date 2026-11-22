/**
 * V3-SEC-04 — Continuous automated red-teaming.
 *
 * Periodically (or on-demand) runs a deterministic battery against:
 *   1) sandbox escape oracles (seccomp deny + path/workspace confinement)
 *   2) credential-proxy anti-SSRF (private/link-local/metadata hosts)
 *   3) DLP egress filters (synthetic secret / proprietary exfil)
 *
 * Acceptance: bypass_rate === 0 (every attack case blocked/denied).
 *
 * Safety: synthetic payloads and in-process oracles only — never live
 * network probes, never attacks outside the workspace, never rm/force-push.
 */

import { resolve } from "node:path";
import {
  buildDefaultSeccompPolicy,
  policyDeniesSyscall,
  ESCAPE_DENY_CASES,
  type SeccompBpfPolicy,
} from "../sandbox/microvm-profile.js";
import { pathEscapesWorkspace } from "../../authority/capability-authority.js";
import {
  isSsrfBlockedHost,
  evaluateCredentialProxy,
  type CredentialProxyConfig,
} from "./credential-proxy.js";
import { inspectEgress } from "./dlp-egress.js";

export const REDTEAM_CONTINUOUS_SCHEMA_VERSION = "1";
export const REDTEAM_CONTINUOUS_PROFILE_ID = "redteam-continuous-v3-sec-04";

/** Default continuous interval (ms). Tests override with a deterministic clock. */
export const DEFAULT_REDTEAM_INTERVAL_MS = 60_000;

export type RedTeamCategory = "sandbox_escape" | "ssrf" | "dlp_exfil";

export type RedTeamHonesty = "reported" | "estimated" | "UNAVAILABLE";

export type RedTeamGateStatus = "PASS" | "FAIL" | "PASS_SIMULATED";

/** Attack held → blocked; attack escaped → bypassed; benign OK → allowed. */
export type RedTeamCaseOutcome = "blocked" | "bypassed" | "allowed" | "error";

export interface RedTeamCase {
  id: string;
  category: RedTeamCategory;
  description: string;
  /**
   * Expected control outcome for attack cases is always `blocked`.
   * Honest negative controls (benign traffic) use `expect_allow: true`.
   */
  expect_allow?: boolean;
}

export interface RedTeamCaseResult {
  id: string;
  category: RedTeamCategory;
  outcome: RedTeamCaseOutcome;
  /** True when an attack case was NOT blocked (or a benign case was wrongly blocked). */
  bypass: boolean;
  detail: string;
}

export interface RedTeamBatteryResult {
  kind: "RedTeamBatteryResult";
  schema_version: typeof REDTEAM_CONTINUOUS_SCHEMA_VERSION;
  profile_id: typeof REDTEAM_CONTINUOUS_PROFILE_ID;
  cases: RedTeamCaseResult[];
  /** Fraction of attack cases that escaped controls (0 = perfect). */
  bypass_rate: number;
  /** True iff every attack case blocked and every benign case allowed. */
  zero_bypass: boolean;
  blocked_count: number;
  bypass_count: number;
  total_attack_cases: number;
  honesty: RedTeamHonesty;
  ran_at_ms: number;
}

export interface RedTeamScheduleTick {
  kind: "RedTeamScheduleTick";
  tick: number;
  scheduled_at_ms: number;
  battery: RedTeamBatteryResult;
}

export interface ContinuousRedTeamHandle {
  /** Stop the continuous loop. Idempotent. */
  stop(): void;
  /** True while the scheduler is armed. */
  readonly running: boolean;
  /** Number of completed ticks (including the optional immediate first run). */
  readonly ticks: number;
  /** Latest battery result, if any. */
  readonly last_battery: RedTeamBatteryResult | null;
}

export interface RunBatteryOptions {
  /** Workspace root for path-escape oracles (default: process.cwd()). */
  workspace_root?: string;
  /** Seccomp policy oracle (default: maximum-isolation stub). */
  seccomp_policy?: SeccompBpfPolicy;
  /** Credential proxy config for SSRF / domain authorize checks. */
  credential_proxy?: CredentialProxyConfig;
  /** Clock for evidence timestamps (deterministic in tests). */
  now_ms?: () => number;
  /** Extra / replacement case catalogs (tests). */
  cases?: readonly RedTeamCase[];
}

export interface ScheduleContinuousOptions extends RunBatteryOptions {
  /** Interval between ticks. Deterministic under injected timers. */
  interval_ms?: number;
  /** Run one battery immediately when schedule starts (default true). */
  run_immediately?: boolean;
  /** Called after each tick with the battery result. */
  on_tick?: (tick: RedTeamScheduleTick) => void;
  /**
   * Injectable timer primitives for deterministic unit tests.
   * Production defaults to global setTimeout / clearTimeout.
   */
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
  /** Cap ticks (tests). Undefined = run until stop(). */
  max_ticks?: number;
}

/** Synthetic SSRF targets — hostnames/IPs only; no live requests. */
export const SSRF_ATTACK_CASES: readonly RedTeamCase[] = Object.freeze([
  {
    id: "SSRF-01_LOOPBACK_127",
    category: "ssrf",
    description: "Block 127.0.0.1 loopback",
  },
  {
    id: "SSRF-02_LOCALHOST",
    category: "ssrf",
    description: "Block localhost hostname",
  },
  {
    id: "SSRF-03_LINK_LOCAL_METADATA",
    category: "ssrf",
    description: "Block 169.254.169.254 cloud metadata",
  },
  {
    id: "SSRF-04_RFC1918_10",
    category: "ssrf",
    description: "Block 10.0.0.1 private",
  },
  {
    id: "SSRF-05_RFC1918_192",
    category: "ssrf",
    description: "Block 192.168.1.1 private",
  },
  {
    id: "SSRF-06_CGNAT",
    category: "ssrf",
    description: "Block 100.64.0.1 CGNAT",
  },
  {
    id: "SSRF-07_IPV6_LOOPBACK",
    category: "ssrf",
    description: "Block ::1 IPv6 loopback",
  },
  {
    id: "SSRF-08_GCP_METADATA_DNS",
    category: "ssrf",
    description: "Block metadata.google.internal",
  },
  {
    id: "SSRF-BENIGN_PUBLIC",
    category: "ssrf",
    description: "Allow public authorized domain (negative control)",
    expect_allow: true,
  },
]);

const SSRF_TARGET_BY_ID: Record<string, string> = {
  "SSRF-01_LOOPBACK_127": "http://127.0.0.1:8080/",
  "SSRF-02_LOCALHOST": "http://localhost/admin",
  "SSRF-03_LINK_LOCAL_METADATA": "http://169.254.169.254/latest/meta-data/",
  "SSRF-04_RFC1918_10": "http://10.0.0.1/",
  "SSRF-05_RFC1918_192": "http://192.168.1.1/",
  "SSRF-06_CGNAT": "http://100.64.0.1/",
  "SSRF-07_IPV6_LOOPBACK": "http://[::1]/",
  "SSRF-08_GCP_METADATA_DNS": "http://metadata.google.internal/",
  "SSRF-BENIGN_PUBLIC": "https://api.openai.com/v1/models",
};

/** Synthetic DLP exfil payloads — intentionally fake material. */
export const DLP_ATTACK_CASES: readonly RedTeamCase[] = Object.freeze([
  {
    id: "DLP-01_OPENAI_SK",
    category: "dlp_exfil",
    description: "Block sk-live style API key in body",
  },
  {
    id: "DLP-02_GITHUB_PAT",
    category: "dlp_exfil",
    description: "Block ghp_ classic PAT in body",
  },
  {
    id: "DLP-03_AWS_AKIA",
    category: "dlp_exfil",
    description: "Block AKIA access key in body",
  },
  {
    id: "DLP-04_BEARER_HEADER",
    category: "dlp_exfil",
    description: "Block Bearer token in Authorization header",
  },
  {
    id: "DLP-05_PEM_KEY",
    category: "dlp_exfil",
    description: "Block PEM private key in body",
  },
  {
    id: "DLP-06_PROPRIETARY",
    category: "dlp_exfil",
    description: "Block @proprietary / CONFIDENTIAL markers",
  },
  {
    id: "DLP-07_ENV_ASSIGN",
    category: "dlp_exfil",
    description: "Block SECRET/TOKEN env assignment form",
  },
  {
    id: "DLP-BENIGN_JSON",
    category: "dlp_exfil",
    description: "Allow clean public JSON (negative control)",
    expect_allow: true,
  },
]);

const DLP_PAYLOAD_BY_ID: Record<
  string,
  { body?: string; headers?: Record<string, string> }
> = {
  "DLP-01_OPENAI_SK": {
    body: "leak=sk-live-abcdefghijklmnopqrstuvwxyz012345",
  },
  "DLP-02_GITHUB_PAT": {
    body: "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  },
  "DLP-03_AWS_AKIA": {
    body: "key=AKIAIOSFODNN7EXAMPLEXX",
  },
  "DLP-04_BEARER_HEADER": {
    body: "{}",
    headers: {
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb",
    },
  },
  "DLP-05_PEM_KEY": {
    body: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKFAKESECRET_SYNTHETIC_ONLY_FOR_UNIT_TEST_NOT_REAL
-----END RSA PRIVATE KEY-----`,
  },
  "DLP-06_PROPRIETARY": {
    body: "// @proprietary\n/* COMPANY CONFIDENTIAL — DO NOT DISTRIBUTE */\n",
  },
  "DLP-07_ENV_ASSIGN": {
    body: "OPENAI_API_KEY=sk-test-abcdefghijklmnopqrstuvwxyz",
  },
  "DLP-BENIGN_JSON": {
    body: JSON.stringify({ prompt: "summarize public README", model: "gpt-4o-mini" }),
    headers: { "content-type": "application/json" },
  },
};

/** Sandbox escape probes: seccomp deny battery + path escape attempts. */
export const SANDBOX_ATTACK_CASES: readonly RedTeamCase[] = Object.freeze([
  ...ESCAPE_DENY_CASES.map(
    (c): RedTeamCase => ({
      id: `SBX-${c.id}`,
      category: "sandbox_escape",
      description: c.description,
    }),
  ),
  {
    id: "SBX-PATH_TRAVERSAL_DOTDOT",
    category: "sandbox_escape",
    description: "Block ../../etc/passwd path escape",
  },
  {
    id: "SBX-PATH_ABS_ETC",
    category: "sandbox_escape",
    description: "Block absolute /etc/shadow outside workspace",
  },
  {
    id: "SBX-PATH_HOME_SSH",
    category: "sandbox_escape",
    description: "Block ~/.ssh/id_rsa outside workspace",
  },
  {
    id: "SBX-PATH_BENIGN_INSIDE",
    category: "sandbox_escape",
    description: "Allow in-workspace relative path (negative control)",
    expect_allow: true,
  },
]);

/** Full default battery catalog (sandbox + SSRF + DLP). */
export const REDTEAM_BATTERY_CASES: readonly RedTeamCase[] = Object.freeze([
  ...SANDBOX_ATTACK_CASES,
  ...SSRF_ATTACK_CASES,
  ...DLP_ATTACK_CASES,
]);

const DEFAULT_PROXY_CONFIG: CredentialProxyConfig = {
  authorized_domains: ["api.openai.com", "*.anthropic.com"],
  credentials: {
    "api.openai.com": { value: "Bearer sk-proxy-injected-not-in-body" },
  },
};

function escapeSyscallFromCaseId(id: string): string | null {
  // SBX-E01_MOUNT → mount via ESCAPE_DENY_CASES id E01_MOUNT
  const m = id.match(/^SBX-(E\d+_.+)$/);
  if (!m) return null;
  const esc = ESCAPE_DENY_CASES.find((c) => c.id === m[1]);
  return esc?.action ?? null;
}

function runSandboxCase(
  c: RedTeamCase,
  policy: SeccompBpfPolicy,
  workspaceRoot: string,
): RedTeamCaseResult {
  const expectAllow = c.expect_allow === true;
  try {
    const syscall = escapeSyscallFromCaseId(c.id);
    if (syscall) {
      const denied = policyDeniesSyscall(policy, syscall);
      const bypass = expectAllow ? denied : !denied;
      return {
        id: c.id,
        category: c.category,
        outcome: bypass ? "bypassed" : denied ? "blocked" : "allowed",
        bypass,
        detail: denied
          ? `seccomp_oracle_deny:${syscall}`
          : `seccomp_oracle_allow_UNEXPECTED:${syscall}`,
      };
    }

    let targetPath: string;
    switch (c.id) {
      case "SBX-PATH_TRAVERSAL_DOTDOT":
        targetPath = resolve(workspaceRoot, "../../etc/passwd");
        break;
      case "SBX-PATH_ABS_ETC":
        targetPath = "/etc/shadow";
        break;
      case "SBX-PATH_HOME_SSH":
        targetPath = resolve(process.env.HOME ?? "/home/nobody", ".ssh/id_rsa");
        break;
      case "SBX-PATH_BENIGN_INSIDE":
        targetPath = resolve(workspaceRoot, "src/v3/security/redteam-continuous.ts");
        break;
      default:
        return {
          id: c.id,
          category: c.category,
          outcome: "error",
          bypass: !expectAllow,
          detail: `unknown_sandbox_case:${c.id}`,
        };
    }

    const escapes = pathEscapesWorkspace(targetPath, workspaceRoot);
    if (expectAllow) {
      const bypass = escapes; // benign path must NOT escape
      return {
        id: c.id,
        category: c.category,
        outcome: bypass ? "bypassed" : "allowed",
        bypass,
        detail: escapes
          ? `path_escape_false_positive:${targetPath}`
          : `path_inside_workspace:${targetPath}`,
      };
    }
    // Attack: escape must be detected (blocked = escapes true)
    const bypass = !escapes;
    return {
      id: c.id,
      category: c.category,
      outcome: bypass ? "bypassed" : "blocked",
      bypass,
      detail: escapes
        ? `path_escape_blocked:${targetPath}`
        : `path_escape_BYPASS:${targetPath}`,
    };
  } catch (err) {
    return {
      id: c.id,
      category: c.category,
      outcome: "error",
      bypass: true,
      detail: `sandbox_case_error:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function runSsrfCase(
  c: RedTeamCase,
  proxyConfig: CredentialProxyConfig,
): RedTeamCaseResult {
  const expectAllow = c.expect_allow === true;
  const target = SSRF_TARGET_BY_ID[c.id];
  if (!target) {
    return {
      id: c.id,
      category: c.category,
      outcome: "error",
      bypass: !expectAllow,
      detail: `unknown_ssrf_case:${c.id}`,
    };
  }

  try {
    // Parse host the same way the proxy does (via evaluateCredentialProxy).
    const decision = evaluateCredentialProxy(target, proxyConfig);
    const hostBlocked = (() => {
      try {
        const u = new URL(target);
        return isSsrfBlockedHost(u.hostname);
      } catch {
        return isSsrfBlockedHost(target);
      }
    })();

    if (expectAllow) {
      // Benign public host: must not be SSRF-blocked and must be authorized.
      const wronglySsrf = hostBlocked;
      const authorized = decision.allowed && !decision.blocked;
      const bypass = wronglySsrf || !authorized;
      return {
        id: c.id,
        category: c.category,
        outcome: bypass ? "bypassed" : "allowed",
        bypass,
        detail: bypass
          ? `ssrf_benign_fail:hostBlocked=${hostBlocked};reason=${decision.reason}`
          : `ssrf_benign_ok:${decision.reason}`,
      };
    }

    // Attack: SSRF host must be blocked by isSsrfBlockedHost AND proxy.
    const blocked = hostBlocked && decision.blocked;
    const bypass = !blocked;
    return {
      id: c.id,
      category: c.category,
      outcome: bypass ? "bypassed" : "blocked",
      bypass,
      detail: blocked
        ? `ssrf_blocked:${decision.reason}`
        : `ssrf_BYPASS:hostBlocked=${hostBlocked};allowed=${decision.allowed};reason=${decision.reason}`,
    };
  } catch (err) {
    return {
      id: c.id,
      category: c.category,
      outcome: "error",
      bypass: true,
      detail: `ssrf_case_error:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function runDlpCase(c: RedTeamCase): RedTeamCaseResult {
  const expectAllow = c.expect_allow === true;
  const payload = DLP_PAYLOAD_BY_ID[c.id];
  if (!payload) {
    return {
      id: c.id,
      category: c.category,
      outcome: "error",
      bypass: !expectAllow,
      detail: `unknown_dlp_case:${c.id}`,
    };
  }

  try {
    const decision = inspectEgress(payload);
    if (expectAllow) {
      const bypass = decision.blocked || decision.verdict !== "ALLOW";
      return {
        id: c.id,
        category: c.category,
        outcome: bypass ? "bypassed" : "allowed",
        bypass,
        detail: bypass
          ? `dlp_benign_blocked:${decision.reasons.join(",")}`
          : "dlp_benign_allow",
      };
    }
    const blocked = decision.blocked && decision.verdict === "BLOCK";
    const bypass = !blocked;
    return {
      id: c.id,
      category: c.category,
      outcome: bypass ? "bypassed" : "blocked",
      bypass,
      detail: blocked
        ? `dlp_blocked:${decision.reasons.join(",")}`
        : `dlp_BYPASS:verdict=${decision.verdict}`,
    };
  } catch (err) {
    return {
      id: c.id,
      category: c.category,
      outcome: "error",
      bypass: true,
      detail: `dlp_case_error:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * runBattery — execute the full red-team catalog against live oracles
 * (seccomp/path, SSRF proxy, DLP). Deterministic; no network I/O.
 */
export function runBattery(opts: RunBatteryOptions = {}): RedTeamBatteryResult {
  const workspaceRoot = resolve(opts.workspace_root ?? process.cwd());
  const policy = opts.seccomp_policy ?? buildDefaultSeccompPolicy();
  const proxyConfig = opts.credential_proxy ?? DEFAULT_PROXY_CONFIG;
  const now = opts.now_ms ?? (() => Date.now());
  const catalog = opts.cases ?? REDTEAM_BATTERY_CASES;

  const cases: RedTeamCaseResult[] = [];
  for (const c of catalog) {
    if (c.category === "sandbox_escape") {
      cases.push(runSandboxCase(c, policy, workspaceRoot));
    } else if (c.category === "ssrf") {
      cases.push(runSsrfCase(c, proxyConfig));
    } else if (c.category === "dlp_exfil") {
      cases.push(runDlpCase(c));
    } else {
      cases.push({
        id: c.id,
        category: c.category,
        outcome: "error",
        bypass: true,
        detail: `unknown_category:${String((c as RedTeamCase).category)}`,
      });
    }
  }

  // Attack cases = those without expect_allow. Bypass rate is over attacks only.
  const attackResults = cases.filter((r) => {
    const meta = catalog.find((c) => c.id === r.id);
    return meta?.expect_allow !== true;
  });
  const bypass_count = attackResults.filter((r) => r.bypass).length;
  const total_attack_cases = attackResults.length;
  const bypass_rate =
    total_attack_cases === 0 ? 0 : bypass_count / total_attack_cases;

  // Benign negatives must also pass (no false positives counted as bypass on attacks,
  // but zero_bypass requires them clean too).
  const benignFail = cases.some((r) => {
    const meta = catalog.find((c) => c.id === r.id);
    return meta?.expect_allow === true && r.bypass;
  });

  const zero_bypass = bypass_rate === 0 && !benignFail;
  const blocked_count = attackResults.filter((r) => !r.bypass).length;

  return {
    kind: "RedTeamBatteryResult",
    schema_version: REDTEAM_CONTINUOUS_SCHEMA_VERSION,
    profile_id: REDTEAM_CONTINUOUS_PROFILE_ID,
    cases,
    bypass_rate,
    zero_bypass,
    blocked_count,
    bypass_count,
    total_attack_cases,
    honesty: "reported",
    ran_at_ms: now(),
  };
}

/**
 * scheduleContinuous — arm a periodic battery.
 * Interval is deterministic under injected timers (tests set interval_ms + fake clock).
 */
export function scheduleContinuous(
  opts: ScheduleContinuousOptions = {},
): ContinuousRedTeamHandle {
  const intervalMs = opts.interval_ms ?? DEFAULT_REDTEAM_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error(`invalid_interval_ms:${intervalMs}`);
  }

  const timers = opts.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as NodeJS.Timeout),
  };

  let running = true;
  let ticks = 0;
  let lastBattery: RedTeamBatteryResult | null = null;
  let timerHandle: unknown = null;

  const clear = () => {
    if (timerHandle != null) {
      timers.clearTimeout(timerHandle);
      timerHandle = null;
    }
  };

  const armNext = () => {
    if (!running) return;
    if (opts.max_ticks != null && ticks >= opts.max_ticks) {
      running = false;
      clear();
      return;
    }
    timerHandle = timers.setTimeout(() => {
      timerHandle = null;
      if (!running) return;
      fire();
    }, intervalMs);
  };

  const fire = () => {
    if (!running) return;
    const battery = runBattery(opts);
    lastBattery = battery;
    ticks += 1;
    const tick: RedTeamScheduleTick = {
      kind: "RedTeamScheduleTick",
      tick: ticks,
      scheduled_at_ms: battery.ran_at_ms,
      battery,
    };
    opts.on_tick?.(tick);
    if (opts.max_ticks != null && ticks >= opts.max_ticks) {
      running = false;
      clear();
      return;
    }
    armNext();
  };

  const handle: ContinuousRedTeamHandle = {
    stop() {
      running = false;
      clear();
    },
    get running() {
      return running;
    },
    get ticks() {
      return ticks;
    },
    get last_battery() {
      return lastBattery;
    },
  };

  if (opts.run_immediately !== false) {
    // Synchronous first tick keeps tests deterministic without awaiting timers.
    fire();
  } else {
    armNext();
  }

  return handle;
}

/** Evaluate gate status from a battery result. */
export function evaluateRedTeamGate(
  battery: RedTeamBatteryResult,
): {
  kind: "RedTeamGateEvaluation";
  gate_status: RedTeamGateStatus;
  bypass_rate: number;
  zero_bypass: boolean;
  honesty: RedTeamHonesty;
  profile_id: typeof REDTEAM_CONTINUOUS_PROFILE_ID;
} {
  const gate_status: RedTeamGateStatus = battery.zero_bypass
    ? "PASS_SIMULATED"
    : "FAIL";
  return {
    kind: "RedTeamGateEvaluation",
    gate_status,
    bypass_rate: battery.bypass_rate,
    zero_bypass: battery.zero_bypass,
    honesty: battery.honesty,
    profile_id: REDTEAM_CONTINUOUS_PROFILE_ID,
  };
}
