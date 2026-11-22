/**
 * V4.3 P0-2 — `evolve delivery show|validate` product surface.
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
        "evolve delivery — Delivery a partir de evidências (V4.3)",
        "",
        "  evolve delivery show              # re-deriva de StateDb (sem inventar PASS)",
        "  evolve delivery validate          # corre verificação e anexa evidência",
        "  evolve delivery validate --command \"npm test\" --exit-code 0",
        "  evolve delivery validate --run \"npm test\"",
        "",
        "PASS só com verification exit 0 anexada. Adapter ok ≠ PASS.",
        "Flags: --workspace <path>  --work-id <id>  --format json",
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
          "Sem comando não anexa evidência (não inventar PASS).",
        ].join("\n"),
      );
      return { handled: true, exitCode: 1 };
    }
    const view = validateDelivery(workspace, {
      command: verifyCommand,
      run: args.run,
      exit_code: Number.isFinite(exit_code) ? exit_code : undefined,
      work_id: args["work-id"] ?? args.work_id,
      goal_contract_id: args["goal-contract-id"],
    });
    if (args.format === "json") print(view);
    else console.log(view.lines.join("\n"));
    const code =
      view.status === "PASS" ? 0 : view.status === "FAILED" ? 1 : 2;
    return { handled: true, exitCode: code };
  }

  // show (default)
  const view = deriveDeliveryFromWorkspace(workspace, {
    work_id: args["work-id"] ?? args.work_id,
  });
  if (args.format === "json") print(view);
  else console.log(view.lines.join("\n"));
  return { handled: true, exitCode: 0 };
}
