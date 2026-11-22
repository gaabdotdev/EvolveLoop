/**
 * V1-TOK-05 — Auto-tombstone tool outputs older than 2 turns (~6-token lápide).
 */

import { describe, it, expect } from "vitest";
import {
  TOOL_TOMBSTONE_AGE_TURNS,
  TOOL_TOMBSTONE_MARKER,
  tombstoneOldToolOutputs,
  tombstoneOldToolOutputsDetailed,
  toolTombstoneMarkerProxyTokens,
  type ConversationMessage,
  type ConversationTurn,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-05 tool-output tombstoning", () => {
  it("marker is ~6 proxy tokens and age threshold is 2", () => {
    expect(TOOL_TOMBSTONE_AGE_TURNS).toBe(2);
    expect(TOOL_TOMBSTONE_MARKER).toBe("[lápide:tool]");
    const tokens = toolTombstoneMarkerProxyTokens();
    expect(tokens).toBeGreaterThanOrEqual(3);
    expect(tokens).toBeLessThanOrEqual(8);
  });

  it("replaces tool bodies older than 2 turns; keeps recent tool + non-tool", () => {
    const currentTurn = 5;
    const messages: ConversationMessage[] = [
      { role: "user", content: "fix the bug", turn: 1 },
      {
        role: "tool",
        content: "VERY LONG TOOL OUTPUT FROM TURN 1 ".repeat(40),
        turn: 1,
        tool_name: "bash",
      },
      {
        role: "tool",
        content: "tool output turn 2 still aged out",
        turn: 2,
        tool_name: "read",
      },
      {
        role: "tool",
        content: "tool output turn 3 — age=2, keep",
        turn: 3,
        tool_name: "read",
      },
      { role: "assistant", content: "thinking…", turn: 4 },
      {
        role: "tool",
        content: "fresh tool output turn 5",
        turn: 5,
        tool_name: "test",
      },
    ];

    const out = tombstoneOldToolOutputs(messages, currentTurn);
    expect(out).toHaveLength(messages.length);

    // turn 1 tool: age=4 > 2 → tombstone
    expect(out[1]!.tombstoned).toBe(true);
    expect(out[1]!.content).toBe(TOOL_TOMBSTONE_MARKER);
    expect(out[1]!.content.length).toBeLessThan(messages[1]!.content.length);

    // turn 2 tool: age=3 > 2 → tombstone
    expect(out[2]!.tombstoned).toBe(true);
    expect(out[2]!.content).toBe(TOOL_TOMBSTONE_MARKER);

    // turn 3 tool: age=2 — NOT older than 2 → keep
    expect(out[3]!.tombstoned).toBeFalsy();
    expect(out[3]!.content).toContain("age=2, keep");

    // non-tool untouched
    expect(out[0]!.content).toBe("fix the bug");
    expect(out[4]!.content).toBe("thinking…");

    // current turn tool kept
    expect(out[5]!.content).toBe("fresh tool output turn 5");
  });

  it("accepts turn-grouped history", () => {
    const turns: ConversationTurn[] = [
      {
        turn: 0,
        messages: [
          { role: "tool", content: "ancient blob", is_tool: true, tool_name: "shell" },
        ],
      },
      {
        turn: 3,
        messages: [{ role: "tool", content: "recent blob", tool_name: "shell" }],
      },
    ];
    const detailed = tombstoneOldToolOutputsDetailed(turns, 3);
    expect(detailed.stats.tombstoned).toBe(1);
    expect(detailed.stats.preserved).toBe(1);
    expect(detailed.messages[0]!.content).toBe(TOOL_TOMBSTONE_MARKER);
    expect(detailed.messages[1]!.content).toBe("recent blob");
  });

  it("is_tool flag tombstones even when role is assistant-shaped", () => {
    const msgs: ConversationMessage[] = [
      {
        role: "assistant",
        content: "tool-shaped payload",
        turn: 0,
        is_tool: true,
      },
    ];
    const out = tombstoneOldToolOutputs(msgs, 5);
    expect(out[0]!.tombstoned).toBe(true);
    expect(out[0]!.content).toBe(TOOL_TOMBSTONE_MARKER);
  });
});
