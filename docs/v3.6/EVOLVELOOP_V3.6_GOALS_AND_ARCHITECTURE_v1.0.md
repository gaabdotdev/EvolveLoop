# EvolveLoop V3.6 — Goals & Architecture Specification

**Version:** 1.0  
**Status:** Implementation authority (user-delivered 2026-11-12)  
**Name:** Multi-Workflow Engineering Operations

This file is the repository copy of the normative goals/architecture document supplied with the `/evolve` implementation mandate. Full text was provided in the user message; operational decisions are recorded in `GAP-ANALYSIS.md`, `ARCHITECTURE.md`, and `docs/v3.6/adr/ADR-V36-0001`…`0008`.

## North star

Several engineering objectives remain active across distinct projects, progress in parallel when safe, respect limits and priorities, survive UI exit, and are inspected/controlled from an Operations Center.

## Objectives O1–O7

Global Workflow Scheduler · Multi-Project Management · Global Resource Management · Adaptive Agent Teams · Engineering Quality Gates · Operations Center · Global continuity.

## Non-goals (selected)

Multi-host cluster · SaaS multi-tenant · replacing EventBus/Measurement Plane · unrestricted Core auto-evolution · Windows/macOS as V3.6 gate · mandatory full web dashboard.

## Acceptance

Gates G/P/R/T/Q/O/E2E/S/Release — see `ACCEPTANCE-MATRIX.md`. Live LLM E2E requires consent+credential; otherwise mark live portion BLOCKED without declaring integral E2E PASS.
