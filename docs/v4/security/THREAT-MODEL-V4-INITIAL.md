# EvolveLoop V4 — Initial Threat Model (M18 Wave 1)

| Field | Value |
|-------|-------|
| Meta | M18 — Security & Adversarial Assurance |
| Wave | 1 — initial threat model (read-only analysis; no product code) |
| Branch | `feature/v4/m18-security` |
| Analysed tip | `03937c175368715e893193fcfad09aac8474286b` (provisional baseline) + V4 bootstrap docs commit `84fead0` |
| V3.7 status | **BLOCKED** (G17 multi-host E2E). Nothing here claims V3.7 or V4 APPROVED. |
| Normative sources | Constitution ch. 3, 4.1–4.5, 4.10–4.13, 5, 6, 7, 8, 9, 13, 15, 16; Orchestrator Mission M18 section; `docs/v4-orchestration/{INVENTORY,BLOCKERS,MASTER-PLAN,REQUIREMENTS-MATRIX}.md`; `docs/v3.7/{SECURITY,PROTOCOL,NODE-IDENTITY-AND-TRUST,FAULT-TOLERANCE,ARTIFACT-FABRIC,LIMITATIONS,risk-register}.md`; `docs/v3.7/adr/ADR-V37-000{2,3}*.md` |
| Knowledge grounding | `WIKI_ROOT` unset → **GAP** (B-WIKI). Repo docs + code on tip only. |

## 0. How to read this document

- **Purpose.** Give M00 and the domain metas a security baseline *before* contracts freeze, so that the V4.0 contracts do not bake in properties that later cannot be secured.
- **Two kinds of entries.**
  - **Evidence findings (`TM-V4-Fxx`)** — grounded in code or docs on the analysed tip. They describe V3.x primitives that V4 is told to *reuse* (constitution §6.3) and the property V4 would lose if they were reused unchanged. All were found **by inspection**; none was exploited or reproduced by test in Wave 1.
  - **Design threats (`TM-V4-Dxx`)** — V4 surfaces that have no implementation yet. Evidence is the constitution/mission text that creates the surface. They are written as **requirements** for owner metas, not as designs.
- **Severity scale** (impact on a V4 guarantee if left unmitigated, assuming the V4 adversary model in §2):
  - **CRITICAL** — breaks a non-negotiable principle (ch. 3) or the security readiness criterion (§16) by itself.
  - **HIGH** — breaks a constitution capability guarantee under a realistic adversary.
  - **MEDIUM** — weakens a guarantee or needs an additional condition to be exploitable.
  - **LOW** — hygiene / reuse hazard.
- **Not in scope of Wave 1.** No adversarial tests were run; no V4 code exists to test. No architecture is imposed on M00: where a mitigation implies a design choice, it is stated as the *property* required, and M00 decides the mechanism through ADRs.

## 1. Assets

| ID | Asset | Why it matters (constitution) | Primary custodian (proposed) |
|----|-------|-------------------------------|------------------------------|
| A1 | **Work State** (Goal Contract, task graph, confirmed vs unverified progress, decisions) | §3 “work belongs to the platform”; §4.1 | M01, M02 |
| A2 | **Work Events / Event Ledger** (append-only history, checkpoints, snapshots) | §5 Work Event invariants; §4.6 time travel depends on it | M02 |
| A3 | **Execution Capsule / Handoff package** | §4.3 integrity + no permanent secrets | M04 |
| A4 | **Effect Ledger** (COMMITTED / REJECTED / UNKNOWN / NOT_EXECUTED, idempotency keys, reconciliation evidence) | §4.4, §7.3 | M03 |
| A5 | **Credentials** (provider API keys, git/SCM tokens, cloud creds, mTLS keys, session tokens, IPC tokens, temporary delegated creds) | §9.2 | M10 (+ fabric trust from V3.7) |
| A6 | **Artifacts** (code, packages, outputs; content-addressed blobs) | §5 Artifact invariants | M02 / fabric artifact registry |
| A7 | **WorkProof / Evidence** | §8 honesty rule | M06 |
| A8 | **Policy and policy decisions** (profiles, grants, approvals, autonomy level, revocations) | §4.10, §9.4 | M10 |
| A9 | **Provenance** (who/what/which permission produced each item) | §4.12 | M11 |
| A10 | **Observability / measurement data** (traces, costs, capability scores) | §4.8, §4.13, §6.2 “Measurement Plane must not invent facts” | M12, M08 |
| A11 | **Executor identity** (worker node ids, agent ids, adapter/provider ids) | §5 Executor invariants | M10, M13, M14 |
| A12 | **Human approver identity & decisions** | §4.10 L2, §9.2 audit of who authorized | M10, M15 |

## 2. Adversary model

V4 changes the adversary model relative to V3.7. ADR-V37-0003 explicitly scopes V3.7 to a **single-user trusted host** where same-UID processes are not an isolation boundary. V4 introduces third-party executors (§4.15), ephemeral/cloud compute (§4.14), agent-to-agent handoff (§4.3), and untrusted artifact/source content flowing into model prompts (§9.2). Therefore this model assumes:

