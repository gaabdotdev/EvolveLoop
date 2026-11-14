import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApprovalCreateInput, ApprovalRequest, ApprovalState } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class ApprovalStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.rootDir, `${id}.json`);
  }

  create(input: ApprovalCreateInput): ApprovalRequest {
    const ts = nowIso();
    const ttl = input.ttl_ms ?? 3_600_000;
    const approval_id = `apr-${randomUUID()}`;
    const maxUses = input.scope?.max_uses ?? 1;
    const rec: ApprovalRequest = {
      kind: "ApprovalRequest",
      approval_id,
      work_id: input.work_id,
      goal_id: input.goal_id,
      task_id: input.task_id,
      agent_id: input.agent_id,
      operation: input.operation,
      resource: input.resource,
      justification: input.justification,
      risk: input.risk ?? "medium",
      impact: input.impact ?? "",
      permissions_requested: input.permissions_requested ?? [String(input.operation)],
      scope: {
        workspace: input.scope?.workspace,
        path_prefix: input.scope?.path_prefix,
        hosts: input.scope?.hosts,
        max_uses: maxUses,
      },
      expires_at: new Date(Date.now() + ttl).toISOString(),
      state: "PENDING",
      uses_remaining: maxUses,
      history: [
        {
          at: ts,
          actor: "system",
          from_state: "PENDING",
          to_state: "PENDING",
          note: "created",
        },
      ],
      created_at: ts,
      updated_at: ts,
      test_provider: input.test_provider === true,
    };
    atomicWrite(this.pathFor(approval_id), JSON.stringify(rec, null, 2));
    return rec;
  }

  get(approvalId: string): ApprovalRequest | undefined {
    const path = this.pathFor(approvalId);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as ApprovalRequest;
  }

  list(filter?: { work_id?: string; state?: ApprovalState }): ApprovalRequest[] {
    const files = readdirSync(this.rootDir).filter((f) => f.endsWith(".json"));
    let items = files.map((f) => JSON.parse(readFileSync(join(this.rootDir, f), "utf-8")) as ApprovalRequest);
    if (filter?.work_id) items = items.filter((a) => a.work_id === filter.work_id);
    if (filter?.state) items = items.filter((a) => a.state === filter.state);
    return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  private transition(
    approvalId: string,
    to: ApprovalState,
    actor: string,
    note?: string,
  ): ApprovalRequest {
    const rec = this.get(approvalId);
    if (!rec) throw new Error(`APPROVAL_NOT_FOUND:${approvalId}`);
    this.expireIfNeeded(rec);
    const from = rec.state;
    if (to === "APPROVED" || to === "REJECTED") {
      if (rec.state !== "PENDING") throw new Error(`APPROVAL_NOT_PENDING:${rec.state}`);
    }
    if (to === "CANCELLED" && rec.state !== "PENDING") {
      throw new Error(`APPROVAL_NOT_PENDING:${rec.state}`);
    }
    rec.state = to;
    if (to === "APPROVED" || to === "REJECTED") rec.decided_by = actor;
    rec.updated_at = nowIso();
    rec.history.push({ at: rec.updated_at, actor, from_state: from, to_state: to, note });
    atomicWrite(this.pathFor(approvalId), JSON.stringify(rec, null, 2));
    return rec;
  }

  expireIfNeeded(rec: ApprovalRequest): ApprovalRequest {
    if (rec.state === "PENDING" && Date.parse(rec.expires_at) <= Date.now()) {
      rec.state = "EXPIRED";
      rec.updated_at = nowIso();
      rec.history.push({
        at: rec.updated_at,
        actor: "system",
        from_state: "PENDING",
        to_state: "EXPIRED",
        note: "ttl",
      });
      atomicWrite(this.pathFor(rec.approval_id), JSON.stringify(rec, null, 2));
    }
    return rec;
  }

  approve(approvalId: string, actor: string, note?: string): ApprovalRequest {
    return this.transition(approvalId, "APPROVED", actor, note);
  }

  reject(approvalId: string, actor: string, note?: string): ApprovalRequest {
    return this.transition(approvalId, "REJECTED", actor, note);
  }

  /**
   * Compare-and-swap decision for concurrent approve/reject races.
   * Reloads from disk under exclusive rename; only first writer wins.
   */
  decideOnce(
    approvalId: string,
    to: "APPROVED" | "REJECTED",
    actor: string,
    note?: string,
  ): { won: true; approval: ApprovalRequest } | { won: false; approval: ApprovalRequest; reason: string } {
    const path = this.pathFor(approvalId);
    const rec = this.get(approvalId);
    if (!rec) throw new Error(`APPROVAL_NOT_FOUND:${approvalId}`);
    this.expireIfNeeded(rec);
    const fresh = this.get(approvalId)!;
    if (fresh.state !== "PENDING") {
      return { won: false, approval: fresh, reason: `already_${fresh.state}` };
    }
    // Write to exclusive temp then rename — loser sees non-PENDING on reload.
    const stamp = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const claimPath = `${path}.claim.${stamp}`;
    try {
      writeFileSync(claimPath, "claim", { flag: "wx" });
    } catch {
      const again = this.get(approvalId)!;
      return { won: false, approval: again, reason: "lost_claim_race" };
    }
    try {
      const again = this.get(approvalId)!;
      this.expireIfNeeded(again);
      const latest = this.get(approvalId)!;
      if (latest.state !== "PENDING") {
        return { won: false, approval: latest, reason: `already_${latest.state}` };
      }
      const decided = this.transition(approvalId, to, actor, note);
      return { won: true, approval: decided };
    } finally {
      try {
        unlinkSync(claimPath);
      } catch {
        /* */
      }
    }
  }

  cancel(approvalId: string, actor: string, note?: string): ApprovalRequest {
    return this.transition(approvalId, "CANCELLED", actor, note);
  }

  /**
   * Consume one use of an approved grant. Validates operation/resource/scope.
   * Rejects replay after uses exhausted, wrong resource, or expired.
   */
  consume(
    approvalId: string,
    operation: string,
    resource: string,
  ): { ok: true; approval: ApprovalRequest } | { ok: false; reason: string } {
    const rec = this.get(approvalId);
    if (!rec) return { ok: false, reason: "not_found" };
    this.expireIfNeeded(rec);
    if (rec.state !== "APPROVED") return { ok: false, reason: `state_${rec.state}` };
    if (rec.operation !== operation) return { ok: false, reason: "operation_mismatch" };
    if (rec.resource !== resource) {
      // Allow prefix scope when path_prefix set.
      if (rec.scope.path_prefix) {
        const prefix = rec.scope.path_prefix;
        // Boundary-aware prefix (same class of bug as ISSUE-SEC-H03-PATH)
        const ok =
          resource === prefix ||
          resource.startsWith(prefix.endsWith(sep) ? prefix : prefix + sep);
        if (!ok) return { ok: false, reason: "resource_mismatch" };
      } else {
        return { ok: false, reason: "resource_mismatch" };
      }
    }
    if (rec.uses_remaining <= 0) return { ok: false, reason: "uses_exhausted" };
    rec.uses_remaining -= 1;
    rec.updated_at = nowIso();
    rec.history.push({
      at: rec.updated_at,
      actor: "system",
      from_state: "APPROVED",
      to_state: "APPROVED",
      note: `consumed uses_remaining=${rec.uses_remaining}`,
    });
    atomicWrite(this.pathFor(approvalId), JSON.stringify(rec, null, 2));
    return { ok: true, approval: rec };
  }
}
