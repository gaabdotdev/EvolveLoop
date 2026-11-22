/**
 * Operations Center TUI — reads durable Global Ops state (not a parallel SSOT).
 */

import * as readline from "node:readline";
import type { GlobalOpsService } from "./global-ops-service.js";

export interface OpsTuiOptions {
  ops: GlobalOpsService;
  inputLines?: string[];
  output?: (line: string) => void;
}

function helpText(): string {
  return [
    "EvolveLoop V3.6 Operations Center",
    "commands:",
    "  help                 this help",
    "  overview             global overview",
    "  projects             list projects",
    "  queue                scheduler queue",
    "  workflows            list workflows",
    "  workflow <id>        workflow detail/timeline",
    "  deps <id>            dependencies for workflow",
    "  resources            resource utilization",
    "  reservations         held reservations",
    "  blockers             blocked/failed workflows",
    "  tick [n]             admission tick",
    "  pause <id>           pause workflow",
    "  resume <id>          resume workflow",
    "  cancel <id>          cancel workflow (destructive)",
    "  recover              reconcile after restart",
    "  health               runtime health snapshot",
    "  quit | exit          leave TUI (ops state persists)",
  ].join("\n");
}

export async function runOpsTui(opts: OpsTuiOptions): Promise<{ lines: string[] }> {
  const outLines: string[] = [];
  const write = (line: string) => {
    outLines.push(line);
    (opts.output ?? console.log)(line);
  };
  const writeJson = (obj: unknown) => write(JSON.stringify(obj, null, 2));
  const ops = opts.ops;

  const handle = async (line: string): Promise<boolean> => {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    const cmd = parts[0]?.toLowerCase();
    if (!cmd) return true;
    if (cmd === "quit" || cmd === "exit") return false;
    if (cmd === "help") {
      write(helpText());
      return true;
    }
    if (cmd === "overview") {
      writeJson(ops.overview());
      return true;
    }
    if (cmd === "projects") {
      writeJson(ops.projects.list());
      return true;
    }
    if (cmd === "queue") {
      writeJson(ops.rebuildQueue());
      return true;
    }
    if (cmd === "workflows") {
      writeJson(ops.workflows.list());
      return true;
    }
    if (cmd === "workflow") {
      const id = parts[1];
      if (!id) {
        write("usage: workflow <id>");
        return true;
      }
      const wf = ops.workflows.get(id);
      writeJson({
        workflow: wf,
        team: wf?.team_plan_id ? ops.teams.get(wf.team_plan_id) : null,
        history: wf?.history ?? [],
      });
      return true;
    }
    if (cmd === "deps") {
      writeJson(ops.dependencies.forWorkflow(parts[1] ?? ""));
      return true;
    }
    if (cmd === "resources") {
      writeJson(ops.resources.status());
      return true;
    }
    if (cmd === "reservations") {
      writeJson(ops.resources.list({ state: "HELD" }));
      return true;
    }
    if (cmd === "blockers") {
      writeJson(
        ops.workflows.list().filter((w) => w.state === "BLOCKED" || w.state === "FAILED"),
      );
      return true;
    }
    if (cmd === "tick") {
      writeJson(ops.tick(parts[1] ? Number(parts[1]) : 1));
      return true;
    }
    if (cmd === "pause") {
      writeJson(ops.pause(parts[1]));
      return true;
    }
    if (cmd === "resume") {
      writeJson(ops.resume(parts[1]));
      return true;
    }
    if (cmd === "cancel") {
      write("confirm cancel? re-run: cancel! <id>");
      return true;
    }
    if (cmd === "cancel!") {
      writeJson(ops.cancel(parts[1]));
      return true;
    }
    if (cmd === "recover") {
      writeJson(ops.recover());
      return true;
    }
    if (cmd === "health") {
      writeJson({
        status: ops.status(),
        note: "Closing this TUI does not stop CoordinatorDaemon or release leases",
      });
      return true;
    }
    write(`unknown command: ${cmd} (help)`);
    return true;
  };

  if (opts.inputLines) {
    write(helpText());
    for (const line of opts.inputLines) {
      write(`> ${line}`);
      const cont = await handle(line);
      if (!cont) break;
    }
    return { lines: outLines };
  }

  write(helpText());
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  for await (const line of rl) {
    const cont = await handle(String(line));
    if (!cont) break;
  }
  rl.close();
  return { lines: outLines };
}
