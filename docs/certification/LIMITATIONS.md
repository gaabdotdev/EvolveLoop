# Limitations — recovery candidate

1. **Multi-host E2E (G17)** blocked — only one online Tailscale Linux host.
2. **Harness OS sandbox (SEC-C02)** — live provider CLIs remain outside bubblewrap; `EVOLVELOOP_REQUIRE_HARNESS_SANDBOX=true` fail-closes spawn; doctor warns.
3. **Dual evolve surfaces** — documented (ADR-0001); not unified into one binary path.
4. **WIKI_ROOT unset** — knowledge grounding cannot be `applied`.
5. **Graphify CLI** often absent — tests skip explicitly (not empty PASS).
6. **Token efficiency −30%** — proposed V3 meta; not proven (G18 UNVERIFIED); frozen baseline corpus drift seen on task `curta`.
7. **IPC token** still grants broad approve/tick/shutdown (SEC-H02 residual HIGH).
8. **Fleet/cross-node measurement (G16)** incomplete vs unit fabric.
9. **License** — commercial restriction intent from V3 v0.5 remains pending formal LICENSE decision; not changed in this mission.
10. **No merge/push/tag** performed or authorized.
