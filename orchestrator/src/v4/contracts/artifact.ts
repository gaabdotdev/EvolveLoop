/**
 * Artifact v1 — immutable, content-addressed output (constitution §5, §6.1).
 * Producer: M02 artifact store port, backed by V3.7 ArtifactFabric (ADR-V4-0002).
 * New content ⇒ new artifact; artifacts are never mutated in place.
 */

import { type ContractHeader, type ContentRef, type ExecutorRef, type IsoTimestamp, isSha256, validateWith, type ValidationResult } from "./common.js";

export const ARTIFACT_SCHEMA_VERSION = "1.0.0";

export type ArtifactIntegrity = "VERIFIED" | "UNVERIFIED" | "MISMATCH";
export type ArtifactClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
export type RetentionPolicy = "WORK_LIFETIME" | "UNTIL" | "PERMANENT" | "LEGAL_HOLD";

export interface Artifact extends ContractHeader<"Artifact"> {
  artifact_id: string;
  work_id: string;
  content: ContentRef & { size_bytes: number; media_type: string };
  origin: { task_id?: string; execution_id?: string; executor_ref?: ExecutorRef };
  /** For code artifacts: VCS identity of the tested/produced code (constitution §8.1). */
  code_version?: { vcs: "git"; commit: string; tree_dirty: boolean };
  access: { classification: ArtifactClassification; project_ids: string[] };
  retention: { policy: RetentionPolicy; until?: IsoTimestamp };
  /** Data residency label consumed by Policy/M13 placement (ADR-V4-0012). */
  residency?: string;
  integrity_status: ArtifactIntegrity;
  /** V3.7 ArtifactFabric id when stored there. */
  v37_artifact_id?: string;
  created_at: IsoTimestamp;
}

export function validateArtifact(value: unknown): ValidationResult {
  return validateWith(value, (c) => {
    c.header("Artifact");
    c.id("artifact_id", "artifact");
    c.id("work_id", "work");
    c.nested("content", (cc) => {
      cc.ensure(isSha256(cc.get("sha256")), "INV-ART-01", "sha256", "artifact must be content-addressed (sha256)");
      cc.integer("size_bytes", 0);
      cc.string("media_type");
    });
    c.nested("origin", (cc) => {
      cc.id("task_id", "task", { optional: true });
      cc.id("execution_id", "execution", { optional: true });
      cc.executorRef("executor_ref", { optional: true });
    });
    c.nested(
      "code_version",
      (cc) => {
        cc.ensure(cc.get("vcs") === "git", "STRUCT", "vcs", 'vcs must be "git"');
        cc.ensure(/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(String(cc.get("commit"))), "INV-ART-02", "commit", "full commit hash required (no short refs)");
        cc.boolean("tree_dirty");
      },
      { optional: true },
    );
    c.nested("access", (cc) => {
      cc.oneOf("classification", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const);
      cc.stringArray("project_ids");
    });
    c.nested("retention", (cc) => {
      const p = cc.oneOf("policy", ["WORK_LIFETIME", "UNTIL", "PERMANENT", "LEGAL_HOLD"] as const);
      if (p === "UNTIL") cc.timestamp("until");
    });
    c.oneOf("integrity_status", ["VERIFIED", "UNVERIFIED", "MISMATCH"] as const);
    c.timestamp("created_at");
  });
}
