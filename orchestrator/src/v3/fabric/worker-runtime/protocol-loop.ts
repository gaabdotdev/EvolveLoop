/**
 * Shared Worker protocol loop: task.offer execution + task.cancel → WorkerRuntime.cancel.
 * Used by CLI `fabric worker-serve` and protocol E2E tests (AUD-V37B-05).
 */

import type { ProtocolEnvelope } from "../protocol/messages.js";
import { envelope } from "../protocol/messages.js";
import type { FabricProtocolClient } from "../protocol/client.js";
import type { WorkerRuntime } from "./runtime.js";
import type { ExecutionContract } from "../types.js";

export type CommandResolver = (
  contract: ExecutionContract,
) => string[] | undefined;

export interface WorkerProtocolLoopOptions {
  worker_node_id: string;
  client: FabricProtocolClient;
  runtime: WorkerRuntime;
  /** Optional lab/test command override (never used to elevate authority). */
  resolveCommand?: CommandResolver;
  cancel_grace_ms?: number;
  onEvent?: (event: {
    kind: "offer" | "cancel" | "result" | "reject";
    task_id?: string;
    detail?: unknown;
  }) => void;
}

export function attachWorkerProtocolLoop(opts: WorkerProtocolLoopOptions): {
  detach: () => void;
  activeTaskIds: () => string[];
} {
  const active = new Set<string>();
  const handler = (msg: ProtocolEnvelope) => {
    void handleMessage(msg);
  };
  opts.client.onMessage(handler);

  function safeSend(msg: ProtocolEnvelope): boolean {
    try {
      opts.client.send(msg);
      return true;
    } catch {
      return false;
    }
  }

  async function handleMessage(msg: ProtocolEnvelope): Promise<void> {
    if (msg.type === "task.cancel") {
      const payload = msg.payload as { task_id?: string; lease_id?: string; reason?: string };
      const taskId = String(payload.task_id ?? "");
      opts.onEvent?.({ kind: "cancel", task_id: taskId, detail: payload });
      const cancelled = taskId ? opts.runtime.cancel(taskId, false) : false;
      safeSend(
        envelope(
          "task",
          "task.cancel_ack",
          {
            task_id: taskId,
            lease_id: payload.lease_id,
            cancelled,
            reason: payload.reason ?? "operator_cancel",
          },
          { worker_node_id: opts.worker_node_id, ack_of: msg.request_id },
        ),
      );
      return;
    }

    if (msg.type !== "task.offer") return;
    const payload = msg.payload as { contract: ExecutionContract; lease_id: string };
    const contract = payload.contract;
    const taskId = contract.task_id;
    opts.onEvent?.({ kind: "offer", task_id: taskId });
    active.add(taskId);
    try {
      safeSend(
        envelope(
          "task",
          "task.ack",
          { lease_id: payload.lease_id, task_id: taskId },
          { ack_of: msg.request_id, worker_node_id: opts.worker_node_id },
        ),
      );
      safeSend(
        envelope(
          "task",
          "task.progress",
          { task_id: taskId, phase: "executing" },
          { worker_node_id: opts.worker_node_id },
        ),
      );

      const command = opts.resolveCommand?.(contract);
      const result = await opts.runtime.execute(contract, {
        command,
        cancel_grace_ms: opts.cancel_grace_ms,
      });
      opts.onEvent?.({ kind: "result", task_id: taskId, detail: result });
      await publishResult(contract, result.status, result);
    } catch (err) {
      opts.onEvent?.({ kind: "reject", task_id: taskId, detail: err });
      safeSend(
        envelope(
          "task",
          "task.reject",
          { reason: err instanceof Error ? err.message : String(err) },
          { ack_of: msg.request_id, worker_node_id: opts.worker_node_id },
        ),
      );
    } finally {
      active.delete(taskId);
    }
  }

  async function publishResult(
    contract: ExecutionContract,
    status: string,
    result: { stdout?: string; supervision?: unknown },
  ): Promise<void> {
    try {
      await opts.client.request(
        envelope(
          "task",
          "task.result",
          {
            task_id: contract.task_id,
            lease_id: contract.lease_id,
            fencing_epoch: contract.fencing_epoch,
            status,
            stdout: result.stdout,
            supervision: result.supervision,
          },
          { worker_node_id: opts.worker_node_id },
        ),
        undefined,
        30_000,
      );
    } catch {
      /* connection closed / fencing reject already applied at CP */
    }
  }

  return {
    detach: () => {
      /* FabricProtocolClient has no offMessage; closing client ends the loop. */
    },
    activeTaskIds: () => [...active],
  };
}
