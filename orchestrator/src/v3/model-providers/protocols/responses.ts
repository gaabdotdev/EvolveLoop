import type { ProtocolAdapter, ProtocolChatRequest, ProtocolChatResponse } from "./types.js";

/** OpenAI Responses API shaped adapter. */
export class ResponsesProtocol implements ProtocolAdapter {
  readonly protocol = "responses" as const;

  buildRequest(req: ProtocolChatRequest) {
    const input = req.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: m.content,
    }));
    return {
      url_path: "/v1/responses",
      body: {
        model: req.model,
        input,
        max_output_tokens: req.max_tokens,
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
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text =
      b.output_text ??
      (b.output ?? [])
        .flatMap((o) => o.content ?? [])
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