| ID | Adversary | Capability assumed |
|----|-----------|--------------------|
| ADV1 | **Prompt-injected / misaligned agent** | Controls its own outputs (text, tool calls, files in its workspace, free-text capsule fields, self-reported metrics). Runs code inside its sandbox profile. |
| ADV2 | **Compromised or malicious executor/worker** (third-party runtime, ephemeral cloud node) | ADV1 + controls the worker process, its local disk, its protocol messages, timing; holds whatever credentials were delegated to it. |
| ADV3 | **Stale executor** (revoked/expired lease, partitioned node) | Honest but late: continues to act after losing authority. |
| ADV4 | **Malicious content source** (repo file, issue/PR text, web page, wiki page, tool output, dependency) | Injects instructions/data into anything an agent reads. |
| ADV5 | **Network attacker** between Control Plane and workers / external services | Standard Dolev-Yao against non-mTLS paths. |
| ADV6 | **Curious co-tenant** (only if multi-tenancy is in scope — see §8) | Another user/team on the same platform. |
| ADV7 | **Careless operator** | Pastes secrets into goals, approves without reading, mis-scopes policies. |

Explicitly **out of scope** for V4.0–V4.2 unless M00 decides otherwise: compromise of the Control Plane host itself and of the operator account (consistent with ADR-V37-0003), hardware/side-channel attacks, provider-side model compromise beyond ADV4-style output manipulation.

## 3. Trust boundaries

```text
 Human approver / operator (A12)
        │  TB1: approval & operator channel (CLI / IPC / Control Center / API)
        ▼
 ┌─────────────────────── Control Plane (authority) ───────────────────────┐
 │ Goal Compiler · Work State · Event Ledger · Effect Ledger · Policy ·    │
 │ WorkProof/Verifier · Provenance · Measurement Plane                     │
 └──────────────┬──────────────────────────────┬───────────────────────────┘
   TB2: CP ↔ Worker protocol (mTLS + session)  │ TB6: CP ↔ storage (data-dir, artifact store)
                ▼                              ▼
 ┌──────── Worker Runtime ────────┐     persistent state (A1–A4, A6–A9)
 │ sandbox profile, leases        │
 │   TB3: runtime ↔ executor      │  (agent CLI / model harness / third-party runtime)
 │   ┌──── Executor / Agent ────┐ │
 │   │ model context ← TB4 ─────┼─┼── untrusted content: repo, tools, web, wiki, capsule text
 │   └──────────┬───────────────┘ │
 └──────────────┼─────────────────┘
                │ TB5: executor/worker ↔ external services (SCM, CI, cloud, providers, notify)
                ▼
        External services (effects A4)
 TB7: executor A → capsule → executor B (handoff, possibly different provider/host/trust level)
```

| TB | Boundary | V3.7 baseline control (evidence) | V4 delta |
|----|----------|-----------------------------------|----------|
| TB1 | Human/operator → Control Plane | Local IPC with operator vs privileged token, `0600`, nonce anti-replay (`docs/v3.7/SECURITY.md`; ADR-V37-0003). Approver `actor` is a caller-supplied string. | Control Center / API / remote approvers (§4.16, §10.3); L2 depends on authenticated approvers. |
| TB2 | Control Plane ↔ Worker | mTLS, CN = `worker_node_id`, HMAC session token, app-layer cert denylist, live socket destroy on revoke (`PROTOCOL.md`, `NODE-IDENTITY-AND-TRUST.md`). | Third-party and ephemeral workers; capsule transfer across workers. |
| TB3 | Worker Runtime ↔ Executor | `SandboxProfile` + `evaluateCapability` fail-closed (`v3/security/enforcer.ts`); bwrap; harness provider outside bwrap is a known semi-trusted boundary (risk R05). | More executor types (§4.15); executors may be third-party code. |
| TB4 | Untrusted content → model context | No structural channel separation found on tip (grep for `untrusted`/`prompt injection` finds only labels in evaluation prompts and gate-result). | Constitution §9.2 makes this mandatory. |
| TB5 | Executor/worker → external service | Fencing enforced at **result commit** to CP (`SECURITY.md`, `FAULT-TOLERANCE.md`, `lease-manager.ts` `assertFencing`). No evidence of fencing/credential binding at the external-effect call. | Effect Ledger (§4.4) and UNKNOWN semantics (§7.3) make this boundary central. |
| TB6 | Control Plane ↔ storage | Atomic JSON writes; JSONL append; SHA-256 verify on artifact read (`ARTIFACT-FABRIC.md`). No integrity chain on ledgers. | WorkProof, time travel and provenance rely on ledger integrity. |
| TB7 | Executor A → Executor B via capsule | V3 `HandoffPackage` JSON on disk, no signature, permissions embedded (`v3/continuity/engine.ts`). | Cross-provider / cross-host / cross-trust handoff (§4.3). |

## 4. STRIDE per boundary (summary)

S = Spoofing, T = Tampering, R = Repudiation, I = Information disclosure, D = Denial of service, E = Elevation of privilege. Cell content references findings/threats detailed in §5–§6.

