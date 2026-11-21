/**
 * Local Unix-socket IPC for Coordinator service.
 * Auth: peer must present shared token from data-dir (mode 0600 file).
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
import { randomBytes } from "node:crypto";

export interface IpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
  token: string;
}

export interface IpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type IpcHandler = (req: IpcRequest) => Promise<unknown> | unknown;

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

export function ipcSocketPath(dataDir: string): string {
  return join(dataDir, "coordinator", "ipc.sock");
}

export class CoordinatorIpcServer {
  private server: Server | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly handler: IpcHandler,
  ) {}

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
    const token = ensureIpcToken(this.dataDir);
    this.server = createServer((socket) => this.onConnection(socket, token));
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

  private onConnection(socket: Socket, token: string): void {
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
        if (req.token !== token) {
          res = { id: req.id, ok: false, error: "unauthorized" };
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
): Promise<IpcResponse> {
  const token = ensureIpcToken(dataDir);
  const sockPath = ipcSocketPath(dataDir);
  const id = randomBytes(8).toString("hex");
  const req: IpcRequest = { id, method, params, token };

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
