# ADR-V36-0002 — Ops persistence

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

Atomic JSON + JSONL under `--ops-dir` (projects, workflows, queue, reservations, decisions, team-plans, quality-results). No SQLite in V3.6. Workflow transitions validated by FSM; no silent field updates of `state`.

## Consequences

Compatible with V3.5 file layout; schema evolution via additive fields + recovery reports.
