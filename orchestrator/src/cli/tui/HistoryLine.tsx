/**
 * Conversation history items with spacing and user sidebar.
 */

import React from "react";
import { Box, Text } from "ink";
import { parseMdLiteLine } from "./markdown-lite.js";

export type HistoryKind = "user" | "system" | "banner";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  text: string;
}

export function HistoryLine({ entry }: { entry: HistoryEntry }): React.ReactElement {
  if (entry.kind === "user") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {entry.text.split("\n").map((l, i) => (
          <Text key={`u-${entry.id}-${i}`}>
            <Text dimColor>│ </Text>
            {l}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {entry.text.split("\n").map((l, i) => {
        const seg = parseMdLiteLine(l);
        if (seg.kind === "title") {
          return (
            <Text key={`s-${entry.id}-${i}`} bold>
              {seg.text}
            </Text>
          );
        }
        if (seg.kind === "subtitle") {
          return (
            <Text key={`s-${entry.id}-${i}`} dimColor>
              {seg.text}
            </Text>
          );
        }
        return <Text key={`s-${entry.id}-${i}`}>{seg.text}</Text>;
      })}
    </Box>
  );
}
