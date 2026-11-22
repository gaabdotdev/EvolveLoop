# ADR — P0 prefs / validate / history (V4.2)

**Status:** aceite  
**Data:** 2026-11-22  
**Fecha:** `implementation-backlog.md` P0-1..P0-4  

---

## Contexto

Auditoria V4.2: preferências sem UI, config inválida com fallback silencioso, histórico só “latest”, Handles só via YAML.

## Decisão

1. **Prefs:** `evolve config prefs|set` + `/config handles on|off` persistem via `writeWorkspaceAgentHandles` (workspace `.evolveloop/config.yaml`). Handles **default OFF**; consequência curta sempre impressa.
2. **Validate:** `evolve config validate` reporta `ficheiro · chave · correção`. Load detalhado emite issues; hosts mantêm fallback DEFAULT; shell interativo **avisa** (stderr) sem exigir `--strict`.
3. **History:** `evolve history list|show` + `/history` leem StateDb do Workspace (cwd). Retomada **nunca** prometida perfeita — limitações explícitas por entrada. ≠ `continuity`.

## Consequências

- Sem reescrever profile schema; sem Handles ON por default.
- `evolve workspace` permanece integration/worktree (rótulo na help; rename = P1).
