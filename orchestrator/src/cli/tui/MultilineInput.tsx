/**
 * Multiline Ink input with bracketed-paste + session history (↑/↓).
 * Paste of 15–50 lines stays in the buffer; Enter submits outside paste;
 * Shift+Enter / Alt+Enter inserts a newline.
 */

import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";

export interface MultilineInputProps {
  prompt?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (value: string) => void;
  /** When false, ignore input (e.g. while a modal is focused). */
  focus?: boolean;
  mask?: boolean;
  placeholder?: string;
  /**
   * Session prompt history (newest last). Navigable with ↑/↓ when the cursor
   * is on the first/last line of the multiline buffer.
   */
  history?: string[];
  /** Visual block mode (dedicated Box with padding). */
  block?: boolean;
  /** Called when value looks like `/…` for slash menu. */
  onSlashPrefix?: (value: string) => void;
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

export { pushInputHistory } from "./input-history.js";

export function MultilineInput({
  prompt = "→ ",
  value: controlled,
  onChange,
  onSubmit,
  focus = true,
  mask = false,
  placeholder = "",
  history = [],
  block = false,
  onSlashPrefix,
}: MultilineInputProps): React.ReactElement {
  const [internal, setInternal] = useState("");
  const [pasting, setPasting] = useState(false);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const draftBeforeHist = useRef("");
  const value = controlled ?? internal;

  const setValue = (next: string) => {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
    onSlashPrefix?.(next);
  };

  useInput(
    (input, key) => {
      if (!focus) return;

      // Bracketed paste markers may arrive as raw escape chunks.
      if (input.includes(PASTE_START) || input.includes(PASTE_END)) {
        let buf = input;
        if (buf.includes(PASTE_START)) {
          setPasting(true);
          buf = buf.split(PASTE_START).join("");
        }
        if (buf.includes(PASTE_END)) {
          setPasting(false);
          buf = buf.split(PASTE_END).join("");
        }
        if (buf) setValue(value + buf);
        return;
      }

      if (key.upArrow) {
        const lines = value.split("\n");
        // Only navigate history when on the first visual line (or empty).
        if (lines.length <= 1 && history.length > 0) {
          if (histIdx === null) {
            draftBeforeHist.current = value;
            const next = history.length - 1;
            setHistIdx(next);
            setValue(history[next]!);
          } else if (histIdx > 0) {
            const next = histIdx - 1;
            setHistIdx(next);
            setValue(history[next]!);
          }
        }
        return;
      }

      if (key.downArrow) {
        const lines = value.split("\n");
        if (lines.length <= 1 && histIdx !== null) {
          if (histIdx < history.length - 1) {
            const next = histIdx + 1;
            setHistIdx(next);
            setValue(history[next]!);
          } else {
            setHistIdx(null);
            setValue(draftBeforeHist.current);
          }
        }
        return;
      }

      if (key.return) {
        // Shift+Enter / Alt+Enter → newline; plain Enter submits (unless pasting).
        if (pasting || key.shift || key.meta) {
          setValue(value + "\n");
          return;
        }
        const trimmed = value;
        setHistIdx(null);
        setValue("");
        onSubmit(trimmed);
        return;
      }

      if (key.backspace || key.delete) {
        setHistIdx(null);
        setValue(value.slice(0, -1));
        return;
      }

      if (key.ctrl && input === "u") {
        setHistIdx(null);
        setValue("");
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setHistIdx(null);
        // Multi-char chunk without paste markers → treat as paste blob.
        if (input.length > 1 && /[\r\n]/.test(input)) {
          setValue(value + input.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
          return;
        }
        setValue(value + input);
      }
    },
    { isActive: focus },
  );

  const display = mask ? "*".repeat(value.length) : value;
  const shown = display.length === 0 && placeholder ? placeholder : display;
  const lines = (shown || " ").split("\n");
  const emptyPlaceholder = display.length === 0 && Boolean(placeholder);

  const body = (
    <Box flexDirection="column">
      <Text>
        <Text color="cyan">{prompt}</Text>
        {emptyPlaceholder ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <Text>{lines[0]}</Text>
        )}
        {focus ? <Text inverse> </Text> : null}
      </Text>
      {lines.slice(1).map((line, i) => (
        <Text key={`ml-${i}`}>{line || " "}</Text>
      ))}
    </Box>
  );

  if (!block) return body;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      {body}
    </Box>
  );
}
