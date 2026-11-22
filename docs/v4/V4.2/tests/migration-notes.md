# V4.2 — Migration / config antiga

**Data:** 2026-11-22  
**Regra:** descrever o que **acontece** no código; não inventar migrator.

---

## 1. Profile YAML inválido

| Caso | Comportamento |
|---|---|
| YAML parse fail / chave inválida | `loadEvolveLoopProfileDetailed` / `evolve config validate` → issues com ficheiro, chave, correção sugerida; exit 1 no validate |
| Hosts que só leem profile “soft” | Fallback DEFAULT + **warn** (não fingir silent success em fluxos interativos) |

Evidência: `v42-p0-operational.test.ts` P0-2; ADR `docs/v4/V4.2/adr/P0-prefs-validate-history.md`.

---

## 2. Workspace `.evolveloop/config.yaml` inválido

Mesma disciplina de validate; Agent Handles toggle escreve YAML workspace quando set via CLI.

---

## 3. Sem migrator de schema antigo

| Item | Estado |
|---|---|
| Migração automática vN→vN+1 de profile | **LIMITATION** — não implementada nesta fatia |
| Config “antiga” válida | Continua a carregar se schema actual aceitar; campos desconhecidos não inventados |
| Preferência Handles ausente | Default **OFF** (profile) |

---

## 4. Credenciais (duas casas — P2-4)

| Superfície | Path | Notas |
|---|---|---|
| `evolve setup` | `<workspace>/.evolveloop/credentials.env` (0600) | Canónico setup |
| Provider TUI / FreeLLM | `~/.config/evolveloop/secrets.env` (0600) | Canónico ProviderSetup |
| Precedência FreeLLM key | env `FREELLMAPI_API_KEY` \| `EVOLVELOOP_FREELLMAPI_API_KEY` **>** secrets.env | Documentado; ficheiros **não** unificados nesta M4 |

Valores nunca em logs/readiness. Help journey lista ambos.

---

## 5. Comandos / taxonomia

| Antigo | V4.2 |
|---|---|
| `evolve workspace` (integration) | Mantido (compat); preferir `evolve integration` |
| Help default JSON enorme | Journey curto; advanced = `evolve help advanced` |
| Version string `0.1.0-v0-cli` only | Product `2.0.0` + `legacy_cli_label` |

---

## 6. O que o utilizador deve fazer

1. `evolve config validate` após editar YAML.  
2. Prefs: `evolve config set agent-handles on|off` (não editar YAML à mão se possível).  
3. Credenciais: seguir paths canónicos no help; não commitar `*.env`.  
4. Não esperar migrate automático de schemas pré-V4.
