"""System management endpoints."""

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.services.display_power_service import display_power_service

logger = logging.getLogger(__name__)

router = APIRouter()

# Restart helper installed on Raspberry Pi images (see scripts/restart-calvin-services.sh).
_RESTART_HELPER = Path("/usr/local/bin/restart-calvin-services.sh")
# Delay before running `systemctl restart calvin-backend` so the HTTP response is sent first;
# otherwise the client sees a network error even when restart succeeds.
_BACKEND_RESTART_DELAY_SEC = 0.75


def _restart_mechanism_available() -> bool:
    """True if we have at least one way to ask systemd to restart a Calvin unit."""
    if _RESTART_HELPER.is_file():
        return True
    return shutil.which("systemctl") is not None


def _attempt_restart_calvin_service(service: str) -> bool:
    """
    Try helper script (sudo) then systemctl. Returns True if restart likely started
    (including subprocess timeout cases where systemd may still be restarting).
    """
    if service not in ("backend", "frontend"):
        raise ValueError(f"Invalid service: {service}")
    unit = f"calvin-{service}"

    if _RESTART_HELPER.is_file():
        try:
            result = subprocess.run(
                ["sudo", str(_RESTART_HELPER), service],
                capture_output=True,
                timeout=10,
                text=True,
            )
            if result.returncode == 0:
                logger.info("%s restart initiated via helper script", service)
                return True
            error_msg = result.stderr or result.stdout or "Unknown error"
            logger.warning("Helper script failed: %s", error_msg)
        except FileNotFoundError:
            logger.warning("sudo not found")
        except subprocess.TimeoutExpired:
            logger.info("Helper script timed out (but may have initiated)")
            return True
        except Exception as e:
            logger.error("Helper script error: %s", e, exc_info=True)

    try:
        result = subprocess.run(
            ["systemctl", "restart", unit],
            capture_output=True,
            timeout=5,
            text=True,
        )
        if result.returncode == 0:
            logger.info("%s restart initiated via systemctl restart", service)
            return True
        logger.warning("systemctl restart failed: %s", result.stderr or "Unknown error")
    except FileNotFoundError:
        logger.warning("systemctl not found")
    except subprocess.TimeoutExpired:
        logger.info("systemctl restart timed out (but may have initiated)")
        return True
    except Exception as e:
        logger.error("systemctl restart error: %s", e, exc_info=True)

    return False


_UPDATE_LOG_LOCATIONS = [
    lambda: settings.repo_dir / "backend" / "logs" / "calvin-update.log",
    lambda: settings.repo_dir.parent / "calvin-update.log",
    lambda: Path("/tmp/calvin-update.log"),  # nosec B108 - read-only fallback for log discovery
    lambda: Path("/var/log/calvin-update.log"),
]
_UPDATE_STATE_STALE_AFTER_SEC = 15 * 60
_COMMIT_KEYS = {
    "current_commit",
    "current_commit_short",
    "current_commit_msg",
    "new_commit",
    "new_commit_short",
    "new_commit_msg",
}

_UPDATE_STATE_LOCATIONS = [
    lambda: settings.repo_dir / "backend" / "logs" / "calvin-update-state.json",
    lambda: settings.repo_dir.parent / "calvin-update-state.json",
    lambda: Path("/tmp/calvin-update-state.json"),  # nosec B108 - read-only fallback
    lambda: Path("/var/log/calvin-update-state.json"),
]


def _find_update_log() -> Path | None:
    for loc_fn in _UPDATE_LOG_LOCATIONS:
        p = loc_fn()
        if p.exists():
            return p
    return None


def _find_update_state() -> Path | None:
    for loc_fn in _UPDATE_STATE_LOCATIONS:
        p = loc_fn()
        if p.exists():
            return p
    return None


def _empty_update_status(status: str, message: str) -> dict[str, Any]:
    return {
        "status": status,
        "message": message,
        "current_commit": None,
        "current_commit_short": None,
        "current_commit_msg": None,
        "new_commit": None,
        "new_commit_short": None,
        "new_commit_msg": None,
        "backend_restarted": False,
    }


