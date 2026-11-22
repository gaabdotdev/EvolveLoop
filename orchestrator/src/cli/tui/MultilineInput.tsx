/**
 * Multiline Ink input with bracketed-paste + session history (↑/↓).
 * Paste of 15–50 lines stays in the buffer; Enter submits outside paste;
 * Shift+Enter / Alt+Enter inserts a newline.
 */

import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  applyMultilineInput,
  createMultilineInputState,
  type MultilineInputState,
} from "./multiline-input-logic.js";

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

export { pushInputHistory } from "./input-history.js";
export {
  applyMultilineInput,
  createMultilineInputState,
  PASTE_START,
  PASTE_END,
} from "./multiline-input-logic.js";

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
  const logicRef = useRef<MultilineInputState>(createMultilineInputState(""));
  const value = controlled ?? internal;

  // Keep pure-logic value in sync with controlled/external updates.
  if (logicRef.current.value !== value && controlled !== undefined) {
    logicRef.current = { ...logicRef.current, value };
  }

  const publish = (next: MultilineInputState) => {
    logicRef.current = next;
    if (controlled === undefined) setInternal(next.value);
    onChange?.(next.value);
    onSlashPrefix?.(next.value);
  };

  useInput(
    (input, key) => {
      if (!focus) return;
      // Prefer live buffer value (controlled parent may own it).
      const base: MultilineInputState = {
        ...logicRef.current,
        value: controlled !== undefined ? value : logicRef.current.value,
      };
      const { state: next, effect } = applyMultilineInput(
        base,
        input,
        key,
        history,
      );
      publish(next);
      if (effect.type === "submit") {
        onSubmit(effect.value);
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
