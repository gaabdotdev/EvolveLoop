/**
 * Daemon attach probe + Inbox stream sync for banner/HUD (UX spec §5.5 / META-WS-007).
 *
 * Protocol (UDS): `inbox_publish` → server broadcasts `inbox_event` to all clients
 * (including publisher). Publisher `request()` consumes own framed reply by id;
 * peers print via onMessage. Ctrl+D disconnect does not kill runs.
 */

import { existsSync } from "node:fs";
import {
  createEvolveDaemonClient,
  defaultRuntimeSockPath,
  type EvolveDaemonClient,
  type DaemonMessage,
} from "../daemon/index.js";

export type InboxSyncStatus = "enabled" | "unavailable";

export interface DaemonAttachInfo {
  active: boolean;
  /** True when this shell successfully probed a live daemon (attach-ready). */
  attached: boolean;
  clients: number | null;
  sock_path: string;
  /**
   * `enabled` after live attach + inbox_event subscribe succeeds.
   * `unavailable` when daemon OFF / probe fails / subscribe not established.
   */
  inbox_sync: InboxSyncStatus;
}

export interface InboxEvent {
  from_client: string;
  text: string;
  id?: string;
  ts?: string;
}

export type InboxEventHandler = (ev: InboxEvent) => void;

/**
 * Thin bridge used by evolve-shell (real UDS or test mock).
 */
export interface ShellInboxBridge {
  publish(text: string): Promise<void>;
  subscribe(handler: InboxEventHandler): () => void;
  close(): Promise<void>;
}

export function formatInboxStreamLine(ev: InboxEvent): string {
  return `[Inbox · ${ev.from_client}] ${ev.text}`;
}

export function formatDaemonBannerLabel(info: DaemonAttachInfo): string {
  if (!info.active || !info.attached) return "OFF";
  if (info.clients != null) {
    return `ON (attached · ${info.clients} clientes)`;
  }
  return "ON (attached)";
}

/**
 * Probe workspace UDS. Sock absent → OFF. Sock present + status_ok → ON attached.
 * Stale/unresponsive sock → OFF (do not invent ON).
 * Probe alone does not subscribe — inbox_sync stays `unavailable` until bridge attach.
 */
export async function probeDaemonAttach(
  workspace: string,
  timeoutMs = 250,
): Promise<DaemonAttachInfo> {
  const sock_path = defaultRuntimeSockPath(workspace);
  const base: DaemonAttachInfo = {
    active: false,
    attached: false,
    clients: null,
    sock_path,
    inbox_sync: "unavailable",
  };
  if (!existsSync(sock_path)) return base;

  const client = createEvolveDaemonClient(sock_path);
  try {
    await client.connect();
    const status = await client.request({ type: "status" }, timeoutMs);
    if (status.type === "status_ok") {
      return {
        active: true,
        attached: true,
        clients: status.clients,
        sock_path,
        inbox_sync: "unavailable",
      };
    }
    return base;
  } catch {
    return base;
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

/**
 * Persistent UDS client subscribed to `inbox_event` for multi-terminal Inbox sync.
 */
export async function createUdsInboxBridge(
  sock_path: string,
): Promise<ShellInboxBridge | null> {
  if (!existsSync(sock_path)) return null;
  const client: EvolveDaemonClient = createEvolveDaemonClient(sock_path);
  try {
    await client.connect();
  } catch {
    return null;
  }

  const handlers = new Set<InboxEventHandler>();
  const unsubNet = client.onMessage((msg: DaemonMessage) => {
    if (msg.type !== "inbox_event") return;
    const ev: InboxEvent = {
      from_client: msg.from_client,
      text: msg.text,
      id: msg.id,
      ts: msg.ts,
    };
    for (const h of handlers) {
      try {
        h(ev);
      } catch {
        /* ignore */
      }
    }
  });

  return {
    async publish(text: string) {
      const res = await client.publishInbox(text);
      if (res.type === "error") {
        throw new Error(res.message);
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close() {
      unsubNet();
      handlers.clear();
      await client.disconnect().catch(() => undefined);
    },
  };
}

/**
 * Resolve attach info + optional inbox bridge for the shell boot path.
 * Injected `daemon_attach` / `inbox_bridge` skip live UDS (tests).
 */
export async function resolveDaemonInboxForShell(opts: {
  workspace: string;
  daemon_attach?: DaemonAttachInfo;
  inbox_bridge?: ShellInboxBridge;
}): Promise<{ info: DaemonAttachInfo; bridge: ShellInboxBridge | null }> {
  if (opts.daemon_attach) {
    const info = { ...opts.daemon_attach };
    if (!info.active) {
      info.inbox_sync = "unavailable";
      return { info, bridge: opts.inbox_bridge ?? null };
    }
    if (opts.inbox_bridge) {
      info.inbox_sync = "enabled";
      return { info, bridge: opts.inbox_bridge };
    }
    // Injected ON without bridge → keep caller inbox_sync (tests of banner only).
    return { info, bridge: null };
  }

  const probed = await probeDaemonAttach(opts.workspace);
  if (!probed.active || !probed.attached) {
    return { info: { ...probed, inbox_sync: "unavailable" }, bridge: null };
  }

  const bridge = await createUdsInboxBridge(probed.sock_path);
  if (!bridge) {
    return { info: { ...probed, inbox_sync: "unavailable" }, bridge: null };
  }
  return {
    info: { ...probed, inbox_sync: "enabled" },
    bridge,
  };
}
