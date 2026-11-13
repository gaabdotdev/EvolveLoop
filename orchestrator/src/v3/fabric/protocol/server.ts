/**
 * Control Plane listener — length-prefixed JSON frames over TLS (default) or plain TCP (tests).
 */

import { createServer as createTlsServer, type Server as TlsServer, type TLSSocket } from "node:tls";
import { createServer as createNetServer, type Server as NetServer, type Socket } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { FrameDecoder, encodeFrame } from "./framing.js";
import { assertProtocolVersion, envelope, type ProtocolEnvelope } from "./messages.js";
import { verifySessionToken } from "../trust/session.js";

export type MessageHandler = (
  msg: ProtocolEnvelope,
  ctx: { socket: Socket | TLSSocket; worker_node_id?: string },
) => Promise<ProtocolEnvelope | void> | ProtocolEnvelope | void;

export interface FabricServerOptions {
  host: string;
  port: number;
  key?: string | Buffer;
  cert?: string | Buffer;
  ca?: string | Buffer;
  requestCert?: boolean;
  /** When false, bind plain TCP (lab/unit only). Default true. */
  tls?: boolean;
  cpSecret: Buffer;
  handler: MessageHandler;
  maxFramesPerSec?: number;
}

export class FabricProtocolServer {
  private server?: TlsServer | NetServer;
  private readonly seenRequestIds = new Map<string, number>();
  private readonly sockets = new Set<Socket>();

  constructor(private readonly opts: FabricServerOptions) {}

  async listen(): Promise<{ host: string; port: number }> {
    const maxFps = this.opts.maxFramesPerSec ?? 100;
    const onConn = (socket: Socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      this.onConnection(socket, maxFps);
    };

    if (this.opts.tls === false) {
      this.server = createNetServer(onConn);
    } else {
      if (!this.opts.key || !this.opts.cert) throw new Error("tls_materials_required");
      this.server = createTlsServer(
        {
          key: this.opts.key,
          cert: this.opts.cert,
          ca: this.opts.ca,
          requestCert: this.opts.requestCert ?? false,
          rejectUnauthorized: Boolean(this.opts.ca),
        },
        (socket) => onConn(socket as TLSSocket),
      );
    }

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.opts.port, this.opts.host, () => resolve());
    });
    const addr = this.server.address();
    if (!addr || typeof addr === "string") throw new Error("bind_failed");
    return { host: this.opts.host, port: addr.port };
  }

  async close(): Promise<void> {
    for (const s of this.sockets) {
      try {
        s.destroy();
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }

  private onConnection(socket: Socket, maxFps: number): void {
    const decoder = new FrameDecoder();
    let windowStart = Date.now();
    let windowCount = 0;
    let worker_node_id: string | undefined;

    socket.on("data", (chunk) => {
      void (async () => {
        try {
          const msgs = decoder.push(chunk);
          for (const raw of msgs) {
            const now = Date.now();
            if (now - windowStart > 1000) {
              windowStart = now;
              windowCount = 0;
            }
            windowCount += 1;
            if (windowCount > maxFps) {
              socket.write(encodeFrame(envelope("control", "error.rate_limited", { reason: "rate_limited" })));
              socket.destroy();
              return;
            }
            const msg = raw as ProtocolEnvelope;
            assertProtocolVersion(msg.protocol_version);
            const prev = this.seenRequestIds.get(msg.request_id);
            if (prev && now - prev < 600_000) {
              socket.write(
                encodeFrame(
                  envelope("control", "ack.duplicate", { request_id: msg.request_id }, { ack_of: msg.request_id }),
                ),
              );
              continue;
            }
            this.seenRequestIds.set(msg.request_id, now);

            if (msg.type === "control.auth") {
              const token = (msg.payload as { session_token?: string }).session_token;
              if (!token) throw new Error("missing_token");
              const v = verifySessionToken(this.opts.cpSecret, token);
              if (!v.ok) throw new Error(`auth_failed:${v.reason}`);
              worker_node_id = v.claims.worker_node_id;
              socket.write(
                encodeFrame(
                  envelope(
                    "control",
                    "control.auth_ok",
                    { worker_node_id, token_id: v.claims.token_id },
                    { ack_of: msg.request_id },
                  ),
                ),
              );
              continue;
            }

            if (!worker_node_id && msg.type !== "control.hello") {
              throw new Error("unauthenticated");
            }

            const reply = await this.opts.handler(msg, { socket, worker_node_id });
            if (reply) socket.write(encodeFrame(reply));
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          try {
            socket.write(encodeFrame(envelope("control", "error", { reason })));
          } catch {
            /* ignore */
          }
          socket.destroy();
        }
      })();
    });
  }
}

export function fingerprintPemCert(certPem: string | Buffer): string {
  const pem = Buffer.isBuffer(certPem) ? certPem.toString("utf8") : certPem;
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  const der = Buffer.from(b64, "base64");
  return createHash("sha256").update(der).digest("hex");
}

export function randomNonce(): string {
  return randomBytes(16).toString("hex");
}
