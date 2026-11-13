/**
 * V3.6 Operations Center CLI — project/workflow/scheduler/resources/operations.
 */

import { resolve } from "node:path";
import {
  GlobalOpsService,
  defaultOpsDir,
  serviceClassOf,
} from "../v3/ops/index.js";
import { runOpsTui } from "../v3/ops/ops-tui.js";

function print(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

function requireOps(args: Record<string, string>): GlobalOpsService {
  const opsDir = resolve(args["ops-dir"] ?? defaultOpsDir());
  return new GlobalOpsService({
    opsDir,
    bindExecutionPlane: args["bind-execution"] !== "false",
  });
}

export const V36_USAGE_GROUPS = {
  project: ["add", "list", "inspect", "doctor", "update", "pause-admission", "archive"],
  workflow: [
    "submit",
    "list",
    "inspect",
    "pause",
    "resume",
    "cancel",
    "dependencies",
    "complete",
    "tick-admit",
  ],
  scheduler: ["status", "queue", "policy", "tick", "recover"],
  resources: ["status", "reservations"],
  operations: ["tui", "overview", "gates-discover"],
};

export async function handleV36Command(args: Record<string, string>): Promise<boolean> {
  const group = args.group;
  if (!Object.keys(V36_USAGE_GROUPS).includes(group)) return false;

  const ops = requireOps(args);

  if (group === "project") {
    if (args.command === "add") {
      if (!args.path) {
        console.error("Required: --path <dir>");
        process.exit(2);
      }
      print(
        ops.projects.add({
          path: args.path,
          name: args.name,
          description: args.description,
          data_dir: args["data-dir"],
        }),
      );
      return true;
    }
    if (args.command === "list") {
      print({ projects: ops.projects.list() });
      return true;
    }
    if (args.command === "inspect") {
      const id = args["project-id"] ?? args.id;
      if (!id) {
        console.error("Required: --project-id");
        process.exit(2);
      }
      const p = ops.projects.get(id);
      if (!p) {
        console.error(`PROJECT_NOT_FOUND:${id}`);
        process.exit(3);
      }
      print(p);
      return true;
    }
    if (args.command === "doctor") {
      const id = args["project-id"] ?? args.id;
      if (!id) {
        console.error("Required: --project-id");
        process.exit(2);
      }
      print(ops.projects.doctor(id));
      return true;
    }
    if (args.command === "pause-admission") {
      const id = args["project-id"] ?? args.id;
      if (!id) {
        console.error("Required: --project-id");
        process.exit(2);
      }
      print(ops.projects.setAvailability(id, "PAUSED_ADMISSION"));
      return true;
    }
    if (args.command === "archive") {
      const id = args["project-id"] ?? args.id;
      if (!id) {
        console.error("Required: --project-id");
        process.exit(2);
      }
      print(ops.projects.archive(id));
      return true;
    }
    if (args.command === "update") {
      const id = args["project-id"] ?? args.id;
      if (!id) {
        console.error("Required: --project-id");
        process.exit(2);
      }
      print(
        ops.projects.update(id, {
          name: args.name,
          description: args.description,
        }),
      );
      return true;
    }
    console.error(`Unknown project command: ${args.command}`);
    process.exit(2);
  }

  if (group === "workflow") {
    if (args.command === "submit") {
      const projectId = args["project-id"];
      const goal = args.goal ?? args.objective;
      if (!projectId || !goal) {
        console.error("Required: --project-id --goal <text>");
        process.exit(2);
      }
      print(
        ops.submitWorkflow({
          project_id: projectId,
          objective: goal,
          priority: args.priority ? Number(args.priority) : undefined,
          service_class: args["service-class"]
            ? serviceClassOf(args["service-class"])
            : undefined,
          max_agents: args["max-agents"] ? Number(args["max-agents"]) : undefined,
        }),
      );
      return true;
    }
    if (args.command === "list") {
      print({
        workflows: ops.workflows.list({
          project_id: args["project-id"],
          state: args.state as never,
        }),
      });
      return true;
    }
    if (args.command === "inspect") {
      const id = args["workflow-id"] ?? args.id;
      if (!id) {
        console.error("Required: --workflow-id");
        process.exit(2);
      }
      const wf = ops.workflows.get(id);
      if (!wf) {
        console.error(`WORKFLOW_NOT_FOUND:${id}`);
        process.exit(3);
      }
      print({
        workflow: wf,
        team_plan: wf.team_plan_id ? ops.teams.get(wf.team_plan_id) : null,
        dependencies: ops.dependencies.forWorkflow(id),
      });
      return true;
    }
    if (args.command === "pause") {
      print(ops.pause(args["workflow-id"] ?? args.id));
      return true;
    }
    if (args.command === "resume") {
      print(ops.resume(args["workflow-id"] ?? args.id));
      return true;
    }
    if (args.command === "cancel") {
      print(ops.cancel(args["workflow-id"] ?? args.id));
      return true;
    }
    if (args.command === "complete") {
      const id = args["workflow-id"] ?? args.id;
      const ok = args.ok !== "false";
      print(ops.complete(id, ok));
      return true;
    }
    if (args.command === "dependencies") {
      const id = args["workflow-id"] ?? args.id;
      if (!id) {
        console.error("Required: --workflow-id");
        process.exit(2);
      }
      if (args.add === "true" || args.predecessor) {
        print(
          ops.dependencies.add({
            predecessor_id: args.predecessor!,
            successor_id: id,
            artifact_ref: args["artifact-ref"],
            workflows: ops.workflows,
            projects: ops.projects,
          }),
        );
        return true;
      }
      print({ dependencies: ops.dependencies.forWorkflow(id) });
      return true;
    }
    if (args.command === "tick-admit") {
      const id = args["workflow-id"] ?? args.id;
      if (!id) {
        console.error("Required: --workflow-id");
        process.exit(2);
      }
      print(ops.evaluateAdmission(id));
      return true;
    }
    console.error(`Unknown workflow command: ${args.command}`);
    process.exit(2);
  }

  if (group === "scheduler") {
    if (args.command === "status") {
      print(ops.status());
      return true;
    }
    if (args.command === "queue") {
      print({ queue: ops.rebuildQueue() });
      return true;
    }
    if (args.command === "policy") {
      if (args.set === "true") {
        print(
          ops.policyStore.update({
            max_global_workflows: args["max-global"]
              ? Number(args["max-global"])
              : undefined,
            max_per_project: args["max-per-project"]
              ? Number(args["max-per-project"])
              : undefined,
            aging_ms_per_boost: args["aging-ms"] ? Number(args["aging-ms"]) : undefined,
          }),
        );
        return true;
      }
      print(ops.policyStore.get());
      return true;
    }
    if (args.command === "tick") {
      print(ops.tick(args.max ? Number(args.max) : 1));
      return true;
    }
    if (args.command === "recover") {
      print(ops.recover());
      return true;
    }
    console.error(`Unknown scheduler command: ${args.command}`);
    process.exit(2);
  }

  if (group === "resources") {
    if (args.command === "status") {
      print(ops.resources.status());
      return true;
    }
    if (args.command === "reservations") {
      print({
        reservations: ops.resources.list({
          scope_id: args.project ? undefined : args["scope-id"],
          state: (args.state as never) ?? "HELD",
        }).filter((r) => {
          if (!args.project) return true;
          // Filter by project via workflow ownership
          const wf = ops.workflows.get(r.owner);
          return wf?.project_id === args.project;
        }),
      });
      return true;
    }
    console.error(`Unknown resources command: ${args.command}`);
    process.exit(2);
  }

  if (group === "operations") {
    if (args.command === "overview") {
      print(ops.overview());
      return true;
    }
    if (args.command === "gates-discover") {
      const id = args["project-id"];
      if (!id) {
        console.error("Required: --project-id");
        process.exit(2);
      }
      print(ops.discoverAndOptionallyApplyGates(id, args.confirm === "true"));
      return true;
    }
    if (args.command === "tui") {
      await runOpsTui({ ops, inputLines: args["input-lines"]?.split("\\n") });
      return true;
    }
    console.error(`Unknown operations command: ${args.command}`);
    process.exit(2);
  }

  return false;
}
