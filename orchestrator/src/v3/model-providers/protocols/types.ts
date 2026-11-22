/**
 * V1-PROD-03 — Multi-protocol client interfaces (no network assumed in unit tests).
 */

export type ProtocolId = "openai_compatible" | "anthropic" | "responses" | "gemini";

export interface ProtocolMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ProtocolChatRequest {
  model: string;
  messages: ProtocolMessage[];
  max_tokens?: number;
  temperature?: number;
  /** Opaque checkpoint for failover continuity. */
  checkpoint_id?: string;
}

export interface ProtocolChatResponse {
  protocol: ProtocolId;
  status: "ok" | "failed" | "quota" | "auth";
  code: string;
  message: string;
  text?: string;
  model_requested: string;
  model_served?: string;
  checkpoint_id?: string;
  raw?: unknown;
}

export interface ProtocolAdapter {
  readonly protocol: ProtocolId;
  /** Build wire payload without sending (testable). */
  buildRequest(req: ProtocolChatRequest): { url_path: string; body: unknown; headers: Record<string, string> };
  /** Parse provider JSON into normalized response. */
  parseResponse(
    req: ProtocolChatRequest,
    httpStatus: number,
    body: unknown,
  ): ProtocolChatResponse;
}
