/**
 * V0-CLI-01..03 + V0-GRILL-01..04 unit evidence.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  authorizePlanning,
  classifyRequestScale,
  buildGrillMeQuestions,
  resolveAnswers,
  validateGrillMeResult,
  buildGrillMeResultFromAnswers,
} from "../../src/v3/grill-me/index.js";
import {
  validateGoalDocumentStructural,
  validateGoalContractStructural,
  buildGoalDocument,
} from "../../src/v3/goal-document/index.js";
import { runIntentFlow } from "../../src/v3/intake/intent-flow.js";
import { silentScan } from "../../src/v3/workspace-scan/index.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/index.js";
import {
  detectWorkspaceSession,
  runEvolveShell,
  attachKeybindings,
} from "../../src/v3/evolve-shell/index.js";

describe("V0-GRILL + V0-CLI", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-cli-grill-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "fixture-cli", version: "0.0.1" }),
      "utf-8",
    );
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "app.ts"), "export const x = 1\n", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("V0-GRILL-01: runtime gate mandatory for medium/large; LLM boolean ≠ proof", () => {
    expect(classifyRequestScale("status")).toBe("trivial");
    expect(classifyRequestScale("fix typo")).toBe("small");
    expect(classifyRequestScale("Adicionar endpoint de auth na API")).toBe("medium");
    expect(classifyRequestScale("Grande refactor da arquitectura do orquestrador multi-repo")).toBe(
      "large",
    );

    const llmOnly = authorizePlanning({
      intent: "Adicionar endpoint de auth na API",
      llm_claim_ready: true,
    });
    expect(llmOnly.gate_required).toBe(true);
    expect(llmOnly.planning_authorized).toBe(false);
    expect(llmOnly.reasons).toContain("llm_boolean_not_proof");

    const scan = silentScan(tmp);
    const qs = buildGrillMeQuestions("Adicionar endpoint de auth na API", scan);
    const answers = resolveAnswers(qs, ["ok", "ok", "ok", "ok"]);
    const grill = buildGrillMeResultFromAnswers(
      "Adicionar endpoint de auth na API",
      scan,
      qs,
      answers,
    );
    const validation = validateGrillMeResult(grill);
    const ok = authorizePlanning({
      intent: "Adicionar endpoint de auth na API",
      scan,
      grill_validation: validation,
      llm_claim_ready: true,
    });
    expect(ok.planning_authorized).toBe(true);
    expect(ok.structural_proof).toBe(true);
    expect(ok.reasons).toContain("llm_claim_ignored_structural_proof_used");
  });

  it("V0-GRILL-02: silent scan is deterministic (git/stack/tree/symbols)", () => {
    const a = silentScan(tmp);
    const b = silentScan(tmp);
    expect(a.languages).toEqual(b.languages);
    expect(a.package_name).toBe("fixture-cli");
    expect(a.tree.some((t) => t.includes("src"))).toBe(true);
    expect(a.symbols.some((s) => s.name === "x")).toBe(true);
    expect(a.context_block).toContain("WORKSPACE_SCAN");
  });

  it("V0-GRILL-03: adaptive interview 2–3 (vague) with default approvable by ok", () => {
    const scan = silentScan(tmp);
    const qs = buildGrillMeQuestions("Implementar persistência SQLite do goal contract", scan);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    expect(qs.length).toBeLessThanOrEqual(3);
    const answers = resolveAnswers(qs, qs.map(() => "ok"));
    expect(answers.every((a) => a.used_default)).toBe(true);
    expect(answers.every((a) => a.value.length > 0)).toBe(true);
    expect(qs.every((q) => !/Bloco\s*3/i.test(q.default_answer))).toBe(true);
  });

  it("V0-GRILL-04: Goal Document + Contract persist with structural validation", () => {
    const out = runIntentFlow({
      workspace: tmp,
      intent: "Adicionar endpoint de health na API",
      answers: ["ok", "ok", "ok", "ok"],
      confirm_mso: true,
      goal_contract_id: "gc-grill-04",
    });
    expect(out.kind).toBe("goal_contract");
    if (out.kind !== "goal_contract") return;

    expect(out.planning.planning_authorized).toBe(true);
    expect(out.goal_document_id).toBeTruthy();
    expect(out.goal_document).toBeTruthy();
    expect(validateGoalDocumentStructural(out.goal_document!).ok).toBe(true);
    expect(validateGoalContractStructural(out.contract).ok).toBe(true);

    const db = new StateDb(defaultStateDbPath(tmp));
    try {
      expect(db.listTables()).toContain("goal_documents");
      const doc = db.loadLatestGoalDocument(out.goal_document_id!);
      expect(doc?.validated).toBe(true);
      expect((doc?.payload as { kind?: string }).kind).toBe("GoalDocument");
      const contract = db.loadLatestGoalContract("gc-grill-04");
      expect(contract?.validated).toBe(true);
    } finally {
      db.close();
    }

    // Reject LLM boolean as proof on forged document
    const forged = {
      ...out.goal_document!,
      llm_says_ready: true,
      structural_checks: {
        ...out.goal_document!.structural_checks,
        llm_boolean_accepted_as_proof: true as unknown as false,
      },
    };
    const bad = validateGoalDocumentStructural(forged);
    expect(bad.ok).toBe(false);
    expect(bad.reasons.some((r) => r.includes("llm_boolean"))).toBe(true);
  });

  it("V0-CLI-03: auto-recognize initialized session on re-run", () => {
    const before = detectWorkspaceSession(tmp);
    expect(before.initialized).toBe(false);

    runIntentFlow({
      workspace: tmp,
      intent: "Adicionar endpoint mínimo",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-resume",
    });

    const db = new StateDb(defaultStateDbPath(tmp));
    try {
      const lease = db.acquireWorkspaceLease({
        workspace_id: tmp,
        holder_id: "cli-test",
        lease_ms: 60_000,
      });
      db.createMsoSession({
        workspace_id: tmp,
        fencing_token: lease.fencing_token,
        holder_id: "cli-test",
        goal_contract_id: "gc-resume",
        session_id: "mso-resume-1",
      });
    } finally {
      db.close();
    }

    const after = detectWorkspaceSession(tmp);
    expect(after.initialized).toBe(true);
    expect(after.state_db_exists).toBe(true);
    expect(after.contracts_count).toBeGreaterThanOrEqual(1);
    expect(after.latest_mso_session?.session_id).toBe("mso-resume-1");
    // V4.3 product copy: Session (EN token), not legacy "Sessão MSO".
    expect(after.message_pt).toMatch(
      /Session reconhecida|Workspace inicializado|Projeto inicializado/,
    );
  });

  it("V0-CLI-02: shell resume + keybinding hooks without raw mode", async () => {
    runIntentFlow({
      workspace: tmp,
      intent: "Ship logging middleware endpoint",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-shell",
    });

    const result = await runEvolveShell({
      workspace: tmp,
      inputLines: ["status", "sair"],
      disable_raw_mode: true,
      answers: ["ok", "ok", "ok", "ok"],
    });
    expect(result.resumed).toBe(true);
    expect(result.keybindings.raw_mode_active).toBe(false);
    expect(result.lines.some((l) => /MSO:|Meta:|EvolveLoop/.test(l))).toBe(true);
    expect(result.exit_code).toBe(0);

    let paused = false;
    const ctrl = attachKeybindings({ isTTY: false } as NodeJS.ReadStream, {
      onPause: () => {
        paused = true;
      },
      onInterrupt: () => undefined,
    });
    expect(ctrl.raw_mode_active).toBe(false);
    ctrl.emit("pause");
    expect(paused).toBe(true);
    ctrl.dispose();
  });

  it("V0-CLI-01: bin/evolve exists and --help exits 0", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const bin = path.join(repoRoot, "bin", "evolve");
    expect(existsSync(bin)).toBe(true);
    const help = spawnSync(bin, ["--help"], { encoding: "utf-8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/evolve/);
  });

  it("buildGoalDocument links contract id and marks llm proof false", () => {
    const scan = silentScan(tmp);
    const qs = buildGrillMeQuestions("teste", scan);
    const grill = buildGrillMeResultFromAnswers(
      "teste",
      scan,
      qs,
      resolveAnswers(qs, ["ok", "ok", "ok", "ok"]),
    );
    const validation = validateGrillMeResult(grill);
    const out = runIntentFlow({
      workspace: tmp,
      intent: "teste curto",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-doc-link",
      persist: false,
    });
    if (out.kind !== "goal_contract") throw new Error("expected contract");
    const doc = buildGoalDocument({
      contract: out.contract,
      scan,
      grill_validation: validation,
    });
    expect(doc.goal_contract_id).toBe("gc-doc-link");
    expect(doc.structural_checks.llm_boolean_accepted_as_proof).toBe(false);
  });
});
