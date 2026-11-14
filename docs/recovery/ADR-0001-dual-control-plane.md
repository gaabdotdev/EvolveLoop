# ADR-0001 — Dual evolve control planes (honest coexistence)

**Status:** Accepted for recovery tip `recovery/pre-v37-cert`  
**Issues:** ISSUE-ARCH-DUAL-EVOLVE-001, PUB-001  
**Date:** 2026-11-13

## Context

EvolveLoop exposes more than one “evolve” surface:

1. Cursor `/evolve` (PDA / orquestrar) → often `run-engine` / agents-orch
2. Product CLI `evolve` → V3 Goal/Coordinator/Approvals/Engineering Loop
3. Optional longitudinal `--evolve` flag on `run-engine`

Pretending these are one control plane produced false certification confidence.

## Decision

- Keep both surfaces temporarily.
- Require explicit `EVOLVELOOP_CONTROL_PLANE=v3_product_cli|execution_engine|cursor_pda` for operators who need fail-closed clarity (`requireControlPlane`).
- Doctor emits WARNING when unset.
- Module: `orchestrator/src/v3/entrypoints/control-plane.ts`
- Do **not** silently route `/evolve` PDA into V3 daemon without an explicit bridge command.

## Consequences

- PUB-001 moves from “hidden dual” toward “documented dual with explicit plane”.
- Full unification remains a later product decision; not required to close honesty FAIL if doctor+tests prove disclosure.
- TRUE_FULL_PASS still needs a documented primary path for engineering work (V3 product CLI + daemon).
