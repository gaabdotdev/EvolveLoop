# EvolveLoop V3 — Independent Reconstruction (NOW)

| Field | Value |
|-------|-------|
| **Role** | Independent explore / reconstruction (≠ implementer reports) |
| **Baseline** | `556473fb0e7c2172be4eb5da5112a5b2c7e826ce` (`v3-audit-baseline` / `checkpoint(v3): immutable pre-hardening audit baseline`) |
| **Branch** | `evolve-v3-hardening` |
| **Date** | 2026-09-24 |
| **Parent cycle** | `evolveloop-v3-h0` |
| **Knowledge** | `applied_with_gap` — vault `EvolveLoop/log.md` only; pack wiki ausente |
| **Hearsay** | `.agent_history.md`, `docs/architecture/v3/MASTER-MODEL.md` treated as **UNVERIFIED** claims |
| **Contract chain** | Intent→Capability→Policy→Runtime→Provider→Evidence |
| **Code fixes** | **NONE** (recon only) |

**Measured this turn:** `npm test -- --run tests/unit/v3` → **113 passed / 8 files** (Node 24.18.0). MASTER-MODEL’s “110 PASS” is **stale/unverified**.

---

## 1. WHAT EXISTS (paths only)

### 1.1 Spec / architecture docs

| Path |
|------|
| `/home/gaab/Documentos/GitHub/EvolveLoop/EVOLVELOOP_V3.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/v3-metas-topo.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/AGENCY.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/AGENCY-RUNTIME.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/CAPABILITY-FABRIC.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/CONTRACTS.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/FAILURE-RECOVERY.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/MASTER-MODEL.md` *(hearsay)* |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/META0-DEMOS.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/OWNERS.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/WORLD-MODEL.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/hardening/SSOT.md` |
| `/home/gaab/Documentos/GitHub/EvolveLoop/docs/architecture/v3/hardening/INDEPENDENT-RECON.md` *(this file)* |

### 1.2 YAML contracts (`orchestrator/contracts/v3/`)

| Path |
|------|
| `.../autonomy-governor.yaml` |
| `.../belief-observation.yaml` |
| `.../capability-lifecycle.yaml` |
| `.../checkpoint-v3.yaml` |
| `.../delegation-contract-stub.yaml` |
| `.../effect-idempotency.yaml` |
| `.../evidence-lineage.yaml` |
| `.../evolution-candidate-stub.yaml` |
| `.../goal-contract.yaml` |
| `.../instruction-hierarchy.yaml` |
| `.../memory-trust.yaml` |
| `.../meta0-evidence-demo.yaml` |
| `.../safety-sandbox.yaml` |
| `.../success-oracle.yaml` |

### 1.3 TypeScript modules (`orchestrator/src/v3/`)

| Module | Paths |
|--------|-------|
| **barrel** | `index.ts` |
| **contracts** | `contracts/{common,types,validators,enforcement,index}.ts` |
| **goals** | `goals/{goal-store,success-oracle,errors,index}.ts` |
| **agency** | `agency/{agency-loop,governor,bridge,types,index}.ts` |
| **world-model** | `world-model/{world-model-store,reconcile,belief-revision,assert,types,errors,index}.ts` |
| **fabric** | `fabric/{discovery,composition,acquisition,lifecycle,bridge,types,index}.ts` |
| **failure** | `failure/{classify-outcome,containment,recovery-hierarchy,stagnation,safety-transitions,types,errors,index}.ts` |
| **adapters** | `adapters/{agency-runtime,agency-bridge,index}.ts` |
| **meta0** | `meta0/{catalog,run-stub,types,errors,index}.ts` |

### 1.4 Meta0 demos + CLI

| Path |
|------|
| `orchestrator/demos/v3/DEMO-001.yaml` … `DEMO-008.yaml` |
| `orchestrator/src/cli/run-demo.ts` |
| `orchestrator/package.json` → script `run-demo` |

### 1.5 Unit tests (V3)

| Path |
|------|
| `orchestrator/tests/unit/v3/agency-runtime.test.ts` |
| `orchestrator/tests/unit/v3/agency.test.ts` |
| `orchestrator/tests/unit/v3/contracts.test.ts` |
| `orchestrator/tests/unit/v3/fabric.test.ts` |
| `orchestrator/tests/unit/v3/failure.test.ts` |
| `orchestrator/tests/unit/v3/goals.test.ts` |
| `orchestrator/tests/unit/v3/meta0.test.ts` |
| `orchestrator/tests/unit/v3/world-model.test.ts` |

### 1.6 V2 substrate consumed by V3 runtime (not V3-owned)

| Path | Role in chain |
|------|----------------|
| `orchestrator/src/engine/execution-engine.ts` | Runtime |
| `orchestrator/src/policies/policy-engine.ts` | Policy |
| `orchestrator/src/scheduler/scheduler.ts` | Provider schedule |
| `orchestrator/src/orchestrator/orchestrator.ts` | Blocked-path decisions |
| `orchestrator/src/providers/*` | Provider |
| `orchestrator/src/evidence/*` | Evidence builders/validators |
| `orchestrator/src/memory/*` | MemoryStore V2 |
| `orchestrator/src/registry/*` | CapabilityRegistry |
| `orchestrator/src/evolveloop/*` | V2 self-evolution (separate from V3 stubs) |

### 1.7 Public export

| Path | Note |
|------|------|
| `orchestrator/src/index.ts` | `export * from "./v3/index.js"` |

---

## 2. WHAT IS DECLARED vs ENFORCED

Legend: **Schema** = types/YAML/validators only · **Module** = library callable · **Runtime** = on `runAgencyRuntime` / Engine path · **OS** = real isolation.

| Declaration | Where declared | Enforced how | Gap |
|-------------|----------------|--------------|-----|
| GoalContract lifecycle §176 | YAML + `types` + `GoalStore` | Module transitions + validators | No portfolio daemon; single-tick agency only |
| SuccessOracle criteria | YAML + `SuccessOracle` | Runtime: oracle after engine; AR-C01 eligible refs | Stub methods only; no live external oracle |
| AutonomyGovernor matrix FW-H01 | `enforcement` + `governor` | Runtime: `governor.decide` before run | Does not rewrite PolicyEngine |
| SandboxDepth / effect mins FW-H02 | `enforcement` + `SafetySandboxContext` | Schema + AcquisitionGate stub + **host attestation** gate in runtime | **No OS sandbox** |
| InstructionHierarchy FW-H03 | YAML + validators + `assertInstructionHierarchyConstraints` | Schema/tests only | **Not consulted by agency-runtime** |
| MemoryTrust FW-H04 | `annotateMemoryEntry` | Schema + unit test | **Not wired into Engine MemoryStore path** |
| EvidenceLineage | YAML + validator | Schema only | Runtime uses string refs `evidence:`/`lineage:`/`check:`; no Lineage object write |
| EffectIdempotencyDeclaration | YAML + validator | Schema only | Unwired in runtime |
| CheckpointSchemaV3 | YAML + validator | Schema only | Engine uses V2 job checkpoint, not V3 schema |
| EvolutionCandidateStub | YAML + validator | Schema only | **No promote** in V3; V2 evolveloop has separate candidate pipeline |
| DelegationContractStub | YAML + validator | Schema only | **No multi-agent runtime** |
| CapabilityLifecycleRecord | YAML + fabric lifecycle helpers | Fabric discovery ranking | Does not mutate registry |
| AcquisitionGate | `fabric/acquisition.ts` | Module + fabric tests | **Not called by agency-runtime** |
| Fabric discover/compose | fabric modules + bridge | Runtime optional enrichment | Multi-step → `needs_planner` (no execute compose) |
| World Model Observation≠Belief | world-model store | Module + agency consumes snapshot | No live “observe actual world” sensors |
| Zero silent failure statuses | `classifyOutcome` | Runtime classify + oracle | Helpers only; Engine success≠PASS |
| Failure containment | `selectContainment` | Runtime post-oracle | Advisory safety_state; no kill/OS quarantine |
| RecoveryHierarchy | `failure/recovery-hierarchy.ts` | Module + failure tests | **Not wired into agency-runtime** |
| StagnationDetector | failure + runtime | Runtime observe/evaluate | In-memory window only |
| Meta0 DemoManifest / EvidencePackage | YAML + catalog/stub | CLI stub never PASS | No live measured runner / EvidencePackage writer |
| Persistent agency / long-horizon | Spec Meta 2/38 | — | AgencyLoop **explicitly not daemon** |
| Real sandbox (Meta 19) | Spec + SafetySandbox schema | Attestation flag/env/depth | **NOT_IMPLEMENTED OS** |

---

## 3. RUNTIME PATH TRACE — agency-runtime → ExecutionEngine

Call graph with line refs (source of truth: tree at baseline + working tree inspected 2026-09-24).

```text
AgencyRuntime.run (agency-runtime.ts:806-811)
  └─ runAgencyRuntime (agency-runtime.ts:394-804)
       │
       ├─ resolveWorld (288-293)  [WorldModelStore.toSnapshot | WorldSnapshot]
       ├─ AgencyLoop.step / runAgencyStep (411-416 → agency-loop.ts:102-145 / 147-151)
       │     └─ proposals from GoalPortfolio actionable states + world grounding
       │
       └─ FOR each proposal:
            ├─ AutonomyGovernor.decide / decideAutonomy (425-432 → governor.ts:140-153 / 44-74)
            │     └─ assertAutonomyGovernorDecisionConstraints (enforcement.ts:98+)
            │     └─ validateAutonomyGovernorDecision (validators)
            │
            ├─ [deny] → BLOCKED, no engine (441-452)
            ├─ [degrade] → DEGRADED, skip engine (455-510)   # AR-H02
            ├─ [confirm w/o approval] → UNCERTAIN (513-532)
            │
            ├─ proposalToCapabilityIRWithFabric (547-553 → fabric/bridge.ts:65-121)
            │     ├─ enrichProposalWithFabric → discoverCapabilities + planComposition
            │     │     (discovery.ts / composition.ts) — NO execute
            │     ├─ multi-step → needs_planner composition_pending (97-108)  # AR-H03
            │     └─ proposalToCapabilityIR (agency/bridge.ts:28-109) — IR skeleton only
            │
            ├─ [needs_planner no fixture] → NOT_MEASURED (586-596)
            ├─ [composition_pending] → PARTIAL, no engine (567-579)
            │
            ├─ hasSandboxAttestation / requiresSandboxAttestation (602-619)
            │     └─ assertEffectAllowedAtDepth (enforcement) if SafetySandboxContext
            │     # SEC-001 PARTIAL — host flag/env/schema depth; NOT OS
            │
            ├─ options.engine.run({ ir, policy_id, feature_id })  ★ (622-626)
            │     └─ ExecutionEngine.run (execution-engine.ts:118+)
            │           ├─ validateIR
            │           ├─ PolicyEngine.resolve (124-125)
            │           ├─ MemoryStore.initFeature
            │           ├─ Scheduler + GraphStore loop (maxIterations 500)
            │           │     ├─ scheduler.readyNodes / schedule
            │           │     ├─ selectProvider → ProviderRouter
            │           │     └─ evidence accumulation + validateEvidence
            │           └─ Orchestrator.decide on blocked_reason
            │
            ├─ evidenceRefsFromRun (298-316) → filterEligibleEvidenceRefs
            ├─ classifyOutcome provisional (634-640)
            │
            └─ AFTER all proposals:
                 ├─ SuccessOracle.evaluateGoal (736 → goals/success-oracle.ts)
                 ├─ classifyOutcome on oracle decision (739-740)
                 ├─ StagnationDetector.observe (762-768)
                 └─ selectContainment + safety transitions (775-789)
                      # RecoveryHierarchy NOT invoked
```

**Authority note:** Agency proposes + gates; **PolicyEngine inside ExecutionEngine** remains execution authority. AgencyLayer `bridge.ts` / `agency-bridge.ts` never call `engine.run`.

**Chain mapping (this tick):**

| Stage | Component |
|-------|-----------|
| Intent | `AgencyProposal.intent` from GoalContract |
| Capability | `capability_hint` / Fabric discovery → IR node.capability |
| Policy | `policy_id` → `PolicyEngine.resolve` |
| Runtime | `ExecutionEngine.run` + Scheduler |
| Provider | `ProviderRouter` / discovery |
| Evidence | Engine `Evidence[]` → eligible refs → SuccessOracle |

---

## 4. DEAD / ORPHAN / UNWIRED

| Item | Exists as | Wired into `runAgencyRuntime`? | Verdict |
|------|-----------|--------------------------------|---------|
| **AcquisitionGate** | `fabric/acquisition.ts` | No | **UNWIRED** (unit-tested only) |
| **EvolutionCandidateStub (V3)** | schema/validator | No | **ORPHAN schema** — no promote API |
| **V2 EvolutionCandidateGenerator** | `evolveloop/` | Via optional Engine observer only | Parallel stack; not V3 promote |
| **InstructionHierarchyBinding** | schema/enforcement | No | **UNWIRED in runtime** |
| **DelegationContractStub / Multi-agent** | schema | No | **NOT_IMPLEMENTED** |
| **OS Sandbox / process isolation** | Spec Meta 19; schema S0–S5 | Attestation only | **NOT_IMPLEMENTED** |
| **Self-evolution promote (V3)** | stub comment “no promote” | No | **NOT_IMPLEMENTED** |
| **Long-horizon daemon / heartbeat** | Spec Meta 2/38 | AgencyLoop forbids daemon | **NOT_IMPLEMENTED** |
| **RecoveryHierarchy** | failure module | No (containment only) | **UNWIRED** |
| **EffectIdempotencyDeclaration** | schema | No | **ORPHAN schema** |
| **CheckpointSchemaV3** | schema | No | **ORPHAN schema** (V2 checkpoints separate) |
| **MemoryTrustAnnotation / annotateMemoryEntry** | enforcement helper | No Engine path | **UNWIRED** |
| **EvidenceLineage object builders** | schema | Refs only | **PARTIAL / unwired writer** |
| **Meta0 live runner / EvidencePackage emit** | stub + YAML | CLI stub | **STUB** — never PASS |
| **agency-bridge.ts** | re-exports | Indirect via fabric symbols | Thin; non-executing |
| **Planner LLM** | — | fixtures only | **ABSENT** |
| **Browser OS handlers in fabric** | profiles mention | No handlers | Documented GAP in fabric tests |

---

## 5. REQUIREMENT TRACEABILITY

Statuses: `PASS` | `PARTIAL` | `FAIL` | `UNVERIFIED` | `NOT_MEASURED`  
Rule: **PASS only if SPEC→RUNTIME→TEST→EVIDENCE all hold for the meta’s core claim.**

### Meta 1 — Autonomia ponta a ponta (OBJETIVO→OUTCOME sem comandos intermediários)

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 1 (interpret→…→deliver) |
| **COMPONENT** | `AgencyLoop` + `agency-runtime` + `ExecutionEngine` |
| **SOURCE** | `agency-loop.ts`, `agency-runtime.ts`, `execution-engine.ts` |
| **RUNTIME** | Single tick; many paths stop at NOT_MEASURED / needs_planner / confirm |
| **TEST** | `agency-runtime.test.ts` (gated paths), not e2e autonomy |
| **EVIDENCE** | Unit 113 PASS (suite); no long autonomy benchmark run this turn |
| **STATUS** | **PARTIAL** |

### Meta 3 — Goal Contract + Success Oracle

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 3 |
| **COMPONENT** | `GoalStore`, `SuccessOracle`, GoalContract validators |
| **SOURCE** | `goals/*`, `contracts/types.ts`, `goal-contract.yaml`, `success-oracle.yaml` |
| **RUNTIME** | Oracle evaluates post-run; blocks PASS without eligible evidence |
| **TEST** | `goals.test.ts`, `agency-runtime.test.ts` AR-C01 |
| **EVIDENCE** | Measured unit tests |
| **STATUS** | **PARTIAL** (stub criterion types; no rich real-world criteria suite) |

### Meta 11 — World Model

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 11 |
| **COMPONENT** | `WorldModelStore`, Observation/Belief |
| **SOURCE** | `world-model/*`, `belief-observation.yaml` |
| **RUNTIME** | Snapshot → AgencyLoop rationale/risk bump only |
| **TEST** | `world-model.test.ts`, agency AR-H01 |
| **EVIDENCE** | Unit tests |
| **STATUS** | **PARTIAL** (substrate ≠ full repo/architecture world model) |

### Meta 13 — Dynamic Capability Discovery

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 13 |
| **COMPONENT** | `discoverCapabilities`, RegistryClient (V2) |
| **SOURCE** | `fabric/discovery.ts`, `fabric/bridge.ts` |
| **RUNTIME** | Optional enrich when hint missing |
| **TEST** | `fabric.test.ts` |
| **EVIDENCE** | Unit tests |
| **STATUS** | **PARTIAL** (no propose/build acquisition loop) |

### Meta 19 — Real Sandbox

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 19 — filesystem/process/network isolation |
| **COMPONENT** | `SafetySandboxContext` schema; `hasSandboxAttestation` |
| **SOURCE** | `safety-sandbox.yaml`, `agency-runtime.ts:67-161,602-619` |
| **RUNTIME** | Fail-closed on missing **host attestation**; comments admit NOT OS |
| **TEST** | SEC-001 cases in `agency-runtime.test.ts` |
| **EVIDENCE** | Code comments + tests for flag/depth only |
| **STATUS** | **FAIL** vs meta claim of real isolation (`NOT_IMPLEMENTED` OS) |

### Meta 36 — Zero Silent Failure

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 36 |
| **COMPONENT** | `classifyOutcome`, oracle fail-closed, AR-C01 |
| **SOURCE** | `failure/classify-outcome.ts`, `success-oracle.ts`, agency-runtime |
| **RUNTIME** | Engine success → PARTIAL until oracle; unknown↛PASS |
| **TEST** | `failure.test.ts`, goals/agency-runtime AR-C01 |
| **EVIDENCE** | Measured unit tests |
| **STATUS** | **PARTIAL** (V3 adapter path strong; full Engine surface not exhaustively proven) |

### Meta 38 — Persistent Agency

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 38 — observe/wait/wake loop |
| **COMPONENT** | `AgencyLoop` (documented single-step) |
| **SOURCE** | `agency-loop.ts:1-2,147-148` |
| **RUNTIME** | No daemon/heartbeat |
| **TEST** | Agency unit = one tick |
| **EVIDENCE** | Explicit code prohibition |
| **STATUS** | **FAIL** (not persistent agency) |

### Meta 44 — Autonomy Governor

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 44 |
| **COMPONENT** | `AutonomyGovernor` + FW-H01 matrix |
| **SOURCE** | `governor.ts`, `enforcement.ts`, `autonomy-governor.yaml` |
| **RUNTIME** | Every proposal gated before IR/engine |
| **TEST** | `agency.test.ts`, `contracts.test.ts` adversarial matrix |
| **EVIDENCE** | Measured unit tests |
| **STATUS** | **PARTIAL** (deterministic stub; not full impact/cost/env realism) |

### Meta 45 — Capability Fabric

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 45 NEED→DISCOVER→COMPOSE→…→EXECUTE |
| **COMPONENT** | discovery + composition + fabric bridge |
| **SOURCE** | `fabric/*` |
| **RUNTIME** | Discover/compose for hint; multi-step refuses execute; Acquisition unwired |
| **TEST** | `fabric.test.ts` AR-H03 |
| **EVIDENCE** | Unit tests |
| **STATUS** | **PARTIAL** (compose plan yes; authorize/execute compose chain incomplete) |

### Meta 61 — Failure Containment

| Field | Value |
|-------|-------|
| **SPEC** | `EVOLVELOOP_V3.md` § Meta 61 |
| **COMPONENT** | `selectContainment`, safety transitions, stagnation |
| **SOURCE** | `failure/containment.ts`, agency-runtime AR-C02 |
| **RUNTIME** | Report + safety_state updates; no OS kill / domain isolation |
| **TEST** | `failure.test.ts`, `agency-runtime.test.ts` AR-C02 |
| **EVIDENCE** | Measured unit tests |
| **STATUS** | **PARTIAL** |

### Meta 0 — Public proof / DX demos (catalog + honesty)

| Field | Value |
|-------|-------|
| **SPEC** | Meta0 doctrine (topo/docs; **GAP**: no numbered “Meta 0” section body found in `EVOLVELOOP_V3.md` via search) |
| **COMPONENT** | `meta0/catalog`, `runDemoStub`, `run-demo` CLI, DEMO-001..008 |
| **SOURCE** | `meta0/*`, `demos/v3/*`, `meta0-evidence-demo.yaml` |
| **RUNTIME** | Stub only; never PASS |
| **TEST** | `meta0.test.ts` (14) |
| **EVIDENCE** | Measured: stub refuses PASS |
| **STATUS** | **PARTIAL** (honest non-measurement ≠ public proof PASS) |

---

## 6. AUDIT GRAPH — OWNERS

Mapped from code ownership + `OWNERS.md` stub (contact column is stub, not verified people).

```text
                    ┌─────────────────────────────┐
                    │ Intent (Agency / Goals)     │
                    │ agency/*, goals/goal-store  │
                    │ OWNER: orchestrator-v3      │
                    └──────────────┬──────────────┘
                                   │ proposals
                    ┌──────────────▼──────────────┐
                    │ Policy / Governor           │
                    │ agency/governor + V2        │
                    │ PolicyEngine                │
                    │ OWNER: orchestrator-v3 +    │
                    │         V2 policy maintainers│
                    └──────────────┬──────────────┘
                                   │ allow path
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
┌─────────▼─────────┐   ┌──────────▼──────────┐   ┌─────────▼─────────┐
│ World / Memory    │   │ Capability Fabric   │   │ Execution         │
│ world-model/*     │   │ fabric/* + Registry │   │ ExecutionEngine   │
│ MemoryTrust UNWIRED│  │ Acquisition UNWIRED │   │ Scheduler/Orch    │
│ OWNER: v3 / V2 mem│   │ OWNER: v3 + registry│   │ OWNER: V2 engine  │
└─────────┬─────────┘   └──────────┬──────────┘   └─────────┬─────────┘
          │                        │                        │
          │              ┌─────────▼──────────┐             │
          │              │ Provider           │◄────────────┘
          │              │ ProviderRouter     │
          │              │ OWNER: V2 providers│
          │              └─────────┬──────────┘
          │                        │
┌─────────▼────────────────────────▼──────────┐
│ Evidence                                    │
│ V2 evidence builders + V3 eligible refs     │
│ EvidenceLineage schema (writer GAP)         │
│ SuccessOracle (goals/)                      │
│ OWNER: evidence-maintainers + orchestrator-v3│
└─────────────────────┬───────────────────────┘
                      │
           ┌──────────▼──────────┐
           │ Failure             │
           │ classify/contain/   │
           │ stagnate; Recovery  │
           │ Hierarchy UNWIRED   │
           │ OWNER: orchestrator-v3│
           └─────────────────────┘
```

| Area | Primary code | Doc owner stub |
|------|--------------|----------------|
| Agency | `src/v3/agency/*`, `adapters/agency-runtime.ts` | OWNERS → orchestrator-v3 |
| Goals | `src/v3/goals/*` | orchestrator-v3 |
| World | `src/v3/world-model/*` | orchestrator-v3 |
| Memory | V2 `src/memory/*` + V3 annotate helper only | V2 + FW-H04 stub |
| Capability | `src/v3/fabric/*` + V2 registry | orchestrator-v3 + registry-maintainers |
| Execution | `src/engine/execution-engine.ts` | V2 engine |
| Policy | `src/policies/policy-engine.ts` + Governor | V2 + v3 governor |
| Evidence | `src/evidence/*` + oracle refs | evidence-maintainers |
| Failure | `src/v3/failure/*` | orchestrator-v3 |

---

## 7. TOP 15 HYPOTHESIZED ATTACK SURFACES

Ranked by likely exploitability given **current** enforcement (not inherited PASS).

| # | Surface | Severity | Rationale (evidence-based) |
|---|---------|----------|------------------------------|
| 1 | **Host sandbox attestation bypass** (`sandbox_attestation=true` / `EVOLVELOOP_SANDBOX_ATTESTATION`) | **CRITICAL** | Boolean/env grants high-risk execute path with **zero OS isolation** (`agency-runtime.ts` SEC-001 comments) |
| 2 | **SafetySandboxContext depth forgery** | **CRITICAL** | Schema depth alone satisfies attestation; attacker-controlled context → false “sandboxed” |
| 3 | **IR fixture injection** (`ir_fixtures`) | **CRITICAL** | Host/test injection runs arbitrary CapabilityIR through Engine once governor allows |
| 4 | **Capability hint / Fabric steps[0] trust** | **HIGH** | Single-step enriched hint becomes IR capability string; registry poisoning → wrong provider |
| 5 | **Policy_id defaulting / agency-default-policy** | **HIGH** | Governor may attach default policy_ref; mis-resolve → weaker Policy than intended |
| 6 | **Provider / JobFile / Cursor skill side effects** | **HIGH** | Engine still invokes real providers under Policy; V3 gates don’t add OS jail |
| 7 | **Oracle presence_of_evidence ref crafting** | **HIGH** | Eligible prefix `evidence:`/`lineage:`/`check:` — if upstream can mint refs without real Evidence objects, false PASS |
| 8 | **Confirm approval set confusion** | **HIGH** | Approvals keyed by `proposal_id` **or** `goal_id` — coarse approval may over-authorize |
| 9 | **degrade skip vs “restricted execute” gap** | **HIGH** | Degrade skips run entirely; no constrained Policy mode — operators may flip to allow+attestation instead |
| 10 | **InstructionHierarchy unwired** | **HIGH** | Prompt/instruction injection has no runtime hierarchy enforcement |
| 11 | **MemoryTrust unwired** | **HIGH** | Untrusted memory can influence V2 paths without V3 trust class checks |
| 12 | **AcquisitionGate not on runtime** | **HIGH** | Future install path could bypass gate if wired incorrectly; today gate is dead code |
| 13 | **Containment without hard isolation** | **MEDIUM→HIGH** | `safety_state` transitions are soft; QUARANTINED doesn’t kill providers/OS |
| 14 | **Stagnation / recovery not auto-driving Engine** | **MEDIUM** | RecoveryHierarchy unused — repeated FAIL loops depend on caller re-tick |
| 15 | **Meta0 / demo social-engineering PASS claims** | **MEDIUM** | Catalog exists; stub honest, but external docs/MASTER-MODEL numbers can be misread as measured autonomy |

---

## 8. VERDICT (consolidation)

**EvolveLoop V3 NOW** is an **additive foundation + one integrated tick adapter**:

- Contracts + validators + enforcement helpers (FW-H01–H04) exist.
- Agency → Governor → (Fabric) → **ExecutionEngine** → Oracle → Containment path exists and is unit-tested (**113** tests measured).
- Core metas for **real sandbox, persistent agency, multi-agent, acquisition install, self-evolution promote, long-horizon** are **not delivered**.
- Several schemas are **orphan** relative to runtime (InstructionHierarchy, EvolutionCandidateStub, Delegation, EffectIdempotency, CheckpointV3, AcquisitionGate, RecoveryHierarchy).

**Certification / COMPLETE:** **FORBIDDEN / NOT SUPPORTED** by this recon.  
**MASTER-MODEL checkpoint table:** **UNVERIFIED** as operational truth — used only as hearsay; measured test count already diverges (110 claimed vs **113** observed).

---

## 9. ENCERRAMENTO

| Item | Result |
|------|--------|
| Mission | Independent reconstruction written |
| Output | `docs/architecture/v3/hardening/INDEPENDENT-RECON.md` |
| Code changes | None |
| Wiki | `applied_with_gap` — append `EvolveLoop/log.md` |
| Next (outer) | Adversarial hardening against attestation/fixture/oracle surfaces — not claim PASS |

**Wiki / Fontes:** `EVOLVELOOP_V3.md`; `orchestrator/src/v3/**`; `orchestrator/src/engine/execution-engine.ts`; unit/v3 (113 PASS measured).  
**GAP:** vault pack EvolveLoop beyond `log.md`; Meta0 body absent in V3.md search; MASTER-MODEL evidence dirs not re-audited.
