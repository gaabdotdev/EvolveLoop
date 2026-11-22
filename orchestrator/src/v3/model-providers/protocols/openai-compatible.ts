import type { ProtocolAdapter, ProtocolChatRequest, ProtocolChatResponse } from "./types.js";

export class OpenAICompatibleProtocol implements ProtocolAdapter {
  readonly protocol = "openai_compatible" as const;

  buildRequest(req: ProtocolChatRequest) {
    return {
      url_path: "/chat/completions",
      body: {
        model: req.model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: req.max_tokens,
        temperature: req.temperature,
      },
      headers: { "content-type": "application/json" },
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
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      protocol: this.protocol,
      status: "ok",
      code: "OK",
      message: "ok",
      text: b.choices?.[0]?.message?.content ?? "",
      model_requested: req.model,
      model_served: b.model ?? req.model,
      checkpoint_id: req.checkpoint_id,
      raw: body,
    };
  }
}
