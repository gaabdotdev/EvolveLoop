/**
 * M05 Time Travel, Replay & Fork — public engine.
 *
 * Composes Wave 2 ports/APIs (ledger, checkpoint, artifacts, effects, work,
 * goal). Does not own those aggregates.
 */

import { isValidId } from "../contracts/index.js";
import { TIMETRAVEL_ERROR, TimeTravelError } from "./errors.js";
import { forkWork } from "./fork.js";
import { inspectWork } from "./inspect.js";
import { replayStep } from "./replay.js";
import type {
  ForkCompare,
  ForkRequest,
  ForkResult,
  InspectQuery,
  InspectionView,
  ReplayRequest,
  ReplayResult,
  TimeTravelDeps,
} from "./types.js";

const DEFAULT_ACTOR = { kind: "PLATFORM" as const, id: "v4-m05-timetravel" };

export class TimeTravelService {
  private readonly deps: TimeTravelDeps;

  constructor(deps: TimeTravelDeps) {
    this.deps = {
      ...deps,
      actor: deps.actor ?? DEFAULT_ACTOR,
      clock: deps.clock ?? (() => new Date().toISOString()),
    };
  }

  /** Read-only view of a work's log / checkpoint. Does not append. */
  async inspect(query: InspectQuery): Promise<InspectionView> {
    return inspectWork(this.deps, query);
  }

  /**
   * New work that references base history/artifacts. Does not mutate the
   * base log. Does not copy grants, credentials or leases (D08).
   */
  async fork(request: ForkRequest): Promise<ForkResult> {
    return forkWork(this.deps, request);
  }

  /**
   * Replay a recorded step. RECORDED reuses captured I/O. REEXECUTE may
   * call an INTERNAL executor or create a new EXTERNAL EffectRecord.
   * Never auto-reapplies external side effects. Does not claim model
   * determinism (constitution §14).
   */
  async replay(request: ReplayRequest): Promise<ReplayResult> {
    return replayStep(this.deps, request);
  }

  /** Comparison of two work ids (ADR-V4-0007 consequences). */
  async compare(base_work_id: string, fork_work_id: string): Promise<ForkCompare> {
    if (!isValidId("work", base_work_id) || !isValidId("work", fork_work_id)) {
      throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "compare requires valid work ids", {
        base_work_id,
        fork_work_id,
      });
    }
    const [base, fork] = await Promise.all([
      this.inspect({ work_id: base_work_id }),
      this.inspect({ work_id: fork_work_id }),
    ]);
    return {
      base_work_id,
      fork_work_id,
      identity_distinct: base_work_id !== fork_work_id,
      base_head_seq: base.head_seq,
      fork_head_seq: fork.head_seq,
      base_state: base.work?.state,
      fork_state: fork.work?.state,
    };
  }
}