def _read_update_state(state_file: Path) -> dict[str, Any] | None:
    try:
        with open(state_file, encoding="utf-8") as f:
            state = json.load(f)
        return state if isinstance(state, dict) else None
    except (OSError, json.JSONDecodeError):
        logger.warning("Failed to read update state file: %s", state_file, exc_info=True)
        return None


def _state_to_update_status(state: dict[str, Any], state_file: Path) -> dict[str, Any]:
    raw_status = str(state.get("status") or "unknown").lower()
    status = {
        "success": "idle",
        "complete": "idle",
        "completed": "idle",
        "running": "running",
        "error": "error",
        "failed": "error",
    }.get(raw_status, "unknown")
    message = str(state.get("message") or "Update status unknown. Check logs for details.")

    if status == "running":
        state_mtime = state_file.stat().st_mtime
        stale_after = state.get("stale_after_seconds", _UPDATE_STATE_STALE_AFTER_SEC)
        try:
            stale_after = int(stale_after)
        except (TypeError, ValueError):
            stale_after = _UPDATE_STATE_STALE_AFTER_SEC

        if (time.time() - state_mtime) > stale_after:
            status = "error"
            message = "Update appears to have stalled or failed"

    data = _empty_update_status(status, message)
    data.update(
        {
            "state_status": raw_status,
            "phase": state.get("phase"),
            "started_at": state.get("started_at"),
            "updated_at": state.get("updated_at"),
            "finished_at": state.get("finished_at"),
            "error": state.get("error"),
            "mode": state.get("mode"),
            "branch": state.get("branch"),
            "log_file": state.get("log_file"),
            "state_file": str(state_file),
            "backend_restarted": bool(state.get("backend_restarted", False)),
        }
    )

    for key in _COMMIT_KEYS:
        if key in state:
            data[key] = state.get(key)

    return data


