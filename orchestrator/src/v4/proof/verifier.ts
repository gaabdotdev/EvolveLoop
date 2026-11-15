/**
 * Independent deterministic verifier (V4.0 minimum).
 * Implements `VerifierPort`. Never shares executor identity with the subject.
 * Methods: AUTOMATED_TEST (test-report artifacts) and DETERMINISTIC_RULE (hash integrity).
 */

import {
  DEFAULT_TENANT_ID,
  EVIDENCE_SCHEMA_VERSION,
  type Artifact,
  type ArtifactStorePort,
  type ContentRef,
  type Evidence,
  type EvidenceResult,
  type GoalContract,
  type IsoTimestamp,
  type VerifierPort,
} from "../contracts/index.js";
import { ARTIFACT_INTEGRITY_EVIDENCE_KIND, DEFAULT_DETERMINISTIC_VERIFIER_ID, PROOF_ENGINE_VERSION, TEST_REPORT_MEDIA_TYPE, UNIT_TEST_EVIDENCE_KIND } from "./constants.js";
import { SelfVerificationRefused } from "./errors.js";
import { createRandomIdFactory, type IdFactory } from "./ids.js";
import { assertIndependentVerifier, requireExecutorId } from "./independence.js";
import { evaluateTestReport, parseTestReport } from "./test-report.js";

export interface ArtifactContentPort {
  readBytes(artifact_id: string): Promise<Uint8Array | undefined>;
}

export interface DeterministicVerifierOptions {
  verifier_id?: string;
  verifier_version?: string;
  artifacts?: Pick<ArtifactStorePort, "verify">;
  content?: ArtifactContentPort;
  clock?: () => IsoTimestamp;
  ids?: IdFactory;
  tenant_id?: string;
}

export class DeterministicVerifier implements VerifierPort {
  readonly verifier_id: string;
  readonly verifier_version: string;
  private readonly artifacts?: Pick<ArtifactStorePort, "verify">;
  private readonly content?: ArtifactContentPort;
  private readonly clock: () => IsoTimestamp;
  private readonly ids: IdFactory;
  private readonly tenant_id: string;

  constructor(opts: DeterministicVerifierOptions = {}) {
    this.verifier_id = requireExecutorId(opts.verifier_id ?? DEFAULT_DETERMINISTIC_VERIFIER_ID);
    this.verifier_version = opts.verifier_version ?? PROOF_ENGINE_VERSION;
    this.artifacts = opts.artifacts;
    this.content = opts.content;
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.ids = opts.ids ?? createRandomIdFactory();
    this.tenant_id = opts.tenant_id ?? DEFAULT_TENANT_ID;
  }

  async verify(input: {
    work_id: string;
    goal_contract: GoalContract;
    criterion_id: string;
    artifacts: Artifact[];
    subject_executor_id: string;
  }): Promise<Evidence[]> {
    assertIndependentVerifier(this.verifier_id, input.subject_executor_id);
    const criterion = input.goal_contract.acceptance_criteria.find((c) => c.criterion_id === input.criterion_id);
    if (!criterion) return [];

    const methods = criterion.verification_methods as readonly string[];
    const workArtifacts = input.artifacts.filter((a) => a.work_id === input.work_id);
    const out: Evidence[] = [];

    if (methods.includes("AUTOMATED_TEST")) {
      const produced = await this.evaluateTestReports(input, workArtifacts);
      out.push(...produced);
    }
    if (methods.includes("DETERMINISTIC_RULE")) {
      out.push(await this.evaluateIntegrity(input, workArtifacts));
    }
    return out;
  }

  private async evaluateTestReports(
    input: {
      work_id: string;
      goal_contract: GoalContract;
      criterion_id: string;
      subject_executor_id: string;
    },
    artifacts: Artifact[],
  ): Promise<Evidence[]> {
    if (!this.content) return [];
    const labeled = artifacts.filter((a) => a.content.media_type === TEST_REPORT_MEDIA_TYPE);
    const json = artifacts.filter((a) => a.content.media_type === "application/json");
    const candidates = labeled.length > 0 ? labeled : json;
    const evidence: Evidence[] = [];

    for (const artifact of candidates) {
      const bytes = await this.content.readBytes(artifact.artifact_id);
      if (!bytes) {
        if (artifact.content.media_type === TEST_REPORT_MEDIA_TYPE) {
          evidence.push(
            this.baseEvidence(input, {
              evidence_kind: UNIT_TEST_EVIDENCE_KIND,
              result: "ERROR",
              method_kind: "AUTOMATED_TEST",
              description: `test report ${artifact.artifact_id} bytes missing`,
              tested: [{ sha256: artifact.content.sha256 }],
              limitations: ["missing report bytes; does not prove the criterion"],
            }),
          );
        }
        continue;
      }
      const parsed = parseTestReport(bytes);
      if (!parsed.ok) {
        if (artifact.content.media_type === TEST_REPORT_MEDIA_TYPE) {
          evidence.push(
            this.baseEvidence(input, {
              evidence_kind: UNIT_TEST_EVIDENCE_KIND,
              result: "ERROR",
              method_kind: "AUTOMATED_TEST",
              description: `test report ${artifact.artifact_id} parse error: ${parsed.error}`,
              tested: [{ sha256: artifact.content.sha256 }],
              limitations: [`unreadable test report (${parsed.error}); does not prove the criterion`],
            }),
          );
        }
        continue;
      }
      if (parsed.report.criterion_id !== input.criterion_id) continue;
      const result = evaluateTestReport(parsed.report);
      const tested: ContentRef[] =
        parsed.report.tested_artifact_sha256.length > 0
          ? parsed.report.tested_artifact_sha256.map((sha256) => ({ sha256 }))
          : [{ sha256: artifact.content.sha256 }];
      evidence.push(
        this.baseEvidence(input, {
          evidence_kind: parsed.report.evidence_kind,
          result,
          method_kind: "AUTOMATED_TEST",
          description: `deterministic test report ${artifact.artifact_id}: ${parsed.report.tests.length} test(s)`,
          command: "deterministic-test-report",
          tested,
          limitations: [
            result === "PASS"
              ? "does not prove production behaviour or untested requirements"
              : "failing or empty tests do not prove the criterion",
          ],
        }),
      );
    }
    return evidence;
  }

