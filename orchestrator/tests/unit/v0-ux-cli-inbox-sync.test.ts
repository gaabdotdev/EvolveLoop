/**
 * META-WS-007 / UX §5.5 — Inbox sync across attached terminals (minimum slice).
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEvolveDaemon,
  createEvolveDaemonClient,
} from "../../src/v3/daemon/index.js";
import {
  createUdsInboxBridge,
  formatInboxStreamLine,
  probeDaemonAttach,
  resolveDaemonInboxForShell,
  runEvolveShell,
  type InboxEvent,
  type InboxEventHandler,
  type ShellInboxBridge,
} from "../../src/v3/evolve-shell/index.js";

function mockInboxBridge(): ShellInboxBridge & {
  published: string[];
  emit(ev: InboxEvent): void;
} {
  const handlers = new Set<InboxEventHandler>();
  const published: string[] = [];
  return {
    published,
    async publish(text: string) {
      published.push(text);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async close() {
      handlers.clear();
    },
    emit(ev) {
      for (const h of handlers) h(ev);
    },
  };
}

describe("Inbox stream format", () => {
  it("formatInboxStreamLine tags origin client", () => {
    expect(
      formatInboxStreamLine({ from_client: "client-abcd1234", text: "olá world" }),
    ).toBe("[Inbox · client-abcd1234] olá world");
  });
});

describe("UDS inbox_publish → inbox_event (2 clients)", () => {
  let tmp: string;
  const daemons: Array<{ stop: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const d of daemons.splice(0)) {
      await d.stop();
    }
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("publish from A arrives as inbox_event on B (same Inbox origin id)", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-inbox-uds-"));
    const sock_path = path.join(tmp, "runtime.sock");
    const daemon = createEvolveDaemon({ sock_path });
    daemons.push(daemon);
    await daemon.start();
    expect(existsSync(sock_path)).toBe(true);

    const a = createEvolveDaemonClient(sock_path);
    const b = createEvolveDaemonClient(sock_path);
    await a.connect();
    await b.connect();
    const deadline = Date.now() + 2000;
    while (daemon.clientCount() < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(daemon.clientCount()).toBeGreaterThanOrEqual(2);

    const peerEvents: Array<{ from_client: string; text: string }> = [];
    b.onMessage((msg) => {
      if (msg.type === "inbox_event") {
        peerEvents.push({ from_client: msg.from_client, text: msg.text });
      }
    });

    const ack = await a.publishInbox("mensagem partilhada MSO");
    expect(ack.type).toBe("inbox_event");
    if (ack.type === "inbox_event") {
      expect(ack.text).toBe("mensagem partilhada MSO");
      expect(ack.from_client).toMatch(/^client-/);
    }

    const waitPeer = Date.now() + 2000;
    while (peerEvents.length < 1 && Date.now() < waitPeer) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(peerEvents).toHaveLength(1);
    expect(peerEvents[0]!.text).toBe("mensagem partilhada MSO");
    expect(peerEvents[0]!.from_client).toMatch(/^client-/);
    if (ack.type === "inbox_event") {
      expect(peerEvents[0]!.from_client).toBe(ack.from_client);
    }

    // Ctrl+D on A must not kill in-flight tracking (sanity with inbox path)
    daemon.trackRun("run-after-inbox", "owner-a");
    a.sendEof();
    await a.disconnect().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    expect(daemon.activeRuns().some((r) => r.run_id === "run-after-inbox")).toBe(
      true,
    );

    await b.disconnect();
  });

  it("createUdsInboxBridge subscribe + publish round-trip", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-inbox-bridge-"));
    const sock_path = path.join(tmp, "runtime.sock");
    const daemon = createEvolveDaemon({ sock_path });
    daemons.push(daemon);
    await daemon.start();

    const bridgeA = await createUdsInboxBridge(sock_path);
    const bridgeB = await createUdsInboxBridge(sock_path);
    expect(bridgeA).toBeTruthy();
    expect(bridgeB).toBeTruthy();

    const seen: InboxEvent[] = [];
    bridgeB!.subscribe((ev) => seen.push(ev));
    await bridgeA!.publish("via bridge");

    const wait = Date.now() + 2000;
    while (seen.length < 1 && Date.now() < wait) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(seen[0]?.text).toBe("via bridge");
    expect(seen[0]?.from_client).toMatch(/^client-/);

    await bridgeA!.close();
    await bridgeB!.close();
  });
});

describe("evolve-shell Inbox tag + inbox_sync status", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("daemon OFF → inbox_sync unavailable; no Inbox tag from bridge", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-inbox-off-"));
    const probed = await probeDaemonAttach(tmp);
    expect(probed.active).toBe(false);
    expect(probed.inbox_sync).toBe("unavailable");

    const resolved = await resolveDaemonInboxForShell({
      workspace: tmp,
      daemon_attach: {
        active: false,
        attached: false,
        clients: null,
        sock_path: path.join(tmp, ".evolveloop", "runtime.sock"),
        inbox_sync: "unavailable",
      },
    });
    expect(resolved.info.inbox_sync).toBe("unavailable");
    expect(resolved.bridge).toBeNull();
  });

  it("shell with mock bridge prints [Inbox · client-…] and publishes conversational lines", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-inbox-shell-"));
    const bridge = mockInboxBridge();

    const result = await runEvolveShell({
      workspace: tmp,
      inputLines: ["status", "sair"],
      disable_raw_mode: true,
      daemon_attach: {
        active: true,
        attached: true,
        clients: 2,
        sock_path: path.join(tmp, ".evolveloop", "runtime.sock"),
        inbox_sync: "enabled",
      },
      inbox_bridge: bridge,
      on_ready: () => {
        bridge.emit({
          from_client: "client-peer001",
          text: "hello from peer terminal",
        });
      },
    });

    expect(
      result.lines.some((l) =>
        l.includes("[Inbox · client-peer001] hello from peer terminal"),
      ),
    ).toBe(true);
    // "status" is published; "sair" is not
    expect(bridge.published).toContain("status");
    expect(bridge.published).not.toContain("sair");
    expect(result.daemon_label).toBe("ON (attached · 2 clientes)");
  });

  it("attach+subscribe via resolveDaemonInboxForShell → enabled", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-inbox-resolve-"));
    const sock_path = path.join(tmp, ".evolveloop", "runtime.sock");
    await fs.mkdir(path.dirname(sock_path), { recursive: true });
    const daemon = createEvolveDaemon({ sock_path });
    await daemon.start();
    try {
      const { info, bridge } = await resolveDaemonInboxForShell({
        workspace: tmp,
      });
      expect(info.active).toBe(true);
      expect(info.attached).toBe(true);
      expect(info.inbox_sync).toBe("enabled");
      expect(bridge).toBeTruthy();
      await bridge!.close();
    } finally {
      await daemon.stop();
    }
  });
});
