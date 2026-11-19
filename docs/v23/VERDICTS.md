# Vereditos V2.3

As taxonomias não se fundem.

Trilha de integração Orca: `PASS`, `LIMITED`, `BLOCKED`, `NOT_MEASURED`, `UNAVAILABLE`.

Núcleo: `passed`, `rejected`, `conditional`.

Mapa dos sete estados da meta 007:

| Estado | Veredito |
|---|---|
| Conclusão validada pelo revisor | `PASS` |
| Resultado parcial | `LIMITED` |
| Pergunta pendente | `BLOCKED` |
| Falha confirmada | `BLOCKED` |
| Timeout após a única retoma | `BLOCKED` |
| Agente sem resposta após a única retoma | `BLOCKED` |
| Execução possivelmente activa | `NOT_MEASURED` |

`workerState=succeeded` e task `completed` não são `PASS`.
