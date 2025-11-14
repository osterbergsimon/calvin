"""System management endpoints."""

import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.services.display_power_service import display_power_service

router = APIRouter()


@router.post("/update")
async def trigger_update():
    """
    Trigger manual update from GitHub.
    Runs the update script asynchronously and returns immediately.
    """
    from app.services.config_service import config_service

    update_script = Path("/usr/local/bin/update-calvin.sh")

    if not update_script.exists():
        raise HTTPException(
            status_code=404,
            detail="Update script not found. Make sure the system is properly configured.",
        )

    try:
        # Get git branch from config
        git_branch = await config_service.get_value("git_branch", "main")

        # Ensure log directory exists
        log_dir = Path("/home/calvin/calvin/backend/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "calvin-update.log"

        # Run update script in background (non-blocking)
        # Redirect both stdout and stderr to log file AND keep them for error checking
        with open(log_file, "a") as log_f:
            process = subprocess.Popen(
                ["/bin/bash", str(update_script)],
                stdout=log_f,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                text=True,
                cwd="/home/calvin/calvin",  # Set working directory
                env={
                    **os.environ,
                    "PATH": "/home/calvin/.local/bin:/usr/local/bin:/usr/bin:/bin",
                    "GIT_BRANCH": git_branch,  # Pass git branch to update script
                },
            )

        # Wait a moment to see if process starts successfully
        import time

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

            raise HTTPException(status_code=500, detail=error_msg)

        return {
            "status": "started",
            "message": f"Update process started (PID: {process.pid})",
            "pid": process.pid,
            "log_file": str(log_file),
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
    # Try multiple possible log file locations
    log_locations = [
        Path("/home/calvin/calvin/backend/logs/calvin-update.log"),
        Path("/home/calvin/calvin-update.log"),
        Path("/tmp/calvin-update.log"),
        Path("/var/log/calvin-update.log"),
    ]

    log_file = None
    for loc in log_locations:
        if loc.exists():
            log_file = loc
            break

    if not log_file or not log_file.exists():
        return {
            "status": "unknown",
            "message": "Update log not found. No updates have been run yet.",
        }

    try:
        # Read last 30 lines of log for better context
        with open(log_file) as f:
            lines = f.readlines()
            last_lines = lines[-30:] if len(lines) > 30 else lines

        # Check if update is currently running
        # Look for various indicators of update activity
        log_content = "".join(last_lines)
        has_started = "Starting Calvin update" in log_content or "Starting update" in log_content
        has_completed = (
            "Update complete!" in log_content
            or "Update completed" in log_content
            or "Calvin update complete" in log_content
        )
        has_error = (
            "ERROR" in log_content or "error" in log_content or "failed" in log_content.lower()
        )

        # Check for specific update steps
        has_pulling = (
            "Pulling latest code" in log_content
            or "git pull" in log_content.lower()
            or "git fetch" in log_content.lower()
        )
        has_updating_deps = (
            "Updating backend dependencies" in log_content
            or "Updating frontend dependencies" in log_content
            or "Installing" in log_content
        )
        has_building = (
            "Building frontend" in log_content
            or "Rebuilding frontend" in log_content
            or "npm run build" in log_content.lower()
            or "vite build" in log_content.lower()
            or "transforming" in log_content.lower()
        )
        has_build_complete = (
            "Frontend build completed successfully" in log_content
            or "build completed" in log_content.lower()
        )
        has_restarting = (
            "Restarting services" in log_content or "systemctl restart" in log_content.lower()
        )

        # Check if process is still running by checking for recent activity
        # If log was updated in last 60 seconds, assume it's running
        import time

        log_mtime = log_file.stat().st_mtime
        recently_updated = (time.time() - log_mtime) < 60

        # Determine status based on log content and recent activity
        # Only mark as complete if we have BOTH the build completion AND the update complete message
        # This ensures the build actually finished before we mark it as done
        if has_completed and has_build_complete:
            status = "idle"
            message = "Update completed successfully"
        elif has_completed and not has_build_complete and recently_updated:
            # Update complete message exists but build hasn't finished yet - still running
            status = "running"
            if has_building:
                message = "Building frontend... (this may take a few minutes)"
            else:
                message = "Update in progress..."
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
        else:
            status = "unknown"
            message = "Update status unknown. Check logs for details."

        # Get last 15 lines for display
        display_lines = "".join(last_lines[-15:])

        return {
            "status": status,
            "last_log": display_lines,
            "message": message,
            "log_file": str(log_file),
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to read update log: {str(e)}",
            "last_log": "",
        }


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
                print("Reboot initiated via systemctl reboot")
                reboot_attempted = True
            else:
                print(f"systemctl reboot failed: {result.stderr.decode()}")
        except FileNotFoundError:
            print("systemctl not found")
        except subprocess.TimeoutExpired:
            print("systemctl reboot timed out (but may have initiated)")
            reboot_attempted = True
        except Exception as e:
            print(f"systemctl reboot error: {e}")

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
                    print("Reboot initiated via dbus")
                    reboot_attempted = True
                else:
                    error_msg = result.stderr.decode()
                    print(f"dbus reboot failed: {error_msg}")
            except FileNotFoundError:
                print("dbus-send not found")
            except subprocess.TimeoutExpired:
                print("dbus reboot timed out (but may have initiated)")
                reboot_attempted = True
            except Exception as e:
                print(f"dbus reboot error: {e}")

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
            print(error_detail)
            raise HTTPException(status_code=500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Reboot error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reboot system: {str(e)}")
