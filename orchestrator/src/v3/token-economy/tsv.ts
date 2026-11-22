/**
 * V1-TOK-09 — TSV / positional compact format for structured internal inputs.
 *
 * Prefer `path|line|symbol` (pipe-positional) over indented JSON/Markdown for
 * lists, DAG nodes, and metadata. Reserve strict JSON for validated outputs.
 */

/** Field separator for positional compact rows (aligned with symbol-map compact). */
export const TSV_FIELD_SEP = "|";

/** Escape a single field so decode is lossless for `|` and newlines. */
export function escapeTsvField(value: string): string {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** Inverse of escapeTsvField. */
export function unescapeTsvField(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (next === "r") {
        out += "\r";
        i++;
        continue;
      }
      if (next === "|" || next === "\\") {
        out += next;
        i++;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Encode positional compact row: field0|field1|...
 * Empty fields are preserved.
 */
export function encodeTsvRow(fields: readonly string[]): string {
  return fields.map((f) => escapeTsvField(f ?? "")).join(TSV_FIELD_SEP);
}

/**
 * Decode a positional compact row into fields (lossless for escaped content).
 */
export function decodeTsvRow(row: string): string[] {
  const fields: string[] = [];
  let cur = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === "\\" && i + 1 < row.length) {
      cur += ch + row[i + 1];
      i++;
      continue;
    }
    if (ch === TSV_FIELD_SEP) {
      fields.push(unescapeTsvField(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  fields.push(unescapeTsvField(cur));
  return fields;
}

/**
 * Canonical symbol locator: path|line|symbol
 */
export function encodeSymbolTsv(path: string, line: number, symbol: string): string {
  return encodeTsvRow([path, String(line), symbol]);
}

/** Decode path|line|symbol; returns null when shape is invalid. */
export function decodeSymbolTsv(
  row: string,
): { path: string; line: number; symbol: string } | null {
  const fields = decodeTsvRow(row);
  if (fields.length < 3) return null;
  const line = Number(fields[1]);
  if (!Number.isInteger(line) || line < 1) return null;
  return { path: fields[0]!, line, symbol: fields[2]! };
}
