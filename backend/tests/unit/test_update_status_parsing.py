import json
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


async def test_update_status_prefers_structured_success_state(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    state_file = repo_dir / "backend" / "logs" / "calvin-update-state.json"
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(
        json.dumps(
            {
                "status": "success",
                "phase": "complete",
                "message": "Update completed successfully",
                "current_commit": "abc123",
                "new_commit": "def456",
                "backend_restarted": True,
            }
        ),
        encoding="utf-8",
    )

    data = await get_update_status()
    assert data["status"] == "idle"
    assert data["state_status"] == "success"
    assert data["phase"] == "complete"
    assert data["current_commit"] == "abc123"
    assert data["new_commit"] == "def456"
    assert data["backend_restarted"] is True


async def test_update_status_reads_structured_running_state(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    state_file = repo_dir / "backend" / "logs" / "calvin-update-state.json"
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(
        json.dumps(
            {
                "status": "running",
                "phase": "pulling_code",
                "message": "Pulling latest code",
            }
        ),
        encoding="utf-8",
    )

    data = await get_update_status()
    assert data["status"] == "running"
    assert data["phase"] == "pulling_code"
    assert data["message"] == "Pulling latest code"


async def test_update_status_reads_structured_error_state(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    state_file = repo_dir / "backend" / "logs" / "calvin-update-state.json"
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(
        json.dumps(
            {
                "status": "error",
                "phase": "healthcheck",
                "message": "Update failed. Check logs for details.",
                "error": "curl exited with 1",
            }
        ),
        encoding="utf-8",
    )

    data = await get_update_status()
    assert data["status"] == "error"
    assert data["phase"] == "healthcheck"
    assert data["error"] == "curl exited with 1"


async def test_update_status_marks_stale_structured_running_state_error(monkeypatch, tmp_path):
    from app.api.routes.system import get_update_status
    from app.config import settings

    repo_dir = tmp_path / "repo"
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    state_file = repo_dir / "backend" / "logs" / "calvin-update-state.json"
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(
        json.dumps(
            {
                "status": "running",
                "phase": "healthcheck",
                "message": "Waiting for Calvin to become healthy",
                "stale_after_seconds": 1,
            }
        ),
        encoding="utf-8",
    )
    stale = time.time() - 10
    os.utime(state_file, (stale, stale))

    data = await get_update_status()
    assert data["status"] == "error"
    assert data["message"] == "Update appears to have stalled or failed"
