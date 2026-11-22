/**
 * V5-M02/M07/M10 — `evolve work list|show|attempts|status` product surface.
 * Legacy `evolve work init|status` with `--data-dir` remains in evolve.ts:
 * when `--data-dir` is set, `status` is NOT handled here (compat Gate I).
 * Status without --data-dir uses PersistentWorkRuntime (M07 summary).
 */

import { resolve } from "node:path";
import { PersistentWorkRuntime } from "../v3/work-runtime/index.js";
import { readSharedWorkState } from "../v3/experience/index.js";

const PRODUCT_CMDS = new Set(["list", "show", "attempts", "status", "help"]);

/**
 * Handle `evolve work list|show|attempts|status|help`.
 * Returns handled=false for legacy init / unknown cmds /
 * legacy `status` when `--data-dir` is present.
 */
export function handleWorkSurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; argv?: string[] },
): { handled: boolean; exitCode?: number } {
  if (args.group !== "work") return { handled: false };

  const argv = opts?.argv ?? process.argv;
  const idx = argv.findIndex((a) => a === "work");
  const positionals: string[] = [];
  if (idx >= 0) {
    for (let i = idx + 1; i < argv.length; i++) {
      const t = argv[i]!;
      if (t.startsWith("--")) {
        if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) i++;
        continue;
      }
      positionals.push(t);
    }
  }

  const cmd = (positionals[0] ?? args.command ?? "").toLowerCase();
  if (!PRODUCT_CMDS.has(cmd)) {
    return { handled: false };
  }

  // Gate I / V4 journey: `evolve work status --data-dir …` stays on coordinator
  // path in evolve.ts (agents_summary JSON). Do not intercept.
  if (cmd === "status" && (args["data-dir"] || args.dataDir)) {
    return { handled: false };
  }

  const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
  const print =
    opts?.printJson ??
    ((obj: unknown) => console.log(JSON.stringify(obj, null, 2)));

  if (cmd === "help") {
    console.log(
      [
        "evolve work — Persistent Work Runtime (V5-M01/M02/M07)",
        "",
        "  evolve work list",
        "      # list Works in workspace (coordinator-registered)",
        "  evolve work status [--work-id <id>]",
        "      # status summary (workspace or one Work)",
        "  evolve work show --work-id <id>",
        "      # aggregate Work (durável; dual-label Task UX)",
        "  evolve work attempts --work-id <id>",
        "      # list Attempts (ProcessSession / runner binding)",
        "  evolve work attempts --work-id <id> --attempt-id <id>",
        "      # get one Attempt",
        "",
        "Legacy (require --data-dir): evolve work init|status",
        "  (status with --data-dir defers to coordinator path in evolve.ts)",
        "Flags: --workspace <path>  --work-id <id>  --format json",
        "Nota: Attempt failed ≠ Work failed. CLI+TUI leem o mesmo work-runtime.",
        "ACP server = GAP (docs/v5/M02). Custom Workbench visual = LIMITATION M07.",
      ].join("\n"),
    );
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "list") {
    const snap = readSharedWorkState({ workspaceRoot: workspace });
    if (args.format === "json") {
      print({ workspace, works: snap.list, source: snap.source });
    } else if (snap.list.length === 0) {
      console.log("No works registered in this workspace.");
    } else {
      for (const w of snap.list) {
        console.log(
          `${w.work_id}  state=${w.work_state}  tasks=${w.task_count}  attempts=${w.attempt_count}  ${w.objective}`,
        );
      }
    }
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "status") {
    const workId =
      args["work-id"] ??
      args.work ??
      (positionals[1] && !positionals[1].startsWith("--")
        ? positionals[1]
        : undefined);
    try {
      const snap = readSharedWorkState({
        workspaceRoot: workspace,
        workId: workId?.trim() || undefined,
      });
      const s = snap.summary;
      if (args.format === "json") {
        print(s);
      } else {
        const stateParts = Object.entries(s.by_state)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        console.log(
          [
            `Work status${s.work_id ? ` (${s.work_id})` : " (workspace)"}`,
            `  works: ${s.total_works}  ${stateParts || "(none)"}`,
            `  attempts: ${s.total_attempts}`,
            `  live_sessions: ${s.works_with_live_session}`,
            `  source: PersistentWorkRuntime`,
            `  dual-label: Work/Task`,
          ].join("\n"),
        );
        for (const w of s.works) {
          console.log(
            `  - ${w.work_id}  ${w.work_state}  attempts=${w.attempt_count}`,
          );
        }
      }
      return { handled: true, exitCode: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg);
      return { handled: true, exitCode: 1 };
    }
  }

  const workId =
    args["work-id"] ??
    args.work ??
    (positionals[1] && !positionals[1].startsWith("--")
      ? positionals[1]
      : undefined);

  if (!workId?.trim()) {
    console.error("work-id required (evolve work show|attempts --work-id <id>)");
    return { handled: true, exitCode: 1 };
  }

  const rt = new PersistentWorkRuntime({ workspaceRoot: workspace });
  try {
    if (cmd === "show") {
      const work = rt.read(workId);
      if (args.format === "json") {
        print(work);
      } else {
        console.log(
          [
            `Work ${work.work_id}`,
            `  objective: ${work.objective}`,
            `  state: ${work.work_state}`,
            `  tasks: ${work.task_ids.join(", ") || "(none)"}`,
            `  attempts: ${work.attempt_ids.length}`,
            `  durable: ${work.liveness.durable}`,
            `  live_session: ${work.liveness.has_live_process_session}`,
            `  dual-label: ${work.ux_dual_label.infrastructure}/${work.ux_dual_label.product_v4}`,
          ].join("\n"),
        );
      }
      return { handled: true, exitCode: 0 };
    }

    const attemptId = args["attempt-id"] ?? args.attempt;
    if (attemptId) {
      const attempt = rt.getAttempt(attemptId);
      if (attempt.work_id !== workId) {
        console.error(
          `attempt '${attemptId}' belongs to work '${attempt.work_id}', not '${workId}'`,
        );
        return { handled: true, exitCode: 1 };
      }
      print(attempt);
      return { handled: true, exitCode: 0 };
    }

    const attempts = rt.listAttempts(workId);
    if (args.format === "json") {
      print({ work_id: workId, attempts });
    } else if (attempts.length === 0) {
      console.log(`No attempts for work ${workId}`);
    } else {
      for (const a of attempts) {
        console.log(
          [
            `${a.attempt_id}  task=${a.task_id}  status=${a.status}  mode=${a.execution_mode}`,
            `  executor=${a.executor_id ?? "-"}  adapter=${a.adapter_id ?? "-"}  session=${a.process_session_id ?? "-"}  run=${a.run_id ?? "-"}`,
          ].join("\n"),
        );
      }
    }
    return { handled: true, exitCode: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return { handled: true, exitCode: 1 };
  } finally {
    rt.close();
  }
}
