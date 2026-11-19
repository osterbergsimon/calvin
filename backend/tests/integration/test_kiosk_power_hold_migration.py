"""Verify the kiosk power-hold migration upgrades and downgrades cleanly (calvin-2ifv)."""

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command

_PREVIOUS = "a7d4e1f8c2b9"  # head before the power-hold columns
_REVISION = "b8e2f4a6c9d1"


def _columns(engine: sa.Engine, table: str) -> list[str]:
    with engine.connect() as conn:
        return [row[1] for row in conn.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()]


@pytest.mark.integration
def test_kiosk_power_hold_migration_upgrade_and_downgrade(tmp_path):
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

    command.upgrade(cfg, _PREVIOUS)
    assert "power_hold" not in _columns(engine, "kiosks")
    with engine.begin() as conn:
        conn.execute(sa.text("INSERT INTO kiosks (id, last_seen) VALUES ('kitchen', '2026-11-18')"))

    command.upgrade(cfg, _REVISION)
    columns = _columns(engine, "kiosks")
    assert "power_hold" in columns and "agent_features" in columns
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("SELECT power_hold, agent_features FROM kiosks WHERE id = 'kitchen'")
        ).one()
    assert tuple(row) == (None, None)  # an existing screen starts with no hold

    command.downgrade(cfg, _PREVIOUS)
    columns = _columns(engine, "kiosks")
    assert "power_hold" not in columns and "agent_features" not in columns
