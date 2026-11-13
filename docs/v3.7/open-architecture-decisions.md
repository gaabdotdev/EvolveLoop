# Open Architectural Decisions — V3.7

**Status:** hypotheses for decision — **not approved**.  
**Confidence scale:** High / Medium / Low (auditor judgment from evidence).

---

## D01 — Integration spine (merge base)

| Field | Content |
|-------|---------|
| **Problem** | V3.5, V3.6, and bench-obs diverge from `6b69c3f`. HEAD lacks Runtime/Ops. |
| **Alternatives** | A) Merge V3.6 tip into integration branch + cherry-pick bench-obs · B) Merge bench-obs then V3.5/V3.6 · C) Keep parallel lines and design V3.7 abstractly |
| **Pros/Cons** | A reuses Ops+Runtime spine (best). B puts observability first but rebases larger Runtime. C maximizes confusion. |
| **Impacts** | All V3.7 modules; CLI; tests; docs paths |
| **Dependencies** | Explicit human merge authorization |
| **Preliminary recommendation** | **A** — integration branch from `feature/v3.6-multi-workflow` (`5c1df88`), then port Measurement Plane |
| **Confidence** | High |

---

## D02 — Control Plane cardinality

| Field | Content |
|-------|---------|
| **Problem** | Single CoordinatorDaemon today; fleet needs authority without split-brain. |
| **Alternatives** | A) Single Control Plane leader · B) Multi-CP with quorum · C) Hierarchical regional CPs |
| **Pros/Cons** | A simplest, matches V3.5 LeaderLock. B HA but new consensus. C scale + complexity. |
| **Impacts** | Enrollment, scheduling, fencing |
| **Dependencies** | D03, D04 |
| **Preliminary recommendation** | **A** for V3.7.0–V3.7.3; design interfaces so B can arrive later |
| **Confidence** | Medium |

---

## D03 — Node authentication

| Field | Content |
|-------|---------|
| **Problem** | No Node Identity; V3.5 IPC uses local file token. |
| **Alternatives** | A) mTLS certs + CA · B) signed enrollment tokens + rotation · C) SSH-only bootstrap |
| **Pros/Cons** | A industry standard for fleet. B lighter ops. C weak for continuous API. |
| **Impacts** | Enrollment, revocation, transport |
| **Dependencies** | Secrets storage; operator UX |
| **Preliminary recommendation** | **A** (mTLS) with short-lived certs + CRL/OCSP-style revoke list in Control Plane |
| **Confidence** | Medium |

---

## D04 — Worker connectivity model

| Field | Content |
|-------|---------|
| **Problem** | Must workers stay connected? |
| **Alternatives** | A) Always-connected heartbeats · B) Temporarily disconnected execution with reconcile · C) Hybrid |
| **Pros/Cons** | A simpler fencing. B needed for laptops/flaky nets but hard. C matches reality. |
| **Impacts** | Leases, work stealing, recovery |
| **Dependencies** | D03, checkpoint portability |
| **Preliminary recommendation** | **C** — connected required for admit/steal; allow disconnect during execution with lease expiry → RECOVERING |
| **Confidence** | Medium |

---

## D05 — Communication style

| Field | Content |
|-------|---------|
| **Problem** | Sync RPC vs async events for Control↔Worker. |
| **Alternatives** | A) Sync gRPC/HTTP · B) Async queue · C) Hybrid (sync control, async telemetry) |
| **Pros/Cons** | C reuses mental model of V3.5 IPC methods + MP event stream |
| **Preliminary recommendation** | **C** |
| **Confidence** | Medium |

---

## D06 — Global authority location

| Field | Content |
|-------|---------|
| **Problem** | Who owns admission, fencing, revoke? |
| **Alternatives** | A) Extend GlobalOpsService · B) New FleetControlPlane · C) Keep Ops local + separate Fleet |
| **Pros/Cons** | A reuses admission/queue. B cleaner distributed boundary. C duplicates. |
| **Preliminary recommendation** | **A evolving into B** — extend Ops interfaces first; extract Fleet module when multi-host lands |
| **Confidence** | Medium |

---

## D07 — Artifact distribution

| Field | Content |
|-------|---------|
| **Problem** | How to move workspaces/artifacts across nodes? |
| **Alternatives** | A) Content-addressed store + pull · B) rsync/git bundle workspaces · C) Shared network FS · D) Re-clone + patch |
| **Pros/Cons** | A integrity/dedup. B pragmatic for git repos. C ops-simple but trust/leak risk. D slow. |
| **Preliminary recommendation** | **B for workspaces (git)** + **A for opaque artifacts**; avoid C as default |
| **Confidence** | Medium |

---

## D08 — Knowledge fabric vs existing Wiki

| Field | Content |
|-------|---------|
| **Problem** | Risk of second memory system. |
| **Alternatives** | A) Keep Wiki/KnowledgeBackend local per project · B) Replicated vault · C) New distributed KG |
| **Pros/Cons** | A respects current design. B sync complexity. C overengineering without proven need. |
| **Preliminary recommendation** | **A** + explicit artifact handoff packages; no new KG until measured pain |
| **Confidence** | High |

---

## D09 — Scheduling placement

| Field | Content |
|-------|---------|
| **Problem** | Extend V3.6 scheduler or replace? |
| **Alternatives** | A) Add `node_id`/capability dimensions to GlobalOps · B) New distributed scheduler · C) External k8s-like |
| **Pros/Cons** | A lowest rewrite. B clean but costly. C heavy dependency. |
| **Preliminary recommendation** | **A** |
| **Confidence** | High |

---

## D10 — Preventing split-brain / fencing

| Field | Content |
|-------|---------|
| **Problem** | Two nodes may think they own a task. |
| **Alternatives** | A) Generation + fencing token (extend WorkLock) · B) Consensus log · C) Shared DB lease |
| **Pros/Cons** | A aligns with existing locks. B stronger HA. C new SPOF. |
| **Preliminary recommendation** | **A** for V3.7.0–.4 |
| **Confidence** | High |

---

## D11 — Topology mutability mid-run

| Field | Content |
|-------|---------|
| **Problem** | Can hierarchy → fan-out change during execution? |
| **Alternatives** | A) Fixed at admit · B) Restricted replans · C) Fully dynamic |
| **Pros/Cons** | A safest. B matches EngineeringLoop REPLAN. C hard + ROI unclear. |
| **Preliminary recommendation** | **B** — topology class fixed; depth/fan-out adjustable via replan under budget |
| **Confidence** | Medium |

---

## D12 — GPU / heterogeneous pools

| Field | Content |
|-------|---------|
| **Problem** | Capability discovery for GPU/VRAM not in HostCapacity today. |
| **Alternatives** | A) Extend HostCapacity schema · B) Separate DeviceRegistry · C) Defer |
| **Pros/Cons** | A incremental. B cleaner long-term. C blocks GPU pools. |
| **Preliminary recommendation** | **A** in V3.7.3 with honest UNKNOWN until probed |
| **Confidence** | Medium |

---

## D13 — Cross-project isolation across nodes

| Field | Content |
|-------|---------|
| **Problem** | V3.6 isolation is path-local; multi-node needs stronger tenancy. |
| **Alternatives** | A) Per-project node allowlists · B) Hard tenancy namespaces · C) Shared workers with policy |
| **Preliminary recommendation** | **A then B** — start allowlists; move to namespaces when fleet grows |
| **Confidence** | Medium |

---

## Decision gate for official goals doc

Do **not** write V3.7 goals until **D01, D02, D03, D06, D10** have explicit owner decisions recorded as ADRs.
