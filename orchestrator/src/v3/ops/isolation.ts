/**
 * Cross-project isolation — deny-by-default filesystem/authority access.
 */

import { mkdirSync, appendFileSync, realpathSync, existsSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type { CrossProjectAccessAttempt, ProjectRecord } from "./types.js";
import type { ProjectRegistry } from "./project-registry.js";

export class ProjectIsolationGuard {
  constructor(private readonly paths: OpsDataPaths) {
    mkdirSync(paths.accessLogDir, { recursive: true });
  }

  private logPath(): string {
    return join(this.paths.accessLogDir, "access.jsonl");
  }

  private log(attempt: CrossProjectAccessAttempt): void {
    appendFileSync(this.logPath(), `${JSON.stringify(attempt)}\n`, "utf-8");
  }

  /**
   * Resolve a path a workflow wants to touch and verify it stays inside the project root
   * (or an explicitly shared artifact path).
   */
  assertPathAllowed(input: {
    from_project: ProjectRecord;
    target_path: string;
    projects: ProjectRegistry;
    shared_artifact?: boolean;
  }): { allowed: true; resolved: string } | { allowed: false; reason: string; resolved?: string } {
    let resolved: string;
    try {
      const abs = isAbsolute(input.target_path)
        ? input.target_path
        : resolve(input.from_project.canonical_path, input.target_path);
      resolved = existsSync(abs) ? realpathSync(abs) : resolve(abs);
    } catch (err) {
      const reason = `PATH_RESOLVE_FAILED:${String(err)}`;
      this.log({
        kind: "CrossProjectAccessAttempt",
        at: nowIso(),
        from_project_id: input.from_project.project_id,
        to_project_id: "unknown",
        path: input.target_path,
        allowed: false,
        reason,
      });
      return { allowed: false, reason };
    }

    const home = input.from_project.canonical_path;
    const rel = relative(home, resolved);
    const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));

    if (inside) {
      this.log({
        kind: "CrossProjectAccessAttempt",
        at: nowIso(),
        from_project_id: input.from_project.project_id,
        to_project_id: input.from_project.project_id,
        path: resolved,
        allowed: true,
        reason: "inside_project_root",
      });
      return { allowed: true, resolved };
    }

    // Check if path falls under another registered project
    let other: ProjectRecord | undefined;
    for (const p of input.projects.list()) {
      if (p.project_id === input.from_project.project_id) continue;
      if (p.availability === "ARCHIVED") continue;
      const r = relative(p.canonical_path, resolved);
      const inOther = r === "" || (!r.startsWith("..") && !isAbsolute(r));
      if (inOther) {
        other = p;
        break;
      }
    }

    if (other) {
      const allow =
        input.shared_artifact === true &&
        input.from_project.policy.allow_cross_project_artifacts === true &&
        other.policy.allow_cross_project_artifacts === true;
      const reason = allow
        ? "explicit_shared_artifact"
        : "CROSS_PROJECT_ACCESS_DENIED";
      this.log({
        kind: "CrossProjectAccessAttempt",
        at: nowIso(),
        from_project_id: input.from_project.project_id,
        to_project_id: other.project_id,
        path: resolved,
        allowed: allow,
        reason,
      });
      if (!allow) return { allowed: false, reason, resolved };
      return { allowed: true, resolved };
    }

    this.log({
      kind: "CrossProjectAccessAttempt",
      at: nowIso(),
      from_project_id: input.from_project.project_id,
      to_project_id: "outside",
      path: resolved,
      allowed: false,
      reason: "OUTSIDE_PROJECT_BOUNDARY",
    });
    return { allowed: false, reason: "OUTSIDE_PROJECT_BOUNDARY", resolved };
  }
}
