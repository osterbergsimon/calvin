"""The version and build revision shown in Settings > System.

``app.__version__`` is the one version source. release-please bumps it together
with ``.release-please-manifest.json`` (see ``release-please-config.json``), and
the image build may stamp the same release version through ``CALVIN_VERSION``.

The revision is the commit the running code was built from. The Docker image
has no git and no ``.git`` directory, so the build passes it as
``CALVIN_GIT_SHA``; a git checkout falls back to ``git rev-parse`` exactly once
(cached, never per request).
"""

import os
import subprocess
from functools import lru_cache
from pathlib import Path

from app import __version__

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def get_version() -> str:
    """Return the release version, preferring an image's build arg."""
    version = _env("CALVIN_VERSION")
    if version:
        return version.removeprefix("v")
    return __version__


@lru_cache(maxsize=1)
def get_revision() -> str | None:
    """Return the source revision, preferring the image's build arg.

    The environment is checked first because the runtime image ships without
    git. In a checkout ``git rev-parse --short HEAD`` is the dev fallback; its
    result is cached, so requests never spawn a process.
    """
    for name in ("CALVIN_GIT_SHA", "GIT_COMMIT_HASH"):
        revision = _env(name)
        if revision:
            return revision

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None
    return result.stdout.strip() or None
