import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isProceedAfterConfirmIntent,
  startAuthorizedExecution,
} from "../../src/v3/evolve-shell/shell-start-execution.js";
import { runIntentFlow } from "../../src/v3/intake/intent-flow.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/index.js";

describe("shell post-grill kickoff", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-shell-kick-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "kick-fixture", version: "0.0.1" }),
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("isProceedAfterConfirmIntent matches ok/continuar variants", () => {
    expect(isProceedAfterConfirmIntent("Ok, continue")).toBe(true);
    expect(isProceedAfterConfirmIntent("continuar")).toBe(true);
    expect(isProceedAfterConfirmIntent("ok")).toBe(true);
    expect(isProceedAfterConfirmIntent("começar")).toBe(true);
    expect(isProceedAfterConfirmIntent("Adicionar endpoint de auth")).toBe(false);
  });

  it("without confirmed contract, kickoff refuses honestly", async () => {
    const lines: string[] = [];
    const r = await startAuthorizedExecution({
      workspace: tmp,
      write: (l) => lines.push(l),
    });
    expect(r.started).toBe(false);
    expect(r.message_pt).toMatch(/Nenhum Goal Contract/i);
  });

  it("with confirmed contract, kickoff advances MSO without re-grilling", async () => {
    const intent =
      "Adicionar um endpoint de autenticação na API com persistência SQLite e testes";
    const out = runIntentFlow({
      workspace: tmp,
      intent,
      answers: ["ok", "ok", "ok", "ok", "ok"],
      confirm_mso: true,
      persist: true,
    });
    expect(out.kind).toBe("goal_contract");
    if (out.kind !== "goal_contract") return;
    expect(out.persisted.mso_confirmed).toBe(true);

    const lines: string[] = [];
    const kick = await startAuthorizedExecution({
      workspace: tmp,
      write: (l) => lines.push(l),
      dry_run: true,
    });
    expect(kick.started).toBe(true);
    expect(kick.mso_state).toBe("DELEGATING");
    expect(lines.join("\n")).toMatch(/LOADING_GOALS/);
    expect(lines.join("\n")).not.toMatch(/Entrevista Grill-Me/);

    const db = new StateDb(defaultStateDbPath(tmp));
    try {
      const mso = db.getLatestMsoSessionForWorkspace(tmp);
      expect(mso?.state).toBe("DELEGATING");
      expect(mso?.goal_contract_id).toBe(out.contract.goal_contract_id);
    } finally {
      db.close();
    }
  });
});