| TB | S | T | R | I | D | E |
|----|---|---|---|---|---|---|
| TB1 approver | F02 approver identity self-asserted | F03/F04 grant reuse | F02 `decided_by` is free text | D10 approval UI shows secrets | D07 approval flooding (UNKNOWN spam) | F02 self-approval by agent |
| TB2 CP↔worker | V3.7 mTLS (baseline OK) | D03 capsule in transit | D05 worker-reported effect state | F11 secrets in telemetry | D09 frame/size abuse | D04 worker claims higher capability |
| TB3 runtime↔executor | F09 self-labelled trust | F14 denied-path bypass | — | F11 redaction gaps | D09 resource exhaustion (R13) | F14, D06 L-level escalation |
| TB4 content→model | D01 instructions masquerading as operator | D01 poisoned artifacts | — | D01 exfiltration via tool calls | D01 loop induction | D01 policy bypass by persuasion |
| TB5 executor→external | — | F05 stale effects | D05 no CP-side effect evidence | F11 creds in logs | D07 UNKNOWN abuse | F05 creds outlive lease |
| TB6 CP↔storage | — | F07 ledger rewrite, F08 path traversal | F07 no tamper evidence | — | F07 JSONL full-read | F01 via edited capsule file |
| TB7 capsule handoff | F01 forged origin | F01 tampering | F01 no signer | D02 secrets in capsule | — | F01 permission injection, F12 instruction injection |

## 5. Evidence findings (code/docs on tip)

Each finding: severity · affected requirement · evidence · threat · required property (requirement, not design) · owner meta(s).

### TM-V4-F01 — Handoff package has no integrity/authenticity and is the source of the substitute’s permissions — **CRITICAL**

- **Requirement:** §4.3 “validar a integridade e a versão da cápsula antes do handoff”; §5 Execution Capsule “integridade verificável”; §9.2 least privilege; §9.1 autonomy must not escalate automatically.
- **Evidence:** `orchestrator/src/v3/continuity/engine.ts` L87–118 builds `HandoffPackage` including `permissions: { ...agent.permissions }` and free-text `reason`/`decisions`/`next_action`; L145–151 `load()` only checks `kind === "HandoffPackage"` (no hash, signature, version or expiry check); L263–295 `spawnSubstitute` registers the substitute with `permissions: { ...pkg.permissions }` and embeds `next_action` in the delegation `objective`.
- **Threat:** anyone who can write the handoffs dir (ADV2 on a shared host, or a future transport) edits `permissions` → substitute is created with arbitrary permissions (E). Forged `from_agent_id`/`verified_task_state` → state/attribution forgery (S/T/R). Pending package can be applied after its context changed (no TTL).
- **Required properties:** (a) capsule integrity and origin verifiable by the receiver before use, bound to work id + Goal Contract version + checkpoint/event position; (b) capsule carries **references** to authority, never authority itself — effective permissions are re-derived by the Policy Engine at acceptance time from current policy, and can only narrow; (c) capsule has version, expiry and single-use/anti-replay semantics; (d) rejection on any check failure is fail-closed and recorded.
- **Owners:** **M04** (format, verification), **M10** (permission re-derivation at accept), **M00** (contract: “capsule ≠ grant”; ADR for signing/versioning per §15.2 open decision).

### TM-V4-F02 — Approver identity is caller-asserted; executors sharing the operator UID can self-approve L2 actions — **CRITICAL (for V4 adversary model)**

- **Requirement:** §3 “um executor não pode aprovar o próprio resultado”; §4.10 L2 “ações sensíveis exigem aprovação humana”; §9.2 “auditoria de quem autorizou”.
- **Evidence:** `orchestrator/src/v3/coordinator/daemon.ts` L108–117: `actor = String(req.params?.actor ?? "cli")` passed to `approvals.approve/reject`; `v3/approvals/store.ts` L108 stores it as `decided_by`. Privileged token on disk, `0600`, same-UID is out of scope by **ADR-V37-0003** (“Same-UID process with data-dir read cannot forge privileged calls — No”). No requester ≠ approver check in `store.ts`/`broker.ts`.
- **Threat:** in V3.7’s single-user model this is an accepted boundary. In V4, executors are explicitly untrusted (ADV1/ADV2). Any executor process running as the operator UID with read access to the Coordinator data-dir can approve its own `pending_approval` request, with any `decided_by` label → L2 collapses to L1 and audit trail is forged (S, R, E).
- **Required properties:** (a) approver is an **authenticated principal** distinct from the requesting executor and from any executor identity; (b) `decided_by` is derived from authentication, never from request payload; (c) executors run in a trust domain that cannot read Control Plane credentials/tokens/data-dir (OS user, container, or host separation — mechanism is M00/M13 decision); (d) approval decisions are bound to the exact action (operation, resource, work, policy version) and recorded in provenance.
- **Owners:** **M10** (approver authN, separation of duties), **M00** (ADR superseding ADR-V37-0003 trust-domain assumption for V4 executors), **M13** (executor/worker isolation from CP data), **M15** (approval UI/API authN), **M11** (permission → action provenance).

### TM-V4-F03 — Approved grants never expire and cannot be revoked — **HIGH**

- **Requirement:** §9.4 “não se deve presumir que uma permissão concedida no início continue válida indefinidamente”; §4.10 revocation.
- **Evidence:** `v3/approvals/store.ts` L115–129 `expireIfNeeded` only acts when `state === "PENDING"`; `consume()` L192–215 does not compare `expires_at` for `APPROVED`; `cancel` L184–186 → `transition` L104–106 only allows `PENDING → CANCELLED`. No `REVOKED` state for an approved grant.
- **Threat:** an approved multi-use grant (or an unused single-use grant) stays usable indefinitely, including after policy change, work cancellation, or executor revocation (E).
- **Required properties:** grants have an active validity window enforced at use time; grants are revocable after approval; policy version change has defined effect on outstanding grants (§9.4).
- **Owner:** **M10**.

### TM-V4-F04 — Grant consumption is a non-atomic read-modify-write — **HIGH** (by inspection, not reproduced)

