"""The headless backup CLI works against a stopped install (calvin-8gx)."""

import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

BACKEND = Path(__file__).resolve().parents[2]


def _cli(tmp_path, *args):
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{tmp_path / 'db' / 'calvin.db'}",
        "PLUGIN_DIR": str(tmp_path / "plugins"),
        "IMAGE_DIR": str(tmp_path / "images"),
        "IMAGE_CACHE_DIR": str(tmp_path / "cache"),
        "LOG_DIR": str(tmp_path / "logs"),
        "BACKUP_DIR": str(tmp_path / "backups"),
        "KIOSK_SIGNING_KEY_PATH": str(tmp_path / "kiosk-signing.key"),
    }
    env.pop("CALVIN_RESTORE_FROM", None)
    return subprocess.run(
        [sys.executable, "-m", "app.services.backup", *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_cli_export_then_dry_run_restore(tmp_path):
    out = tmp_path / "seed.zip"
    r = _cli(tmp_path, "export", "--out", str(out), "--no-secrets")
    assert r.returncode == 0, r.stderr
    with zipfile.ZipFile(out) as zf:
        doc = json.loads(zf.read("backup.json"))
    assert doc["format"] == "calvin-backup"
    assert doc["options"]["include_secrets"] is False

    r = _cli(tmp_path, "restore", str(out), "--dry-run")
    assert r.returncode == 0, r.stderr
    plan = json.loads(r.stdout)
    assert plan["mode"] == "replace"
    assert "counts" in plan


def test_cli_restore_rejects_bad_file(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text('{"format": "calvin-backup", "format_version": 99}')
    r = _cli(tmp_path, "restore", str(bad))
    assert r.returncode == 2
    assert "newer" in r.stderr.lower()
