#!/usr/bin/env python3
"""Testes estruturais do classificador. Não lançam agentes nem escrevem configuração."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

from readiness import classify, project_from_worktree

ROOT = Path(__file__).resolve().parents[2]
KERNEL = ROOT / "orchestrator" / "src"


def _rate_limits(*, cursor_ok: bool, antigravity_ok: bool):
    def entry(provider: str, ok: bool, source: str):
        if ok:
            return {
                "provider": provider,
                "status": "ok",
                "error": None,
                "usageMetadata": {"credentialSource": source},
            }
        return {
            "provider": provider,
            "status": "unavailable",
            "error": "ausente",
            "usageMetadata": {"credentialSource": "none"},
        }

    return {
        "result": {
            "claude": {"accounts": [], "activeAccountId": None},
            "rateLimits": {
                "cursor": entry("cursor", cursor_ok, "cli"),
                "antigravity": entry("antigravity", antigravity_ok, "antigravity-cli"),
            },
        }
    }


def snapshot(**overrides):
    base = {
        "command_missing": False,
        "status_ok": True,
        "runtime": {
            "state": "ready",
            "capabilities": [
                "orchestration.contract.v1",
                "terminal.prompt-delivery.v1",
                "worktree.create-idempotency.v1",
            ],
        },
        "project_known": True,
        "accounts": {"providers": [{"name": "claude", "accounts": [{"id": "a"}], "activeAccountId": "a"}]},
    }
    base.update(overrides)
    return base


class ClassifyTest(unittest.TestCase):
    def test_ausente(self):
        self.assertEqual(classify({"command_missing": True})["state"], "ausente")
        self.assertEqual(classify(None)["state"], "ausente")

    def test_desconhecido(self):
        self.assertEqual(classify({"status_ok": False})["state"], "desconhecido")

    def test_bloqueado(self):
        data = snapshot()
        data["runtime"]["state"] = "stopped"
        self.assertEqual(classify(data)["state"], "bloqueado")

    def test_incompativel(self):
        data = snapshot()
        data["runtime"]["capabilities"] = ["terminal.prompt-delivery.v1"]
        result = classify(data)
        self.assertEqual(result["state"], "incompativel")
        self.assertIn("orchestration.contract.v1", result["missing_capabilities"])

    def test_isolation_capability(self):
        data = snapshot()
        data["runtime"]["capabilities"] = [
            "orchestration.contract.v1",
            "terminal.prompt-delivery.v1",
        ]
        self.assertEqual(classify(data, isolation=False)["state"], "pronto")
        self.assertEqual(classify(data, isolation=True)["state"], "incompativel")

    def test_sem_conta_nao_e_pronto(self):
        data = snapshot(accounts={"providers": [{"name": "cursor", "accounts": [{"id": "c"}]}]})
        result = classify(data)
        self.assertEqual(result["state"], "parcialmente_preparado")
        self.assertFalse(result["pronto"])
        self.assertFalse(result["sandbox_claimed"])
        self.assertFalse(result["writes_config"])

    def test_conta_vazia(self):
        data = snapshot(accounts={"providers": [{"name": "claude", "accounts": [], "activeAccountId": None}]})
        self.assertEqual(classify(data)["state"], "parcialmente_preparado")

    def test_cursor_com_usage_ok_nao_e_conta_de_lancamento(self):
        data = snapshot(accounts=_rate_limits(cursor_ok=True, antigravity_ok=False))
        result = classify(data)
        self.assertEqual(result["state"], "parcialmente_preparado")
        self.assertFalse(result["pronto"])

    def test_antigravity_cli_conta_como_lancamento(self):
        data = snapshot(accounts=_rate_limits(cursor_ok=True, antigravity_ok=True))
        self.assertEqual(classify(data)["state"], "pronto")

    def test_sem_projeto(self):
        result = classify(snapshot(project_known=False, project_id=None))
        self.assertEqual(result["state"], "parcialmente_preparado")
        self.assertIsNone(result["project_id"])

    def test_directorio_fora_do_worktree_nao_herda_projeto_do_host(self):
        project_id, known = project_from_worktree(
            {"ok": False, "error": {"code": "selector_not_found"}}
        )
        self.assertFalse(known)
        self.assertIsNone(project_id)
        data = snapshot(project_known=known, project_id=project_id, host_has_project=True)
        self.assertEqual(classify(data)["state"], "parcialmente_preparado")

    def test_worktree_identifica_projeto_sem_usar_so_a_lista_do_host(self):
        project_id, known = project_from_worktree(
            {"ok": True, "result": {"worktree": {"projectId": "github:example/app"}}}
        )
        self.assertTrue(known)
        self.assertEqual(classify(snapshot(project_known=known, project_id=project_id))["project_id"], "github:example/app")

    def test_pronto(self):
        self.assertEqual(classify(snapshot())["state"], "pronto")

    def test_kernel_has_no_orca_client_string(self):
        offenders = []
        for path in KERNEL.rglob("*.ts"):
            text = path.read_text(encoding="utf-8", errors="replace")
            if "orca" in text:
                offenders.append(str(path.relative_to(ROOT)))
        self.assertEqual(offenders, [])

    def test_cli_snapshot_flag(self):
        path = Path(__file__).with_name("_fixture.json")
        path.write_text(json.dumps(snapshot()), encoding="utf-8")
        try:
            completed = subprocess.run(
                ["python3", str(Path(__file__).with_name("readiness.py")), "--snapshot", str(path)],
                check=False,
                capture_output=True,
                text=True,
            )
        finally:
            path.unlink(missing_ok=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["state"], "pronto")


if __name__ == "__main__":
    unittest.main()