- **Requirement:** §4.4/§4.10 — single-use approvals must not authorize two effects.
- **Evidence:** `v3/approvals/store.ts` L192–226 `consume` reads, decrements `uses_remaining`, and writes via rename without a claim/lock; contrast `decideOnce` L143–182 which uses an exclusive `wx` claim file for the same class of race.
- **Threat:** two concurrent consumers (two workers, or retry + original) both observe `uses_remaining = 1` and both succeed → one human approval authorizes two sensitive effects (E, T).
- **Required property:** grant consumption is atomic and linearizable across all consumers of the Control Plane (compare-and-swap or single-writer), and each consumption is linked to exactly one Effect Record.
- **Owners:** **M10** (+ **M03** linkage consumption ↔ effect).

### TM-V4-F05 — Fencing protects commits to the Control Plane, not external effects — **HIGH**

- **Requirement:** §7.2 step 7 “impedir commits obsoletos por fencing”; §4.4; §12.2 “impedir commits obsoletos ou duplicações indevidas”; §16 Integridade.
- **Evidence:** `docs/v3.7/SECURITY.md` “Fencing at result commit”; `PROTOCOL.md` “`task.result` (fencing checked at commit)”; `v3/fabric/leases/lease-manager.ts` L114–147 `assertFencing` is a Control-Plane-side check. No evidence on tip that an external call (git push, PR creation, deploy, notification) is gated by a fresh fencing check or that delegated credentials are bound to the lease.
- **Threat:** ADV3 (stale worker) or ADV2 keeps performing external effects after lease revoke/steal; the CP rejects the *result*, but the external world already changed → duplicate or conflicting effects that the Effect Ledger does not know about (T, R).
- **Required properties:** (a) every externally visible effect is preceded by an Effect Record intent accepted by the CP under a valid lease/epoch; (b) credentials usable for external effects are scoped to the lease and become unusable on revoke/expiry; (c) external effects not preceded by an accepted intent are detectable at reconciliation and classified (not silently ignored).
- **Owners:** **M03** (intent-before-effect), **M04** (recovery uses this), **M10** (lease-scoped credentials), **M13** (ephemeral workers inherit this).

### TM-V4-F06 — Idempotency store cannot represent “started, outcome unknown” and races on begin — **HIGH**

- **Requirement:** §4.4 (UNKNOWN), §7.3 “antes de repetir, consultar o destino… bloquear repetição cega”.
- **Evidence:** `v3/idempotency/store.ts` L43–72 `beginOrReplay` returns `fresh` **without persisting** a reservation; the record only exists after `commit` (L74–82). Check-then-act on `existsSync` with no lock. `pathFor` L38–41 sanitizes `key` but not `workId`.
- **Threat:** crash between begin and commit leaves no trace → the next attempt is `fresh` again → blind repeat (exactly the §7.3 failure). Two concurrent begins both get `fresh` (T). Unsanitized `workId` → path traversal (see F08).
- **Required properties:** an intent/reservation is durably recorded **before** the effect is dispatched; recovery that finds a reservation without outcome yields UNKNOWN, never `fresh`; reservation is atomic per key.
- **Owners:** **M03** (+ **M02** durability guarantees).

### TM-V4-F07 — Ledgers have no tamper evidence, ordering integrity, or concurrency control — **HIGH**

- **Requirement:** §5 Work Event “identidade, ordenação, deduplicação e versão de schema”; §4.6 time travel; §8 WorkProof traceability; §4.12 provenance.
- **Evidence:** `v3/event-log/store.ts` L26–42 append-only JSONL with no event id, sequence, hash chain or signature; `read` parses whole file. `v3/work-ledger/store.ts` L54–92 `version = meta.latest_version + 1` from an unlocked meta read, JSONL append and meta rewrite are two non-atomic steps; `rebuildSnapshot` L126–153 trusts JSONL content.
- **Threat:** anyone with write access to the data-dir rewrites history undetectably (T, R). Concurrent appenders produce duplicate versions; crash between append and meta write leaves projection behind (state inconsistency, §15.1). WorkProof and time travel built on top inherit unverifiable history.
- **Required properties:** events have unique ids and a total order per Work; history is tamper-evident (detects edits, deletions, reordering) and verifiable by an independent verifier (M06/M20); append and projection have defined atomicity; WorkProof references a verifiable ledger position.
- **Owners:** **M02** (ledger), **M00** (event semantics ADR — §15.2 “Event Ledger” open decision), **M11** (provenance anchoring), **M06** (proof references).

### TM-V4-F08 — Identifiers used as path components without validation — **MEDIUM** (by inspection; no exploit attempted)

- **Requirement:** M18 mission: path traversal tests; §9.2 filesystem control.
- **Evidence:** `join(rootDir, \`${workId}.jsonl\`)` in `v3/event-log/store.ts` L22–24 and `v3/work-ledger/store.ts` L32–38; `join(rootDir, workId, …)` in `v3/idempotency/store.ts` L38–41; `join(rootDir, \`${id}.json\`)` in `v3/approvals/store.ts` L29–31 reached from IPC `approval_id` param (`daemon.ts` L109); `v3/continuity/engine.ts` L63–65. No central id validator found (`rg` for common validator names returned nothing).
- **Threat:** ids originating from untrusted input (API, capsule, worker message) traverse out of the store root → read/overwrite JSON/JSONL elsewhere under the CP account (T, I). Today mostly reachable with privileged access; V4 widens input sources (API, third-party executors, capsules).
- **Required property:** all externally influenced identifiers are validated against a single canonical grammar at the trust boundary before reaching storage; stores refuse ids outside the grammar.
- **Owners:** **M00** (id grammar in contracts), **M02** (storage enforcement), **M15** (API boundary).

