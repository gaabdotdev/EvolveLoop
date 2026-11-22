/**
 * V5-M03 — Model & Provider Freedom (ADR-002).
 * Model Registry ≠ Agent Registry; Provider Registry + selection + routing honesty.
 */

export type {
  ExecutionModelControl,
  UsageProvenance,
  ModelSelectionScope,
  ProviderImplementation,
  ProviderLocality,
  ProviderCapabilityHonesty,
  ProviderCapability,
  ProviderRecord,
  ModelRecord,
  ModelPreference,
  ScopedModelPreference,
  ModelSelectionResolved,
  RoutingPolicy,
  RoutingAttemptReason,
  RoutingDecision,
  UsageRecord,
  ModelRegistrySnapshot,
  ProviderRegistrySnapshot,
  SelectionStoreSnapshot,
} from "./types.js";

export {
  ProviderRegistryStore,
  ProviderRegistryError,
  defaultProviderSeed,
} from "./provider-registry.js";

export {
  ModelRegistryStore,
  ModelRegistryError,
  defaultModelRegistrySeed,
} from "./model-store.js";

export {
  ModelSelectionStore,
  ModelSelectionError,
  MODEL_SELECTION_PRECEDENCE,
  resolveModelSelection,
  type ResolveModelSelectionInput,
} from "./selection.js";

export {
  routeWithFallback,
  RoutingError,
  type RouteWithFallbackInput,
} from "./routing.js";

export {
  resolveExecutionModelControl,
  assertRuntimeModelControl,
  type IntegrationModelControl,
} from "./ownership.js";

export {
  createUsageRecord,
  mapCostProvenance,
  type UsageInput,
} from "./usage.js";

export { CustomModelProviderStub } from "./custom-stub.js";

import { join } from "node:path";
import { ModelRegistryStore } from "./model-store.js";
import { ProviderRegistryStore } from "./provider-registry.js";
import { ModelSelectionStore } from "./selection.js";

/** Open all M03 stores under a data-dir / .evolveloop/v3/model-registry root. */
export function openModelProviderFreedom(rootDir: string): {
  providers: ProviderRegistryStore;
  models: ModelRegistryStore;
  selection: ModelSelectionStore;
  rootDir: string;
} {
  const providers = new ProviderRegistryStore(rootDir);
  const models = new ModelRegistryStore(rootDir);
  const selection = new ModelSelectionStore(rootDir);
  return { providers, models, selection, rootDir };
}

/** Default path under V3 data root: `<dataDir>/model-registry`. */
export function modelRegistryDirFromDataRoot(dataRoot: string): string {
  return join(dataRoot, "model-registry");
}
