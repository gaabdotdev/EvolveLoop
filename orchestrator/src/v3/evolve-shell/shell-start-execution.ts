/**
 * Post–Grill-Me kickoff: when a Goal Contract is MSO-confirmed, "continuar/ok"
 * must start authorized execution — not re-enter Grill-Me.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { selectV0AgentAdapter } from "../circuit/cursor-adapter.js";
import { defaultExecutionRunner } from "../execution-runner/index.js";
import type { MsoState } from "../mso/states.js";
import {
  applyHarnessConsentEnv,
  harnessConsentGranted,
  persistHarnessConsent,
} from "../security/harness-consent.js";
import { defaultStateDbPath, StateDb } from "../state-db/store.js";
import type { PersistedGoalContract } from "../state-db/types.js";

export function isProceedAfterConfirmIntent(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return /^(?:ok(?:ay)?|sim|yes|y|continuar|continue|começar|comecar|pode\s+continuar|ok,?\s*continue|vamos(?:\s+l[aá])?|start|go|executar|iniciar)(?:\s*[.!]*)?$/i.test(
    t,
  );
}

function latestConfirmedContract(db: StateDb): PersistedGoalContract | undefined {
  return db.listValidatedGoalContracts().find((c) => c.mso_confirmed);
}

function transitionChain(
  db: StateDb,
  sessionId: string,
  fencingToken: number,
  holderId: string,
  states: MsoState[],
  write: (line: string) => void,
): void {
  for (const to of states) {
    const s = db.transitionMso({
      session_id: sessionId,
      to,
      fencing_token: fencingToken,
      holder_id: holderId,
      reason: "shell_authorized_kickoff",
      event: "evolve_shell_continue",
    });
    write(`MSO → ${s.state}`);
  }
}

export interface ShellStartExecutionResult {
  started: boolean;
  message_pt: string;
  mso_state?: string;
  goal_contract_id?: string;
  adapter_status?: string;
}

/**
 * Start MSO + delegate the confirmed Goal Contract objective via the V0 adapter.
 */
