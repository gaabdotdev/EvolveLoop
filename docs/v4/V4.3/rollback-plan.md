# V4.3 — Plano de rollback

**Data:** 2026-11-22  
**Âmbito:** consolidação P0/P1 (copy, facades, pause/delivery, docs).  
**Não cobre:** reescrever motor MSO; wipe Wiki; `rm -rf` de `.evolveloop` do utilizador.

---

## 1. Código (repo)

1. Identificar merge/commit V4.3 (tag ou SHA).  
2. Reverter para SHA pré-V4.3 **sem** `--force` em main partilhada (revert commit preferível).  
3. Rebuild: `cd orchestrator && npm run build`.  
4. Revalidar: `vitest` suite `v43-*` / regressão V4.2 se necessário.

## 2. Estado local do utilizador

| Artefacto | Acção |
|---|---|
| `.evolveloop/state.db` | **Manter** — schema compatível; pause meta/journey flags são aditivas |
| Profile YAML | `evolve config validate`; se partido, restaurar backup pré-edit |
| Credenciais `*.env` | Não apagar; paths canónicos inalterados |
| Preferência Handles | Default OFF; se ON e problema, `evolve config set agent-handles off` |

## 3. Comportamento UX a esperar após rollback

- Labels podem voltar a “Workers” / “MSO” / “Goal Contract” se o build antigo voltar.  
- `evolve tui` volta a poder ser confundido com jornada (docs P1-4 perdem efeito).  
- Pause persistido: builds pré-P0-1 ignoram meta — copy “só desta janela” pode reaparecer.

## 4. Proibido no rollback

- `git push --force` em main sem pedido explícito  
- `git reset --hard` sem backup  
- Apagar StateDb do utilizador “para limpar”  
- Forçar Handles ON

---

*MSO TASK V43-M3 — P1-6*
