"""Test database helpers — extracted from conftest.py.

Why this module exists:
    conftest.py was 920 lines with three repeated patterns: (1) Windows-tolerant
    file deletion, (2) sync-engine table creation + sqlite3 verification, and
    (3) re-pointing Ormar models at a different `databases.Database` instance.
    Extracting them keeps conftest focused on fixture orchestration.
"""

from __future__ import annotations

import asyncio
import gc
import logging
import os
import sqlite3
import sys
import time
from pathlib import Path

import databases
from sqlalchemy import create_engine

from app.database import metadata

logger = logging.getLogger(__name__)

REQUIRED_TABLES: frozenset[str] = frozenset(
    {"config", "keyboard_mappings", "plugin_types", "plugins"}
)


def assert_models_registered() -> None:
    """Fail fast at import time if Ormar models haven't been registered with metadata.

    Ormar registers tables when the model module is imported, so callers must
    import `app.models.db_models` before calling this. We catch missing imports
    here rather than letting `metadata.create_all()` silently no-op later.
    """
    registered = set(metadata.tables.keys())
    if not registered.issuperset(REQUIRED_TABLES):
        missing = REQUIRED_TABLES - registered
        raise RuntimeError(
            f"Models not registered with metadata! Missing tables: {missing}. "
            f"Registered: {registered}. "
            "Make sure all Ormar models are imported before fixtures run."
        )


def cleanup_db_file(db_path: Path) -> None:
    """Delete a temp SQLite file, tolerating Windows file-lock races.

    Windows holds connection handles open briefly after `disconnect()`, so a
    naive `unlink()` raises PermissionError. We retry with backoff, then force
    GC, then chmod+unlink as a last resort.
    """
    if not db_path.exists():
        return

    max_retries = 5
    for attempt in range(max_retries):
        try:
            db_path.unlink()
            return
        except PermissionError:
            if attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue

            gc.collect()
            try:
                db_path.unlink()
                return
            except PermissionError:
                if sys.platform == "win32":
                    try:
                        os.chmod(db_path, 0o777)
                        db_path.unlink()
                        return
                    except Exception:
                        logger.warning(f"Could not delete {db_path}, may need manual cleanup")
                        return
                raise


def create_tables_with_verify(db_path: Path) -> None:
    """Create all metadata tables in a SQLite file and verify they exist.

    Runs synchronously (sync engine) on purpose: SQLite caches database state
    on first async connect, so tables MUST exist before any aiosqlite connection
    is opened.
    """
    if not metadata.tables:
        raise RuntimeError(
            "Cannot create tables: metadata is empty. "
            "Ensure Ormar models are imported before this is called."
        )

    abs_path = db_path.resolve()
    sync_engine = create_engine(f"sqlite:///{abs_path}", echo=False)
    try:
        metadata.create_all(sync_engine)
    finally:
        sync_engine.dispose()

    assert_required_tables(abs_path)


def assert_required_tables(db_path: Path, retries: int = 1) -> None:
    """Verify the required tables exist in `db_path`, optionally with retry.

    Used both right after create_all (retries=1) and before yielding a TestClient
    (retries>1, to absorb any lingering filesystem flush delay on Windows).
    """
    abs_path = db_path.resolve() if not db_path.is_absolute() else db_path
    last_err: Exception | None = None

    for attempt in range(retries):
        try:
            with sqlite3.connect(str(abs_path)) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                created = {row[0] for row in cursor.fetchall()}

            missing = REQUIRED_TABLES - created
            if not missing:
                return

            if attempt < retries - 1:
                time.sleep(0.2 * (attempt + 1))
                continue

            raise RuntimeError(
                f"Required tables missing in {abs_path}. "
                f"Missing: {missing}. Created: {sorted(created)}. "
                f"Registered in metadata: {sorted(metadata.tables.keys())}"
            )
        except sqlite3.Error as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(0.2 * (attempt + 1))
                continue
            raise RuntimeError(f"Failed to verify tables in {abs_path}: {e}") from last_err


def update_ormar_models_database(new_database: databases.Database) -> None:
    """Re-point Ormar models at `new_database`.

    Ormar caches the database connection on `ormar_config.database` at class
    definition time. Patching `app.database.database` alone isn't enough — the
    models keep their original reference until we update them explicitly.
    """
    from app.models.db_models import (
        ConfigDB,
        KeyboardMappingDB,
        PluginDB,
        PluginTypeDB,
    )

    for model in (ConfigDB, KeyboardMappingDB, PluginDB, PluginTypeDB):
        model.ormar_config.database = new_database


async def windows_settle() -> None:
    """Brief async sleep on Windows to let file handles release after disconnect."""
    if sys.platform == "win32":
        await asyncio.sleep(0.1)
