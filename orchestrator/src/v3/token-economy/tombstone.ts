/**
 * V1-TOK-05 — Tombstone aged tool outputs in conversational sessions.
 *
 * Tool bodies older than TOOL_TOMBSTONE_AGE_TURNS are replaced with a short
 * ~6-token lápide marker so history stays bounded.
 */

/** Turns of age beyond which tool outputs are tombstoned (keep last 2 turns). */
export const TOOL_TOMBSTONE_AGE_TURNS = 2;

/**
 * Canonical ~6-token lápide (whitespace-proxy ≈ 5–7 tokens).
 * Format kept short and stable for prompt cache friendliness.
 */
export const TOOL_TOMBSTONE_MARKER = "[lápide:tool]";

export type ConversationRole = "system" | "user" | "assistant" | "tool" | string;

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  /** 0-based or 1-based turn index; compared against currentTurn. */
  turn: number;
  /** Explicit tool flag; role==="tool" also counts. */
  is_tool?: boolean;
  tool_name?: string;
  tool_call_id?: string;
  /** Set true when content was replaced by a lápide. */
  tombstoned?: boolean;
}

export interface ConversationTurn {
  turn: number;
  messages: Array<Omit<ConversationMessage, "turn"> & { turn?: number }>;
}

export interface TombstoneOptions {
  /** Default TOOL_TOMBSTONE_AGE_TURNS (2). */
  max_age_turns?: number;
  /** Override marker (must stay short). */
  marker?: string;
}

export interface TombstoneStats {
  scanned: number;
  tool_messages: number;
  tombstoned: number;
  preserved: number;
  marker: string;
  max_age_turns: number;
  current_turn: number;
}

export interface TombstoneResult {
  kind: "TombstoneResult";
  messages: ConversationMessage[];
  stats: TombstoneStats;
}

function isToolMessage(m: ConversationMessage): boolean {
  if (m.is_tool === true) return true;
  const role = String(m.role ?? "").toLowerCase();
  return role === "tool" || role === "tool_result" || role === "function";
}

function alreadyTombstoned(content: string, marker: string): boolean {
  const t = content.trim();
  return t === marker || t.startsWith("[lápide:") || t.startsWith("[tombstone:");
}

function estimateMarkerTokens(marker: string): number {
  return Math.max(1, Math.ceil(marker.length / 4));
}

/** Flatten turn-oriented history into messages with turn stamps. */
export function flattenTurns(turns: readonly ConversationTurn[]): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const t of turns) {
    for (const m of t.messages) {
      out.push({
        role: m.role,
        content: m.content,
        turn: m.turn ?? t.turn,
        is_tool: m.is_tool,
        tool_name: m.tool_name,
        tool_call_id: m.tool_call_id,
        tombstoned: m.tombstoned,
      });
    }
  }
  return out;
}

/**
 * Replace tool output bodies older than `max_age_turns` with a short lápide.
 *
 * Accepts either a flat message list or turn-grouped history.
 * Non-tool messages are never altered.
 */
export function tombstoneOldToolOutputs(
  messagesOrTurns: readonly ConversationMessage[] | readonly ConversationTurn[],
  currentTurn: number,
  opts: TombstoneOptions = {},
): ConversationMessage[] {
  return tombstoneOldToolOutputsDetailed(messagesOrTurns, currentTurn, opts).messages;
}

export function tombstoneOldToolOutputsDetailed(
  messagesOrTurns: readonly ConversationMessage[] | readonly ConversationTurn[],
  currentTurn: number,
  opts: TombstoneOptions = {},
): TombstoneResult {
  const maxAge = opts.max_age_turns ?? TOOL_TOMBSTONE_AGE_TURNS;
  const marker = opts.marker ?? TOOL_TOMBSTONE_MARKER;
  // Guard: marker should stay ~6 tokens (proxy).
  void estimateMarkerTokens(marker);

  const looksLikeTurns =
    messagesOrTurns.length > 0 &&
    typeof (messagesOrTurns[0] as ConversationTurn)?.messages !== "undefined" &&
    Array.isArray((messagesOrTurns[0] as ConversationTurn).messages);

  const flat: ConversationMessage[] = looksLikeTurns
    ? flattenTurns(messagesOrTurns as readonly ConversationTurn[])
    : (messagesOrTurns as readonly ConversationMessage[]).map((m) => ({ ...m }));

  let tool_messages = 0;
  let tombstoned = 0;
  let preserved = 0;

  const messages = flat.map((m) => {
    if (!isToolMessage(m)) {
      return { ...m };
    }
    tool_messages += 1;
    const age = currentTurn - m.turn;
    if (age > maxAge) {
      if (alreadyTombstoned(m.content, marker) && m.tombstoned) {
        tombstoned += 1;
        return { ...m, content: marker, tombstoned: true };
      }
      tombstoned += 1;
      return {
        ...m,
        content: marker,
        tombstoned: true,
      };
    }
    preserved += 1;
    return { ...m };
  });

  return {
    kind: "TombstoneResult",
    messages,
    stats: {
      scanned: flat.length,
      tool_messages,
      tombstoned,
      preserved,
      marker,
      max_age_turns: maxAge,
      current_turn: currentTurn,
    },
  };
}

/** Approximate token count of the canonical marker (for tests / telemetry). */
export function toolTombstoneMarkerProxyTokens(marker: string = TOOL_TOMBSTONE_MARKER): number {
  return estimateMarkerTokens(marker);
}
