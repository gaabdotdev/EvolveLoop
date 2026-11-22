#!/usr/bin/env python3
"""Classificador de prontidão Orca para /evolve.

Só lê. Não altera agents.env, setups, repos nem worktrees.
O estado pronto exige runtime ready, as capabilities da decisão 2
e uma conta de lançamento que não seja o provider cursor.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from typing import Any

REQUIRED_CAPABILITIES = (
    "orchestration.contract.v1",
    "terminal.prompt-delivery.v1",
)
ISOLATION_CAPABILITIES = (
    "worktree.create-idempotency.v1",
    "worktree.provisioned-root.v1",
)
STATES = (
    "ausente",
    "pronto",
    "parcialmente_preparado",
    "incompativel",
    "bloqueado",
    "desconhecido",
)


def classify(snapshot: dict[str, Any] | None, *, isolation: bool = False) -> dict[str, Any]:
    if snapshot is None:
        return _result("ausente", "cli_ausente", isolation=isolation)
    if snapshot.get("command_missing") is True:
        return _result("ausente", "cli_ausente", isolation=isolation, snapshot=snapshot)
    if snapshot.get("status_ok") is not True or not isinstance(snapshot.get("runtime"), dict):
        return _result("desconhecido", "status_ilegivel", isolation=isolation, snapshot=snapshot)

    runtime = snapshot["runtime"]
    caps = set(runtime.get("capabilities") or [])
    missing = [name for name in REQUIRED_CAPABILITIES if name not in caps]
    if isolation:
        if not any(name in caps for name in ISOLATION_CAPABILITIES):
            missing.append("worktree.create-idempotency.v1|worktree.provisioned-root.v1")
    if runtime.get("state") != "ready":
        return _result(
            "bloqueado",
            "runtime_nao_ready",
            isolation=isolation,
            snapshot=snapshot,
            missing=missing,
        )
    if missing:
        return _result(
            "incompativel",
            "capability_obrigatoria_ausente",
            isolation=isolation,
            snapshot=snapshot,
            missing=missing,
        )
    if not snapshot.get("project_known"):
        return _result(
            "parcialmente_preparado",
            "projeto_orca_ausente",
            isolation=isolation,
            snapshot=snapshot,
        )
    if not _has_launch_account(snapshot.get("accounts")):
        return _result(
            "parcialmente_preparado",
            "sem_conta_de_lancamento",
            isolation=isolation,
            snapshot=snapshot,
        )
    return _result("pronto", "componentes_criticos_presentes", isolation=isolation, snapshot=snapshot)


def _usage_credential(node: dict[str, Any]) -> bool:
    """Conta de lançamento fora de `account add`.

    O Cursor pode estar `status=ok` e continua de fora. Antigravity e
    CLIs semelhantes aparecem em `rateLimits` com `credentialSource`.
    """
    provider = node.get("provider")
    if not isinstance(provider, str) or provider == "cursor":
        return False
    if node.get("status") != "ok" or node.get("error"):
        return False
    meta = node.get("usageMetadata")
    if not isinstance(meta, dict):
        return False
    source = meta.get("credentialSource")
    return isinstance(source, str) and source not in ("", "none")


def _has_launch_account(payload: Any) -> bool:
    found = False

    def walk(node: Any, provider: str | None) -> None:
        nonlocal found
        if found:
            return
        if isinstance(node, dict):
            if _usage_credential(node):
                found = True
                return
            name = node.get("provider") or node.get("name") or node.get("id")
            current = provider
            names_provider = isinstance(name, str) and (
                "accounts" in node or "activeAccountId" in node
            )
            if names_provider:
                current = name
            accounts = node.get("accounts")
            active = node.get("activeAccountId")
            if current and current != "cursor":
                if isinstance(accounts, list) and len(accounts) > 0:
                    found = True
                    return
                if isinstance(active, str) and active:
                    found = True
                    return
            for value in node.values():
                walk(value, current if isinstance(current, str) else provider)
        elif isinstance(node, list):
            for item in node:
                walk(item, provider)

    walk(payload, None)
    return found


def _result(
    state: str,
    reason: str,
    *,
    isolation: bool,
    snapshot: dict[str, Any] | None = None,
    missing: list[str] | None = None,
) -> dict[str, Any]:
    runtime = (snapshot or {}).get("runtime") or {}
    return {
        "state": state,
        "reason": reason,
        "pronto": state == "pronto",
        "isolation_requested": isolation,
        "runtime_state": runtime.get("state"),
        "missing_capabilities": missing or [],
        "project_id": (snapshot or {}).get("project_id"),
        "writes_config": False,
        "sandbox_claimed": False,
    }


def collect_live() -> dict[str, Any]:
    if shutil.which("orca") is None:
        return {"command_missing": True}
    status = _json_command(["orca", "status", "--json"])
    accounts = _json_command(["orca", "account", "list", "--json"])
    projects = _json_command(["orca", "project", "list", "--json"])
    runtime = {}
    status_ok = False
    if isinstance(status, dict) and status.get("ok") is True:
        status_ok = True
        result = status.get("result") if isinstance(status.get("result"), dict) else {}
        runtime = result.get("runtime") if isinstance(result.get("runtime"), dict) else {}
    current = _json_command(["orca", "worktree", "current", "--json"])
    project_id, project_known = project_from_worktree(current)
    listed = False
    if isinstance(projects, dict):
        result = projects.get("result") if isinstance(projects.get("result"), dict) else {}
        rows = result.get("projects")
        listed = isinstance(rows, list) and len(rows) > 0
    return {
        "command_missing": False,
        "status_ok": status_ok,
        "runtime": {
            "state": runtime.get("state"),
            "capabilities": list(runtime.get("capabilities") or []),
        },
        "accounts": accounts,
        "project_id": project_id,
        "project_known": project_known,
        "host_has_project": listed,
    }


def project_from_worktree(payload: Any) -> tuple[str | None, bool]:
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        return None, False
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    worktree = result.get("worktree") if isinstance(result.get("worktree"), dict) else {}
    project_id = worktree.get("projectId")
    if not isinstance(project_id, str) or not project_id:
        return None, False
    return project_id, True


def _json_command(argv: list[str]) -> Any:
    try:
        completed = subprocess.run(argv, check=False, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0 or not completed.stdout.strip():
        return None
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Classifica a prontidão Orca sem escrever configuração.")
    parser.add_argument("--live", action="store_true", help="Lê o CLI orca deste host.")
    parser.add_argument("--snapshot", help="JSON de snapshot, em vez de --live.")
    parser.add_argument("--isolation", action="store_true", help="A tarefa exige capability de worktree.")
    args = parser.parse_args()
    if args.live == bool(args.snapshot):
        parser.error("indique exactamente um de --live ou --snapshot")
    if args.snapshot:
        with open(args.snapshot, encoding="utf-8") as handle:
            snapshot = json.load(handle)
    else:
        snapshot = collect_live()
    print(json.dumps(classify(snapshot, isolation=args.isolation), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
