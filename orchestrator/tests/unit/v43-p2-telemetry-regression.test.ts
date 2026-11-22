/**
 * V4.3 P2-4 / P2-5 — telemetria/ledger/continuity smokes + credentials LIMITATION surface.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/index.js";
import { loadHonestTokenTelemetry } from "../../src/v3/token-economy/honest-telemetry.js";
import { formatHonestMetric } from "../../src/v3/evolve-shell/footer.js";
import {
  formatDeliveryTokens,
  buildDeliveryCardView,
} from "../../src/cli/tui/delivery-card-view.js";
import { formatContinuityLimitation } from "../../src/v3/continuity/limitation-ui.js";
import {
  buildAgentVsSessionView,
  classifyHandleLifecycle,
} from "../../src/v3/agent-handles/index.js";
import type { AgentRecord } from "../../src/v3/agent-registry/types.js";
import {
  formatCredentialsCanonicalLines,
  resolveCredentialsCanonicalPaths,
} from "../../src/cli/credentials-paths.js";
import { formatJourneyHelp, formatAdvancedHelp } from "../../src/cli/help-usage.js";

function stubReplaced(): AgentRecord {
  return {
    agent_id: "a-old",
    role: "worker",
    child_agent_ids: [],
    work_id: "w-tel",
    state: "REPLACED",
    replaced_by: "a-new",
    last_heartbeat_at: "t",
    last_activity_at: "t",
    budget_consumed: {},
    permissions: {},
    created_at: "t",
    updated_at: "t",
  };
}

describe("P2-4 HonestMetric / ledger / continuity", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v43-p2-tel-"));
    mkdirSync(join(ws, ".evolveloop"), { recursive: true });
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("absent/empty ledger → UNAVAILABLE (never silent invented 0 consumption)", () => {
    const emptyWs = mkdtempSync(join(tmpdir(), "v43-p2-empty-"));
    try {
      const tel = loadHonestTokenTelemetry(emptyWs);
      expect(tel.tok_mso.provenance).toBe("UNAVAILABLE");
      expect(tel.tok_workers.provenance).toBe("UNAVAILABLE");
      expect(tel.aggregate).toBeNull();
      expect(formatHonestMetric(tel.tok_mso)).toMatch(/indisponível|—|n\/a|UNAVAILABLE/i);
    } finally {
      rmSync(emptyWs, { recursive: true, force: true });
    }

    const db = new StateDb(defaultStateDbPath(ws));
    try {
      expect(db.listTokenLedger()).toHaveLength(0);
    } finally {
      db.close();
    }
    const afterDb = loadHonestTokenTelemetry(ws);
    expect(afterDb.tok_mso.provenance).toBe("UNAVAILABLE");
    expect(afterDb.tok_workers.provenance).toBe("UNAVAILABLE");
  });

  it("reported ledger entries roll up without inventing extra tokens", () => {
    const db = new StateDb(defaultStateDbPath(ws));
    try {
      db.recordTokenLedger({
        work_id: "w-tel",
        task_id: "mso-1",
        subsystem: "mso.planning",
        tokens_in: 10,
        tokens_out: 5,
        cost_provenance: "reported",
        status: "ok",
      });
      db.recordTokenLedger({
        work_id: "w-tel",
        task_id: "w-1",
        subsystem: "circuit.adapter",
        tokens_in: 20,
        tokens_out: 10,
        cost_provenance: "reported",
        status: "ok",
      });
    } finally {
      db.close();
    }
    const tel = loadHonestTokenTelemetry(ws, "w-tel");
    expect(tel.tok_mso.provenance).toBe("reported");
    expect(tel.tok_mso.value).toBe(15);
    expect(tel.tok_workers.provenance).toBe("reported");
    expect(tel.tok_workers.value).toBe(30);
    expect(tel.aggregate!.tokens_total).toBe(45);

    const line = formatDeliveryTokens(tel.tok_mso, tel.tok_workers);
    expect(line).toMatch(/Orchestrator/);
    expect(line).toMatch(/Agents/);
    expect(line).not.toMatch(/\b0 \(reported\)/);
  });

  it("Delivery card does not invent PASS tokens when UNAVAILABLE", () => {
    const view = buildDeliveryCardView({
      status: "UNVERIFIED",
      diff_stat: "(sem diff)",
      tok_mso: { provenance: "UNAVAILABLE" },
      tok_workers: { provenance: "UNAVAILABLE" },
    });
    expect(view.tokens_line).toMatch(/indisponível|—/);
    expect(view.tokens_line).not.toMatch(/Orchestrator 0 \(reported\)/);
  });

  it("REPLACED UI: continuity 3 lines; lifecycle ≠ active", () => {
    const agent = stubReplaced();
    expect(classifyHandleLifecycle(agent)).toBe("replaced");
    const lim = formatContinuityLimitation({ kind: "replaced", agent });
    expect(lim.lines).toHaveLength(3);
    expect(lim.lines[0]).toMatch(/^Preservado:/);
    expect(lim.lines[1]).toMatch(/^Perdido:/);
    expect(lim.lines[2]).toMatch(/^Próximo:/);
    const view = buildAgentVsSessionView(agent);
    expect(view.continuity_limitation?.lines).toHaveLength(3);
    expect(view.handle_lifecycle).not.toBe("active");
  });
});

describe("P2-5 credentials LIMITATION documented (not unified)", () => {
  it("canonical paths remain two houses; help surfaces them", () => {
    const paths = resolveCredentialsCanonicalPaths("/tmp/ws-creds-p2");
    expect(paths.setup_credentials_env).toContain("credentials.env");
    expect(paths.provider_secrets_env).toContain("secrets.env");
    expect(paths.setup_credentials_env).not.toBe(paths.provider_secrets_env);

    const lines = formatCredentialsCanonicalLines(paths);
    expect(lines.some((l) => /Não unificar|duas casas|Precedência/i.test(l))).toBe(
      true,
    );

    const journey = formatJourneyHelp();
    expect(journey).toMatch(/credentials\.env|secrets\.env|credencial/i);

    const advanced = formatAdvancedHelp();
    expect(advanced).toMatch(/credentials\.env|secrets\.env/);
  });
});
