"""Kiosk update bundle — the small file-set a kiosk needs, served from the checkout."""

import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

MIN_PYTHON = "3.9"


@dataclass(frozen=True)
class BundleFile:
    name: str
    repo_path: str
    target_path: str
    mode: str
    restart_unit: str | None
    enable: bool = False


BUNDLE_FILES: list[BundleFile] = [
    BundleFile(
        "calvin_display_agent.py",
        "deploy/kiosk-agent/calvin_display_agent.py",
        "/usr/local/bin/calvin_display_agent.py",
        "0755",
        "calvin-display-agent.service",
    ),
    BundleFile(
        "calvin-display-agent.service",
        "deploy/systemd/calvin-display-agent.service",
        "/etc/systemd/system/calvin-display-agent.service",
        "0644",
        "calvin-display-agent.service",
        enable=True,
    ),
    BundleFile(
        "calvin-kiosk-remote.service",
        "deploy/systemd/calvin-kiosk-remote.service",
        "/etc/systemd/system/calvin-kiosk-remote.service",
        "0644",
        "calvin-kiosk-remote.service",
        enable=True,
    ),
    BundleFile(
        "calvin-x.service",
        "deploy/systemd/calvin-x.service",
        "/etc/systemd/system/calvin-x.service",
        "0644",
        "calvin-x.service",
        enable=True,
    ),
    BundleFile(
        "update-kiosk.sh",
        "deploy/kiosk-agent/update-kiosk.sh",
        "/usr/local/bin/update-kiosk.sh",
        "0755",
        None,
    ),
    BundleFile(
        "calvin-kiosk-update.service",
        "deploy/systemd/calvin-kiosk-update.service",
        "/etc/systemd/system/calvin-kiosk-update.service",
        "0644",
        None,
    ),
]

_BY_NAME = {bf.name: bf for bf in BUNDLE_FILES}


def _root(root: Path | None) -> Path:
    return root if root is not None else settings.repo_dir


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_bundle_file(name: str, root: Path | None = None) -> bytes:
    """Raw bytes for a bundle file. KeyError for any name not in the allowlist."""
    bf = _BY_NAME[name]  # KeyError => unknown/hostile name; never touches the filesystem
    return (_root(root) / bf.repo_path).read_bytes()


def build_manifest(root: Path | None = None) -> dict:
    r = _root(root)
    files = []
    for bf in BUNDLE_FILES:
        files.append(
            {
                "name": bf.name,
                "sha256": _sha256(r / bf.repo_path),
                "mode": bf.mode,
                "target_path": bf.target_path,
                "restart_unit": bf.restart_unit,
                "enable": bf.enable,
            }
        )
    return {"version": _version_from(files), "min_python": MIN_PYTHON, "files": files}


def _version_from(files: list[dict]) -> str:
    blob = "\n".join(f"{f['name']}:{f['sha256']}" for f in sorted(files, key=lambda f: f["name"]))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def bundle_version(root: Path | None = None) -> str:
    return str(build_manifest(root)["version"])