  private async evaluateIntegrity(
    input: {
      work_id: string;
      goal_contract: GoalContract;
      criterion_id: string;
      subject_executor_id: string;
    },
    artifacts: Artifact[],
  ): Promise<Evidence> {
    const tested: ContentRef[] = artifacts.map((a) => ({ sha256: a.content.sha256 }));
    if (artifacts.length === 0) {
      return this.baseEvidence(input, {
        evidence_kind: ARTIFACT_INTEGRITY_EVIDENCE_KIND,
        result: "INCONCLUSIVE",
        method_kind: "DETERMINISTIC_RULE",
        description: "no artifacts to integrity-check",
        tested: [],
        limitations: ["no artifacts present; integrity is unproven"],
      });
    }
    if (!this.artifacts) {
      return this.baseEvidence(input, {
        evidence_kind: ARTIFACT_INTEGRITY_EVIDENCE_KIND,
        result: "INCONCLUSIVE",
        method_kind: "DETERMINISTIC_RULE",
        description: "artifact verify port not configured",
        tested,
        limitations: ["integrity rule requires ArtifactStorePort.verify"],
      });
    }

    let result: EvidenceResult = "PASS";
    const notes: string[] = [];
    for (const artifact of artifacts) {
      const status = await this.artifacts.verify(artifact.content);
      if (status === "MISMATCH") {
        result = "FAIL";
        notes.push(`mismatch:${artifact.artifact_id}`);
      } else if (status === "MISSING" || artifact.integrity_status !== "VERIFIED") {
        if (result !== "FAIL") result = "INCONCLUSIVE";
        notes.push(`unverified:${artifact.artifact_id}:${status}`);
      }
    }
    return this.baseEvidence(input, {
      evidence_kind: ARTIFACT_INTEGRITY_EVIDENCE_KIND,
      result,
      method_kind: "DETERMINISTIC_RULE",
      description: "content-addressed artifact integrity (sha256 verify)",
      command: "artifact.verify",
      tested,
      limitations:
        notes.length > 0
          ? notes
          : ["hash match does not prove functional correctness or production behaviour"],
    });
  }

  private baseEvidence(
    input: {
      work_id: string;
      goal_contract: GoalContract;
      criterion_id: string;
      subject_executor_id: string;
    },
    parts: {
      evidence_kind: string;
      result: EvidenceResult;
      method_kind: "AUTOMATED_TEST" | "DETERMINISTIC_RULE";
      description: string;
      command?: string;
      tested: ContentRef[];
      limitations: string[];
    },
  ): Evidence {
    if (this.verifier_id === input.subject_executor_id) {
      throw new SelfVerificationRefused(this.verifier_id, input.subject_executor_id);
    }
    return {
      kind: "Evidence",
      schema_version: EVIDENCE_SCHEMA_VERSION,
      tenant_id: this.tenant_id,
      evidence_id: this.ids.evidence(),
      work_id: input.work_id,
      subject: { kind: "CRITERION", ref: input.criterion_id },
      criterion_ref: {
        goal_contract_id: input.goal_contract.goal_contract_id,
        goal_contract_version: input.goal_contract.version,
        criterion_id: input.criterion_id,
      },
      evidence_kind: parts.evidence_kind,
      method: { kind: parts.method_kind, description: parts.description, command: parts.command },
      result: parts.result,
      produced_by: { executor_id: this.verifier_id, executor_version: this.verifier_version },
      subject_executor_ref: { executor_id: input.subject_executor_id, executor_version: "unknown" },
      tested_artifacts: parts.tested,
      environment: { runtime: "evolveloop-v4-m06-deterministic-verifier" },
      provenance: "OBSERVED",
      observed_at: this.clock(),
      limitations: parts.limitations.length > 0 ? parts.limitations : ["does not prove production behaviour"],
    };
  }
}
