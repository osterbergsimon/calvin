"""System management endpoints."""

import asyncio
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
    update_script = Path("/usr/local/bin/update-calvin.sh")
    
    if not update_script.exists():
        raise HTTPException(
            status_code=404,
            detail="Update script not found. Make sure the system is properly configured."
        )
    
    try:
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
                    with open(log_file, "r") as f:
                        last_lines = f.readlines()[-5:]
                        error_msg += "Last log: " + "".join(last_lines)
                except:
                    error_msg += "Check log file for details."
            else:
                error_msg += "Log file not created. Script may not be executable or may have failed."
            
            raise HTTPException(
                status_code=500,
                detail=error_msg
            )
        
        return {
            "status": "started",
            "message": f"Update process started (PID: {process.pid})",
            "pid": process.pid,
            "log_file": str(log_file),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start update process: {str(e)}"
        )


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
        with open(log_file, "r") as f:
            lines = f.readlines()
            last_lines = lines[-30:] if len(lines) > 30 else lines
        
        # Check if update is currently running
        # Look for "Starting Calvin update" without "Update complete!"
        log_content = "".join(last_lines)
        has_started = "Starting Calvin update" in log_content
        has_completed = "Update complete!" in log_content
        
        # Check if process is still running by checking for recent activity
        # If log was updated in last 30 seconds, assume it's running
        import time
        log_mtime = log_file.stat().st_mtime
        recently_updated = (time.time() - log_mtime) < 30
        
        if has_started and not has_completed and recently_updated:
            status = "running"
            message = "Update in progress..."
        elif has_completed:
            status = "idle"
            message = "Update completed successfully"
        elif has_started and not has_completed and not recently_updated:
            status = "error"
            message = "Update appears to have stalled or failed"
        else:
            status = "unknown"
            message = "Update status unknown"
        
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
        raise HTTPException(status_code=500, detail=f"Failed to configure display timeout: {str(e)}")


@router.post("/reboot")
async def reboot_system():
    """Reboot the Raspberry Pi."""
    try:
        # Try sudo reboot first (calvin user should have NOPASSWD sudo)
        # If that fails, try systemctl reboot (might work if user has permissions)
        try:
            subprocess.Popen(
                ["sudo", "reboot"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except FileNotFoundError:
            # sudo not found, try systemctl reboot directly
            subprocess.Popen(
                ["systemctl", "reboot"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        return {"status": "success", "message": "System reboot initiated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reboot system: {str(e)}")

