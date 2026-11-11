import type { AdapterId } from "../types.js";
import type { V3DataPaths } from "../../paths.js";
import type {
  AdapterInvokeRequest,
  AdapterInvokeResult,
  AgentAdapterDriver,
} from "./types.js";

/**
 * Fail-closed driver for harnesses without a verified Core bridge.
 * Never returns success; never invents mock harness execution.
 */
export class BlockedAdapterDriver implements AgentAdapterDriver {
  readonly can_invoke = false;

  constructor(
    readonly adapter_id: AdapterId,
    private readonly reason: string,
  ) {}

  describe() {
    return {
      adapter_id: this.adapter_id,
      can_invoke: false,
      notes: [
        this.reason,
        "invoke() always returns blocked — fail-closed",
        "operator may export Handoff Package for manual resume outside Core",
      ],
    };
  }

  async invoke(_paths: V3DataPaths, request: AdapterInvokeRequest): Promise<AdapterInvokeResult> {
    return {
      kind: "AdapterInvokeResult",
      adapter_id: this.adapter_id,
      status: "blocked",
      code: "ADAPTER_DRIVER_BLOCKED",
      message: `${this.adapter_id}: ${this.reason} (work=${request.work_id} task=${request.task_id})`,
      limitations: [
        "no native harness process control in Core",
        "do not interpret blocked as task TRUE_PASS or FAIL",
        "use continuity handoff + operator apply until a verified driver exists",
      ],
    };
  }
}