### TM-V4-F09 — Trust classification is read from the payload being classified — **HIGH**

- **Requirement:** §9.2 “separação entre dados observados e instruções de controle”; §8 honesty rule; §4.8 “não aceitar autoavaliação”.
- **Evidence:** `orchestrator/src/evolveloop/handoff/gate-result.ts` L72–118 `classifyGateSource`: a `gate.json` containing `"gate_source_kind": "controlled_fixture"` or `"controlled_fixture": true` is classified `trust: "trusted_fixture"`.
- **Threat:** any producer that can write the gate file (ADV1/ADV2) self-labels as trusted (S, E). The same anti-pattern in V4 evidence/WorkProof/provenance would let an executor upgrade its own evidence trust.
- **Required property:** trust level of evidence, gate results, metrics and provenance is derived from the **authenticated channel/identity that delivered it** and from policy, never from fields inside the payload.
- **Owners:** **M06**, **M11**, **M12** (same rule for measurement provenance — see F10).

### TM-V4-F10 — Measurement provenance defaults to OBSERVED and is producer-asserted — **MEDIUM**

- **Requirement:** §6.2 “Measurement Plane… não deve inventar fatos”; M12 criterion “métricas não inventam fatos”; §4.8 capability scores need provenance.
- **Evidence:** `telemetry/measurement-plane/envelope.ts` L68–74 `kind: input.provenance?.kind ?? "OBSERVED"`; `source` and `reported_by` are caller-supplied; no source authentication.
- **Threat:** executor-emitted or unlabeled data is stored as OBSERVED → feeds Capability Intelligence (M08) and adaptive routing (M09) → ADV2 inflates its own scores and attracts sensitive work (see D04). Observability data authenticity is not established.
- **Required properties:** missing provenance defaults to UNKNOWN/UNAVAILABLE, never OBSERVED; OBSERVED is only assignable by CP-side observers; source identity is authenticated at ingestion.
- **Owners:** **M12**, **M08** (consumers must reject unauthenticated provenance).

### TM-V4-F11 — Secret redaction is a narrow regex denylist with structural gaps — **HIGH**

- **Requirement:** §9.2 “segredos fora de Execution Capsules, logs e WorkProof”; §4.3; M18 “verificação de que provas/evidências não vazam segredos”.
- **Evidence:** `orchestrator/src/evidence/secret-redaction.ts` L9–15 patterns cover Bearer, `sk-/api-` prefixes, `ghp_`, `AKIA`, and `UPPER_CASE_KEY=value`. Not covered (by reading the regexes): PEM private key blocks, JWTs, `github_pat_` fine-grained tokens, Slack `xox*`, credentials in URLs (`https://user:pass@`), JSON/YAML key-value (`"password": "…"`), lower/mixed-case env names. `sanitizeDeep` L67–78 redacts by value only, never by key name. `envelope.ts` L124–133 `redactAttributes` passes **arrays** through unredacted and does not touch `measurements`; `validateMeasurementEvent` L173–178 detector is narrower than the redactor.
- **Threat:** secrets from tool output, env dumps, or operator-pasted goals (ADV7) persist into logs, telemetry, capsules, WorkProof — artifacts that are designed to be portable and shared with third parties (I).
- **Required properties:** (a) secrets are excluded **structurally** (referenced by handle, injected at use time, never serialized) for capsules and WorkProof; (b) pattern redaction is defense-in-depth only and covers nested arrays/keys; (c) a canary-based leak test is a release gate for capsule, WorkProof, logs and telemetry (V3 canary helper exists and can be reused for tests).
- **Owners:** **M10** (secrets management/handles), **M04** (capsule exclusion), **M06** (WorkProof exclusion), **M12** (telemetry), **M02** (event payloads).

### TM-V4-F12 — Free-text from a previous executor becomes instructions for the next — **HIGH**

- **Requirement:** §9.2 prompt-injection protection; “separação entre dados observados e instruções de controle”.
- **Evidence:** `v3/continuity/engine.ts` L98–111 `reason`, `decisions`, `next_action` are free text from the handing-off side; L283 `objective: \`Handoff continuation of … ${pkg.verified_progress.next_action}\`` embeds it into the substitute’s delegation objective.
- **Threat:** ADV1 (injected agent A) writes instructions into `next_action` → executor B (possibly on a different provider/host/trust level) receives them as its objective → cross-executor injection that survives the handoff the constitution relies on (T, E).
- **Required properties:** capsule fields are typed as **data** vs **control**; control fields (objective, scope, permissions, acceptance) come only from Goal Contract/task graph/policy; executor-authored text is delivered as quoted untrusted data and cannot alter scope or authority.
- **Owners:** **M04** (capsule schema), **M10** (authority never derived from content), **M00** (contract typing).

### TM-V4-F13 — Fencing epoch is derived from currently persisted leases and may be caller-supplied — **MEDIUM**

