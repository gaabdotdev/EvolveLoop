/**
 * V1-ORCH-01 — Optional daemon via Unix Domain Socket.
 * Default path: <workspace>/.evolveloop/runtime.sock
 * Ctrl+D / client disconnect must NOT kill in-flight runs.
 * Multiple thin-client terminals supported.
 */

import {
  createServer,
  createConnection,
  type Server,
  type Socket,
} from "node:net";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Inbox sync (META-WS-007 / UX §5.5):
 * - Client → server: `inbox_publish` { text, from_client? }
 * - Server → all connected clients: `inbox_event` { text, from_client, id? }
 * Broadcast includes the publisher. The publisher's `request()` waiter consumes
 * that framed reply by `id` (so the local shell need not reprint via onMessage);
 * peers receive `inbox_event` via `onMessage` and print `[Inbox · client-…]`.
 * Ctrl+D / client disconnect still only detaches — runs stay alive.
 */
export type DaemonMessage =
  | { type: "ping"; id?: string }
  | { type: "pong"; id?: string; server_id: string }
  | { type: "status"; id?: string }
  | {
      type: "status_ok";
      id?: string;
      server_id: string;
      clients: number;
      runs: number;
      sock_path: string;
    }
  | { type: "run_start"; id?: string; run_id: string }
  | { type: "run_started"; id?: string; run_id: string }
  | { type: "run_complete"; id?: string; run_id: string }
  | { type: "inbox_publish"; id?: string; text: string; from_client?: string }
  | {
      type: "inbox_event";
      id?: string;
      text: string;
      from_client: string;
      ts?: string;
    }
  | { type: "error"; id?: string; message: string };

export interface ActiveRun {
  run_id: string;
  started_at: string;
  owner_client_id: string | null;
}

export interface EvolveDaemonOptions {
  sock_path: string;
  /** Called when a run is tracked (tests can observe). */
  on_run_change?: (runs: ActiveRun[]) => void;
}

export interface EvolveDaemon {
  readonly server_id: string;
  readonly sock_path: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  clientCount(): number;
  activeRuns(): ActiveRun[];
  /** Simulate an in-flight run (also via protocol). */
  trackRun(run_id: string, owner_client_id?: string | null): void;
  completeRun(run_id: string): void;
}

export function defaultRuntimeSockPath(workspace: string): string {
  return join(resolve(workspace), ".evolveloop", "runtime.sock");
}

function encode(msg: DaemonMessage): string {
  return JSON.stringify(msg) + "\n";
}

function tryParseLines(buf: string): { messages: DaemonMessage[]; rest: string } {
  const messages: DaemonMessage[] = [];
  let rest = buf;
  let idx: number;
  while ((idx = rest.indexOf("\n")) >= 0) {
    const line = rest.slice(0, idx).trim();
    rest = rest.slice(idx + 1);
    if (!line) continue;
    try {
      messages.push(JSON.parse(line) as DaemonMessage);
    } catch {
      messages.push({ type: "error", message: "invalid_json" });
    }
  }
  return { messages, rest };
}

export function createEvolveDaemon(opts: EvolveDaemonOptions): EvolveDaemon {
  const server_id = `daemon-${randomUUID().slice(0, 8)}`;
  const sock_path = resolve(opts.sock_path);
  let server: Server | null = null;
  const clients = new Map<string, Socket>();
  const runs = new Map<string, ActiveRun>();

  const notify = () => opts.on_run_change?.([...runs.values()]);

  const broadcast = (msg: DaemonMessage) => {
    const line = encode(msg);
    for (const s of clients.values()) {
      try {
        s.write(line);
      } catch {
        /* ignore broken peer */
      }
    }
  };

  const handle = (clientId: string, msg: DaemonMessage, socket: Socket) => {
    switch (msg.type) {
      case "ping":
        socket.write(encode({ type: "pong", id: msg.id, server_id }));
        break;
      case "status":
        socket.write(
          encode({
            type: "status_ok",
            id: msg.id,
            server_id,
            clients: clients.size,
            runs: runs.size,
            sock_path,
          }),
        );
        break;
      case "run_start": {
        runs.set(msg.run_id, {
          run_id: msg.run_id,
          started_at: new Date().toISOString(),
          owner_client_id: clientId,
        });
        notify();
        socket.write(encode({ type: "run_started", id: msg.id, run_id: msg.run_id }));
        break;
      }
      case "run_complete":
        runs.delete(msg.run_id);
        notify();
        socket.write(encode({ type: "run_complete", id: msg.id, run_id: msg.run_id }));
        break;
      case "inbox_publish": {
        const text = typeof msg.text === "string" ? msg.text : "";
        if (!text.trim()) {
          socket.write(
            encode({
              type: "error",
              id: msg.id,
              message: "inbox_publish_empty",
            }),
          );
          break;
        }
        // Authoritative from_client is the connected socket id (ignore spoof).
        broadcast({
          type: "inbox_event",
          id: msg.id,
          text,
          from_client: clientId,
          ts: new Date().toISOString(),
        });
        break;
      }
      case "inbox_event":
        // Server→client only; clients must not inject events.
        socket.write(
          encode({
            type: "error",
            id: msg.id,
            message: "inbox_event_client_forbidden",
          }),
        );
        break;
      default:
        socket.write(encode({ type: "error", id: (msg as { id?: string }).id, message: "unknown_type" }));
    }
  };

  return {
    server_id,
    sock_path,
    async start() {
      mkdirSync(dirname(sock_path), { recursive: true });
      if (existsSync(sock_path)) {
        try {
          unlinkSync(sock_path);
        } catch {
          /* ignore */
        }
      }
      server = createServer((socket) => {
        const clientId = `client-${randomUUID().slice(0, 8)}`;
        clients.set(clientId, socket);
        let buf = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => {
          buf += chunk;
          const parsed = tryParseLines(buf);
          buf = parsed.rest;
          for (const msg of parsed.messages) handle(clientId, msg, socket);
        });
        // Ctrl+D / disconnect: remove client only — do NOT cancel runs
        socket.on("close", () => {
          clients.delete(clientId);
          // Detach ownership but keep runs alive
          for (const run of runs.values()) {
            if (run.owner_client_id === clientId) {
              run.owner_client_id = null;
            }
          }
          notify();
        });
        socket.on("error", () => {
          clients.delete(clientId);
        });
      });
      await new Promise<void>((resolveP, reject) => {
        server!.once("error", reject);
        server!.listen(sock_path, () => resolveP());
      });
    },
    async stop() {
      for (const s of clients.values()) {
        try {
          s.destroy();
        } catch {
          /* ignore */
        }
      }
      clients.clear();
      await new Promise<void>((resolveP) => {
        if (!server) return resolveP();
        server.close(() => resolveP());
      });
      server = null;
      if (existsSync(sock_path)) {
        try {
          unlinkSync(sock_path);
        } catch {
          /* ignore */
        }
      }
    },
    clientCount() {
      return clients.size;
    },
    activeRuns() {
      return [...runs.values()];
    },
    trackRun(run_id, owner_client_id = null) {
      runs.set(run_id, {
        run_id,
        started_at: new Date().toISOString(),
        owner_client_id,
      });
      notify();
    },
    completeRun(run_id) {
      runs.delete(run_id);
      notify();
    },
  };
}