@router.post("/update")
async def trigger_update():
    """
    Trigger manual update from GitHub.
    Runs the update script asynchronously and returns immediately.
    """
    from app.services.config_service import config_service

    update_script = settings.get_update_script_path()

    if not update_script.exists():
        raise HTTPException(
            status_code=404,
            detail="Update script not found. Make sure the system is properly configured.",
        )

    try:
        # Get git branch from config
        git_branch = await config_service.get_value("git_branch", "main")

        # Ensure log directory exists
        log_dir = settings.repo_dir / "backend" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "calvin-update.log"
        state_file = log_dir / "calvin-update-state.json"

        # Capture current end-of-file position so the stream endpoint knows
        # where this run's output begins (the log is appended, not truncated).
        log_offset = int(log_file.stat().st_size) if log_file.exists() else 0

        state_file.write_text(
            json.dumps(
                {
                    "status": "running",
                    "phase": "starting",
                    "message": "Starting Calvin update",
                    "mode": os.environ.get("CALVIN_MODE"),
                    "branch": git_branch,
                    "log_file": str(log_file),
                    "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        # Run update script in background (non-blocking)
        # Redirect both stdout and stderr to log file AND keep them for error checking
        with open(log_file, "a") as log_f:
            process = subprocess.Popen(
                ["/bin/bash", str(update_script)],
                stdout=log_f,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                text=True,
                cwd=str(settings.repo_dir),  # Set working directory
                env={
                    **os.environ,
                    "PATH": settings.system_path,
                    "GIT_BRANCH": git_branch,  # Pass git branch to update script
                    "UPDATE_LOG_FILE": str(log_file),
                    "UPDATE_STATE_FILE": str(state_file),
                },
            )

        # Wait a moment to see if process starts successfully
        time.sleep(0.5)

        # Check if process is still running (didn't immediately fail)
        if process.poll() is not None:
            # Process already finished (likely an error)
            error_msg = "Update script exited immediately. "
            if log_file.exists():
                try:
                    with open(log_file) as f:
                        last_lines = f.readlines()[-5:]
                        error_msg += "Last log: " + "".join(last_lines)
                except Exception:
                    error_msg += "Check log file for details."
            else:
                error_msg += (
                    "Log file not created. Script may not be executable or may have failed."
                )

            state_file.write_text(
                json.dumps(
                    {
                        "status": "error",
                        "phase": "starting",
                        "message": "Update script exited immediately.",
                        "error": error_msg,
                        "branch": git_branch,
                        "log_file": str(log_file),
                        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            raise HTTPException(status_code=500, detail=error_msg)

        return {
            "status": "started",
            "message": f"Update process started (PID: {process.pid})",
            "pid": process.pid,
            "log_file": str(log_file),
            "state_file": str(state_file),
            "log_offset": log_offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start update process: {str(e)}")


@router.get("/update/status")
async def get_update_status():
    """
    Get the status of the last update.
    Reads the last few lines from the update log.
    """
    state_file = _find_update_state()
    if state_file:
        state = _read_update_state(state_file)
        if state:
            return _state_to_update_status(state, state_file)

    log_file = _find_update_log()

    if not log_file or not log_file.exists():
        return _empty_update_status(
            "unknown", "Update log not found. No updates have been run yet."
        )

    try:
        # Read last 50 lines of log for better context (increased to capture commit info)
        with open(log_file) as f:
            lines = f.readlines()
            last_lines = lines[-50:] if len(lines) > 50 else lines
            all_lines = lines  # Keep all lines for commit extraction

        # Extract commit information from logs
        current_commit = None
        current_commit_short = None
        current_commit_msg = None
        new_commit = None
        new_commit_short = None
        new_commit_msg = None

        for line in all_lines:
            # Extract current commit
            match = re.search(r"Current commit: (\w+) \(([a-f0-9]+)\)", line)
            if match:
                current_commit_short = match.group(1)
                current_commit = match.group(2)

            match = re.search(r"Current commit message: (.+)", line)
            if match:
                current_commit_msg = match.group(1).strip()

            # Extract new commit
            match = re.search(r"Latest commit on remote: (\w+) \(([a-f0-9]+)\)", line)
            if match:
                new_commit_short = match.group(1)
                new_commit = match.group(2)

            match = re.search(r"Latest commit message: (.+)", line)
            if match:
                new_commit_msg = match.group(1).strip()

            # Also check for "Successfully updated to commit"
            match = re.search(r"Successfully updated to commit (\w+)", line)
            if match:
                new_commit_short = match.group(1)
                # Try to get full commit hash
                try:
                    repo_path = settings.repo_dir
                    if (repo_path / ".git").exists():
                        result = subprocess.run(
                            ["git", "rev-parse", new_commit_short],
                            cwd=str(repo_path),
                            capture_output=True,
                            text=True,
                            timeout=2,
                        )
                        if result.returncode == 0:
                            new_commit = result.stdout.strip()
                except Exception:
                    pass

        # Check if update is currently running
        # Look for various indicators of update activity
        log_content = "".join(last_lines)
        log_lower = log_content.lower()

        # Detect "start" across update scripts:
        # - scripts/update-calvin.sh               -> "Starting Calvin update..."
        # - scripts/update-calvin-dev.sh           -> "Starting Calvin development update..."
        # - scripts/update-calvin-prod.sh          -> "Starting Calvin production update..."
        has_started = "starting calvin" in log_lower and "update" in log_lower

        # Detect completion across update scripts:
        # - scripts/update-calvin.sh               -> "Update complete!"
        # - scripts/update-calvin-dev.sh           -> "Development update complete!"
        # - scripts/update-calvin-prod.sh          -> "Production update complete!"
        has_completed = (
            "update complete!" in log_lower
            or "production update complete!" in log_lower
            or "development update complete!" in log_lower
            or "update completed" in log_lower
            or "calvin update complete" in log_lower
        )

        # Treat explicit ERROR, or common failure words, as error indicators.
        # Note: we deliberately keep this broad because the update scripts log warnings in plain text.
        has_error = ("error" in log_lower) or ("failed" in log_lower)

        # Check for specific update steps
        has_pulling = (
            "pulling latest code" in log_lower
            or "fetching latest code" in log_lower
            or "git pull" in log_lower
            or "git fetch" in log_lower
        )
        has_updating_deps = (
            "updating backend dependencies" in log_lower
            or "updating frontend dependencies" in log_lower
            or "npm ci" in log_lower
            or "uv sync" in log_lower
            or "pip install" in log_lower
            or "installing" in log_lower
        )
        has_building = (
            "building frontend" in log_lower
            or "rebuilding frontend" in log_lower
            or "npm run build" in log_lower
            or "vite build" in log_lower
            or "transforming" in log_lower
        )
        has_build_complete = (
            "frontend build completed successfully" in log_lower
            or "pre-built frontend installed successfully" in log_lower
            or "build completed" in log_lower
        )
        has_restarting = (
            "restarting services" in log_lower
            or "restarting backend service" in log_lower
            or "restarting frontend" in log_lower
            or "systemctl restart" in log_lower
        )

        # Check if process is still running by checking for recent activity
        # If log was updated in last 60 seconds, assume it's running
        import time

        log_mtime = log_file.stat().st_mtime
        recently_updated = (time.time() - log_mtime) < 60

        # Determine status based on log content and recent activity
        # We treat any of the known "...update complete!" markers as completion.
        # Some update modes download pre-built frontend instead of building, so build markers may be absent.
        if has_completed:
            status = "idle"
            message = "Update completed successfully"
        elif has_error and not recently_updated:
            status = "error"
            message = "Update failed. Check logs for details."
        elif has_started and (
            has_pulling or has_updating_deps or has_building or has_restarting or recently_updated
        ):
            status = "running"
            # Provide more specific message based on what's happening
            if has_restarting:
                message = "Restarting services..."
            elif has_building and not has_build_complete:
                message = "Building frontend... (this may take a few minutes)"
            elif has_build_complete and not has_completed:
                message = "Frontend build complete, restarting services..."
            elif has_updating_deps:
                message = "Updating dependencies..."
            elif has_pulling:
                message = "Pulling latest code..."
            else:
                message = "Update in progress..."
        elif has_started and not recently_updated:
            status = "error"
            message = "Update appears to have stalled or failed"
        elif recently_updated:
            # Log is being written, but we didn't match any other markers yet.
            status = "running"
            message = "Update in progress..."
        else:
            status = "unknown"
            message = "Update status unknown. Check logs for details."

        # Get last 15 lines for display
        display_lines = "".join(last_lines[-15:])

        # Check if backend has restarted (indicates update is fully complete)
        has_backend_restarted = (
            "backend service restarted successfully" in log_lower
            or "backend service restarted successfully via" in log_lower
            or "backend restart initiated" in log_lower
        )

        return {
            "status": status,
            "last_log": display_lines,
            "message": message,
            "log_file": str(log_file),
            "current_commit": current_commit,
            "current_commit_short": current_commit_short,
            "current_commit_msg": current_commit_msg,
            "new_commit": new_commit,
            "new_commit_short": new_commit_short,
            "new_commit_msg": new_commit_msg,
            "backend_restarted": has_backend_restarted,
        }
    except Exception as e:
        data = _empty_update_status("error", f"Failed to read update log: {str(e)}")
        data["last_log"] = ""
        return data


@router.get("/update/stream")
async def stream_update_log(log_offset: int = 0):
    """Stream update log output as Server-Sent Events starting from log_offset bytes."""

    async def event_generator():
        current_pos = log_offset
        start_time = time.time()
        last_activity = time.time()
        last_keepalive = time.time()
        timeout_sec = 10 * 60
        inactivity_timeout_sec = 90
        has_started = False
        last_state_mtime = None

        while time.time() - start_time < timeout_sec:
            if time.time() - last_keepalive > 15:
                yield ": keepalive\n\n"
                last_keepalive = time.time()

            state_file = _find_update_state()
            if state_file:
                try:
                    state_mtime = state_file.stat().st_mtime
                    if state_mtime != last_state_mtime:
                        last_state_mtime = state_mtime
                        state = _read_update_state(state_file)
                        if state:
                            status_data = _state_to_update_status(state, state_file)
                            stream_status = status_data["status"]
                            if stream_status == "idle":
                                stream_status = "complete"

                            yield (
                                "data: "
                                + json.dumps(
                                    {
                                        "type": "status",
                                        "status": stream_status,
                                        "state": status_data,
                                        "message": status_data.get("message"),
                                        "phase": status_data.get("phase"),
                                    }
                                )
                                + "\n\n"
                            )

                            if stream_status in {"complete", "error"}:
                                return
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'log', 'line': f'[state stream error: {e}]'})}\n\n"

            log_file = _find_update_log()
            if log_file:
                try:
                    with open(log_file, "rb") as f:
                        f.seek(current_pos)
                        new_bytes = f.read()
                    if new_bytes:
                        current_pos += len(new_bytes)
                        last_activity = time.time()
                        new_content = new_bytes.decode("utf-8", errors="replace")
                        for line in new_content.splitlines():
                            if line.strip():
                                yield f"data: {json.dumps({'type': 'log', 'line': line})}\n\n"
                        content_lower = new_content.lower()
                        if "starting calvin" in content_lower and "update" in content_lower:
                            has_started = True
                        if (
                            "update complete!" in content_lower
                            or "production update complete!" in content_lower
                            or "development update complete!" in content_lower
                        ):
                            yield f"data: {json.dumps({'type': 'status', 'status': 'complete'})}\n\n"
                            return
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'log', 'line': f'[stream error: {e}]'})}\n\n"

            if has_started and (time.time() - last_activity) > inactivity_timeout_sec:
                yield f"data: {json.dumps({'type': 'status', 'status': 'error', 'message': 'Update appears to have stalled or failed. Check logs.'})}\n\n"
                return

            await asyncio.sleep(1)

        yield f"data: {json.dumps({'type': 'timeout'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/display/power/on")
