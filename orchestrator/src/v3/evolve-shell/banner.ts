/**
 * Núcleo+Órbita boot banner (UX spec §2.1–§2.2).
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
  /** e.g. "ON (attached)" | "OFF" | "UNAVAILABLE" */
  daemon: string;
  workspace_display: string;
  /** e.g. "v1" or "—" */
  contract: string;
  /** e.g. "0/0" or "UNAVAILABLE" */
  meta_progress: string;
  /** Honest token labels — never silent 0 without provenance. */
  tokens_mso: string;
  tokens_workers: string;
  /** "ON" | "OFF" | "WARN" | "UNAVAILABLE" */
  sandbox: string;
  /** e.g. "FreeLLMAPI · Ollama" or "UNAVAILABLE" */
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

function sandboxLabel(sandbox: string): string {
  if (sandbox === "UNAVAILABLE") return "bwrap UNAVAILABLE";
  return `bwrap ${sandbox}`;
}

/** Compact 2-line header for terminals &lt; 80 columns. */
export function renderBannerCompact(meta: BannerMeta, color = false): string {
  const version = meta.version ?? EVOLVELOOP_UX_VERSION;
  const line1 = `◉ EvolveLoop v${version} · MSO: ${meta.mso_state} · ${sandboxLabel(meta.sandbox)}`;
  const line2 = meta.workspace_display;
  return [cyan(line1, color), dim(line2, color)].join("\n");
}

/** Wide 8-line banner: 18-col symbol + metadata. */
export function renderBannerWide(meta: BannerMeta, color = false): string {
  const version = meta.version ?? EVOLVELOOP_UX_VERSION;
  const shortcuts =
    meta.shortcuts ?? "Ctrl+P Pause · Ctrl+C Stop · Ctrl+D Detach";
  const right: string[] = [
    `EvolveLoop v${version}`,
    `MSO: ${meta.mso_state} · Daemon: ${meta.daemon}`,
    meta.workspace_display,
    `Contract: ${meta.contract} · Meta: ${meta.meta_progress}`,
    `Tokens: MSO ${meta.tokens_mso} │ Workers ${meta.tokens_workers}`,
    `Sandbox: ${sandboxLabel(meta.sandbox)}`,
    `Providers: ${meta.providers}`,
    shortcuts,
  ];
  return NUCLEUS_ORBIT.map((glyph, i) => {
    const metaLine = right[i] ?? "";
    const left = color && i === 0 ? cyan(glyph, true) : glyph;
    const rightPainted =
      color && (i === 2 || i === 7) ? dim(metaLine, true) : metaLine;
    return `${left} ${rightPainted}`;
  }).join("\n");
}

export function renderBanner(meta: BannerMeta, opts: BannerRenderOptions = {}): string {
  const columns = opts.columns ?? process.stdout.columns ?? 80;
  const color = resolveColor(opts);
  if (columns < 80) return renderBannerCompact(meta, color);
  return renderBannerWide(meta, color);
}
