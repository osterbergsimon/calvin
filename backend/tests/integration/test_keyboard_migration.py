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


@pytest.mark.integration
def test_retire_mode_actions_rewrites_stored_bindings(tmp_path):
    """py5: mode_* bindings are rewritten to the current vocabulary."""
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")

    with engine.begin() as conn:
        # Post-unification schema (no keyboard_type column).
        conn.execute(
            sa.text(
                "CREATE TABLE keyboard_mappings "
                "(id INTEGER PRIMARY KEY, key_code TEXT, action TEXT)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO keyboard_mappings (key_code, action) VALUES "
                "('KEY_1','mode_calendar'), "
                "('KEY_2','mode_photos'), "
                "('KEY_3','mode_web_services'), "
                "('KEY_4','mode_cycle'), "
                "('KEY_5','mode_spare'), "
                "('KEY_6','mode_settings'), "
                "('KEY_7','generic_next')"
            )
        )
        conn.execute(sa.text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(sa.text("INSERT INTO alembic_version (version_num) VALUES ('b1f0c0ffee01')"))

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "c2a1d0e5f6a7")

    with engine.connect() as conn:
        rows = dict(
            conn.execute(sa.text("SELECT key_code, action FROM keyboard_mappings")).fetchall()
        )
    assert rows == {
        "KEY_1": "screen_jump_calendar",
        "KEY_2": "screen_jump_photos",
        "KEY_3": "screen_jump_services",
        "KEY_4": "none",  # mode_cycle retired
        "KEY_5": "none",  # mode_spare retired
        "KEY_6": "mode_settings",  # kept
        "KEY_7": "generic_next",  # untouched
    }
