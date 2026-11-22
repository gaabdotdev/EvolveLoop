/**
 * Núcleo+Órbita boot banner (UX spec §2.1–§2.2).
 * Progressive disclosure: omit UNAVAILABLE / empty fields — never spam them.
 * Rendered once at shell boot; wide (≥80) vs compact (<80); no ANSI when NO_COLOR / !TTY.
 */

import { colorEnabled, cyan, dim } from "./colors.js";

/** Product UX version shown in the banner (spec §2.1). */
export const EVOLVELOOP_UX_VERSION = "0.3.0";

/** Official 8-line Núcleo+Órbita glyph; each line is exactly 18 columns. */
const NUCLEUS_ORBIT: readonly string[] = [
  "     ╭──────────╮ ",
  "    ╱            ╲",
  "   │    ┌────┐   │",
  "   │    │████│   │",
  "   │    └────┘   │",
  "   │           ╭─╯",
  "    ╲         ╰──►",
  "     ╰──────────╯ ",
];
export interface BannerMeta {
  version?: string;
  /** Official MSO state label (e.g. INIT, DELEGATING). */
  mso_state: string;
  /** e.g. "ON (attached)" | "OFF" | "UNAVAILABLE" — omitted when absent. */
  daemon: string;
  workspace_display: string;
  /** e.g. "v1" or "—" — omitted when no real contract. */
  contract: string;
  /** e.g. "0/0" or "UNAVAILABLE" — omitted when absent. */
  meta_progress: string;
  /** Honest token labels — never silent 0 without provenance; omitted when absent. */
  tokens_mso: string;
  tokens_workers: string;
  /** "ON" | "OFF" | "WARN" | "UNAVAILABLE" — omitted when UNAVAILABLE. */
  sandbox: string;
  /** e.g. "FreeLLMAPI · Ollama" — omitted when UNAVAILABLE. */
  providers: string;
  shortcuts?: string;
}

export interface BannerRenderOptions {
  columns?: number;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  color?: boolean;
}

export function shortenHomePath(absPath: string, home?: string): string {
  const h = home ?? process.env.HOME ?? "";
  if (h && (absPath === h || absPath.startsWith(h + "/"))) {
    return "~" + absPath.slice(h.length);
  }
  return absPath;
}

function resolveColor(opts: BannerRenderOptions): boolean {
  if (opts.color !== undefined) return opts.color;
  return colorEnabled({ env: opts.env, isTTY: opts.isTTY });
}

function isAbsent(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const t = String(value).trim();
  return t === "" || t === "UNAVAILABLE" || t === "—";
}

function sandboxLabel(sandbox: string): string | undefined {
  if (isAbsent(sandbox)) return undefined;
  return `bwrap ${sandbox}`;
}

function stateLabel(mso_state: string): string {
  if (!mso_state || mso_state === "INIT" || mso_state === "IDLE") return "Pronto";
  return mso_state;
}

/**
 * Progressive right-column lines for the wide banner.
 * Essential: version, workspace, providers, sandbox, state.
 * Optional: daemon / contract / meta / tokens only when real.
 */
export function buildBannerProgressiveLines(meta: BannerMeta): string[] {
  const version = meta.version ?? EVOLVELOOP_UX_VERSION;
  const lines: string[] = [
    `EvolveLoop v${version}`,
    meta.workspace_display,
  ];

  if (!isAbsent(meta.providers)) {
    lines.push(`Providers: ${meta.providers}`);
  }
  const sand = sandboxLabel(meta.sandbox);
  if (sand) {
    lines.push(`Sandbox: ${sand}`);
  }
  lines.push(`Estado: ${stateLabel(meta.mso_state)}`);

  if (!isAbsent(meta.daemon) && meta.daemon !== "OFF") {
    lines.push(`Daemon: ${meta.daemon}`);
  }
  if (!isAbsent(meta.contract) && meta.contract !== "—") {
    const metaPart = !isAbsent(meta.meta_progress)
      ? ` · Meta: ${meta.meta_progress}`
      : "";
    lines.push(`Contract: ${meta.contract}${metaPart}`);
  }
  const hasMso = !isAbsent(meta.tokens_mso);
  const hasWorkers = !isAbsent(meta.tokens_workers);
  if (hasMso || hasWorkers) {
    const mso = hasMso ? meta.tokens_mso : "—";
    const workers = hasWorkers ? meta.tokens_workers : "—";
    lines.push(`Tokens: MSO ${mso} │ Workers ${workers}`);
  }

  return lines;
}

/** Compact 2-line header for terminals &lt; 80 columns. */
export function renderBannerCompact(meta: BannerMeta, color = false): string {
  const version = meta.version ?? EVOLVELOOP_UX_VERSION;
  const sand = sandboxLabel(meta.sandbox);
  const parts = [
    `◉ EvolveLoop v${version}`,
    `Estado: ${stateLabel(meta.mso_state)}`,
  ];
  if (sand) parts.push(sand);
  if (!isAbsent(meta.providers)) parts.push(meta.providers);
  const line1 = parts.join(" · ");
  const line2 = meta.workspace_display;
  return [cyan(line1, color), dim(line2, color)].join("\n");
}

/** Wide 8-line banner: 18-col symbol + progressive metadata (no UNAVAILABLE spam). */
export function renderBannerWide(meta: BannerMeta, color = false): string {
  const progressive = buildBannerProgressiveLines(meta);
  // Pad / trim to glyph height; never invent UNAVAILABLE filler.
  const right: string[] = Array.from({ length: NUCLEUS_ORBIT.length }, (_, i) => progressive[i] ?? "");
  return NUCLEUS_ORBIT.map((glyph, i) => {
    const metaLine = right[i] ?? "";
    const left = color && i === 0 ? cyan(glyph, true) : glyph;
    if (!metaLine) return left; // keep exact 18-col glyph (incl. trailing pad)
    const rightPainted =
      color && (i === 1 || metaLine.startsWith("Estado:")) ? dim(metaLine, true) : metaLine;
    return `${left} ${rightPainted}`;
  }).join("\n");
}

export function renderBanner(meta: BannerMeta, opts: BannerRenderOptions = {}): string {
  const columns = opts.columns ?? process.stdout.columns ?? 80;
  const color = resolveColor(opts);
  if (columns < 80) return renderBannerCompact(meta, color);
  return renderBannerWide(meta, color);
}

/** True when a rendered banner string contains no UNAVAILABLE spam. */
export function bannerHasUnavailable(text: string): boolean {
  return text.includes("UNAVAILABLE");
}
