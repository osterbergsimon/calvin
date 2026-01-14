import os
import time


async def test_update_status_detects_prod_completion(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    (repo_dir / "backend" / "logs").mkdir(parents=True, exist_ok=True)
    log_file = repo_dir / "backend" / "logs" / "calvin-update.log"
    log_file.write_text(
        "\n".join(
            [
                "[2026-01-14] Starting Calvin production update...",
                "Fetching latest code from main...",
                "Restarting backend service...",
                "Backend service restarted successfully",
                "[2026-01-14] Production update complete!",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    data = await get_update_status()
    assert data["status"] == "idle"
    assert data["backend_restarted"] is True


async def test_update_status_detects_dev_completion(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    log_file = repo_dir / "backend" / "logs" / "calvin-update.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    log_file.write_text(
        "\n".join(
            [
                "[2026-01-14] Starting Calvin development update...",
                "Fetching latest code from main...",
                "[2026-01-14] Development update complete!",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    data = await get_update_status()
    assert data["status"] == "idle"


async def test_update_status_detects_running_when_recently_updated(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    log_file = repo_dir / "backend" / "logs" / "calvin-update.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    log_file.write_text(
        "\n".join(
            [
                "[2026-01-14] Starting Calvin update...",
                "Pulling latest code from main...",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    # Fresh mtime to trigger "recently_updated"
    now = time.time()
    os.utime(log_file, (now, now))

    data = await get_update_status()
    assert data["status"] == "running"
