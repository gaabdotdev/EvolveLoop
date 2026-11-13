# V3.6 Limitations

- Local-first, single-host only.
- Live LLM multi-workflow E2E requires process-scoped `EVOLVELOOP_HARNESS_CONSENT=true` and harness session auth (or API key). Validated 2026-11-12 with `cursor-agent` — see `LIVE-MULTI-WORKFLOW-VALIDATION.md`.
- GlobalOpsService does not auto-schedule Coordinator ticks; operators/automation call `scheduler tick` / daemon IPC.
- Measurement Plane / bench-obs branch not required for operation.
- Token/cost budgets refuse `UNAVAILABLE` provenance (live run recorded UNAVAILABLE).
- Preemption never kills arbitrary processes; controlled failure may cancel a session or fail a queued sibling.
- Resource pool defaults (e.g. workflows=8) are separate from scheduler `max_global_workflows`; admission follows scheduler policy.
- Wiki EvolveLoop pack not indexed (`PACK_NOT_FOUND`); register notes via librarian.
- Release tag V3.6 not created until explicit human approval.
