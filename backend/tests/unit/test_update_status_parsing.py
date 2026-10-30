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


def test_find_update_paths_prefer_root_owned_dir(monkeypatch, tmp_path):
    """The updater writes its state/log outside the checkout (calvin-1g25)."""
    from app.api.routes.system import _find_update_log, _find_update_state
    from app.config import settings

    repo_dir = tmp_path / "repo"
    legacy = repo_dir / "backend" / "logs"
    legacy.mkdir(parents=True)
    (legacy / "calvin-update-state.json").write_text("{}", encoding="utf-8")
    (legacy / "calvin-update.log").write_text("old\n", encoding="utf-8")
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)

    status_dir = tmp_path / "update-status"
    status_dir.mkdir()
    new_state = status_dir / "calvin-update-state.json"
    new_log = status_dir / "calvin-update.log"
    new_state.write_text("{}", encoding="utf-8")
    new_log.write_text("new\n", encoding="utf-8")
    monkeypatch.setenv("CALVIN_UPDATE_STATUS_DIR", str(status_dir))

    assert _find_update_state() == new_state
    assert _find_update_log() == new_log


def test_find_update_paths_fall_back_to_checkout(monkeypatch, tmp_path):
    """Installs that predate the move keep reporting their old state (calvin-1g25)."""
    from app.api.routes.system import _find_update_log, _find_update_state
    from app.config import settings

    repo_dir = tmp_path / "repo"
    legacy = repo_dir / "backend" / "logs"
    legacy.mkdir(parents=True)
    old_state = legacy / "calvin-update-state.json"
    old_log = legacy / "calvin-update.log"
    old_state.write_text("{}", encoding="utf-8")
    old_log.write_text("old\n", encoding="utf-8")
    monkeypatch.setattr(settings, "repo_dir", repo_dir, raising=False)
    monkeypatch.setenv("CALVIN_UPDATE_STATUS_DIR", str(tmp_path / "absent"))

    assert _find_update_state() == old_state
    assert _find_update_log() == old_log
