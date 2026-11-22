/**
 * V5-M03 — execution_model_control: harness_owned | runtime_owned.
 * Core must not pretend to control model when the integration is harness-owned.
 */

import type { AdapterId } from "../adapters/types.js";
import { isAdapterId } from "../adapters/catalog.js";
import type { ExecutionModelControl } from "./types.js";

export interface IntegrationModelControl {
  kind: "IntegrationModelControl";
  integration_id: string;
  execution_model_control: ExecutionModelControl;
  reasons: string[];
}

/**
 * Declared ownership matrix (honest):
 * - Harness adapters (cursor, claude-code, codex, antigravity): harness_owned —
 *   Core does not force model selection inside the host agent.
 * - Runtime ModelProviders (freellmapi, ollama, custom, openrouter): runtime_owned —
 *   Core may select/route when using these providers directly.
 */
const HARNESS_OWNED: ReadonlySet<string> = new Set<AdapterId>([
  "cursor",
  "claude-code",
  "codex",
  "antigravity",
]);

const RUNTIME_OWNED_PROVIDERS: ReadonlySet<string> = new Set([
  "freellmapi",
  "ollama",
  "custom",
  "openrouter",
]);

export function resolveExecutionModelControl(
  integrationId: string,
): IntegrationModelControl {
  if (isAdapterId(integrationId) || HARNESS_OWNED.has(integrationId)) {
    return {
      kind: "IntegrationModelControl",
      integration_id: integrationId,
      execution_model_control: "harness_owned",
      reasons: [
        `integration=${integrationId} is a harness adapter`,
        "Core does not force model_id inside host agent sessions",
        "AgentRecord.model_id remains metadata only (ADR-002)",
      ],
    };
  }

  if (RUNTIME_OWNED_PROVIDERS.has(integrationId)) {
    return {
      kind: "IntegrationModelControl",
      integration_id: integrationId,
      execution_model_control: "runtime_owned",
      reasons: [
        `integration=${integrationId} is a ModelProvider path`,
        "Runtime may resolveModelSelection + routeWithFallback",
      ],
    };
  }

  // Unknown integrations: fail closed toward harness_owned (do not claim runtime control).
  return {
    kind: "IntegrationModelControl",
    integration_id: integrationId,
    execution_model_control: "harness_owned",
    reasons: [
      `integration=${integrationId} unknown — default harness_owned (fail-closed)`,
      "Do not invent runtime model control without a verified bridge",
    ],
  };
}

/**
 * Assert that Core may apply a model preference for this integration.
 * Throws when harness_owned — never silently ignore.
 */
export function assertRuntimeModelControl(integrationId: string): void {
  const ctrl = resolveExecutionModelControl(integrationId);
  if (ctrl.execution_model_control !== "runtime_owned") {
    throw new Error(
      `HARNESS_OWNED_MODEL_CONTROL: cannot force model for '${integrationId}' (${ctrl.reasons.join("; ")})`,
    );
  }
}
