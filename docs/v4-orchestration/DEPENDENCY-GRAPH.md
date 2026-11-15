# Dependency Graph (conceptual)

```text
M00 (contracts) ──┬──► M01 Goal/Work
                  ├──► M02 Events/Persistence/Checkpoints
                  ├──► M03 Effect Ledger
                  ├──► M06 WorkProof (min)
                  ├──► M10 Policy (foundations)
                  └──► M12 Observability (init)
                         │
         V4.0 vertical slice (Intent → WorkProof)
                         │
                  ┌──────┴──────┐
                  ▼             ▼
               M04 Capsule   M05 Time Travel
               Recovery      Replay/Fork
                  │             │
                  └──────┬──────┘
                         ▼
              M07 Planning ◄── M08 Capability
                         │
                         ▼
                    M09 Adaptive
                         │
                  ┌──────┴──────┐
                  ▼             ▼
               M10 Policy    M11 Provenance
               (full)        Graph
                  │             │
                  └──────┬──────┘
                         ▼
                      M16 Impossible Handoff
                         │
                  ┌──────┴──────┐
                  ▼             ▼
               M13 Fabric    M14 Ecosystem
                  │             │
                  └──────┬──────┘
                         ▼
                      M15 Control Center
                         │
                      M19 Integration
                         │
              M18 Security + M17 Metrics + M20 Audit
```

**Hard edges:**

- No Wave 2 consolidation without M00 ACCEPTED + freeze.
- M09 must not invent scores — depends on M08 + M17 provenance.
- M14 marketplace forbidden; conformance only.
- M16 must consume prior services — no parallel incompatible stacks.
- Final APPROVED → certified V3.7 hash (external until G17 clears).