export type DaemonMessageHandler = (msg: DaemonMessage) => void;

export interface EvolveDaemonClient {
  readonly sock_path: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  request(msg: DaemonMessage, timeoutMs?: number): Promise<DaemonMessage>;
  /** Subscribe to unsolicited frames (e.g. peer `inbox_event`). Returns unsubscribe. */
  onMessage(handler: DaemonMessageHandler): () => void;
  /** Publish conversational text; resolves when own `inbox_event` (same id) returns. */
  publishInbox(text: string, timeoutMs?: number): Promise<DaemonMessage>;
  /** Half-close write side (simulates Ctrl+D) without destroying peer runs. */
  sendEof(): void;
}

export function createEvolveDaemonClient(sock_path: string): EvolveDaemonClient {
  let socket: Socket | null = null;
  let buf = "";
  const waiters: Array<{
    match: (m: DaemonMessage) => boolean;
    resolve: (m: DaemonMessage) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  const listeners = new Set<DaemonMessageHandler>();

  const dispatch = (msg: DaemonMessage) => {
    const idx = waiters.findIndex((w) => w.match(msg));
    if (idx >= 0) {
      const w = waiters.splice(idx, 1)[0]!;
      clearTimeout(w.timer);
      w.resolve(msg);
      // Publisher's matching inbox_event is consumed by the waiter — peers still
      // get their own copy via broadcast; do not fan-out to local onMessage.
      return;
    }
    for (const h of listeners) {
      try {
        h(msg);
      } catch {
        /* ignore listener errors */
      }
    }
  };

  return {
    sock_path: resolve(sock_path),
    async connect() {
      socket = createConnection(resolve(sock_path));
      socket.setEncoding("utf8");
      await new Promise<void>((resolveP, reject) => {
        socket!.once("connect", () => resolveP());
        socket!.once("error", reject);
      });
      socket.on("data", (chunk: string) => {
        buf += chunk;
        const parsed = tryParseLines(buf);
        buf = parsed.rest;
        for (const msg of parsed.messages) dispatch(msg);
      });
    },
    async disconnect() {
      if (!socket) return;
      const s = socket;
      socket = null;
      listeners.clear();
      await new Promise<void>((resolveP) => {
        s.end(() => {
          s.destroy();
          resolveP();
        });
      });
    },
    onMessage(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    publishInbox(text, timeoutMs = 3000) {
      return this.request({ type: "inbox_publish", text }, timeoutMs);
    },
    sendEof() {
      socket?.end();
    },
    request(msg, timeoutMs = 3000) {
      if (!socket) return Promise.reject(new Error("not_connected"));
      const id = msg.id ?? randomUUID().slice(0, 8);
      const payload = { ...msg, id } as DaemonMessage;
      return new Promise<DaemonMessage>((resolveP, reject) => {
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.timer === timer);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timeout"));
        }, timeoutMs);
        waiters.push({
          match: (m) => {
            const mid = (m as { id?: string }).id;
            if (mid === id) return true;
            // Only match bare errors that carry this request id (avoid stealing
            // peer inbox_event / unrelated frames).
            return m.type === "error" && mid === id;
          },
          resolve: resolveP,
          reject,
          timer,
        });
        socket!.write(encode(payload));
      });
    },
  };
}
