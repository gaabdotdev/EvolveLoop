/**
 * Local admin IPC for the live Control Plane process.
 * Capability-scoped tokens; attach CLI uses this for --deliver without elevating epoch.
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
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type FabricAdminCapability =
  | "fabric.status"
  | "fabric.deliver"
  | "fabric.revoke"
  | "fabric.shutdown";

export const FABRIC_ADMIN_CAPABILITIES: FabricAdminCapability[] = [
  "fabric.status",
  "fabric.deliver",
  "fabric.revoke",
  "fabric.shutdown",
];

export interface FabricAdminRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
  token: string;
  nonce: string;
  issued_at: number;
  epoch: number;
}

export interface FabricAdminResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type FabricAdminHandler = (req: FabricAdminRequest) => Promise<unknown> | unknown;

function tokenPath(fabricDir: string, capability: FabricAdminCapability): string {
  return join(fabricDir, "admin", `token.${capability.replace(".", "_")}.txt`);
}

export function fabricAdminSocketPath(fabricDir: string): string {
  return join(fabricDir, "admin", "admin.sock");
}

export function ensureFabricAdminTokens(
  fabricDir: string,
): Record<FabricAdminCapability, string> {
  const dir = join(fabricDir, "admin");
  mkdirSync(dir, { recursive: true });
  const out = {} as Record<FabricAdminCapability, string>;
  for (const cap of FABRIC_ADMIN_CAPABILITIES) {
    const p = tokenPath(fabricDir, cap);
    if (existsSync(p)) {
      out[cap] = readFileSync(p, "utf8").trim();
    } else {
      const t = randomBytes(24).toString("hex");
      writeFileSync(p, t, { mode: 0o600 });
      try {
        chmodSync(p, 0o600);
      } catch {
        /* */
      }
      out[cap] = t;
    }
  }
  return out;
}

function methodCapability(method: string): FabricAdminCapability | null {
  if (method === "status" || method === "fabric.status") return "fabric.status";
  if (method === "deliver" || method === "fabric.deliver") return "fabric.deliver";
  if (method === "revoke" || method === "fabric.revoke") return "fabric.revoke";
  if (method === "shutdown" || method === "fabric.shutdown") return "fabric.shutdown";
  return null;
}

export function authorizeFabricAdmin(
  fabricDir: string,
  method: string,
  token: string,
  epoch: number,
  reqEpoch: number,
  seenNonces: Map<string, number>,
  nonce: string,
  issuedAt: number,
): { ok: true; capability: FabricAdminCapability } | { ok: false; reason: string } {
  const cap = methodCapability(method);
  if (!cap) return { ok: false, reason: "unknown_method" };
  if (reqEpoch !== epoch) return { ok: false, reason: "epoch_mismatch" };
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > 60_000) {
    return { ok: false, reason: "stale_or_future_request" };
  }
  if (!nonce || nonce.length < 8) return { ok: false, reason: "nonce_required" };
  const prev = seenNonces.get(nonce);
  if (prev && now - prev < 120_000) return { ok: false, reason: "replay_nonce" };
  // expire old
  for (const [n, t] of seenNonces) {
    if (now - t >= 120_000) seenNonces.delete(n);
  }
  if (seenNonces.size >= 10_000) return { ok: false, reason: "nonce_cache_full" };
  const expected = ensureFabricAdminTokens(fabricDir)[cap];
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "unauthorized_capability" };
  }
  seenNonces.set(nonce, now);
  return { ok: true, capability: cap };
}

export class FabricAdminServer {
  private server: Server | null = null;
  private readonly seenNonces = new Map<string, number>();

  constructor(
    private readonly fabricDir: string,
    private readonly epoch: () => number,
    private readonly handler: FabricAdminHandler,
  ) {}

  async start(): Promise<string> {
    ensureFabricAdminTokens(this.fabricDir);
    const sock = fabricAdminSocketPath(this.fabricDir);
    mkdirSync(dirname(sock), { recursive: true });
    if (existsSync(sock)) {
      try {
        unlinkSync(sock);
      } catch {
        /* */
      }
    }
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
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let req: FabricAdminRequest;
        try {
          req = JSON.parse(line) as FabricAdminRequest;
        } catch {
          socket.write(JSON.stringify({ id: "?", ok: false, error: "bad_json" }) + "\n");
          continue;
        }
        const auth = authorizeFabricAdmin(
          this.fabricDir,
          req.method,
          req.token,
          this.epoch(),
          Number(req.epoch),
          this.seenNonces,
          String(req.nonce ?? ""),
          Number(req.issued_at),
        );
        let res: FabricAdminResponse;
        if (!auth.ok) {
          res = { id: req.id, ok: false, error: auth.reason };
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
    const sock = fabricAdminSocketPath(this.fabricDir);
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

export async function fabricAdminCall(
  fabricDir: string,
  method: string,
  params: Record<string, unknown> = {},
  capability: FabricAdminCapability,
  epoch: number,
  timeoutMs = 15_000,
): Promise<FabricAdminResponse> {
  const tokens = ensureFabricAdminTokens(fabricDir);
  const token = tokens[capability];
  const sockPath = fabricAdminSocketPath(fabricDir);
  const id = randomBytes(8).toString("hex");
  const req: FabricAdminRequest = {
    id,
    method,
    params,
    token,
    nonce: randomBytes(16).toString("hex"),
    issued_at: Date.now(),
    epoch,
  };
  return new Promise((resolve, reject) => {
    const socket = createConnection(sockPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("fabric_admin_timeout"));
    }, timeoutMs);
    let buf = "";
    socket.on("connect", () => {
      socket.write(JSON.stringify(req) + "\n");
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const idx = buf.indexOf("\n");
      if (idx >= 0) {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(buf.slice(0, idx)) as FabricAdminResponse);
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

/** Binding proof helper for audits (HMAC of capability+epoch). */
export function capabilityProof(token: string, capability: string, epoch: number): string {
  return createHmac("sha256", token).update(`${capability}:${epoch}`).digest("hex");
}
