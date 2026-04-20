"""Validate bash syntax of setup scripts (install_privileged_sudo_helper_script, etc.)."""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCRIPTS = _REPO_ROOT / "scripts"


@pytest.mark.unit
@pytest.mark.skipif(sys.platform == "win32", reason="bash -n not used on Windows dev hosts")
@pytest.mark.skipif(shutil.which("bash") is None, reason="bash not on PATH")
@pytest.mark.parametrize(
    "relative_path",
    [
        "setup-common.sh",
        "setup.sh",
        "setup-dev.sh",
    ],
)
def test_setup_script_bash_syntax(relative_path: str):
    script = _SCRIPTS / relative_path
    if not script.is_file():
        pytest.skip(f"Missing {script}")
    subprocess.run(["bash", "-n", str(script)], check=True, capture_output=True)
