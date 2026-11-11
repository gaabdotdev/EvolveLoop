/**
 * Cursor adapter driver — routes through existing ExecutionBridge / CursorSkill jobs path.
 * Does not claim full Cursor Agent SDK control or IDE session injection.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { V3DataPaths } from "../../paths.js";
import { dispatchImplementTask } from "../../execution/bridge.js";
import type {
  AdapterInvokeRequest,
  AdapterInvokeResult,
  AgentAdapterDriver,
} from "./types.js";

export class CursorJobsAdapterDriver implements AgentAdapterDriver {
  readonly adapter_id = "cursor" as const;
  readonly can_invoke = true;

  describe() {
    return {
      adapter_id: this.adapter_id,
      can_invoke: true,
      notes: [
        "invokes ExecutionBridge (PLAN_APPROVED gated)",
        "cursor-skill providers use JobStore pickup — not a live IDE agent API",
        "host-internal tools remain incompletely mediated",
      ],
    };
  }

  async invoke(paths: V3DataPaths, request: AdapterInvokeRequest): Promise<AdapterInvokeResult> {
    if (!request.ir_path) {
      return {
        kind: "AdapterInvokeResult",
        adapter_id: "cursor",
        status: "failed",
        code: "IR_PATH_REQUIRED",
        message: "cursor driver requires ir_path to dispatch via ExecutionBridge",
        limitations: this.describe().notes,
      };
    }
    const ir = resolve(request.ir_path);
    if (!existsSync(ir)) {
      return {
        kind: "AdapterInvokeResult",
        adapter_id: "cursor",
        status: "failed",
        code: "IR_NOT_FOUND",
        message: ir,
        limitations: this.describe().notes,
      };
    }

    const mode = request.provider_mode ?? "mock";
    try {
      const result = await dispatchImplementTask(paths, {
        work_id: request.work_id,
        task_id: request.task_id,
        ir_path: ir,
        provider_mode: mode,
      });
      return {
        kind: "AdapterInvokeResult",
        adapter_id: "cursor",
        status: result.success && result.finished ? "accepted" : "failed",
        code: result.success && result.finished ? "DISPATCH_OK" : "DISPATCH_INCOMPLETE",
        message: `feature=${result.feature_id} state=${result.state} mode=${mode}`,
        bridge_ref: result.feature_id,
        limitations: this.describe().notes,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "AdapterInvokeResult",
        adapter_id: "cursor",
        status: "failed",
        code: "DISPATCH_ERROR",
        message: msg,
        limitations: this.describe().notes,
      };
    }
  }
}