- **Requirement:** §7.2 fencing; §15.2 retention/compaction open decision.
- **Evidence:** `v3/fabric/leases/lease-manager.ts` L52–65 `prevEpoch = max(epochs of listed leases for resource)`; `fencing_epoch: input.fencing_epoch ?? prevEpoch + 1`.
- **Threat:** if lease records are compacted/deleted (retention, backup restore, disk cleanup), the epoch can regress and a stale holder’s epoch becomes valid again; explicit `fencing_epoch` input allows non-monotonic issuance (T).
- **Required property:** per-resource epoch high-watermark is durable, monotonic across retention/restore, and not caller-settable.
- **Owners:** **M02** (retention/restore), **M04** (recovery uses fencing).

### TM-V4-F14 — Policy decisions are not versioned and `denied_paths` matches unnormalized paths — **MEDIUM**

- **Requirement:** §9.4 “políticas versionadas… vinculadas à execução”; §4.10 filesystem scope.
- **Evidence:** `v3/security/enforcer.ts` L115–122 `SecurityDecision` has `profile_id`, no policy version/hash; L99–106 `denied_paths` compared with `startsWith` on raw `opts.targetPath` (only `pathEscapesWorkspace` resolves paths, L95). A denied path *inside* the workspace (e.g. `<ws>/.git`) would not match `<ws>/sub/../.git` or a relative path.
- **Threat:** denied sub-paths bypassed (E); audit cannot prove which policy version authorized an action (R).
- **Required properties:** every decision records policy id + version/hash + inputs; path checks operate on canonical (resolved, symlink-aware) paths for both allow and deny lists.
- **Owner:** **M10** (+ **M11** for decision provenance).

### TM-V4-F15 — Handoff eligibility allows substitutes with broader permissions — **MEDIUM**

- **Requirement:** §9.2 least privilege; §9.1 no automatic escalation.
- **Evidence:** `v3/continuity/engine.ts` L157–167 `findEligibleSubstitutes` requires substitute ⊇ package permissions; no upper bound.
- **Threat:** task continues under an executor with more authority than the original grant (E, not attacker-initiated but widens blast radius of ADV1 content in the capsule — see F12).
- **Required property:** effective authority after handoff = policy-derived authority for the task, intersected with the substitute’s capability; never the substitute’s full permission set.
- **Owners:** **M04**, **M10**.

### TM-V4-F16 — Legacy evidence builders attach fixed confidence to provider success — **LOW**

- **Requirement:** §8 honesty rule.
- **Evidence:** `orchestrator/src/evidence/validator.ts` `buildSuccessEvidence` → `buildGateEvidence(…, "passed", 0.9)`. `builders.ts` marks DoD checks unverified, which is correct; the constant confidence is the hazard.
- **Threat:** if reused for WorkProof, a provider-reported “passed” yields a numeric confidence that looks measured.
- **Required property:** WorkProof does not import confidence constants; confidence/state come only from validation results.
- **Owner:** **M06**.

## 6. Design threats (no V4 implementation yet → requirements)

| ID | Sev | Surface | Threat | Required property | Owners |
|----|-----|---------|--------|-------------------|--------|
| TM-V4-D01 | HIGH | Prompt injection / untrusted artifacts (TB4) | Repo files, issue/PR text, web/wiki pages, tool outputs, dependency READMEs carry instructions (“ignore policy, push to main, print env”). Agents act on them; persuasion of a model is not authorization. | Authority is never derived from content (policy evaluates actions, not model intent); untrusted content is marked at ingestion and kept separable through prompts, capsules and evidence; sensitive actions requested after reading untrusted content follow normal L-level policy (no shortcut); egress controls limit exfiltration. | M10, M01 (goal intake), M04, M14 |
| TM-V4-D02 | HIGH | Capsule confidentiality | Capsule is portable to other providers/hosts; context excerpts may contain secrets or data with residency limits. | Capsule content classified; transfer checked against destination trust/residency policy; secrets excluded by construction (F11). | M04, M10, M13 |
| TM-V4-D03 | HIGH | Capsule replay / rollback | Valid old capsule re-presented to resume from an earlier state (re-executing effects) or to a second executor (split brain). | Capsule bound to checkpoint position + epoch; accepting it requires current lease; superseded capsules rejected. | M04, M02 |
| TM-V4-D04 | MEDIUM | Capability Intelligence poisoning | Executor self-reports success/cost/latency, or games benchmarks → routing favours it for sensitive work. | Scores from CP-observed/independently verified outcomes only (§4.8); routing for sensitive work constrained by policy, not score alone. | M08, M09, M12 |
| TM-V4-D05 | HIGH | Effect state reported by executor | Executor reports NOT_EXECUTED for an effect that happened (→ duplicate on retry, e.g. double deploy/payment) or COMMITTED for one that did not (→ false proof). | Effect state transitions to COMMITTED/NOT_EXECUTED require CP-side observation/reconciliation evidence when the target supports it; executor report alone ≤ UNKNOWN. | M03, M06 |
| TM-V4-D06 | HIGH | L0–L3 escalation | Autonomy inherited via capsule/delegation/child agents, or “earned” by past success (§9.1 forbids), or L3 granted globally. | Level is computed per action/resource/work/environment at decision time; children ≤ parent; no level stored as executor property; L3 requires explicit, bounded, revocable policy with audit. | M10, M04, M07 (plan must not request levels) |
| TM-V4-D07 | MEDIUM | UNKNOWN abuse (availability) | Attacker forces many effects into UNKNOWN to flood the human queue (approval fatigue → rubber-stamp, ADV7) or stall work. | UNKNOWN rate per executor is monitored and triggers quarantine; reconciliation automated where target supports queries; approval queue shows provenance and risk. | M03, M12, M15, M10 |
| TM-V4-D08 | HIGH | Replay / fork (§4.6, §7.4) | Replay or fork re-applies external effects or reuses credentials/grants of the original execution. | Forks get new identity, no inherited grants/credentials, external effects disabled until newly authorized; replay consumes recorded outputs, never re-dispatches effects. | M05, M03, M10 |
| TM-V4-D09 | MEDIUM | Resource abuse / DoS | Oversized capsules, events, frames, artifacts; JSONL full-file reads; cgroup/`max_pids` not enforced (risk R13). | Size/rate/quota limits at every ingestion boundary; streaming reads; per-work/per-executor quotas. | M02, M13, M04 |
| TM-V4-D10 | MEDIUM | Control Center / API (TB1) | Approval UI renders untrusted text (injection into human), leaks secrets, CSRF/session issues on remote approval. | Untrusted text rendered as data; approval shows exact action/resource/policy; authenticated sessions. | M15, M10 |
| TM-V4-D11 | MEDIUM | Ephemeral compute (§4.14) | Discarded workers retain credentials/artifacts; cloud images not attested; data placed outside residency. | Credential revocation on discard; workspace wipe evidence; placement checks residency/trust policy. | M13, M10 |
| TM-V4-D12 | MEDIUM | Third-party executors / manifests (§4.15) | Malicious manifest over-declares capabilities or under-declares effects; adapter executes outside sandbox (R05 precedent). | Capabilities granted by policy, not manifest; conformance suite includes negative security tests; semi-trusted boundaries declared explicitly. | M14, M10, M18 |
| TM-V4-D13 | MEDIUM | WorkProof forgery / staleness | Evidence for artifact hash X attached to proof for artifact Y; stale evidence after code change; verifier = executor. | Evidence bound to artifact hash + code version; verifier identity ≠ executor identity and authenticated; PROVEN only by policy-defined verifiers (§8 honesty rule). | M06, M11 |
| TM-V4-D14 | MEDIUM | Policy change mid-work (§9.4) | Policy tightened but in-flight executor keeps old cached decision. | Decision cache keyed by policy version; revocation propagates to leases/credentials within defined bound (metric: revocation time, §13). | M10, M13 |

