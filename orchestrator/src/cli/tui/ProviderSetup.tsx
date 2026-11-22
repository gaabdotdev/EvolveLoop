/**
 * Inline provider readiness — FreeLLMAPI key / Ollama / other key.
 * Secrets written to ~/.config/evolveloop/ with 0600; values never logged.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { MultilineInput } from "./MultilineInput.js";
import {
  writeFreellmKeySecure,
  pingFreellmWithKey,
  pingOllamaLocal,
  type ProviderReadinessSnapshot,
} from "../../v3/evolve-shell/provider-readiness.js";

export interface ProviderSetupProps {
  snapshot: ProviderReadinessSnapshot;
  onReady: (summary: string) => void;
  onAbort?: () => void;
}

type Mode = "menu" | "key_freellm" | "key_other" | "busy";

const MENU = [
  { id: "freellm" as const, label: "Inserir API Key do FreeLLMAPI agora" },
  { id: "ollama" as const, label: "Usar Ollama local (localhost:11434)" },
  { id: "other" as const, label: "Configurar outra API Key" },
];

export function ProviderSetup({
  snapshot,
  onReady,
  onAbort,
}: ProviderSetupProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>("menu");
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState(`Detectado: ${snapshot.summary}`);
  const [keyBuf, setKeyBuf] = useState("");

  useInput(
    (_unused: string, key) => {
      void _unused;
      if (mode !== "menu") return;
      if (key.upArrow) {
        setIdx((i) => (i <= 0 ? MENU.length - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setIdx((i) => (i + 1) % MENU.length);
        return;
      }
      if (key.escape) {
        onAbort?.();
        return;
      }
      if (key.return) {
        const choice = MENU[idx]!;
        if (choice.id === "ollama") {
          setMode("busy");
          const ping = pingOllamaLocal();
          if (ping.ok) {
            setStatus(ping.message);
            onReady(ping.message);
          } else {
            setStatus(ping.message);
            setMode("menu");
          }
          return;
        }
        if (choice.id === "freellm") {
          setMode("key_freellm");
          setKeyBuf("");
          return;
        }
        setMode("key_other");
        setKeyBuf("");
      }
    },
    { isActive: mode === "menu" },
  );

  const submitKey = async (raw: string) => {
    const key = raw.trim();
    if (!key) {
      setStatus("Chave vazia — tente de novo.");
      setMode("menu");
      return;
    }
    setMode("busy");
    setStatus("A gravar chave (0600) e a validar…");
    try {
      writeFreellmKeySecure(key);
      process.env.FREELLMAPI_API_KEY = key;
      process.env.EVOLVELOOP_FREELLMAPI_API_KEY = key;
      const ping = await pingFreellmWithKey(key);
      if (ping.ok) {
        setStatus(ping.message);
        onReady(ping.message);
      } else {
        setStatus(ping.message);
        setMode("menu");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      setMode("menu");
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} marginBottom={1}>
      <Text bold>Provider readiness</Text>
      <Text dimColor>
        FreeLLMAPI precisa de chave e não há outro provider pronto para a MSO.
      </Text>
      <Text>{status}</Text>
      {mode === "menu" ? (
        <Box flexDirection="column" marginTop={1}>
          {MENU.map((m, i) => (
            <Text key={m.id} color={i === idx ? "cyan" : undefined}>
              {i === idx ? "❯ " : "  "}
              {m.label}
            </Text>
          ))}
        </Box>
      ) : null}
      {mode === "key_freellm" || mode === "key_other" ? (
        <Box marginTop={1}>
          <MultilineInput
            prompt="API Key> "
            value={keyBuf}
            onChange={setKeyBuf}
            mask
            placeholder="cola a chave (mascarada)"
            onSubmit={(v) => {
              void submitKey(v);
            }}
          />
        </Box>
      ) : null}
      {mode === "busy" ? <Text dimColor>…</Text> : null}
    </Box>
  );
}
