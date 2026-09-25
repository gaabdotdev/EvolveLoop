# EvolveLoop V3 — Master Model (ciclo evolveloop-v3-c0)

**Status:** living plan — **não** é declaração de COMPLETE.  
**Fontes:** `EVOLVELOOP_V3.md`, `v3-metas-topo.md`, deep-map V2, critics first-wave + agency-runtime.

## Arquitectura additiva (§174)

```text
V2 Execution Substrate (Intent→Capability→Policy→Runtime→Provider→Evidence)
  + V3 Agency Layer
  + V3 Intelligence (World Model / Memory trust / Reasoning)
  + V3 Persistent World Interaction
  + V3 Evolution Layer (governada)
  + Meta 0 Trust / Reproducibility / DX
```

**Proibido:** descartar V2; segundo registry; segundo evidence stack; Agency a executar capabilities directamente.

## Checkpoints (ciclo c0)

| CP | Estado |
|----|--------|
| V3-F0 | parcial — Meta0 doctrine em `v3-metas-topo.md`; GAP corpo V3 |
| V3-F1 | contracts **0.1.2** — GoalLifecycle §176; Governor/Sandbox/Hierarchy/MemoryTrust depth |
| V3-F2 | Agency + GoalStore + Oracle + Governor — tick propose-only |
| V3-F3 | World Model + Fabric adapter (discover/compose/acquisition stub) |
| V3-F4 | partial — InstructionHierarchy sealed_root; adversarial suite ainda estreita |
| V3-F5 | Failure helpers + AgencyRuntime path (oracle fail-closed; degrade skips run) |
| V3-F6 | Meta0 DEMO-001..008 stub → **NOT_MEASURED** (sem live runner) |
| V3-F7..F9 | **não iniciado** (long-horizon / novel / self-evolution) |

## Evidence (ciclo)

- `memory/evolveloop-v3/evidence/gate.testing.json` — unit/v3 **110 PASS** (não prova autonomy)
- Critics: `critic.first-wave.json`, `critic.agency-runtime.json` (repairs applied for C/H findings marked)

## Ainda bloqueia V3 COMPLETE (amostra)

- OS sandbox real (S2+)
- Planner LLM / multi-step composition execution
- Long-horizon 100→10k
- Novel/Unknown/Adversarial live
- Self-evolution canary/promote
- Meta0 one-command reproduce PASS
- Security + PO gates formais do ciclo `/evolve`
- Acquisition install real; browser handlers

## V3 FINAL STATUS (ciclo c0)

**NÃO COMPLETE** — foundations + integrated tick path + honest Meta0 stubs.
