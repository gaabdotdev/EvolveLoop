/**
 * V5-M05 — Bridge ApprovalStore / ApprovalFacade ↔ Work / Attempt ids.
 * Persistence remains ApprovalStore; this only binds domain ids honestly.
 */

import { ApprovalFacade, toApprovalCardView } from "../approvals/facade.js";
import { ApprovalStore } from "../approvals/store.js";
import type {
  ApprovalCreateInput,
  ApprovalRequest,
  ApprovalState,
} from "../approvals/types.js";
import type { ApprovalCardView } from "../approvals/facade.js";

export interface ApprovalBridgeCreateInput extends ApprovalCreateInput {
  work_id: string;
  /** Prefer binding Attempt when available (M01/M02). */
  attempt_id?: string;
}

export class ApprovalWorkAttemptBridge {
  constructor(private readonly store: ApprovalStore) {}

  create(input: ApprovalBridgeCreateInput): ApprovalRequest {
    if (!input.work_id.trim()) {
      throw new Error("APPROVAL_BRIDGE:work_id_required");
    }
    return this.store.create({
      ...input,
      work_id: input.work_id.trim(),
      attempt_id: input.attempt_id?.trim() || undefined,
    });
  }

  listForWork(
    workId: string,
    opts?: { attempt_id?: string; state?: ApprovalState },
  ): ApprovalRequest[] {
    return this.store.list({
      work_id: workId.trim(),
      attempt_id: opts?.attempt_id?.trim(),
      state: opts?.state,
    });
  }

  listForAttempt(attemptId: string, state?: ApprovalState): ApprovalRequest[] {
    return this.store.list({
      attempt_id: attemptId.trim(),
      state,
    });
  }
}

/**
 * Facade-facing bridge: create approval cards with work_id + attempt_id.
 */
export class ApprovalGovernanceFacade {
  private readonly facade: ApprovalFacade;
  private readonly bridge: ApprovalWorkAttemptBridge;

  constructor(store: ApprovalStore) {
    this.facade = new ApprovalFacade(store);
    this.bridge = new ApprovalWorkAttemptBridge(store);
  }

  create(input: ApprovalBridgeCreateInput): ApprovalCardView {
    const req = this.bridge.create(input);
    return toApprovalCardView(req);
  }

  listPending(workId?: string, attemptId?: string): ApprovalCardView[] {
    if (attemptId?.trim()) {
      return this.bridge
        .listForAttempt(attemptId, "PENDING")
        .filter((a) => !workId || a.work_id === workId)
        .map(toApprovalCardView);
    }
    return this.facade.listPending(workId);
  }

  inspect(approvalId: string): ApprovalCardView | undefined {
    return this.facade.inspect(approvalId);
  }

  approve(approvalId: string, actor = "tui", note?: string): ApprovalCardView {
    return this.facade.approve(approvalId, actor, note);
  }

  reject(approvalId: string, actor = "tui", note?: string): ApprovalCardView {
    return this.facade.reject(approvalId, actor, note);
  }
}
