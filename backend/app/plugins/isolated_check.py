"""Run the installed-plugin import check in a child interpreter.

An uploaded plugin is untrusted until it has been shown to import cleanly, so
the import happens in ``python -I -m app.plugins.check_plugin`` rather than in
the server process. The child imports ``plugin.py`` through the same loader
seam the server uses, so what it validates is exactly what the server will
later load. See ``docs/superpowers/specs/2026-10-29-admin-auth-design.md`` §6.

The child runs as the same user, so this is a "don't load rejected code into
the server" guard, not a sandbox.
"""

import json
import os
import subprocess
import sys

from loguru import logger

from app.config import BACKEND_DIR, settings
from app.services.plugin_installer import plugin_installer

CHECK_MODULE = "app.plugins.check_plugin"
DEFAULT_TIMEOUT = 60.0


def _child_env() -> dict[str, str]:
    """A minimal environment: nothing from the parent server leaks into the child."""
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME") or os.environ.get("USERPROFILE") or "",
        "CALVIN_DATA_DIR": str(settings.data_dir),
        "PLUGIN_DIR": str(plugin_installer.plugins_dir),
        "PYTHONPATH": str(BACKEND_DIR),
    }
    return env


def _parse_result(stdout: str) -> dict[str, list[str]] | None:
    """Read the child's JSON line (the last line, so plugin prints don't break us)."""
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except ValueError:
            return None
        if not isinstance(payload, dict):
            return None
        errors = payload.get("errors")
        if not isinstance(errors, list):
            return None
        return payload
    return None


def run_isolated_plugin_check(plugin_id: str, timeout: float = DEFAULT_TIMEOUT) -> list[str]:
    """Import a freshly installed plugin in a child process.

    Returns:
        Human-readable error strings; empty means the child imported and
        registered the plugin cleanly. Blocking — call it through
        ``asyncio.to_thread`` (or the installer's lock) from an async route.
    """
    try:
        plugin_dir = plugin_installer.get_plugin_path(plugin_id)
    except ValueError as e:
        return [str(e)]
    if not plugin_dir.is_dir():
        return [f"Plugin directory {plugin_dir} does not exist"]

    cmd = [sys.executable, "-I", "-m", CHECK_MODULE, str(plugin_dir)]
    logger.debug("Checking plugin {} in a child process: {}", plugin_id, " ".join(cmd))
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(BACKEND_DIR),
            env=_child_env(),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return [f"Plugin check timed out after {timeout:g} s: importing plugin.py did not finish."]
    except OSError as e:
        return [f"Could not run the plugin check: {e}"]

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        message = f"Plugin check exited with status {completed.returncode}"
        return [f"{message}: {detail}" if detail else message]

    result = _parse_result(completed.stdout)
    if result is None:
        return ["Plugin check produced no parseable result (expected one JSON line)."]
    return [str(error) for error in result["errors"]]
