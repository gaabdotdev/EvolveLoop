/**
 * V4.3 P1 — Consolidation smoke: copy, help, dual TUI, status facade, identity map.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatJourneyHelp, formatAdvancedHelp } from "../../src/cli/help-usage.js";
import {
  PRODUCT_RUNTIME_MAP,
  formatSessionTransitionUi,
  formatTokensProductLine,
  UI_ORCHESTRATOR,
  UI_AGENTS,
  UI_PLAN,
} from "../../src/cli/product-copy.js";
import {
  buildFooterTelemetry,
  renderFooter,
} from "../../src/v3/evolve-shell/footer.js";
import { renderCompactFooter } from "../../src/cli/tui/footer-compact.js";
import { formatSlashStatus } from "../../src/cli/tui/slash-handlers.js";
import { runIntentFlow } from "../../src/v3/intake/intent-flow.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/store.js";
import type { WorkspaceSessionSnapshot } from "../../src/v3/evolve-shell/workspace-session.js";
import { renderGoalContractCard } from "../../src/v3/evolve-shell/grill-ux.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function emptySession(): WorkspaceSessionSnapshot {
  return {
    workspace: "/tmp/ws",
    initialized: false,
    state_db_path: "/tmp/ws/.evolveloop/state.db",
    state_db_exists: false,
    contracts_count: 0,
    message_pt: "workspace novo",
  };
}

describe("P1-1 status / sessions facade", () => {
  let ws: string;
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v43-p1-"));
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("evolve status message uses Task/Session product axis", () => {
    const out = runIntentFlow({ workspace: ws, intent: "status", answers: [] });
    expect(out).toMatchObject({ bypassed: true });
    if (!("bypassed" in out) || !out.bypassed) throw new Error("expected bypass");
    expect(out.message_pt).toMatch(/Task\/Session/);
    expect(out.message_pt).not.toMatch(/Goal Contract/);
    const data = out.data as { product?: string; kind?: string };
    expect(data.product).toBe("task_session");
    expect(data.kind).toBe("status");
  });

  it("journey help marks status as Task/Session; advanced qualifies L2", () => {
    const j = formatJourneyHelp();
    expect(j).toMatch(/Task\/Session/);
    expect(j).toMatch(/help advanced/);
    const adv = formatAdvancedHelp();
    expect(adv).toMatch(/coordinator status/);
    expect(adv).toMatch(/adapters sessions/);
    expect(adv).toMatch(/harness sessions/);
    expect(adv).toMatch(/evolve status/);
  });
});

describe("P1-2 classic REPL copy Agents / Plan", () => {
  it("classic footer uses Agents not Workers", () => {
    const tel = buildFooterTelemetry(emptySession(), {
      home: "/home/gaab",
      idle: true,
    });
    const text = renderFooter(tel, { color: false });
    expect(text).toContain("Agents:");
    expect(text).not.toContain("Workers:");
  });

  it("Plan card title is Plan (runtime Goal Contract IDs unchanged)", () => {
    const card = renderGoalContractCard({
      objective: "Adicionar healthcheck",
      scope: ["src/api"],
      criteria: "GET /health 200",
    });
    expect(card.split("\n")[0]).toBe(UI_PLAN);
    expect(card).toMatch(/Objetivo:/);
    expect(card).not.toMatch(/Goal Contract/);
  });
});

describe("P1-3 Orchestrator / Session copy + map", () => {
  it("product map documents Orchestrator↔MSO and Plan↔Goal Contract", () => {
    expect(PRODUCT_RUNTIME_MAP.Orchestrator).toMatch(/MSO/);
    expect(PRODUCT_RUNTIME_MAP.Plan).toMatch(/Goal Contract/);
    expect(PRODUCT_RUNTIME_MAP.Agents).toMatch(/workers/i);
  });

  it("compact footer + slash tokens say Orchestrator not MSO", () => {
    const tel = buildFooterTelemetry(emptySession(), {
      home: "/home/gaab",
      executing: true,
      mso_state: "DELEGATING",
      tasks: [{ name: "agy" }],
      tok_mso: { value: 1200, provenance: "reported" },
      tok_workers: { value: 340, provenance: "reported" },
    });
    const compact = renderCompactFooter(tel);
    expect(compact.lines.join("\n")).toContain(`tok ${UI_ORCHESTRATOR}`);
    expect(compact.lines.join("\n")).not.toContain("tok MSO");
    expect(compact.lines.join("\n")).not.toContain("Workers");

    const slash = formatSlashStatus({
      mso_state: "DELEGATING",
      tokens_mso: "1.2k",
      tokens_workers: "340",
    });
    expect(slash).toContain(formatTokensProductLine("1.2k", "340"));
    expect(slash).not.toContain("Tokens: MSO");
  });

  it("session transitions avoid MSO → prefix; TRUE-FULL-PASS mapped", () => {
    expect(formatSessionTransitionUi("VALIDATING")).toBe("Session → validando");
    expect(formatSessionTransitionUi("TRUE-FULL-PASS")).toBe(
      "Session → concluída (verificada)",
    );
    expect(formatSessionTransitionUi("VALIDATING")).not.toMatch(/^MSO/);
  });
});

describe("P1-4 dual TUI help", () => {
  it("journey help: Ink default; tui run/status = ops", () => {
    const j = formatJourneyHelp();
    expect(j).toMatch(/Ink TUI/);
    expect(j).toMatch(/tui run\|status/);
    expect(j).toMatch(/ops Core/);
    const adv = formatAdvancedHelp();
    expect(adv).toMatch(/ops Core StatusBoard/);
    expect(adv).toMatch(/NÃO Ink default|≠ Ink/);
  });
});

describe("P1-5 / P1-6 release + compat docs exist", () => {
  const required = [
    "docs/v4/V4.3/compat-matrix.md",
    "docs/v4/V4.3/migration-notes.md",
    "docs/v4/V4.3/quickstart.md",
    "docs/v4/V4.3/troubleshooting.md",
    "docs/v4/V4.3/known-limits.md",
    "docs/v4/V4.3/release-checklist.md",
    "docs/v4/V4.3/rollback-plan.md",
    "docs/v4/V4.3/deferred-decisions.md",
    "docs/v4/V4.3/identity-copy-map.md",
    "docs/v4/V4.3/redundancy-report.md",
  ];

  it("all P1 release/compat docs present and mention Node >=22.5 where relevant", () => {
    for (const rel of required) {
      const p = join(REPO_ROOT, rel);
      expect(existsSync(p), rel).toBe(true);
    }
    const compat = readFileSync(join(REPO_ROOT, "docs/v4/V4.3/compat-matrix.md"), "utf-8");
    expect(compat).toMatch(/≥\s*22\.5|>=22\.5/);
    expect(compat).toMatch(/LIMITATION/);
  });

  it("advanced help documents Node >=22.5.0", () => {
    expect(formatAdvancedHelp()).toMatch(/Node suportado: >=22\.5\.0/);
  });
});

describe("P1-7 redundancy report closes R1/T2/E1", () => {
  it("report marks Fundir/Ocultar/Alinhar for key IDs", () => {
    const body = readFileSync(
      join(REPO_ROOT, "docs/v4/V4.3/redundancy-report.md"),
      "utf-8",
    );
    expect(body).toMatch(/\*\*R1\*\*/);
    expect(body).toMatch(/\*\*T2\*\*/);
    expect(body).toMatch(/\*\*E1\*\*/);
    expect(body).toMatch(/Fundir/);
    expect(body).toMatch(/Ocultar/);
    expect(body).toMatch(/Alinhar copy/);
    expect(body).toMatch(/Remover \| 0/);
  });
});

describe("P1 identity: Agents label constant", () => {
  it("UI_AGENTS is Agents", () => {
    expect(UI_AGENTS).toBe("Agents");
  });

  it("status JSON still exposes validated_goal_contracts (compat)", () => {
    const ws = mkdtempSync(join(tmpdir(), "v43-p1b-"));
    try {
      const db = new StateDb(defaultStateDbPath(ws));
      db.close();
      const out = runIntentFlow({ workspace: ws, intent: "status", answers: [] });
      if (!("bypassed" in out) || !out.bypassed) throw new Error("expected bypass");
      expect(out.data).toHaveProperty("validated_goal_contracts");
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
