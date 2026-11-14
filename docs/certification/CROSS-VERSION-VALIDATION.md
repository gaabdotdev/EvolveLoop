# Cross-Version Validation (G20 partial / R8)

Integrated tip contains lineages via merge `6dee950` + remediations + `c89949a` fabric.

| Line | Tip evidence | Status |
|------|--------------|--------|
| V22 session continuity | Fixed JOB-INTEGRITY listPending; integration PASS | PASS on tip |
| V22 Graphify B3 | skip when CLI absent | PASS (honest skip) |
| V22 P0 baseline freeze | Regenerated; efficiency meta still unproven | PARTIAL |
| V3 Core / eval battery | integration PASS previously | PASS |
| V3.3 resilience | integration PASS | PASS |
| V3.4 engineering loop | integration PASS TRUE_FULL_PASS path | PASS (deterministic) |
| V3.5 runtime/sandbox/approvals/coordinator | integration + adversarial PASS | PASS |
| V3.6 multi-workflow | e2e PASS | PASS |
| Measurement Plane | wired + unit PASS | PARTIAL (fleet/G18 open) |
| V3.7 fabric unit/adversarial | PASS after merge | PARTIAL |
| V3.7 multi-host | BLOCKED | BLOCKED |

## Lost / unproven historical claims

- MegaBrain/GaabType capabilities not auto-attributed
- Public dual `/evolve` honesty remediated; not unified
- Token −30% meta never certified
