"""Verify the keyboard-mapping unification migration keeps the active type's rows."""

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command


@pytest.mark.integration
def test_unify_migration_keeps_active_type(tmp_path):
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "CREATE TABLE config (id INTEGER PRIMARY KEY, key TEXT, value TEXT, value_type TEXT)"
            )
        )
        conn.execute(
            sa.text("INSERT INTO config (key, value) VALUES ('keyboard_type', '\"7-button\"')")
        )
        conn.execute(
            sa.text(
                "CREATE TABLE keyboard_mappings "
                "(id INTEGER PRIMARY KEY, keyboard_type TEXT, key_code TEXT, action TEXT)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO keyboard_mappings (keyboard_type, key_code, action) VALUES "
                "('7-button','KEY_1','generic_prev'), "
                "('standard','KEY_LEFT','generic_prev')"
            )
        )
        # Stamp the DB at the down_revision so only our migration runs.
        conn.execute(sa.text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(sa.text("INSERT INTO alembic_version (version_num) VALUES ('7b0d79d6ae0c')"))

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "b1f0c0ffee01")

    with engine.connect() as conn:
        cols = [
            c[1] for c in conn.execute(sa.text("PRAGMA table_info(keyboard_mappings)")).fetchall()
        ]
        assert "keyboard_type" not in cols
        rows = conn.execute(sa.text("SELECT key_code, action FROM keyboard_mappings")).fetchall()
        assert rows == [("KEY_1", "generic_prev")]
