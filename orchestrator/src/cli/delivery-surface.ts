/**
 * V4.3 P0-2 — `evolve delivery show|validate` product surface.
 * REMED-M5: provenance explícita; PASS só com local_execution.
 */

import { resolve } from "node:path";
import {
  deriveDeliveryFromWorkspace,
  validateDelivery,
} from "./tui/delivery-verify.js";

/**
 * Handle `evolve delivery …`.
 */
export function handleDeliverySurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; argv?: string[] },
): { handled: boolean; exitCode?: number } {
  if (args.group !== "delivery") return { handled: false };

  const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
  const print =
    opts?.printJson ??
    ((obj: unknown) => console.log(JSON.stringify(obj, null, 2)));
  const argv = opts?.argv ?? process.argv;
  const idx = argv.findIndex((a) => a === "delivery");
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
  const cmd = (positionals[0] ?? args.command ?? "show").toLowerCase();

  if (cmd === "help") {
    console.log(
      [
        "evolve delivery — Delivery a partir de evidências (V4.3 / M5 provenance)",
        "",
        "  evolve delivery show",
        "      # re-deriva de StateDb (sem inventar PASS; absent → UNVERIFIED)",
        "  evolve delivery validate --run \"npm test\"",
        "      # EvolveLoop EXECUTA o comando → PASS só com exit 0 local_execution",
        "  evolve delivery validate --command \"npm test\" --exit-code 0",
        "      # atestado externo → ATTESTED (nunca PASS; exit 0 isolado ≠ PASS)",
        "",
        "Provenance: local_execution | external_attestation | absent | invalid | stale",
        "Associação: work/task/goal version/workspace — stale/incompatível ignorados.",
        "Flags: --workspace <path>  --work-id <id>  --goal-contract-id <id>  --format json",
      ].join("\n"),
    );
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "validate") {
    const exitRaw = args["exit-code"] ?? args.exit_code;
    const exit_code =
      exitRaw !== undefined && exitRaw !== ""
        ? Number(exitRaw)
        : undefined;
    // parseArgs may overwrite args.command with --command value; ignore subcommand names.
    const rawCmd = args.command_text ?? args.command_str ?? args.command;
    const verifyCommand =
      rawCmd &&
      !["validate", "show", "help", "delivery"].includes(rawCmd.toLowerCase())
        ? rawCmd
        : undefined;
    if (!verifyCommand && !args.run) {
      console.error(
        [
          "Uso: evolve delivery validate --command \"npm test\" --exit-code 0",
          "  ou: evolve delivery validate --run \"npm test\"",
          "Sem comando → provenance=absent (não inventar PASS).",
        ].join("\n"),
      );
      return { handled: true, exitCode: 1 };
    }
    const goalVerRaw = args["goal-contract-version"] ?? args.goal_contract_version;
    const goal_contract_version =
      goalVerRaw !== undefined && goalVerRaw !== ""
        ? Number(goalVerRaw)
        : undefined;
    const view = validateDelivery(workspace, {
      command: verifyCommand,
      run: args.run,
      exit_code: Number.isFinite(exit_code) ? exit_code : undefined,
      work_id: args["work-id"] ?? args.work_id,
      goal_contract_id: args["goal-contract-id"],
      goal_contract_version: Number.isFinite(goal_contract_version)
        ? goal_contract_version
        : undefined,
      task_id: args["task-id"] ?? args.task_id,
    });
    if (args.format === "json") print(view);
    else console.log(view.lines.join("\n"));
    const code =
      view.status === "PASS"
        ? 0
        : view.status === "ATTESTED"
          ? 3
          : view.status === "FAILED"
            ? 1
            : 2;
    return { handled: true, exitCode: code };
  }

  // show (default)
  const view = deriveDeliveryFromWorkspace(workspace, {
    work_id: args["work-id"] ?? args.work_id,
    goal_contract_id: args["goal-contract-id"],
    task_id: args["task-id"] ?? args.task_id,
  });
  if (args.format === "json") print(view);
  else console.log(view.lines.join("\n"));
  return { handled: true, exitCode: 0 };
}
