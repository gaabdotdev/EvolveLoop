import type { ProtocolAdapter, ProtocolChatRequest, ProtocolChatResponse } from "./types.js";

export class AnthropicProtocol implements ProtocolAdapter {
  readonly protocol = "anthropic" as const;

  buildRequest(req: ProtocolChatRequest) {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const messages = req.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      url_path: "/v1/messages",
      body: {
        model: req.model,
        max_tokens: req.max_tokens ?? 1024,
        system: system || undefined,
        messages,
      },
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
    };
  }

  parseResponse(req: ProtocolChatRequest, httpStatus: number, body: unknown): ProtocolChatResponse {
    if (httpStatus === 401 || httpStatus === 403) {
      return {
        protocol: this.protocol,
        status: "auth",
        code: `HTTP_${httpStatus}`,
        message: "auth failed",
        model_requested: req.model,
        checkpoint_id: req.checkpoint_id,
      };
    }
    if (httpStatus === 429) {
      return {
        protocol: this.protocol,
        status: "quota",
        code: "HTTP_429",
        message: "quota/rate limit",
        model_requested: req.model,
        checkpoint_id: req.checkpoint_id,
      };
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      return {
        protocol: this.protocol,
        status: "failed",
        code: `HTTP_${httpStatus}`,
        message: "request failed",
        model_requested: req.model,
        checkpoint_id: req.checkpoint_id,
        raw: body,
      };
    }
    const b = body as {
      model?: string;
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = (b.content ?? [])
      .filter((c) => c.type === "text" || c.text)
      .map((c) => c.text ?? "")
      .join("");
    return {
      protocol: this.protocol,
      status: "ok",
      code: "OK",
      message: "ok",
      text,
      model_requested: req.model,
      model_served: b.model ?? req.model,
      checkpoint_id: req.checkpoint_id,
      raw: body,
    };
  }
}
