/**
 * V5-M09 — Capability-aware validation for AgentConfig.
 * Rejects configs claiming unsupported capabilities (e.g. pause).
 *
 * Mapping (catalog has no dedicated "pause" key):
 *   pause  → cancel (adapter-mediated interrupt / stop)
 *   cancel → cancel
 *   resume → resume
 *   streaming → streaming
 *   tools → tools
 */

import type { AdapterCapabilityKey } from "../adapters/types.js";
import {
  discoverCapabilityProfile,
  type AdapterCapabilityProfile,
} from "../agent-orchestration/capability-profile.js";
import type { AgentConfig } from "./schema.js";
import { AgentStudioError } from "./config-io.js";

export interface CapabilityValidationIssue {
  claim: string;
  catalog_key: AdapterCapabilityKey;
  honesty: string;
  message: string;
}

export interface AgentConfigValidationResult {
  kind: "AgentConfigValidationResult";
  ok: boolean;
  agent_name: string;
  adapter: string;
  profile?: AdapterCapabilityProfile;
  issues: CapabilityValidationIssue[];
}

const CLAIM_TO_CATALOG: Record<string, AdapterCapabilityKey> = {
  pause: "cancel",
  cancel: "cancel",
  resume: "resume",
  streaming: "streaming",
  tools: "tools",
};

/**
 * Validate agent config claims against adapter capability profile.
 * Throws AgentStudioError when adapter id unknown (optional soft mode returns issues).
 */
export function validateAgentConfigCapabilities(
  config: AgentConfig,
  opts?: { throwOnUnknownAdapter?: boolean },
): AgentConfigValidationResult {
  const issues: CapabilityValidationIssue[] = [];
  let profile: AdapterCapabilityProfile | undefined;

  try {
    profile = discoverCapabilityProfile(config.adapter);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts?.throwOnUnknownAdapter !== false) {
      throw new AgentStudioError("UNKNOWN_ADAPTER", msg);
    }
    return {
      kind: "AgentConfigValidationResult",
      ok: false,
      agent_name: config.name,
      adapter: config.adapter,
      issues: [
        {
          claim: "adapter",
          catalog_key: "cancel",
          honesty: "unknown",
          message: msg,
        },
      ],
    };
  }

  const claims = config.capabilities_claimed ?? {};
  for (const [claim, enabled] of Object.entries(claims)) {
    if (!enabled) continue;
    const catalogKey = CLAIM_TO_CATALOG[claim];
    if (!catalogKey) {
      issues.push({
        claim,
        catalog_key: "cancel",
        honesty: "unknown",
        message: `unknown capability claim '${claim}'`,
      });
      continue;
    }
    const entry = profile.capabilities.find((c) => c.key === catalogKey);
    const honesty = entry?.honesty ?? "unknown";
    if (honesty === "unsupported" || honesty === "unknown" || !entry) {
      issues.push({
        claim,
        catalog_key: catalogKey,
        honesty,
        message:
          claim === "pause"
            ? `config claims pause but adapter '${config.adapter}' has ${catalogKey}=${honesty}`
            : `config claims ${claim} but adapter '${config.adapter}' has ${catalogKey}=${honesty}`,
      });
    }
  }

  return {
    kind: "AgentConfigValidationResult",
    ok: issues.length === 0,
    agent_name: config.name,
    adapter: config.adapter,
    profile,
    issues,
  };
}

/** Assert valid — throws AgentStudioError on capability mismatch. */
export function assertAgentConfigCapabilities(config: AgentConfig): void {
  const result = validateAgentConfigCapabilities(config);
  if (!result.ok) {
    const detail = result.issues.map((i) => i.message).join("; ");
    throw new AgentStudioError("CAPABILITY_UNSUPPORTED", detail);
  }
}
