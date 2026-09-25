# EvolveLoop V3 — Meta0 Public Proof Demos

**Status:** scaffold — catalog + honest stub (V3-F6 start)  
**Fontes:** `v3-metas-topo.md` DEMO-001..008; [`meta0-evidence-demo.yaml`](../../../orchestrator/contracts/v3/meta0-evidence-demo.yaml)  
**Schema:** `DemoManifest` / `EvidencePackageManifest` (`evolveloop.io/v3`, `0.1.2`)

## Purpose

Transform “confie que funciona” into a **public, reproducible demo catalog**. This wave ships manifests + a stub runner that **never fakes PASS**.

```text
CLONE → INSTALL → RUN stub → INSPECT status (NOT_MEASURED|BLOCKED)
```

Live measurement (sandbox + capabilities + SuccessOracle → EvidencePackage) remains a GAP until the Meta0 runner is implemented.

## Catalog

| ID | Title | Fixture |
|----|-------|---------|
| DEMO-001 | Unknown repository task | [`DEMO-001.yaml`](../../../orchestrator/demos/v3/DEMO-001.yaml) |
| DEMO-002 | Broken application recovery | [`DEMO-002.yaml`](../../../orchestrator/demos/v3/DEMO-002.yaml) |
| DEMO-003 | Missing capability acquisition | [`DEMO-003.yaml`](../../../orchestrator/demos/v3/DEMO-003.yaml) |
| DEMO-004 | Novel debugging task | [`DEMO-004.yaml`](../../../orchestrator/demos/v3/DEMO-004.yaml) |
| DEMO-005 | Long-horizon engineering | [`DEMO-005.yaml`](../../../orchestrator/demos/v3/DEMO-005.yaml) |
| DEMO-006 | Provider failure recovery | [`DEMO-006.yaml`](../../../orchestrator/demos/v3/DEMO-006.yaml) |
| DEMO-007 | External-world interaction | [`DEMO-007.yaml`](../../../orchestrator/demos/v3/DEMO-007.yaml) |
| DEMO-008 | Self-testing / adversarial verification | [`DEMO-008.yaml`](../../../orchestrator/demos/v3/DEMO-008.yaml) |

Each manifest declares `required_capabilities`, `requires_sandbox: true`, and `result: NOT_MEASURED`.

## Code surface

| Module | Role |
|--------|------|
| `orchestrator/src/v3/meta0/catalog.ts` | `loadDemo`, `listDemos`, `defaultDemosDir` |
| `orchestrator/src/v3/meta0/run-stub.ts` | `runDemoStub` → `OutcomeStatus` |
| `orchestrator/src/cli/run-demo.ts` | CLI list / stub-run |
| `orchestrator/tests/unit/v3/meta0.test.ts` | unit coverage |

Validation: every load path calls `validateDemoManifest`.

## CLI

From `orchestrator/`:

```bash
# Catalog integrity + stub honesty (preferred until full package tsc is green)
npm test -- --run tests/unit/v3/meta0.test.ts

# After `npm run build` succeeds:
npm run run-demo -- --list
npm run run-demo -- DEMO-003
node dist/cli/run-demo.js DEMO-001
```

Stub exit codes: `0` for `NOT_MEASURED` (honest gap); `1` for `BLOCKED` (missing/invalid manifest).

## Stub semantics (inegociável)

| Condition | Status |
|-----------|--------|
| Invalid / missing manifest | `BLOCKED` |
| Missing `required_capabilities` vs context | `NOT_MEASURED` |
| `requires_sandbox` and sandbox not ready | `NOT_MEASURED` |
| Catalog OK but no live runner | `NOT_MEASURED` |
| `runtime_ready` set on stub | `BLOCKED` (still refuses PASS) |
| Success without oracle evidence | **never emitted** |

## Flow

```text
DemoManifest YAML
      ↓
validateDemoManifest
      ↓
runDemoStub(context?)
      ↓
OutcomeStatus ∈ {NOT_MEASURED, BLOCKED, …}  — PASS forbidden in stub
```

## GAP

- Demos are **not** runnable end-to-end (no live sandbox / evidence package writer).
- Meta0 doctrine still lives primarily in `v3-metas-topo.md` (GAP vs `EVOLVELOOP_V3.md` body).
- EvidencePackage generation and third-party verify CLI are future work.
