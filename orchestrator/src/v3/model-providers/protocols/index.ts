export type {
  ProtocolId,
  ProtocolMessage,
  ProtocolChatRequest,
  ProtocolChatResponse,
  ProtocolAdapter,
} from "./types.js";
export { OpenAICompatibleProtocol } from "./openai-compatible.js";
export { AnthropicProtocol } from "./anthropic.js";
export { ResponsesProtocol } from "./responses.js";
export { GeminiProtocol } from "./gemini.js";

import { OpenAICompatibleProtocol } from "./openai-compatible.js";
import { AnthropicProtocol } from "./anthropic.js";
import { ResponsesProtocol } from "./responses.js";
import { GeminiProtocol } from "./gemini.js";
import type { ProtocolAdapter, ProtocolId } from "./types.js";

export function createProtocolAdapters(): Record<ProtocolId, ProtocolAdapter> {
  return {
    openai_compatible: new OpenAICompatibleProtocol(),
    anthropic: new AnthropicProtocol(),
    responses: new ResponsesProtocol(),
    gemini: new GeminiProtocol(),
  };
}

export function listProtocolIds(): ProtocolId[] {
  return ["openai_compatible", "anthropic", "responses", "gemini"];
}
