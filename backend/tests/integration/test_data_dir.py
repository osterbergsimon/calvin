"""Everything Calvin writes lands under CALVIN_DATA_DIR, whatever the cwd.

The app is started in a subprocess (settings are a module-level singleton)
from an unrelated working directory with only CALVIN_DATA_DIR set, then
exercised through every path that writes to disk. Between the first start
and the second, the DB is given what an older install stored for the Local
Images instance: a cwd-relative image_dir that must no longer win.
"""

import io
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

from app.config import BACKEND_DIR

pytestmark = [pytest.mark.integration, pytest.mark.slow]

# Env vars that would pin a path outside the data dir.
OVERRIDES = (
    "DATABASE_URL",
    "LOG_DIR",
    "IMAGE_DIR",
    "IMAGE_CACHE_DIR",
    "PLUGIN_DIR",
    "PLUGINS_DIR",
    "THEMES_DIR",
    "KIOSK_SIGNING_KEY_PATH",
    "BACKUP_DIR",
    "CALVIN_RESTORE_FROM",
)

SCRIPT = r"""
import io, json, sys
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.plugins.utils.scan_cache import save_scan_cache
from app.services import kiosk_bundle
from app.services.remote_image_cache import remote_image_cache
from app.services.theme_installer import theme_installer

if sys.argv[1] == "init":
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
    sys.exit(0)

png = bytes.fromhex(sys.argv[1])
with TestClient(app) as client:
    r = client.post(
        "/api/images/upload", files={"file": ("photo.png", io.BytesIO(png), "image/png")}
    )
    assert r.status_code == 200, r.text
    r = client.post("/api/backup/files", json={})
    assert r.status_code == 200, r.text
    kiosk_bundle.ensure_signing_key()
    save_scan_cache("some-instance", [{"id": "x"}])
    cached = remote_image_cache._cache_path("https://example.com/a.jpg")
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(b"x")

print(json.dumps({
    "database": str(settings.database_path),
    "themes": str(theme_installer.themes_dir),
}))
"""


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, format="PNG")
    return buf.getvalue()


def _tree(root: Path) -> set[Path]:
    return {p.relative_to(root) for p in root.rglob("*")} if root.exists() else set()


LEGACY_LOCAL_CONFIG = {"image_dir": "./data/images", "thumbnail_dir": "./data/images/thumbnails"}


def _seed_legacy_local_images(db: Path) -> None:
    now = "2025-01-01 00:00:00"
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE plugin_types SET enabled = 1 WHERE type_id = 'local'")
        conn.execute(
            "INSERT INTO plugins (id, type_id, plugin_type, name, enabled, config,"
            " display_order, created_at, updated_at)"
            " VALUES ('local-images', 'local', 'image', 'Local Images', 1, ?, 0, ?, ?)",
            (json.dumps(LEGACY_LOCAL_CONFIG), now, now),
        )


def test_app_writes_only_under_data_dir(tmp_path):
    data_dir = tmp_path / "data"
    cwd = tmp_path / "elsewhere"
    cwd.mkdir()
    env = {k: v for k, v in os.environ.items() if k not in OVERRIDES}
    env["CALVIN_DATA_DIR"] = str(data_dir)
    env["PYTHONPATH"] = str(BACKEND_DIR)
    backend_data_before = _tree(BACKEND_DIR / "data")

    def run(arg: str) -> subprocess.CompletedProcess:
        proc = subprocess.run(
            [sys.executable, "-c", SCRIPT, arg],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert proc.returncode == 0, proc.stderr[-4000:]
        return proc

    run("init")
    _seed_legacy_local_images(data_dir / "db" / "calvin.db")
    proc = run(_png().hex())
    reported = json.loads(proc.stdout.strip().splitlines()[-1])

    # Nothing in the working directory, nothing new in the checkout's data dir.
    assert _tree(cwd) == set()
    assert _tree(BACKEND_DIR / "data") == backend_data_before

    assert Path(reported["database"]) == data_dir / "db" / "calvin.db"
    assert Path(reported["themes"]) == data_dir / "themes"
    files = {str(p) for p in _tree(data_dir) if (data_dir / p).is_file()}
    assert "db/calvin.db" in files
    assert "kiosk-signing.key" in files
    assert "images/photo.png" in files
    assert "plugins/some-instance/scan_cache.json" in files
    assert any(f.startswith("image_cache/") for f in files)
    assert any(f.startswith("backups/calvin-backup-") for f in files)
    for d in ("logs", "themes"):
        assert (data_dir / d).is_dir()