export async function startAuthorizedExecution(opts: {
  workspace: string;
  write: (line: string) => void;
  /** Stop after DELEGATING without invoking the live adapter (unit tests). */
  dry_run?: boolean;
  /**
   * When consent is missing, ask the operator (interactive shell).
   * Return true to grant+persist; false to abort before spawn.
   */
  requestConsent?: () => Promise<boolean>;
}): Promise<ShellStartExecutionResult> {
  const workspace = resolve(opts.workspace);
  const write = opts.write;
  const db = new StateDb(defaultStateDbPath(workspace));
  const holder_id = `shell-${process.pid}`;

  try {
    const contract = latestConfirmedContract(db);
    if (!contract) {
      return {
        started: false,
        message_pt:
          "Nenhum Goal Contract com MSO confirmado. Envie uma intenção nova ou confirme o contrato primeiro.",
      };
    }

    const existing = db.getLatestMsoSessionForWorkspace(workspace);
    if (
      existing &&
      existing.state !== "INIT" &&
      existing.state !== "TRUE-FULL-PASS" &&
      existing.state !== "BLOCKED"
    ) {
      return {
        started: false,
        message_pt: `Já existe sessão MSO ativa (${existing.session_id} · ${existing.state}). Use 'status' ou aguarde.`,
        mso_state: existing.state,
        goal_contract_id: existing.goal_contract_id,
      };
    }

    write(`Iniciando execução autorizada para ${contract.goal_contract_id}…`);
    write(`Objetivo: ${contract.objective.slice(0, 160)}${contract.objective.length > 160 ? "…" : ""}`);

    const payload =
      contract.payload && typeof contract.payload === "object"
        ? (contract.payload as Record<string, unknown>)
        : {};
    const scope = Array.isArray(payload.scope) ? (payload.scope as string[]) : [];
    const constraints = Array.isArray(payload.constraints)
      ? (payload.constraints as string[])
      : [];
    const criteria = Array.isArray(payload.criteria)
      ? (payload.criteria as Array<{ id?: string; description?: string; mandatory?: boolean }>)
      : [];

    const lease = db.acquireWorkspaceLease({
      workspace_id: workspace,
      on_stale_cleared: (info) => write(info.message),
      holder_id,
      lease_ms: 30 * 60_000,
    });
    const work_id = `work-${randomUUID().slice(0, 8)}`;
    const task_id = `task-${randomUUID().slice(0, 8)}`;
    const session = db.createMsoSession({
      workspace_id: workspace,
      fencing_token: lease.fencing_token,
      holder_id,
      goal_contract_id: contract.goal_contract_id,
      work_id,
    });
    write(`MSO sessão ${session.session_id} criada (INIT).`);

    transitionChain(
      db,
      session.session_id,
      lease.fencing_token,
      holder_id,
      ["LOADING_GOALS", "ANALYZING", "DECOMPOSING", "DELEGATING"],
      write,
    );

    if (opts.dry_run) {
      write("dry_run: parando em DELEGATING (sem adapter live).");
      return {
        started: true,
        message_pt: "dry_run: MSO em DELEGATING — execução live não invocada.",
        mso_state: "DELEGATING",
        goal_contract_id: contract.goal_contract_id,
        adapter_status: "dry_run",
      };
    }

    if (!harnessConsentGranted()) {
      write(
        "Consentimento do harness em falta: o EvolveLoop não spawna cursor-agent sem autorização explícita.",
      );
      if (opts.requestConsent) {
        const ok = await opts.requestConsent();
        if (!ok) {
          db.transitionMso({
            session_id: session.session_id,
            to: "WAITING_AGENTS",
            fencing_token: lease.fencing_token,
            holder_id,
            reason: "consent_prompt_declined_pre",
          });
          db.transitionMso({
            session_id: session.session_id,
            to: "VALIDATING",
            fencing_token: lease.fencing_token,
            holder_id,
            reason: "consent_declined",
          });
          db.transitionMso({
            session_id: session.session_id,
            to: "BLOCKED",
            fencing_token: lease.fencing_token,
            holder_id,
            reason: "CONSENT_REQUIRED",
          });
          return {
            started: false,
            message_pt:
              "Execução cancelada — sem consentimento. Diga 'continuar' de novo e aceite, ou grave harness_consent: true em ~/.config/evolveloop/config.yaml",
            mso_state: "BLOCKED",
            goal_contract_id: contract.goal_contract_id,
          };
        }
        const saved = persistHarnessConsent(true);
        write(`Consentimento gravado em ${saved.path} (chmod 600).`);
      } else {
        db.transitionMso({
          session_id: session.session_id,
          to: "WAITING_AGENTS",
          fencing_token: lease.fencing_token,
          holder_id,
          reason: "consent_missing_noninteractive",
        });
        db.transitionMso({
          session_id: session.session_id,
          to: "VALIDATING",
          fencing_token: lease.fencing_token,
          holder_id,
          reason: "consent_missing",
        });
        db.transitionMso({
          session_id: session.session_id,
          to: "BLOCKED",
          fencing_token: lease.fencing_token,
          holder_id,
          reason: "CONSENT_REQUIRED",
        });
        return {
          started: false,
          message_pt:
            "CONSENT_REQUIRED: defina EVOLVELOOP_HARNESS_CONSENT=true ou harness_consent: true em ~/.config/evolveloop/config.yaml, depois diga 'continuar'.",
          mso_state: "BLOCKED",
          goal_contract_id: contract.goal_contract_id,
        };
      }
    } else {
      applyHarnessConsentEnv(true);
    }

    const runner = defaultExecutionRunner;
    const adapter = await selectV0AgentAdapter(runner);
    const health = await adapter.healthCheck();
    if (!health.ok) {
      db.transitionMso({
        session_id: session.session_id,
        to: "WAITING_AGENTS",
        fencing_token: lease.fencing_token,
        holder_id,
        reason: "adapter_health_fail_pre_wait",
      });
      db.transitionMso({
        session_id: session.session_id,
        to: "VALIDATING",
        fencing_token: lease.fencing_token,
        holder_id,
        reason: "adapter_unavailable",
      });
      db.transitionMso({
        session_id: session.session_id,
        to: "BLOCKED",
        fencing_token: lease.fencing_token,
        holder_id,
        reason: `adapter:${health.code}`,
      });
      return {
        started: false,
        message_pt: `Adapter indisponível (${health.code}): ${health.message}. MSO → BLOCKED.`,
        mso_state: "BLOCKED",
        goal_contract_id: contract.goal_contract_id,
        adapter_status: health.code,
      };
    }

    db.transitionMso({
      session_id: session.session_id,
      to: "WAITING_AGENTS",
      fencing_token: lease.fencing_token,
      holder_id,
      reason: "delegated_to_adapter",
    });
    write("MSO → WAITING_AGENTS (a delegar ao agente)…");

    const prompt = [
      `You are the EvolveLoop executor for an MSO-authorized Goal Contract.`,
      `goal_contract_id: ${contract.goal_contract_id}`,
      `work_id: ${work_id}`,
      `task_id: ${task_id}`,
      ``,
      `## Objective`,
      contract.objective,
      ``,
      `## Scope`,
      ...scope.map((s) => `- ${s}`),
      ``,
      `## Constraints`,
      ...constraints.map((c) => `- ${c}`),
      `- Stay inside this workspace only.`,
      `- Do NOT use rm -rf, git push --force, or git reset --hard.`,
      `- Do NOT push to remote.`,
      ``,
      `## Acceptance`,
      ...criteria.map(
        (c) =>
          `- [${c.id ?? "?"}] ${c.description ?? ""}${c.mandatory ? " (mandatory)" : ""}`,
      ),
      ``,
      `Implement the objective, run the project's verification (e.g. pytest/npm test), and stop when green.`,
    ].join("\n");
    const adapter_result = await adapter.invoke({
      work_id,
      task_id,
      prompt,
      workspace_path: workspace,
      timeout_ms: 600_000,
      force_tools: true,
    });

    db.recordTokenLedger({
      work_id,
      task_id,
      goal_contract_id: contract.goal_contract_id,
      subsystem: "shell.authorized_execution",
      adapter_id: adapter_result.adapter_id,
      tokens_in: adapter_result.tokens_in ?? null,
      tokens_out: adapter_result.tokens_out ?? null,
      latency_ms: adapter_result.duration_ms ?? null,
      cost_usd: adapter_result.cost_usd ?? null,
      cost_provenance: adapter_result.cost_provenance ?? "UNAVAILABLE",
      status: adapter_result.status,
      payload: {
        code: adapter_result.code,
        message: adapter_result.message,
        exit_code: adapter_result.exit_code,
      },
    });

    db.transitionMso({
      session_id: session.session_id,
      to: "VALIDATING",
      fencing_token: lease.fencing_token,
      holder_id,
      reason: "adapter_returned",
    });
    write(`MSO → VALIDATING (adapter status=${adapter_result.status})`);

    if (adapter_result.status === "ok") {
      // Shell kickoff does not claim TRUE-FULL-PASS without Evidence Validator.
      write(
        "Delegação concluída com status ok. TRUE-FULL-PASS exige Evidence Validator (não declarado só por prosa do agente).",
      );
      write(`Adapter: ${adapter_result.adapter_id} · ${adapter_result.message}`);
      return {
        started: true,
        message_pt: "Execução autorizada devolvida (VALIDATING). Revise o diff e rode testes se necessário.",
        mso_state: "VALIDATING",
        goal_contract_id: contract.goal_contract_id,
        adapter_status: adapter_result.status,
      };
    }

    db.transitionMso({
      session_id: session.session_id,
      to: "BLOCKED",
      fencing_token: lease.fencing_token,
      holder_id,
      reason: `adapter:${adapter_result.code}`,
    });
    write(`MSO → BLOCKED (${adapter_result.code}: ${adapter_result.message})`);
    const hint =
      adapter_result.code === "CONSENT_REQUIRED"
        ? " Autorize o harness (sim no prompt) ou config.yaml e diga 'continuar' de novo."
        : "";
    return {
      started: true,
      message_pt: `Execução bloqueada pelo adapter: ${adapter_result.code}.${hint}`,
      mso_state: "BLOCKED",
      goal_contract_id: contract.goal_contract_id,
      adapter_status: adapter_result.status,
    };
  } finally {
    db.close();
  }
}
