# EvolveLoop V4 — Ownership map (M00–M20)

Rule: one writer per aggregate (ARCHITECTURE §5). Cross-meta use is through `ports.ts` only. Directory paths are **declared**; creating them is the owner meta's job. M00 does not implement engines.

V3.7 cert surfaces (`recovery/v37-full-cert`, certification evidence) are **owned by the V3.7 cert process**, not by any V4 meta. Forbidden to edit.

## Directories

| Path | Owner | Notes |
|------|-------|-------|
| `orchestrator/src/v4/contracts/**` | **M00** | Canonical contracts. Freeze via ADR-V4-0001. |
| `orchestrator/tests/v4/contracts/**` | **M00** | Schema / invariant tests |
| `orchestrator/tests/v4/conformance/**` | **M00** | Consumer hooks |
| `docs/v4/architecture/**` | **M00** | This package |
| `docs/v4/contracts/**` | **M00** | Catalog (docs of TS) |
| `docs/v4/adr/ADR-V4-*.md` | **M00** | Domain metas may propose superseding ADRs via RFC |
| `docs/v4/EvolveLoop_V4_*.md` | Orchestrator / product | Constitution + mission; M00 does not rewrite |
| `docs/v4-orchestration/**` | Orchestrator | Control plane of the V4 build |
| `docs/v4/security/**` | **M18** | Threat model; M00 may copy read-only |
| `orchestrator/src/v4/goal/**`, `work/**` | **M01** | |
| `orchestrator/src/v4/ledger/**`, `checkpoint/**`, `artifacts/**` | **M02** | |
| `orchestrator/src/v4/effects/**` | **M03** | |
| `orchestrator/src/v4/continuity/**` | **M04** | capsule, handoff, recovery |
| `orchestrator/src/v4/timetravel/**` | **M05** | |
| `orchestrator/src/v4/proof/**` | **M06** | |
| `orchestrator/src/v4/planning/**` | **M07** | |
| `orchestrator/src/v4/capability/**` | **M08** | |
| `orchestrator/src/v4/adaptive/**` | **M09** | |
| `orchestrator/src/v4/policy/**` | **M10** | |
| `orchestrator/src/v4/provenance/**` | **M11** | read model |
| `orchestrator/src/v4/observability/**` | **M12** | wraps `telemetry/measurement-plane` |
| `orchestrator/src/v4/execution/**`, `compute/**` | **M13** | |
| `orchestrator/src/v4/ecosystem/**` | **M14** | |
| `orchestrator/src/v4/api/**`, `cli/**`, `sdk/**` | **M15** | Control Center UI location: M15 RFC |
| `orchestrator/src/v4/engineering/**` | **M16** | Impossible Handoff + real workflows |
| `orchestrator/tests/v4/<module>/**` | same as source | |
| `orchestrator/src/v4/adapters/v37/ledger.ts` (name TBD) | **M02** | ArtifactFabric + fencing-at-append |
| `orchestrator/src/v4/adapters/v37/execution.ts` | **M13** | protocol, placement, node registry, leases |
| `orchestrator/src/v4/adapters/v37/policy.ts` | **M10** | approvals broker adapter (must not keep F02 fallback) |
| `orchestrator/src/v4/adapters/v37/identity.ts` | **M10** / **M13** | signatures, enrollment |
| `orchestrator/src/v3/**` | V3.7 maintainers | **read via adapters only** |
| `orchestrator/src/telemetry/measurement-plane/**` | V3 MP; V4 wrap = **M12** | |
| `orchestrator/src/evidence/**` | V3 evidence; V4 must not reuse confidence constants | M06 owns V4 proof |
| Metrics/baselines docs | **M17** | |
| Integration branch `feature/v4-integration` | **M19** | M00 does not merge |
| Independent audit | **M20** | |

## Constitution chapters → owners

Matches `docs/v4-orchestration/REQUIREMENTS-MATRIX.md` (no orphans). M00 owns 1, 2, 3, 5, 6, 7, 14 (with orchestrator), 15.1 (with M18), 15.2, 17. Domain chapters 4.x as in the matrix. M18 owns 9 with M10. M20 owns 16.

## Aggregates → single writer

See ARCHITECTURE.md §5. Event *types* → producer: `EVENT_TYPE_CATALOG` in `work-event.ts`.

## M18 mitigation owners (not duplicated)

Threat model §9. M00 items are ADRs 0003, 0006, 0014, 0015, 0016, 0017. Other metas implement in their waves.

## RFC rule

Changing another meta's future directory or a FROZEN contract requires an RFC. M00 will not absorb M01–M17/M19 engines.
