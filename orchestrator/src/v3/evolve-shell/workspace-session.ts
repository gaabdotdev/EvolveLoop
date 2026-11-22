/**
 * V0-CLI-03 — Auto-recognize initialized session/project in cwd/.evolveloop/
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defaultStateDbPath, StateDb } from "../state-db/store.js";
import type { MsoSession, PersistedGoalContract, PersistedGoalDocument } from "../state-db/types.js";

export interface WorkspaceSessionSnapshot {
  workspace: string;
  initialized: boolean;
  state_db_path: string;
  state_db_exists: boolean;
  journal_mode?: string;
  contracts_count: number;
  latest_contract?: PersistedGoalContract;
  latest_document?: PersistedGoalDocument;
  latest_mso_session?: MsoSession;
  message_pt: string;
}

export function detectWorkspaceSession(workspaceRoot: string): WorkspaceSessionSnapshot {
  const workspace = resolve(workspaceRoot);
  const state_db_path = defaultStateDbPath(workspace);
  const state_db_exists = existsSync(state_db_path);

  if (!state_db_exists) {
    return {
      workspace,
      initialized: false,
      state_db_path,
      state_db_exists: false,
      contracts_count: 0,
      message_pt: `Workspace novo: estado será criado em ${state_db_path}`,
    };
  }

  const db = new StateDb(state_db_path);
  try {
    const contracts = db.listValidatedGoalContracts();
    const latest_contract = contracts[0];
    const latest_document = latest_contract
      ? db.loadLatestGoalDocumentForContract(latest_contract.goal_contract_id)
      : undefined;
    const latest_mso_session = db.getLatestMsoSessionForWorkspace(workspace);
    const journal_mode = db.journalMode();
    const initialized = contracts.length > 0 || Boolean(latest_mso_session);

    let message_pt: string;
    if (latest_mso_session) {
      const sessionUi =
        latest_mso_session.state === "TRUE-FULL-PASS"
          ? "concluída (verificada)"
          : latest_mso_session.state;
      message_pt = `Session reconhecida: ${latest_mso_session.session_id} (${sessionUi}); ${contracts.length} Plan(s).`;
    } else if (latest_contract) {
      message_pt = `Workspace inicializado: ${contracts.length} Plan(s); último=${latest_contract.goal_contract_id} v${latest_contract.version}.`;
    } else {
      message_pt = `Estado SQLite presente (${journal_mode}) mas sem Plan/Session ainda.`;
    }

    return {
      workspace,
      initialized,
      state_db_path,
      state_db_exists: true,
      journal_mode,
      contracts_count: contracts.length,
      latest_contract,
      latest_document,
      latest_mso_session,
      message_pt,
    };
  } finally {
    db.close();
  }
}
