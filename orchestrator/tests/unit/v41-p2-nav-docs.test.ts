/**
 * V4.1 P2 — journey help + slash de jornada.
 */
import { describe, it, expect } from "vitest";
import {
  formatAdvancedHelp,
  formatJourneyHelp,
} from "../../src/cli/help-usage.js";
import {
  parseSlashCommand,
  SLASH_COMMANDS,
} from "../../src/cli/tui/slash-commands.js";
import {
  formatSlashAgents,
  formatSlashApprovals,
  formatSlashDelivery,
  formatSlashPlan,
  runSlashHandler,
} from "../../src/cli/tui/slash-handlers.js";
import { buildPlanDisplay } from "../../src/cli/tui/plan-display.js";

describe("P2-1 journey help vs advanced", () => {
  it("formatJourneyHelp is short and points to advanced", () => {
    const text = formatJourneyHelp();
    expect(text).toMatch(/jornada cotidiana/i);
    expect(text).toMatch(/evolve help advanced/);
    expect(text).toMatch(/\/plan/);
    expect(text).toMatch(/\/approvals/);
    expect(text).not.toMatch(/embeddings/);
    // V4.2+ credentials block + V4.3 delivery/pause lines — keep short, not L3 dump
    expect(text).toMatch(/Credenciais/);
    expect(text.split("\n").length).toBeLessThan(55);
  });

  it("formatAdvancedHelp exposes progressive groups as JSON", () => {
    const raw = formatAdvancedHelp();
    const obj = JSON.parse(raw) as {
      layer: string;
      groups: Record<string, string[]>;
    };
    expect(obj.layer).toBe("advanced");
    expect(obj.groups.agents).toBeTruthy();
    expect(obj.groups.adapters).toBeTruthy();
    expect(obj.groups.embeddings).toBeTruthy();
  });
});

describe("P2-3 slash jornada", () => {
  it("registers plan/approvals/agents/pause/cancel/delivery", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    for (const id of [
      "plan",
      "approvals",
      "agents",
      "pause",
      "cancel",
      "delivery",
    ] as const) {
      expect(ids).toContain(id);
      expect(parseSlashCommand(`/${id}`)).toEqual({
        kind: "slash",
        command: id,
        args: "",
      });
    }
  });

  it("/plan shows Plan card or honest empty stub", () => {
    expect(formatSlashPlan(null)).toMatch(/nenhum Plan ativo/);
    const plan = buildPlanDisplay({
      objective: "Healthcheck",
      scope: ["a", "b"],
      criteria: "ok",
      approval_needed: true,
    });
    const body = formatSlashPlan(plan);
    expect(body).toMatch(/^Plan/);
    expect(body).toMatch(/Objetivo/);
    expect(runSlashHandler("plan", { plan }).command).toBe("plan");
  });

  it("/approvals empty points to CLI", () => {
    const body = formatSlashApprovals([]);
    expect(body).toMatch(/fila vazia/);
    expect(body).toMatch(/evolve approvals list/);
  });

  it("/agents stub points to evolve agents + Handles default OFF", () => {
    const body = formatSlashAgents({ handlesEnabled: false });
    expect(body).toMatch(/evolve agents/);
    expect(body).toMatch(/OFF \(default\)/);
  });

  it("/pause and /cancel reuse task-control semantics", () => {
    const pause = runSlashHandler("pause");
    expect(pause.command).toBe("pause");
    expect(pause.message).toMatch(/pausa/i);
    const cancel = runSlashHandler("cancel");
    expect(cancel.command).toBe("cancel");
    if (cancel.command === "cancel") {
      expect(cancel.destructive).toBe(true);
    }
    expect(cancel.message).toMatch(/destrutivo/i);
  });

  it("/delivery empty is honest (no fake PASS status)", () => {
    const body = formatSlashDelivery({});
    expect(body).toMatch(/ainda sem cartão/);
    expect(body).toMatch(/só com evidência/);
    expect(body).not.toMatch(/^Entrega aceita/m);
    expect(formatSlashDelivery({ status: "UNVERIFIED" })).toMatch(
      /não validado/i,
    );
  });
});
