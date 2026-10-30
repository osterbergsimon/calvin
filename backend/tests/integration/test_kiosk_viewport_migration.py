"""Verify the kiosk-viewport migration upgrades and downgrades cleanly (CLV-36)."""

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command

_PREVIOUS = "8f3a1c5d7e20"  # head before the viewport column
_REVISION = "c7a2b3d4e5f6"


def _columns(engine: sa.Engine, table: str) -> list[str]:
    with engine.connect() as conn:
        return [row[1] for row in conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()]


@pytest.mark.integration
def test_kiosk_viewport_migration_upgrade_and_downgrade(tmp_path):
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

    command.upgrade(cfg, _PREVIOUS)
    assert "viewport" not in _columns(engine, "kiosks")

    command.upgrade(cfg, _REVISION)
    assert "viewport" in _columns(engine, "kiosks")

    # A reported viewport survives as JSON.
    with engine.begin() as conn:
        conn.execute(
            sa.text("INSERT INTO kiosks (id, last_seen) VALUES ('kitchen-1', '2026-10-30')")
        )
        conn.execute(
            sa.text("UPDATE kiosks SET viewport = :vp WHERE id = 'kitchen-1'"),
            {"vp": '{"w": 800, "h": 480}'},
        )
    with engine.connect() as conn:
        stored = conn.execute(
            sa.text("SELECT viewport FROM kiosks WHERE id = 'kitchen-1'")
        ).scalar()
    assert stored == '{"w": 800, "h": 480}'

    command.downgrade(cfg, _PREVIOUS)
    assert "viewport" not in _columns(engine, "kiosks")