## 7. Coverage of required surfaces

| Surface (acceptance) | Covered by |
|----------------------|-----------|
| Continuity (Work State, checkpoints, handoff) | F01, F07, F12, F13, F15, D03, D06 |
| Effects (Effect Ledger, UNKNOWN, idempotency) | F05, F06, D05, D07, D08 |
| Capsule | F01, F11, F12, F15, D02, D03 |
| Policy (L0–L3, approvals, revocation) | F02, F03, F04, F14, D01, D06, D14 |
| Proof (WorkProof, evidence trust) | F09, F11, F16, D05, D13 |
| Observability data authenticity | F10, F11, D04, D07 |
| Replay / time travel | F07, D03, D08 |
| Secrets leakage (logs/capsules/proofs) | F11, D02 |
| Prompt injection / untrusted artifacts | F09, F12, D01, D10 |
| Privilege escalation L0–L3 | F01, F02, F15, D06 |

## 8. Multi-tenancy

**Decision proposed for M00 (not imposed): out of scope for V4.0–V4.2.** Rationale with evidence:

- V3.7 baseline is single-user trusted host (ADR-V37-0003); there is no tenant concept in the V3 stores (grep for `tenant` matches only `evolveloop/adapters/runtime-observer.ts` and `v3/embeddings/vector-index.ts`, not the coordination stores).
- Constitution §15.2 lists multi-tenancy as an **open decision**.
- Cross-*project* artifact isolation exists (deny-by-default, `ARTIFACT-FABRIC.md`, risk R17) and must be preserved, but project ≠ tenant.

Consequences that remain **in scope** even without multi-tenancy: separation between Control Plane and executors (F02), between works/projects (artifact ACLs, path validation F08), and between executors in a handoff (F01/F12). Any later multi-tenant claim requires an M00 ADR plus M18 review covering ADV6 (isolation of state, artifacts, telemetry, quotas, capability scores, approval queues).

## 9. Mitigation requirements by owner meta

