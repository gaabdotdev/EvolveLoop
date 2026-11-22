/**
 * Compact Ink footer — 1 line idle · 2 lines executing (no UNAVAILABLE spam).
 */

import React from "react";
import { Box, Text } from "ink";
import type { FooterTelemetry } from "../../v3/evolve-shell/footer.js";
import { renderCompactFooter } from "./footer-compact.js";

export interface FooterBarProps {
  telemetry: FooterTelemetry;
  color?: boolean;
  /** Ready providers label (e.g. "Ollama") — preferred over mso_model when idle. */
  providers_ready?: string;
}

export function FooterBar({
  telemetry,
  providers_ready,
}: FooterBarProps): React.ReactElement {
  const compact = renderCompactFooter(telemetry, {
    providers_ready,
    idle_shortcuts: "/config · Ctrl+C Sair",
  });
  return (
    <Box flexDirection="column" flexShrink={0} height={compact.mode === "idle" ? 1 : 2}>
      {compact.lines.map((line, i) => (
        <Text key={`ft-${i}`} dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
}
