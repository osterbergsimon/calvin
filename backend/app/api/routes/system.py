"""System management endpoints."""

import asyncio
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

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
        # Run update script in background (non-blocking)
        # Use subprocess.Popen to run asynchronously
        process = subprocess.Popen(
            ["/bin/bash", str(update_script)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        
        # Don't wait for completion - return immediately
        return {
            "status": "started",
            "message": "Update process started. Check logs at /var/log/calvin-update.log",
            "pid": process.pid,
        }
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
    log_file = Path("/var/log/calvin-update.log")
    
    if not log_file.exists():
        return {
            "status": "unknown",
            "message": "Update log not found. No updates have been run yet.",
        }
    
    try:
        # Read last 20 lines of log
        with open(log_file, "r") as f:
            lines = f.readlines()
            last_lines = lines[-20:] if len(lines) > 20 else lines
        
        # Check if update is currently running
        # Look for "Starting Calvin update" without "Update complete!"
        log_content = "".join(last_lines)
        is_running = "Starting Calvin update" in log_content and "Update complete!" not in log_content[-500:]
        
        return {
            "status": "running" if is_running else "idle",
            "last_log": "".join(last_lines[-10:]),  # Last 10 lines
            "message": "Update in progress" if is_running else "Last update completed",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to read update log: {str(e)}",
        }

