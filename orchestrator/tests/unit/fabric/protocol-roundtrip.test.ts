import { describe, it, expect, afterEach } from "vitest";
import { FabricProtocolServer } from "../../../src/v3/fabric/protocol/server.js";
import { FabricProtocolClient } from "../../../src/v3/fabric/protocol/client.js";
import { createSessionToken, generateCpSecret } from "../../../src/v3/fabric/trust/session.js";
import { assertProtocolEnvelope, envelope } from "../../../src/v3/fabric/protocol/messages.js";

describe("protocol roundtrip", () => {
  it("rejects malformed protocol envelopes before dispatch", () => {
    const valid = envelope("control", "hello", { ping: true });
    expect(() => assertProtocolEnvelope(valid)).not.toThrow();
    expect(() => assertProtocolEnvelope({ ...valid, request_id: "" })).toThrow("invalid_envelope:request_id");
    expect(() => assertProtocolEnvelope({ ...valid, channel: "root" })).toThrow("invalid_envelope:channel");
    expect(() => assertProtocolEnvelope({ ...valid, issued_at: "not-a-date" })).toThrow("invalid_envelope:issued_at");
  });
  let server: FabricProtocolServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("auth succeeds over plaintext with matching secret", async () => {
    const secret = generateCpSecret();
    const { token } = createSessionToken(secret, {
      worker_node_id: "wn_test",
      expires_at: Date.now() + 60_000,
      control_plane_id: "cp_test",
    });

    server = new FabricProtocolServer({
      host: "127.0.0.1",
      port: 0,
      tls: false,
      cpSecret: secret,
      handler: async (msg) =>
        envelope("control", "echo_ok", { type: msg.type }, { ack_of: msg.request_id }),
    });
    const listen = await server.listen();

    const client = new FabricProtocolClient({
      host: "127.0.0.1",
      port: listen.port,
      tls: false,
      sessionToken: token,
      worker_node_id: "wn_test",
    });
    await client.connect();
    const echo = await client.request(envelope("control", "hello", { ping: true }), "echo_ok");
    expect(echo.payload).toEqual({ type: "hello" });
    client.close();
  }, 15_000);
});
