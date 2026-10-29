"""Kiosk update bundle — the small file-set a kiosk needs, served from the checkout."""

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import settings
from app.services import kiosk_signing

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

# Setup scripts the one-command installer (GET /api/kiosks/install.sh) downloads.
# They are served and hashed in the signed manifest, but are NOT bundle files:
# never installed by the updater and not part of the bundle version.
INSTALLER_FILES: dict[str, str] = {
    "setup-kiosk.sh": "scripts/setup-kiosk.sh",
    "setup-common.sh": "scripts/setup-common.sh",
}

INSTALL_SCRIPT_PATH = "deploy/kiosk-agent/install-kiosk.sh"
_SERVER_URL_PLACEHOLDER = "@CALVIN_SERVER_URL@"
# Baked into a bash single-quoted string; the value comes from the request's Host
# header, so allow only plain URL characters (no quotes, $, backticks, spaces).
_SAFE_URL_RE = re.compile(r"https?://[A-Za-z0-9.\-\[\]:]+(/[A-Za-z0-9._~/\-]*)?")


def _root(root: Path | None) -> Path:
    if root is not None:
        return root
    return settings.kiosk_bundle_dir or settings.repo_dir


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_bundle_file(name: str, root: Path | None = None) -> bytes:
    """Raw bytes for a bundle file. KeyError for any name not in the allowlist."""
    bf = _BY_NAME[name]  # KeyError => unknown/hostile name; never touches the filesystem
    return (_root(root) / bf.repo_path).read_bytes()


def read_installer_file(name: str, root: Path | None = None) -> bytes:
    """Raw bytes for an installer script. KeyError for any name not in the allowlist."""
    rel = INSTALLER_FILES[name]
    return (_root(root) / rel).read_bytes()


def render_install_script(server_url: str, root: Path | None = None) -> str:
    """The kiosk installer with this server's URL baked in (empty if the URL is unsafe)."""
    url = server_url.rstrip("/")
    if not _SAFE_URL_RE.fullmatch(url):
        url = ""  # installer then insists on --backend-url
    template = (_root(root) / INSTALL_SCRIPT_PATH).read_text()
    return template.replace(_SERVER_URL_PLACEHOLDER, url)


def ensure_signing_key() -> Path:
    """Create the manifest signing key up front so it can be read before any kiosk exists."""
    kiosk_signing.load_or_create_key(settings.kiosk_signing_key_path)
    return settings.kiosk_signing_key_path


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
    installer = [
        {"name": name, "sha256": _sha256(r / rel)} for name, rel in INSTALLER_FILES.items()
    ]
    return {
        "version": _version_from(files),
        "min_python": MIN_PYTHON,
        "files": files,
        "installer": installer,
    }


def build_signed_manifest(root: Path | None = None) -> dict:
    """build_manifest() plus an HMAC signature over its canonical form."""
    m = build_manifest(root)
    key = kiosk_signing.load_or_create_key(settings.kiosk_signing_key_path)
    return {**m, "signature": kiosk_signing.sign(m, key), "sig_alg": kiosk_signing.ALG}


def _version_from(files: list[dict]) -> str:
    blob = "\n".join(f"{f['name']}:{f['sha256']}" for f in sorted(files, key=lambda f: f["name"]))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def bundle_version(root: Path | None = None) -> str:
    r = _root(root)
    files = [{"name": bf.name, "sha256": _sha256(r / bf.repo_path)} for bf in BUNDLE_FILES]
    return _version_from(files)
