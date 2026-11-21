"""Verify the kiosk pairing migration upgrades and downgrades cleanly (calvin-0xns)."""

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command

_PREVIOUS = "b8e2f4a6c9d1"  # head before the credential columns
_REVISION = "d4a8b0e1f2c3"  # credential columns + nullable last_seen


def _columns(engine: sa.Engine, table: str) -> list[str]:
    with engine.connect() as conn:
        return [row[1] for row in conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()]


def _not_null(engine: sa.Engine, table: str, column: str) -> bool:
    with engine.connect() as conn:
        rows = conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
    return next(row[3] for row in rows if row[1] == column) == 1


@pytest.mark.integration
def test_kiosk_pairing_migration_upgrade_and_downgrade(tmp_path):
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

    command.upgrade(cfg, _PREVIOUS)
    assert "credential_hash" not in _columns(engine, "kiosks")
    assert "paired_at" not in _columns(engine, "kiosks")
    assert _not_null(engine, "kiosks", "last_seen") is True
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO kiosks (id, last_seen) VALUES ('kitchen', '2026-11-19')"))

    command.upgrade(cfg, _REVISION)
    columns = _columns(engine, "kiosks")
    assert "credential_hash" in columns and "paired_at" in columns
    # A paired screen that has never polled has no seen time.
    assert _not_null(engine, "kiosks", "last_seen") is False
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("SELECT credential_hash, paired_at FROM kiosks WHERE id = 'kitchen'")
        ).one()
    assert tuple(row) == (None, None)  # an existing screen starts unpaired

    command.downgrade(cfg, _PREVIOUS)
    columns = _columns(engine, "kiosks")
    assert "credential_hash" not in columns and "paired_at" not in columns
    assert _not_null(engine, "kiosks", "last_seen") is True
