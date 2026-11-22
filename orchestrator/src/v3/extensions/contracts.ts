/**
 * V5-M08 — Public extension contracts (versioned re-exports).
 * Stable surface for AgentAdapter / ModelProvider / Tool / Verifier.
 * Full SDK publish is LIMITATION (docs/v5/M08).
 */

/** Contract package version — bump when breaking public shapes. */
export const EXTENSION_CONTRACTS_VERSION = "1.0.0" as const;

export type {
  AgentAdapterContract,
  AdapterCapability,
  AdapterCapabilityKey,
  AdapterCapabilityLevel,
  AdapterId,
} from "../adapters/types.js";

export type {
  ModelProvider,
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
} from "../model-providers/types.js";

export type {
  ToolRecord,
  ToolKind,
  ToolHonesty,
  ToolImplementation,
  RegisterToolInput,
} from "../tool-registry/types.js";

export type {
  CustomVerifier,
  VerifierRecord,
  VerifierRunResult,
  VerifierImplementation,
} from "../verification/types.js";

/** Named public contract bundle (documentation / runtime introspection). */
export interface ExtensionContractsManifest {
  kind: "ExtensionContractsManifest";
  version: typeof EXTENSION_CONTRACTS_VERSION;
  interfaces: Array<
    "AgentAdapter" | "ModelProvider" | "Tool" | "Verifier"
  >;
  notes: string[];
}

export function extensionContractsManifest(): ExtensionContractsManifest {
  return {
    kind: "ExtensionContractsManifest",
    version: EXTENSION_CONTRACTS_VERSION,
    interfaces: ["AgentAdapter", "ModelProvider", "Tool", "Verifier"],
    notes: [
      "Re-exports existing domain types — no parallel type system",
      "AgentAdapter = AgentAdapterContract (adapters/types)",
      "ModelProvider = model-providers/types",
      "Tool = ToolRecord / RegisterToolInput (tool-registry)",
      "Verifier = CustomVerifier / VerifierRecord (verification)",
      "Full npm SDK publish deferred — see docs/v5/M08/LIMITATION-sdk.md",
    ],
  };
}
