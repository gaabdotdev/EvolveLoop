/**
 * Compact Ink footer — 1 line idle · N lines executing (no UNAVAILABLE spam).
 */

import React from "react";
import { Box, Text } from "ink";
import type { FooterTelemetry } from "../../v3/evolve-shell/footer.js";
import {
  renderCompactFooter,
  type CompactFooterExtras,
} from "./footer-compact.js";

export interface FooterBarProps {
  telemetry: FooterTelemetry;
  color?: boolean;
  /** Ready providers label (e.g. "Ollama") — preferred over mso_model when idle. */
  providers_ready?: string;
  task_label?: string;
  session_label?: string;
  agents_label?: string;
  block_reason?: string;
  narrow?: boolean;
}

export function FooterBar({
  telemetry,
  providers_ready,
  task_label,
  session_label,
  agents_label,
  block_reason,
  narrow = false,
}: FooterBarProps): React.ReactElement {
  const extras: CompactFooterExtras = {
    providers_ready,
    idle_shortcuts: "/config · Ctrl+C Sair",
    task_label,
    session_label,
    agents_label,
    block_reason,
    narrow,
  };
  const compact = renderCompactFooter(telemetry, extras);
  const height = Math.min(4, Math.max(1, compact.lines.length));
  return (
    <Box flexDirection="column" flexShrink={0} height={height}>
      {compact.lines.map((line, i) => (
        <Text key={`ft-${i}`} dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
}
