/**
 * Local Unix-socket IPC for Coordinator service.
 * Auth: peer must present shared token from data-dir (mode 0600 file).
 *
 * ISSUE-SEC-H02-IPC: privileged methods require the privileged token
 * (ipc.privileged.token), not the operator/read token alone.
 */

import {
  createServer,
  createConnection,
  type Server,
  type Socket,
} from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

export interface IpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
  token: string;
  /** Anti-replay nonce (required for privileged + tick). */
  nonce?: string;
  /** Client wall-clock ms; must be within skew window. */
  issued_at?: number;
  /** Coordinator fencing/generation epoch when known. */
  epoch?: number;
}

export interface IpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type IpcHandler = (req: IpcRequest) => Promise<unknown> | unknown;

/** Methods that mutate approvals / lifecycle — require privileged token. */
export const IPC_PRIVILEGED_METHODS = new Set([
  "approvals.approve",
  "approvals.reject",
  "approvals.gate",
  "shutdown",
  /** tick advances coordinator work — not operator-readable. */
  "tick",
]);

/** Operator-only methods (read / health). Privileged token also accepted. */
export const IPC_OPERATOR_METHODS = new Set(["ping", "status", "approvals.list"]);

export function ensureIpcToken(dataDir: string): string {
  const tokenPath = join(dataDir, "coordinator", "ipc.token");
  mkdirSync(dirname(tokenPath), { recursive: true });
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf-8").trim();
  }
  const token = randomBytes(24).toString("hex");
  writeFileSync(tokenPath, token, { mode: 0o600 });
  try {
    chmodSync(tokenPath, 0o600);
  } catch {
    /* windows noop */
  }
  return token;
}

export function ensureIpcPrivilegedToken(dataDir: string): string {
  const tokenPath = join(dataDir, "coordinator", "ipc.privileged.token");
  mkdirSync(dirname(tokenPath), { recursive: true });
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf-8").trim();
  }
  const token = randomBytes(32).toString("hex");
  writeFileSync(tokenPath, token, { mode: 0o600 });
  try {
    chmodSync(tokenPath, 0o600);
  } catch {
    /* windows noop */
  }
  return token;
}

export function ipcSocketPath(dataDir: string): string {
  return join(dataDir, "coordinator", "ipc.sock");
}

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function authorizeIpc(
  dataDir: string,
  method: string,
  token: string,
): { ok: true } | { ok: false; reason: string } {
  const op = ensureIpcToken(dataDir);
  const priv = ensureIpcPrivilegedToken(dataDir);
  if (IPC_PRIVILEGED_METHODS.has(method)) {
    if (!tokensEqual(token, priv)) return { ok: false, reason: "unauthorized_privileged_method" };
    return { ok: true };
  }
  if (tokensEqual(token, op) || tokensEqual(token, priv)) return { ok: true };
  return { ok: false, reason: "unauthorized" };
}

export class CoordinatorIpcServer {
  private server: Server | null = null;
  private readonly seenNonces = new Map<string, number>();
  private epochProvider: () => number;

  constructor(
    private readonly dataDir: string,
    private readonly handler: IpcHandler,
    opts?: { epochProvider?: () => number },
  ) {
    this.epochProvider = opts?.epochProvider ?? (() => 0);
  }

  async start(): Promise<string> {
    const sock = ipcSocketPath(this.dataDir);
    mkdirSync(dirname(sock), { recursive: true });
    if (existsSync(sock)) {
      try {
        unlinkSync(sock);
      } catch {
        /* */
      }
    }
    // Ensure both tokens exist at start.
    ensureIpcToken(this.dataDir);
    ensureIpcPrivilegedToken(this.dataDir);
    this.server = createServer((socket) => this.onConnection(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(sock, () => resolve());
    });
    try {
      chmodSync(sock, 0o600);
    } catch {
      /* */
    }
    return sock;
  }

  private onConnection(socket: Socket): void {
    let buf = "";
    socket.on("data", async (chunk) => {
      buf += chunk.toString("utf-8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let req: IpcRequest;
        try {
          req = JSON.parse(line) as IpcRequest;
        } catch {
          socket.write(JSON.stringify({ id: "?", ok: false, error: "bad_json" }) + "\n");
          continue;
        }
        let res: IpcResponse;
        const auth = authorizeIpc(this.dataDir, req.method, req.token);
        if (!auth.ok) {
          res = { id: req.id, ok: false, error: auth.reason };
        } else if (IPC_PRIVILEGED_METHODS.has(req.method)) {
          const now = Date.now();
          const issuedAt = Number(req.issued_at ?? NaN);
          const nonce = String(req.nonce ?? "");
          if (!nonce || nonce.length < 8) {
            res = { id: req.id, ok: false, error: "nonce_required" };
          } else if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > 60_000) {
            res = { id: req.id, ok: false, error: "stale_or_future_request" };
          } else if (req.epoch !== undefined && Number(req.epoch) !== this.epochProvider()) {
            res = { id: req.id, ok: false, error: "epoch_mismatch" };
          } else {
            for (const [n, t] of this.seenNonces) {
              if (now - t >= 120_000) this.seenNonces.delete(n);
            }
            const prev = this.seenNonces.get(nonce);
            if (prev && now - prev < 120_000) {
              res = { id: req.id, ok: false, error: "replay_nonce" };
            } else if (this.seenNonces.size >= 10_000) {
              res = { id: req.id, ok: false, error: "nonce_cache_full" };
            } else {
              this.seenNonces.set(nonce, now);
              try {
                const result = await this.handler(req);
                res = { id: req.id, ok: true, result };
              } catch (err) {
                res = { id: req.id, ok: false, error: String(err) };
              }
            }
          }
        } else {
          try {
            const result = await this.handler(req);
            res = { id: req.id, ok: true, result };
          } catch (err) {
            res = { id: req.id, ok: false, error: String(err) };
          }
        }
        socket.write(JSON.stringify(res) + "\n");
      }
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    const sock = ipcSocketPath(this.dataDir);
    if (existsSync(sock)) {
      try {
        unlinkSync(sock);
      } catch {
        /* */
      }
    }
    this.server = null;
  }
}

export async function ipcCall(
  dataDir: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 5000,
  opts?: { privileged?: boolean; epoch?: number },
): Promise<IpcResponse> {
  const needPriv = opts?.privileged === true || IPC_PRIVILEGED_METHODS.has(method);
  // Auto-read of privileged token remains a same-UID residual risk (documented);
  // callers should prefer injecting token via opts in future. Epoch/nonce bind mitigates replay.
  const token = needPriv
    ? ensureIpcPrivilegedToken(dataDir)
    : ensureIpcToken(dataDir);
  const sockPath = ipcSocketPath(dataDir);
  const id = randomBytes(8).toString("hex");
  const req: IpcRequest = {
    id,
    method,
    params,
    token,
    nonce: randomBytes(16).toString("hex"),
    issued_at: Date.now(),
    epoch: typeof opts?.epoch === "number" ? opts.epoch : undefined,
  };

  return new Promise((resolve, reject) => {
    const socket = createConnection(sockPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ipc_timeout"));
    }, timeoutMs);
    let buf = "";
    socket.on("connect", () => {
      socket.write(JSON.stringify(req) + "\n");
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      const idx = buf.indexOf("\n");
      if (idx >= 0) {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(buf.slice(0, idx)) as IpcResponse);
        } catch (err) {
          reject(err);
        }
        socket.end();
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
