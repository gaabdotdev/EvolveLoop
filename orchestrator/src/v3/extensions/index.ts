/**
 * V5-M08 — Extensibility boundary (contracts + registry + reference stub).
 */

export {
  EXTENSION_CONTRACTS_VERSION,
  extensionContractsManifest,
  type ExtensionContractsManifest,
} from "./contracts.js";

export type {
  AgentAdapterContract,
  AdapterCapability,
  AdapterCapabilityKey,
  AdapterCapabilityLevel,
  AdapterId,
  ModelProvider,
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ToolRecord,
  ToolKind,
  ToolHonesty,
  ToolImplementation,
  RegisterToolInput,
  CustomVerifier,
  VerifierRecord,
  VerifierRunResult,
  VerifierImplementation,
} from "./contracts.js";

export {
  ExtensionRegistryStore,
  ExtensionRegistryError,
  type ExtensionKind,
  type ExtensionPermissions,
  type ExtensionRecord,
  type ExtensionRegistrySnapshot,
  type RegisterExtensionInput,
} from "./registry.js";

export {
  REFERENCE_EXTENSION_ID,
  REFERENCE_VERIFIER_ID,
  REFERENCE_TOOL_ID,
  createReferenceEchoVerifier,
  installReferenceExtension,
  type InstallReferenceExtensionResult,
} from "./reference-stub.js";
