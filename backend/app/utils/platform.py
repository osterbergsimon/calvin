"""Platform detection utilities."""

import asyncio
import subprocess
from pathlib import Path


def is_raspberry_pi() -> bool:
    """
    Detect if running on Raspberry Pi.

    Returns:
        True if running on Raspberry Pi, False otherwise
    """
    # Method 1: Check for /proc/device-tree/model (most reliable)
    try:
        model_path = Path("/proc/device-tree/model")
        if model_path.exists():
            model = model_path.read_text().lower()
            if "raspberry pi" in model:
                return True
    except Exception:
        pass

    # Method 2: Check for vcgencmd (Raspberry Pi specific tool)
    try:
        result = subprocess.run(
            ["vcgencmd", "get_throttled"],
            capture_output=True,
            timeout=2,
        )
        if result.returncode == 0:
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # Method 3: Check for /sys/firmware/devicetree/base/model
    try:
        model_path = Path("/sys/firmware/devicetree/base/model")
        if model_path.exists():
            model = model_path.read_text().lower()
            if "raspberry pi" in model:
                return True
    except Exception:
        pass

    return False


def has_x11() -> bool:
    """
    Check if X11 is available.

    Returns:
        True if X11 is available, False otherwise
    """
    try:
        result = subprocess.run(
            ["xset", "-q"],
            capture_output=True,
            timeout=2,
            env={"DISPLAY": ":0", "HOME": "/home/calvin"},
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


async def run_command(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    """Run ``subprocess.run`` in a worker thread.

    Async routes and services must not call ``subprocess.run`` directly: it blocks
    the event loop, freezing every other request (kiosk polls, SSE) until it returns.
    """
    return await asyncio.to_thread(subprocess.run, cmd, **kwargs)
