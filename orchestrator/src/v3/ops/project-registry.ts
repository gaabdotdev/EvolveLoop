/**
 * Project Registry — multi-project management with canonical paths.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type { ProjectAvailability, ProjectPolicy, ProjectRecord } from "./types.js";

export function defaultProjectPolicy(): ProjectPolicy {
  return {
    version: 1,
    quality_gates: [],
    sandbox_profile: "agent_workspace",
    max_concurrent_workflows: 2,
    max_agents: 4,
    allowed_harnesses: ["cursor-agent", "mock"],
    require_approval_for_integration: true,
    protected_branches: ["main", "master"],
    resource_limits: {
      workflows: 2,
      agents: 4,
      memory_mb: 2048,
      processes: 64,
    },
    allow_cross_project_artifacts: false,
  };
}

function gitIdentity(path: string): { remote?: string; head?: string; branch: string } {
  try {
    const remote = execFileSync("git", ["-C", path, "remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const head = execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    let branch = "main";
    try {
      branch = execFileSync("git", ["-C", path, "rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      /* detached */
    }
    return { remote, head, branch };
  } catch {
    return { branch: "main" };
  }
}

function projectIdFromPath(canonical: string): string {
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 12);
  return `proj-${hash}`;
}

export class ProjectRegistry {
  constructor(private readonly paths: OpsDataPaths) {
    mkdirSync(paths.projectsDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.paths.projectsDir, `${id}.json`);
  }

  list(): ProjectRecord[] {
    return readdirSync(this.paths.projectsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.projectsDir, f), "utf-8")) as ProjectRecord)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  get(projectId: string): ProjectRecord | undefined {
    const p = this.pathFor(projectId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as ProjectRecord;
  }

  findByCanonicalPath(canonical: string): ProjectRecord | undefined {
    return this.list().find((p) => p.canonical_path === canonical);
  }

  add(input: {
    path: string;
    name?: string;
    description?: string;
    data_dir?: string;
    policy?: Partial<ProjectPolicy>;
  }): ProjectRecord {
    const abs = resolve(input.path);
    if (!existsSync(abs)) throw new Error(`PROJECT_PATH_MISSING:${abs}`);
    if (!statSync(abs).isDirectory()) throw new Error(`PROJECT_PATH_NOT_DIR:${abs}`);
    const canonical = realpathSync(abs);
    const existing = this.findByCanonicalPath(canonical);
    if (existing && existing.availability !== "ARCHIVED") {
      throw new Error(`PROJECT_DUPLICATE_PATH:${existing.project_id}`);
    }

    // Detect related worktrees of same git repo
    const git = gitIdentity(canonical);
    if (git.remote) {
      const related = this.list().filter(
        (p) =>
          p.availability !== "ARCHIVED" &&
          p.git_remote === git.remote &&
          p.canonical_path !== canonical,
      );
      if (related.length > 0) {
        // Allow registration but tag in description; do not auto-merge identities
      }
    }

    const ts = nowIso();
    const project_id = existing?.project_id ?? projectIdFromPath(canonical);
    const policy: ProjectPolicy = {
      ...defaultProjectPolicy(),
      ...input.policy,
      version: (input.policy?.version ?? defaultProjectPolicy().version),
      quality_gates: input.policy?.quality_gates ?? defaultProjectPolicy().quality_gates,
      resource_limits: {
        ...defaultProjectPolicy().resource_limits,
        ...input.policy?.resource_limits,
      },
    };

    const data_dir =
      input.data_dir ??
      join(this.paths.root, "project-data", project_id);

    mkdirSync(data_dir, { recursive: true });

    const rec: ProjectRecord = {
      kind: "ProjectRecord",
      project_id,
      name: input.name ?? canonical.split("/").pop() ?? project_id,
      description: input.description ?? "",
      canonical_path: canonical,
      git_remote: git.remote,
      git_head: git.head,
      default_branch: git.branch || "main",
      data_dir,
      availability: "AVAILABLE",
      policy,
      created_at: existing?.created_at ?? ts,
      updated_at: ts,
    };
    atomicWriteJson(this.pathFor(project_id), rec);
    return rec;
  }

  update(
    projectId: string,
    patch: Partial<Pick<ProjectRecord, "name" | "description" | "availability" | "policy" | "default_branch">>,
  ): ProjectRecord {
    const rec = this.get(projectId);
    if (!rec) throw new Error(`PROJECT_NOT_FOUND:${projectId}`);
    const next: ProjectRecord = {
      ...rec,
      ...patch,
      policy: patch.policy
        ? {
            ...rec.policy,
            ...patch.policy,
            resource_limits: {
              ...rec.policy.resource_limits,
              ...patch.policy.resource_limits,
            },
            quality_gates: patch.policy.quality_gates ?? rec.policy.quality_gates,
          }
        : rec.policy,
      updated_at: nowIso(),
    };
    // Local policy cannot exceed global maxes — clamped by GlobalOpsService policy resolver
    atomicWriteJson(this.pathFor(projectId), next);
    return next;
  }

  setAvailability(projectId: string, availability: ProjectAvailability): ProjectRecord {
    return this.update(projectId, { availability });
  }

  archive(projectId: string): ProjectRecord {
    const rec = this.get(projectId);
    if (!rec) throw new Error(`PROJECT_NOT_FOUND:${projectId}`);
    const next: ProjectRecord = {
      ...rec,
      availability: "ARCHIVED",
      archived_at: nowIso(),
      updated_at: nowIso(),
    };
    atomicWriteJson(this.pathFor(projectId), next);
    return next;
  }

  doctor(projectId: string): Record<string, unknown> {
    const rec = this.get(projectId);
    if (!rec) throw new Error(`PROJECT_NOT_FOUND:${projectId}`);
    const pathOk = existsSync(rec.canonical_path);
    const isDir = pathOk && statSync(rec.canonical_path).isDirectory();
    let gitOk = false;
    let head: string | undefined;
    try {
      head = execFileSync("git", ["-C", rec.canonical_path, "rev-parse", "HEAD"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      gitOk = true;
    } catch {
      gitOk = false;
    }
    const dataDirOk = existsSync(rec.data_dir);
    const healthy = Boolean(pathOk && isDir && dataDirOk);
    return {
      project_id: projectId,
      healthy,
      checks: {
        path_exists: pathOk,
        is_directory: isDir,
        git_readable: gitOk,
        git_head: head ?? null,
        data_dir_exists: dataDirOk,
        availability: rec.availability,
      },
      recommendations: healthy
        ? []
        : ["Fix path/permissions or re-register project; do not invent commands"],
    };
  }

  /** Ensure policy does not exceed host/global caps. */
  clampPolicyToGlobal(
    policy: ProjectPolicy,
    global: { max_workflows: number; max_agents: number },
  ): ProjectPolicy {
    return {
      ...policy,
      max_concurrent_workflows: Math.min(policy.max_concurrent_workflows, global.max_workflows),
      max_agents: Math.min(policy.max_agents, global.max_agents),
      resource_limits: {
        ...policy.resource_limits,
        workflows: Math.min(
          policy.resource_limits.workflows ?? policy.max_concurrent_workflows,
          global.max_workflows,
        ),
        agents: Math.min(policy.resource_limits.agents ?? policy.max_agents, global.max_agents),
      },
    };
  }
}

export function newEphemeralProjectId(): string {
  return `proj-${randomUUID().slice(0, 8)}`;
}
