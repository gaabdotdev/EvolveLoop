# META M00 — Delivery record

| Field | Value |
|-------|-------|
| Meta | M00 — Architecture & Domain Contracts |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m00` · `feature/v4/m00-architecture` |
| Baseline | `03937c175368715e893193fcfad09aac8474286b` (provisional; V3.7 **BLOCKED** on G17) |
| Merge to `feature/v4-integration` | **Not done** (forbidden for this meta) |
| Self-assessed status | **DELIVERED for orchestrator validation** — M00 does not mark itself ACCEPTED |
| Knowledge | `WIKI_ROOT` unset → GAP (B-WIKI); grounding = repo docs + code only |

## 1. Commits

On `feature/v4/m00-architecture` (no merge to integration):

| Hash | Message |
|------|---------|
| `55a810a` | feat(v4/m00): versioned domain contracts, normative rules and V3.7 adapter ports |
| `bb9988b` | docs(v4/m00): orchestrator directive — incorporate ACCEPTED M18 Wave 1 reqs |
| `e2099f1` | docs(v4/m00): single-writer lock for Gemini M00 owner (orchestrator) |
| `0a88109` | feat(v4/m00): encode M18 freeze invariants in domain contracts |
| docs commit | architecture, ADRs 0001–0017, ownership, catalog, delivery, review (this package) |

## 2. Files owned by M00

```
orchestrator/src/v4/contracts/**
orchestrator/tests/v4/contracts/**
orchestrator/tests/v4/conformance/**
docs/v4/architecture/**
docs/v4/contracts/**
docs/v4/adr/**
docs/v4/security/README.md          (copies of M18 docs are reference only; owner M18)
```

Engines (`goal/`, `ledger/`, …) are declared in OWNERSHIP-MAP and **not** implemented.

## 3. ADRs

See `docs/v4/adr/README.md`. §15.2 mapping:

| §15.2 topic | ADR | Status |
|-------------|-----|--------|
| Event Ledger | 0003 | PROPOSED-DEFAULT (hybrid log + projections + hash chain) |
| Persistência | 0004 | PROPOSED-DEFAULT |
| Checkpoint | 0005 | PROPOSED-DEFAULT |
| Execution Capsule | 0006 | PROPOSED-DEFAULT (includes capsule ≠ grant) |
| Fork e replay | 0007 | PROPOSED-DEFAULT |
| Effect Ledger / UNKNOWN | 0008 | PROPOSED-DEFAULT; no exactly-once |
| Verificação independente | 0009 | PROPOSED-DEFAULT |
| Capability Intelligence | 0010 | DEFERRED formula; disclosure frozen |
| Policy Engine | 0011 | DEFERRED language; decision contract frozen |
| Elastic Compute | 0012 | PROPOSED-DEFAULT properties; impl M13/V4.5 |
| Interoperabilidade | 0013 | PROPOSED-DEFAULT C0–C3 |
| Multi-tenancy | 0014 | DEFERRED / OOS V4.0–V4.2 |

Plus 0001 versioning, 0002 V3.7 adapters, 0015 id grammar, 0016 trust domain, 0017 data vs control.

## 4. M18 §9 six items

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 1 | Capsule ≠ grant (F01) | **Addressed** | ADR-V4-0006, INV-CAP-07/08, `CapsuleServicePort.accept` |
| 2 | V4 trust-domain ADR vs ADR-V37-0003 (F02) | **Addressed** | ADR-V4-0016 (SO_PEERCRED cited, not implemented) |
| 3 | Event identity/order/tamper-evidence (F07) | **Addressed** | ADR-V4-0003, INV-EVT-06 hash chain (residual: not a signature — review R1) |
| 4 | Canonical identifier grammar (F08) | **Addressed** | ADR-V4-0015, `isValidId` |
| 5 | Data vs control typing (F12, F09) | **Addressed** | ADR-V4-0017, INV-EVD-04, INV-EVT-05, field-class map |
| 6 | Multi-tenancy scope | **Addressed** | ADR-V4-0014 OOS V4.0–V4.2, `INV-TENANT-01` |

## 5. How consumers should depend on contracts

```ts
import { assertConforms, type WorkProof, decideRetry } from "../v4/contracts/index.js";
```

- Import **only** `orchestrator/src/v4/contracts/` (and later `v4/adapters/v37` implementations).
- Validate at every trust boundary (`assertConforms` / `isValidId`).
- Implement `ports.ts`; do not import another meta’s concrete classes. Wiring is M19.
- Treat stability as `PROPOSED` until orchestrator freeze → `FROZEN` (ADR-V4-0001).
- Reuse V3.7 via adapters; do not reimplement fabric; do not map `TRUE_PASS` to `VERIFIED`.

Runnable hooks:

```bash
cd orchestrator && npx vitest run tests/v4
# 23 tests (this delivery); node_modules is a symlink — do not npm install
```

## 6. Commands run

| Command | Result |
|---------|--------|
| `npx vitest run tests/v4` | 23 passed (2 files) |
| `npm install` | **not run** |
| merge to integration | **not run** |
| V3.7 cert edits | **not done** |

## 7. Residual open questions

- M10 policy language (Cedar vs Rego vs DSL) — gate Phase 5.
- M08 capability formula — gate Phase 4.
- M13 isolation mechanism for ADR-V4-0016 (user vs container vs host) — gate Phase 2 approval path.
- M02 archive/skip-link encoding — gate Phase 3.
- Per-event signatures vs hash chain — M18 Phase 5 (review R1).
- Per-type event payload schemas — producing metas (review R3).
- Certified V3.7 hash — external BLOCK (G17). Re-run adapter types on that hash.
- RFC 8785 canonical JSON — revisit if a non-TS verifier appears (M14).

## 8. Subagent review outcome

`M00-INDEPENDENT-REVIEW.md`: **ACCEPT_WITH_RESIDUAL_RISKS** (R1, R3). Independence limitation documented in that file §0.

## 9. Limitations and risks

- Contracts are not FROZEN until orchestrator ACCEPTED.
- Secret scanning is heuristic.
- Canonical JSON v1 ≠ RFC 8785.
- M18 copies under `docs/v4/security/` may drift; M18 branch is canonical.
- Wiki log not updated (`WIKI_ROOT` unset).
- Disk-tight environment: no duplicated `node_modules`.

## 10. M00 acceptance self-check

| Mission criterion | Status |
|-------------------|--------|
| Traceability constitution → contracts/ADRs | Met |
| Open decisions via ADR (accepted or deferred with date) | Met |
| Ownership covers M00–M20; matrix chapters have owners | Met |
| No secrets; no exactly-once; principles preserved | Met |
| Independent review report included | Met (with §0 limitation) |
| Commits identifiable; contract tests | Met (this record + vitest) |
| Delivery report | This file |
| Stop; no merge | Met |
