# Aceitação V2.3

Cenários versionados. O CI não exige o desktop Orca. A prova integrada é local.

| Cenário | Classe | Comando |
|---|---|---|
| Classificador sem CLI, sem conta, sem capability | estrutural | `python3 scripts/v23/test_readiness.py` |
| Núcleo sem a cadeia `orca` | estrutural | o mesmo teste, `test_kernel_has_no_orca_client_string` |
| Host actual | integrada local | `python3 scripts/v23/readiness.py --live` |
| Worker novo | integrada local | Antigravity `term_9f59f1af-cdaa-4865-89ed-a2bda2c064bb`, task `task_5e66bc4c6964` `completed` |
| Diretório sem worktree | integrada local | `python3 scripts/v23/readiness.py --live` com cwd `/tmp` → `projeto_orca_ausente` |
| Segundo repositório | integrada local | `/home/gaab/Downloads/evolveloop-v23-other` → `repo:3517750c-a461-407c-bf5e-a6c6a09bff40`; sem `scripts/v23/` nem `memory/` |
| Tasks paralelas | integrada local | `task_70fb2dcfd1a7` `side: main`; `task_29b475dfa1db` `side: isolation` |
| Permissões de SO | integrada local | `orca computer permissions --json` → accessibility e screenshots `unsupported` |
| Revisão da diff | integrada local | `task_f0cda841ec5d` `orca_trail_pass` false, findings vazio |
| Worktree `v23-isolation` | integrada local | `v23-isolation-agent.txt` só nesse worktree; terminal `term_7a980c3d-659d-427c-80c3-e472c980af2f` |
| Worker com exit 2 | integrada local | `task_21ec522ac8d6` status `failed` |
| Sleep interrompido | não medida até ao fim | `task_1e7fe74e6b7f` ficou `dispatched` / `in_progress` depois de `Cancelled` |
