# ADR-V3-0010 — V3 Complete Finalization

## Status

Accepted (freeze)

## Context

V3.3 froze resilience primitives; V3.4 demonstrated an Engineering Loop on a single-file deterministic demo. The product still lacked proof of generalization, adversarial evaluator integrity, held-out benchmarks, and a global `V3_COMPLETE` gate.

## Decision

1. Ship a multi-repo evaluation battery (`alpha-lib`, `beta-app`, `gamma-service`) with ≥10 tasks and held-out split.  
2. Use **DETERMINISTIC_SOLVER** workers for CI-reproducible proof of Core orchestration on real multi-file trees (explicitly not LLM codegen).  
3. Introduce durable `EvidenceRecord`s + `evaluateVerifiedTrueFullPass` that reject self-review, stale tests, empty diffs, corrupt hashes, and cross-contract evidence.  
4. Extend failure injection to engineering stages and wire anti-loop `ProgressTracker` stop/pause/escalate actions.  
5. Keep harness classifications honest; treat Cursor ExecutionBridge as the real Core harness path; require consent for live CLI harness spawns.  
6. Declare `V3_COMPLETE` only when gates A–F are all `PASS` via `scripts/v3/run-v3-finalization-gate.mjs`.

## Consequences

- V3 can be frozen and tagged without opening V3.5.  
- Live LLM harness E2E beyond Cursor Core remains optional and consent-gated.  
- Benchmark token/cost figures are proxies until metering is attached — documented, not invented as billing truth.
