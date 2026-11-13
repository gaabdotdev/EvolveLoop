# V3.6 Limitations

- Local-first, single-host only.
- Live LLM multi-workflow E2E requires `EVOLVELOOP_HARNESS_CONSENT=1` and provider credentials; otherwise BLOCKED.
- GlobalOpsService does not auto-schedule Coordinator ticks; operators/automation call `scheduler tick` / daemon IPC.
- Measurement Plane / bench-obs branch not required for operation.
- Token/cost budgets refuse `UNAVAILABLE` provenance.
- Preemption never kills arbitrary processes.
- Wiki EvolveLoop pack not indexed (`PACK_NOT_FOUND`); register notes via librarian.
