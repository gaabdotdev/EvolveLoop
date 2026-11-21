export type {
  CostProvenance,
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "./types.js";
export { OllamaModelProvider } from "./ollama.js";
export { OpenRouterModelProvider } from "./openrouter.js";

import { OllamaModelProvider } from "./ollama.js";
import { OpenRouterModelProvider } from "./openrouter.js";
import type { ModelHealth, ModelProvider } from "./types.js";

/** V0 rule 1+1: local Ollama + remote OpenRouter (decoupled). */
export function createV0ModelProviders(): {
  local: ModelProvider;
  remote: ModelProvider;
} {
  return {
    local: new OllamaModelProvider(),
    remote: new OpenRouterModelProvider(),
  };
}

export async function probeV0ModelProviders(): Promise<{
  local: ModelHealth;
  remote: ModelHealth;
}> {
  const { local, remote } = createV0ModelProviders();
  const [l, r] = await Promise.all([local.healthCheck(), remote.healthCheck()]);
  return { local: l, remote: r };
}
