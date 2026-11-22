import type { ProtocolAdapter, ProtocolChatRequest, ProtocolChatResponse } from "./types.js";

export class GeminiProtocol implements ProtocolAdapter {
  readonly protocol = "gemini" as const;

  buildRequest(req: ProtocolChatRequest) {
    const contents = req.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    return {
      url_path: `/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
      body: {
        contents,
        generationConfig: {
          maxOutputTokens: req.max_tokens,
          temperature: req.temperature,
        },
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
      modelVersion?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (b.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return {
      protocol: this.protocol,
      status: "ok",
      code: "OK",
      message: "ok",
      text,
      model_requested: req.model,
      model_served: b.modelVersion ?? req.model,
      checkpoint_id: req.checkpoint_id,
      raw: body,
    };
  }
}
