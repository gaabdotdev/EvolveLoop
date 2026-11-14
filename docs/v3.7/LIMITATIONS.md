# Limitations

- Multi-host E2E BLOCKED without second online Linux host (`gaab-1` offline).
- Plaintext lab transport is not production.
- Speculative execution default **disabled** (policy opt-in).
- Exactly-once not claimed (ADR-V3-0006).
- Wiki grounding PARTIAL (`WIKI_ROOT` unset).
- Full GlobalOps live harness not re-run on integrated tip (Gate 0 G0-16 NOT_RUN).
- Fleet measurement reports / cross-node traces incomplete (Gate O PARTIAL).
- No multi-master; no K8s autoscaling in V3.7.
