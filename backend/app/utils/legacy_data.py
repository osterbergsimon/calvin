"""Bring data from the old checkout data dir into a moved CALVIN_DATA_DIR.

Before CALVIN_DATA_DIR was read, everything without its own env var went to
<backend>/data (via ./data/... relative to the backend working dir). Installs
whose root now moves — notably dev compose (setup.sh --mode dev), which kept
uploads, installed themes and the kiosk signing key in the bind-mounted
checkout — would otherwise come up with an empty gallery and a new key that
kiosks reject.

On the first start with a data dir other than <backend>/data, each known item
found there is copied to where the settings now put it, never overwriting
anything. The originals are left in place. A marker file in the data dir
records that this ran, so files deleted afterwards are not brought back.
"""

import shutil
from pathlib import Path

from loguru import logger

from app.config import LEGACY_DATA_DIR, Settings

MARKER = ".legacy-data-migrated"


def _targets(settings: Settings) -> list[tuple[str, Path]]:
    """(path under the legacy dir, where it lives now)."""
    db = settings.database_path
    return [
        ("db/calvin.db", db),
        ("db/calvin.db-wal", db.with_name(db.name + "-wal")),
        ("db/calvin.db-shm", db.with_name(db.name + "-shm")),
        ("kiosk-signing.key", settings.kiosk_signing_key_path),
        ("images", settings.image_dir),
        ("plugins", settings.plugins_dir),
        ("themes", settings.themes_dir),
        ("image_cache", settings.image_cache_dir),
        ("backups", settings.backup_dir),
    ]


def _copy_missing(src: Path, dest: Path, copied: list[Path]) -> None:
    """Copy src to dest; for directories, merge entry by entry. Never overwrite."""
    if src.is_dir():
        dest.mkdir(parents=True, exist_ok=True)
        for child in src.iterdir():
            _copy_missing(child, dest / child.name, copied)
    elif src.is_file() and not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copied.append(dest)


def migrate_legacy_data(settings: Settings, legacy_dir: Path | None = None) -> list[Path]:
    """Copy legacy <backend>/data contents into the current paths. Returns copied files."""
    legacy_dir = (legacy_dir or LEGACY_DATA_DIR).resolve()
    marker = settings.data_dir / MARKER
    if settings.data_dir.resolve() == legacy_dir or not legacy_dir.is_dir() or marker.exists():
        return []

    db_exists = settings.database_path.exists()
    copied: list[Path] = []
    for rel, dest in _targets(settings):
        src = legacy_dir / rel
        if not src.exists() or src.resolve() == dest.resolve():
            continue
        # Never pair an old DB (or its WAL) with one already in place.
        if rel.startswith("db/") and db_exists:
            continue
        if rel == "themes":
            # builtin.json ships with the code; only installed themes are data.
            for child in src.iterdir():
                if child.is_dir():
                    _copy_missing(child, dest / child.name, copied)
            continue
        if rel == "kiosk-signing.key" and dest.exists():
            if dest.read_bytes() != src.read_bytes():
                logger.warning(
                    f"Kiosk signing key differs between {src} and {dest}; keeping {dest}"
                )
            continue
        try:
            _copy_missing(src, dest, copied)
        except OSError:
            logger.opt(exception=True).warning(f"Could not copy legacy data {src} to {dest}")

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    marker.write_text(f"Copied legacy data from {legacy_dir}\n", encoding="utf-8")
    if copied:
        logger.warning(
            f"Copied {len(copied)} file(s) from the old data dir {legacy_dir} into "
            f"{settings.data_dir} (CALVIN_DATA_DIR). The originals were left in place."
        )
    return copied
