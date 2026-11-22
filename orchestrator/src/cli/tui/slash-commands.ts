/**
 * Slash command parsing for the Ink TUI input.
 */

export type SlashCommandId = "config" | "diff" | "status" | "clear";

export const SLASH_COMMANDS: ReadonlyArray<{
  id: SlashCommandId;
  label: string;
  hint: string;
}> = [
  { id: "config", label: "/config", hint: "Provider / API key" },
  { id: "diff", label: "/diff", hint: "git diff --stat" },
  { id: "status", label: "/status", hint: "Sessão · contrato · tokens" },
  { id: "clear", label: "/clear", hint: "Limpar histórico visual" },
];

export type ParsedSlash =
  | { kind: "slash"; command: SlashCommandId; args: string }
  | { kind: "partial"; prefix: string; matches: typeof SLASH_COMMANDS }
  | { kind: "none" };

/** Exact command after `/`, optional trailing args. */
export function parseSlashCommand(raw: string): ParsedSlash {
  const line = raw.trim();
  if (!line.startsWith("/")) return { kind: "none" };

  const body = line.slice(1);
  const space = body.search(/\s/);
  const name = (space < 0 ? body : body.slice(0, space)).toLowerCase();
  const args = space < 0 ? "" : body.slice(space + 1).trim();

  if (!name) {
    return { kind: "partial", prefix: "", matches: [...SLASH_COMMANDS] };
  }

  const exact = SLASH_COMMANDS.find((c) => c.id === name);
  if (exact) {
    return { kind: "slash", command: exact.id, args };
  }

  const matches = SLASH_COMMANDS.filter(
    (c) => c.id.startsWith(name) || c.label.slice(1).startsWith(name),
  );
  if (matches.length > 0 && !args) {
    return { kind: "partial", prefix: name, matches };
  }

  return { kind: "none" };
}

export function isSlashMenuTrigger(value: string): boolean {
  return value === "/" || /^\/[a-z]*$/i.test(value.trim());
}
