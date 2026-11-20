"""Verify the kiosk pairing migration upgrades and downgrades cleanly (calvin-0xns)."""

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command

_PREVIOUS = "b8e2f4a6c9d1"  # head before the credential columns
_REVISION = "c3f7a9d2e8b1"


def _columns(engine: sa.Engine, table: str) -> list[str]:
    with engine.connect() as conn:
        return [row[1] for row in conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()]


@pytest.mark.integration
def test_kiosk_pairing_migration_upgrade_and_downgrade(tmp_path):
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

    command.upgrade(cfg, _PREVIOUS)
    assert "credential_hash" not in _columns(engine, "kiosks")
    assert "paired_at" not in _columns(engine, "kiosks")
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO kiosks (id, last_seen) VALUES ('kitchen', '2026-11-19')"))

    command.upgrade(cfg, _REVISION)
    columns = _columns(engine, "kiosks")
    assert "credential_hash" in columns and "paired_at" in columns
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("SELECT credential_hash, paired_at FROM kiosks WHERE id = 'kitchen'")
        ).one()
    assert tuple(row) == (None, None)  # an existing screen starts unpaired

    command.downgrade(cfg, _PREVIOUS)
    columns = _columns(engine, "kiosks")
    assert "credential_hash" not in columns and "paired_at" not in columns
