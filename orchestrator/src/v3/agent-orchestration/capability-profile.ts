/**
 * V5-M02 — Capability profile discovery per adapter_id (ADR-005 honesty).
 * Surfaces catalog levels as-is; never upgrades unsupported → supported.
 */

import {
  getAdapterContract,
  isAdapterId,
  listAdapterContracts,
} from "../adapters/catalog.js";
import type {
  AdapterCapability,
  AdapterCapabilityKey,
  AdapterCapabilityLevel,
  AdapterId,
  AgentAdapterContract,
} from "../adapters/types.js";
import { normalizeCapabilityLevel } from "../adapters/types.js";

export type CapabilityHonestyLevel =
  | "full"
  | "partial"
  | "unsupported"
  | "unknown";

/** Map catalog levels → ADR-005 honesty vocabulary (no silent upgrade). */
export function toHonestyLevel(level: AdapterCapabilityLevel): CapabilityHonestyLevel {
  const n = normalizeCapabilityLevel(level);
  switch (n) {
    case "SUPPORTED":
      return "full";
    case "PARTIAL":
    case "PROBE_ONLY":
    case "DRY_RUN":
      return "partial";
    case "BLOCKED":
    case "UNSUPPORTED":
      return "unsupported";
    default:
      return "unknown";
  }
}

export interface CapabilityEntry {
  key: AdapterCapabilityKey;
  /** Raw catalog level (preserved for audit). */
  catalog_level: AdapterCapabilityLevel;
  /** ADR-005 honesty projection. */
  honesty: CapabilityHonestyLevel;
  notes: string;
}

export interface AdapterCapabilityProfile {
  kind: "AdapterCapabilityProfile";
  adapter_id: AdapterId;
  display_name: string;
  execution_bridge: AgentAdapterContract["execution_bridge"];
  certification: AgentAdapterContract["certification"];
  capabilities: CapabilityEntry[];
  limitations: string[];
  /** Keys explicitly unsupported or unknown — never omitted. */
  unsupported_or_unknown: AdapterCapabilityKey[];
  source: "AGENT_ADAPTER_CATALOG";
}

function fromContract(c: AgentAdapterContract): AdapterCapabilityProfile {
  const capabilities: CapabilityEntry[] = c.capabilities.map((cap: AdapterCapability) => ({
    key: cap.key,
    catalog_level: cap.level,
    honesty: toHonestyLevel(cap.level),
    notes: cap.notes,
  }));
  const unsupported_or_unknown = capabilities
    .filter((e) => e.honesty === "unsupported" || e.honesty === "unknown")
    .map((e) => e.key);
  return {
    kind: "AdapterCapabilityProfile",
    adapter_id: c.adapter_id,
    display_name: c.display_name,
    execution_bridge: c.execution_bridge,
    certification: c.certification,
    capabilities,
    limitations: [...c.limitations],
    unsupported_or_unknown,
    source: "AGENT_ADAPTER_CATALOG",
  };
}

/** Discover capability profile for one adapter — throws if id unknown. */
export function discoverCapabilityProfile(adapterId: string): AdapterCapabilityProfile {
  if (!isAdapterId(adapterId)) {
    throw new Error(`UNKNOWN_ADAPTER: '${adapterId}' not in AGENT_ADAPTER_CATALOG`);
  }
  return fromContract(getAdapterContract(adapterId));
}

/** List all declared adapter capability profiles (honest catalog dump). */
export function listCapabilityProfiles(): AdapterCapabilityProfile[] {
  return listAdapterContracts().map(fromContract);
}

/**
 * Whether adapter can satisfy required keys at least at `partial`.
 * unsupported/unknown ⇒ not satisfied (explicit reject).
 */
export function adapterSatisfiesCapabilities(
  profile: AdapterCapabilityProfile,
  required: AdapterCapabilityKey[],
): { ok: boolean; missing: AdapterCapabilityKey[]; reasons: string[] } {
  const byKey = new Map(profile.capabilities.map((c) => [c.key, c]));
  const missing: AdapterCapabilityKey[] = [];
  const reasons: string[] = [];
  for (const key of required) {
    const entry = byKey.get(key);
    if (!entry) {
      missing.push(key);
      reasons.push(`${key}: absent_from_catalog`);
      continue;
    }
    if (entry.honesty === "unsupported" || entry.honesty === "unknown") {
      missing.push(key);
      reasons.push(`${key}:${entry.honesty}`);
    }
  }
  return { ok: missing.length === 0, missing, reasons };
}