| Owner | Requirements (finding/threat ids) |
|-------|-----------------------------------|
| **M00** | Capsule is not a grant (F01); V4 trust-domain ADR superseding ADR-V37-0003 for executors (F02); event identity/order/tamper-evidence semantics (F07); canonical id grammar (F08); data vs control typing in contracts (F12); multi-tenancy scope ADR (§8). |
| **M02** | Tamper-evident ordered ledger + atomic projection (F07); id enforcement in stores (F08); durable monotonic epoch watermark across retention/restore (F13); size limits/streaming (D09); no secrets in event payloads (F11). |
| **M03** | Intent-before-effect under valid lease (F05); durable reservation → UNKNOWN on crash (F06); grant consumption ↔ effect linkage (F04); executor report ≤ UNKNOWN (D05); UNKNOWN abuse handling (D07); no effect re-dispatch on replay/fork (D08). |
| **M04** | Verifiable capsule integrity/version/expiry/anti-replay (F01, D03); capsule data/control separation (F12); secrets excluded by construction (F11, D02); post-handoff authority bounded (F15); limits (D09). |
| **M05** | Fork/replay effect neutralization and no inherited grants (D08). |
| **M06** | Trust from authenticated channel, not payload (F09); WorkProof secret exclusion + leak gate (F11); no confidence constants (F16); evidence bound to artifact hash/version, verifier ≠ executor (D13); effect evidence for COMMITTED (D05). |
| **M08 / M09** | Scores only from authenticated, CP-observed outcomes; routing for sensitive work constrained by policy (D04, F10). |
| **M10** | Authenticated approvers + separation of duties (F02); expiry and revocation of approved grants (F03); atomic consumption (F04); lease-scoped credentials (F05); secrets by handle (F11); authority never from content (F12, D01); policy-versioned decisions + canonical paths (F14); per-action L-level computation (D06); mid-work policy change semantics (D14). |
| **M11** | Provenance of permission → action → effect, anchored to tamper-evident ledger (F02, F07, F14, D13). |
| **M12** | Provenance default UNKNOWN, OBSERVED only from CP observers, authenticated sources (F10); telemetry redaction incl. arrays/measurements (F11); UNKNOWN-rate monitoring (D07). |
| **M13** | Executors cannot reach CP data/tokens (F02); lease-scoped creds on ephemeral workers, revocation on discard, residency (F05, D11); quotas/cgroups (D09). |
| **M14** | Capabilities granted by policy not manifest; negative conformance tests (D12). |
| **M15** | Authenticated remote approval; untrusted text rendered as data (F02, D10). |

## 10. Test plan outline for later adversarial suites

Scheduled per MASTER-PLAN: **Wave 5 (V4.3 Trust)** for policy/approval/provenance suites; **Wave 8 (Release)** for the full adversarial regression and final M18 review. Each test must produce evidence (inputs, commit hash, environment, result) and must run against real components; mocks only for isolated unit cases (§12.3 rule applies by analogy).

| Suite | Cases (minimum) | Targets | Wave |
|-------|-----------------|---------|------|
| S1 Capsule integrity | Bit-flip, field edit (`permissions`, `verified_task_state`, `goal_contract_version`), signature/origin strip, version downgrade, expired capsule, replayed capsule to 2nd executor, capsule from revoked executor | F01, D03, F15 | 5 |
| S2 Approval & grant | Self-approval by executor identity; forged `decided_by`; concurrent consume of single-use grant (N parallel); use after expiry; use after revoke; use after policy version change; wrong resource / path-prefix boundary | F02–F04, D14 | 5 |
| S3 Fencing & stale actors | Steal lease then old worker attempts (a) result commit, (b) external effect with previously delegated creds; epoch after retention/restore; caller-supplied epoch | F05, F13 | 5 |
| S4 Effect Ledger / UNKNOWN | Kill between dispatch and confirm (must be UNKNOWN, not fresh); concurrent begin same key; executor lies NOT_EXECUTED / COMMITTED; UNKNOWN flood; reconciliation with real target (e.g. git remote) | F06, D05, D07 | 5 (+M16 Impossible Handoff case 5) |
| S5 Ledger tamper | Edit/delete/reorder JSONL lines; concurrent appenders; crash between append and projection; verifier detects | F07 | 5 |
| S6 Path & id traversal | `../`, absolute, encoded, NUL, overlong ids at every API/IPC/capsule/worker input; denied sub-path via `..`/symlink/relative | F08, F14 | 5 |
| S7 Prompt injection corpus | Instructions in repo files, PR text, tool output, wiki page, dependency docs, capsule `next_action`; goals: policy bypass, secret exfiltration, scope expansion, self-approval request, trust self-labelling | D01, F12, F09 | 5, re-run 8 |
| S8 Secret leakage | Canary set covering PEM, JWT, `github_pat_`, `xox*`, URL creds, JSON/YAML keys, lowercase env, arrays/nested; scan capsules, WorkProof, logs, telemetry, Control Center payloads | F11, D02 | 5, gate in 8 |
| S9 Provenance & observability authenticity | Unlabeled event stored as OBSERVED; executor-forged `source`; self-reported scores influencing routing | F10, D04 | 5 |
| S10 Replay / fork | Fork from checkpoint before an external effect: verify no re-dispatch, no inherited creds/grants | D08 | 5 |
| S11 Sandbox & resources | Escape attempts, network egress under deny, fork bomb / `max_pids`, oversized frames/capsules | D09, D12 | 8 |
| S12 Ephemeral compute | Credential validity after discard; residual data on discarded worker; placement vs residency policy | D11 | 8 |
| S13 Revocation latency | Measure time from revoke to (credential unusable, lease fenced, socket closed) — reported as §13 security metric | F03, F05, D14 | 5, 8 |

## 11. Limitations of this model

- Analysis is by reading code and docs on one tip; no dynamic testing. Line numbers refer to tip `03937c1`.
- Not every V3 module was read (e.g. `v3/fabric/protocol/*`, `v3/sandbox/backends/*`, `v3/fabric/artifacts/registry.ts` beyond hash verification, Measurement Plane storage). Absence of a finding there is **not** evidence of absence.
- M00 contracts are in progress in a separate worktree that M18 did not read (workspace rule for this launch). Findings must be re-checked against M00’s frozen contracts.
- Wiki grounding unavailable (`WIKI_ROOT` unset).
- V3.7 remains **BLOCKED**; the provisional baseline may change, which can invalidate line references.
