/**
 * Worker-side protocol client (TLS or plain TCP for lab).
 */

import { connect as tlsConnect } from "node:tls";
import { connect as netConnect, type Socket } from "node:net";
import { FrameDecoder, encodeFrame } from "./framing.js";
import { envelope, type ProtocolEnvelope } from "./messages.js";

export interface FabricClientOptions {
  host: string;
  port: number;
  ca?: string | Buffer;
  rejectUnauthorized?: boolean;
  tls?: boolean;
  sessionToken: string;
  worker_node_id: string;
}

export class FabricProtocolClient {
  private socket?: Socket;
  private decoder = new FrameDecoder();
  private pending = new Map<string, { resolve: (m: ProtocolEnvelope) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private bufferHandlers: Array<(m: ProtocolEnvelope) => void> = [];

  constructor(private readonly opts: FabricClientOptions) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.opts.tls === false) {
        this.socket = netConnect({ host: this.opts.host, port: this.opts.port }, () => resolve());
      } else {
        this.socket = tlsConnect(
          {
            host: this.opts.host,
            port: this.opts.port,
            ca: this.opts.ca,
            rejectUnauthorized: this.opts.rejectUnauthorized ?? Boolean(this.opts.ca),
            servername: this.opts.host,
          },
          () => resolve(),
        );
      }
      this.socket.once("error", reject);
    });
    this.socket!.on("error", (error) => this.rejectPending(error));
    this.socket!.on("close", () => this.rejectPending(new Error("connection_closed")));
    this.socket!.on("data", (chunk) => {
      try {
        for (const raw of this.decoder.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)) {
          const msg = raw as ProtocolEnvelope;
          if (msg.type === "error" || msg.type.startsWith("error.")) {
            const reason = String((msg.payload as { reason?: string })?.reason ?? msg.type);
            for (const [id, p] of this.pending) {
              this.pending.delete(id);
              clearTimeout(p.timer);
              p.reject(new Error(reason));
            }
            continue;
          }
          if (msg.ack_of && this.pending.has(msg.ack_of)) {
            const pend = this.pending.get(msg.ack_of)!;
            this.pending.delete(msg.ack_of);
            pend.resolve(msg);
          } else if (this.pending.has(msg.request_id)) {
            const pend = this.pending.get(msg.request_id)!;
            this.pending.delete(msg.request_id);
            pend.resolve(msg);
          } else if (this.pending.size === 1 && /(_ok|_accepted|_ack)$/.test(msg.type)) {
            const [id, pend] = [...this.pending.entries()][0]!;
            this.pending.delete(id);
            pend.resolve(msg);
          } else {
            for (const h of this.bufferHandlers) h(msg);
          }
        }
      } catch (e) {
        this.rejectPending(e as Error);
      }
    });
    const auth = envelope(
      "control",
      "control.auth",
      { session_token: this.opts.sessionToken },
      { worker_node_id: this.opsWorker() },
    );
    await this.request(auth, "control.auth_ok");
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private opsWorker(): string {
    return this.opts.worker_node_id;
  }

  onMessage(handler: (m: ProtocolEnvelope) => void): void {
    this.bufferHandlers.push(handler);
  }

  async request(msg: ProtocolEnvelope, expectType?: string, timeoutMs = 10_000): Promise<ProtocolEnvelope> {
    if (!this.socket) throw new Error("not_connected");
    const result = new Promise<ProtocolEnvelope>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(msg.request_id);
        reject(new Error("request_timeout"));
      }, timeoutMs);
      this.pending.set(msg.request_id, {
        timer: t,
        resolve: (m) => {
          clearTimeout(t);
          if (expectType && m.type !== expectType) {
            reject(new Error(`unexpected_type:${m.type}`));
            return;
          }
          resolve(m);
        },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
    });
    try {
      this.socket.write(encodeFrame(msg));
    } catch (error) {
      const pending = this.pending.get(msg.request_id);
      if (pending) {
        this.pending.delete(msg.request_id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return result;
  }

  send(msg: ProtocolEnvelope): void {
    if (!this.socket) throw new Error("not_connected");
    this.socket.write(encodeFrame(msg));
  }

  close(): void {
    this.socket?.destroy();
    this.socket = undefined;
    this.rejectPending(new Error("connection_closed"));
  }
}
