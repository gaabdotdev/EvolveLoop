/**
 * Terminal narrow / short layout helpers (V4.1 P0-6 + V4.2 P2-2).
 * Guia: largura mínima ~72; altura mínima ~12; abaixo disso empilhar e avisar.
 */

export const NARROW_COLUMNS = 72;
/** Rows below this → short-height degradation (banner compact / notice). */
export const LOW_ROWS = 12;

export interface LayoutMode {
  columns: number;
  rows: number;
  narrow: boolean;
  short_height: boolean;
  stack: boolean;
  degradation_notice: string | null;
}

/**
 * Resolve layout from terminal columns and optional rows.
 * One-arg callers (columns only) keep prior narrow behaviour; rows default 24.
 */
export function resolveLayoutMode(
  columns: number | undefined | null,
  rows?: number | undefined | null,
): LayoutMode {
  const cols =
    typeof columns === "number" && columns > 0 ? Math.floor(columns) : 80;
  const r =
    typeof rows === "number" && rows > 0 ? Math.floor(rows) : 24;
  const narrow = cols < NARROW_COLUMNS;
  const short_height = r < LOW_ROWS;
  const notices: string[] = [];
  if (narrow) {
    notices.push(
      `Terminal estreito (${cols}<${NARROW_COLUMNS}): layout empilhado · L0/L1 priorizados`,
    );
  }
  if (short_height) {
    notices.push(
      `Altura reduzida (${r}<${LOW_ROWS}): banner/histórico compactos · footer priorizado`,
    );
  }
  return {
    columns: cols,
    rows: r,
    narrow,
    short_height,
    stack: narrow || short_height,
    degradation_notice: notices.length > 0 ? notices.join(" · ") : null,
  };
}

/** Prefer vertical stacking for card sections when narrow or short. */
export function narrowCardPadding(narrow: boolean): {
  paddingX: number;
  paddingY: number;
} {
  return narrow ? { paddingX: 1, paddingY: 0 } : { paddingX: 2, paddingY: 1 };
}
