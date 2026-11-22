/**
 * Strip crude markdown headings for Ink Text rendering.
 */

export type MdLiteSegment =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "body"; text: string };

/** Convert a line with leading # / ## into a typed segment (no raw hashes). */
export function parseMdLiteLine(line: string): MdLiteSegment {
  const h2 = line.match(/^##\s+(.*)$/);
  if (h2) return { kind: "subtitle", text: h2[1]!.trim() };
  const h1 = line.match(/^#\s+(.*)$/);
  if (h1) return { kind: "title", text: h1[1]!.trim() };
  return { kind: "body", text: line };
}

export function stripCrudeMarkdown(text: string): string {
  return text
    .split("\n")
    .map((l) => {
      const seg = parseMdLiteLine(l);
      return seg.text;
    })
    .join("\n");
}