async def turn_display_on():
    """Turn display on."""
    try:
        await display_power_service.turn_display_on()
        return {"status": "success", "message": "Display turned on"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to turn display on: {str(e)}")


@router.post("/display/power/off")
async def turn_display_off():
    """Turn display off."""
    try:
        await display_power_service.turn_display_off()
        return {"status": "success", "message": "Display turned off"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to turn display off: {str(e)}")


@router.get("/display/power/state")
async def get_display_state():
    """Get current display power state."""
    try:
        state = await display_power_service.get_display_state()
        return state
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get display state: {str(e)}")


@router.post("/display/timeout/configure")
async def configure_display_timeout():
    """Apply display timeout settings immediately."""
    try:
        await display_power_service.configure_display_timeout()
        return {"status": "success", "message": "Display timeout configured"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to configure display timeout: {str(e)}"
        )


@router.post("/reload-ui")
async def reload_ui():
    """
    Signal that the UI should be reloaded.
    This endpoint doesn't actually reload anything server-side,
    but can be used to trigger a client-side reload.
    """
    return {
        "status": "success",
        "message": "UI reload signal sent. Clients should reload.",
    }


@router.post("/restart-frontend")
async def restart_frontend():
    """
    Restart the frontend service.
    Uses a helper script with sudo permissions to restart the calvin-frontend service.
    """
    try:
        if not _restart_mechanism_available():
            raise HTTPException(
                status_code=500,
                detail=(
                    "No restart method available (missing /usr/local/bin/restart-calvin-services.sh "
                    "and systemctl not found)."
                ),
            )
        threading.Thread(
            target=lambda: _attempt_restart_calvin_service("frontend"), daemon=True
        ).start()
        return {
            "status": "success",
            "message": "Frontend service restart initiated. The service will restart shortly.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Frontend restart error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to restart frontend service: {str(e)}")


@router.post("/restart-backend")
async def restart_backend():
    """
    Restart the backend service.
    Uses a helper script with sudo permissions to restart the calvin-backend service.

    The actual restart runs after a short delay on a background thread so this process
    can return HTTP 200 before systemd stops it; otherwise clients typically see a
    network error even when the restart succeeds.
    """
    try:
        if not _restart_mechanism_available():
            raise HTTPException(
                status_code=500,
                detail=(
                    "No restart method available (missing /usr/local/bin/restart-calvin-services.sh "
                    "and systemctl not found)."
                ),
            )

        def _run_restart() -> None:
            time.sleep(_BACKEND_RESTART_DELAY_SEC)
            if not _attempt_restart_calvin_service("backend"):
                logger.error(
                    "Background backend restart failed after HTTP response was sent. "
                    "Check sudoers for calvin-restart and journalctl -u calvin-backend."
                )

        threading.Thread(target=_run_restart, daemon=True).start()
        return {
            "status": "success",
            "message": (
                "Backend restart scheduled. The service will restart in a moment "
                f"(after ~{_BACKEND_RESTART_DELAY_SEC:.0f}s)."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Backend restart error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to restart backend service: {str(e)}")


@router.post("/reboot")
async def reboot_system():
    """Reboot the Raspberry Pi."""
    try:
        # Try multiple methods to reboot
        # Note: The backend service runs with NoNewPrivileges=true, so sudo might not work
        # Try systemctl reboot first (might work if user has permissions)
        reboot_attempted = False

        # Method 1: systemctl reboot (might work without sudo)
        try:
            result = subprocess.run(
                ["systemctl", "reboot"],
                capture_output=True,
                timeout=5,
            )
            if result.returncode == 0:
                logger.info("Reboot initiated via systemctl reboot")
                reboot_attempted = True
            else:
                logger.warning(f"systemctl reboot failed: {result.stderr.decode()}")
        except FileNotFoundError:
            logger.warning("systemctl not found")
        except subprocess.TimeoutExpired:
            logger.info("systemctl reboot timed out (but may have initiated)")
            reboot_attempted = True
        except Exception as e:
            logger.error(f"systemctl reboot error: {e}", exc_info=True)

        # Method 2: Use dbus to call systemd-logind (alternative to systemctl)
        # This might work if polkit rules are configured
        if not reboot_attempted:
            try:
                result = subprocess.run(
                    [
                        "dbus-send",
                        "--system",
                        "--print-reply",
                        "--dest=org.freedesktop.login1",
                        "/org/freedesktop/login1",
                        "org.freedesktop.login1.Manager.Reboot",
                        "boolean:false",
                    ],
                    capture_output=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    logger.info("Reboot initiated via dbus")
                    reboot_attempted = True
                else:
                    error_msg = result.stderr.decode()
                    logger.warning(f"dbus reboot failed: {error_msg}")
            except FileNotFoundError:
                logger.warning("dbus-send not found")
            except subprocess.TimeoutExpired:
                logger.info("dbus reboot timed out (but may have initiated)")
                reboot_attempted = True
            except Exception as e:
                logger.error(f"dbus reboot error: {e}", exc_info=True)

        if reboot_attempted:
            return {"status": "success", "message": "System reboot initiated"}
        else:
            # If all methods failed, return error with details
            error_detail = (
                "Failed to reboot system: All reboot methods failed.\n"
                "Note: Polkit rules must be configured to allow calvin user to reboot.\n"
                "Check /etc/polkit-1/rules.d/50-calvin-reboot.rules exists.\n"
                "Check logs for details."
            )
            logger.error(error_detail)
            raise HTTPException(status_code=500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reboot error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reboot system: {str(e)}")
