"""Retire obsolete mode_* keyboard actions (py5 vocabulary unfreeze).

Rewrites persisted keyboard mappings from the pre-py5 vocabulary:

- mode_calendar     -> screen_jump_calendar
- mode_photos       -> screen_jump_photos
- mode_web_services -> screen_jump_services

The renamed actions never did a mode switch — they jump to the first screen
containing a region of that kind, so the value now says what it does. The two
dead actions (mode_cycle: cycled an invisible mode; mode_spare: no-op) are
rewritten to "none" so any key a user bound to them becomes an explicit
No Action rather than an unknown value.

Revision ID: c2a1d0e5f6a7
Revises: b1f0c0ffee01
Create Date: 2026-07-03
"""

import sqlalchemy as sa

from alembic import op

revision = "c2a1d0e5f6a7"
down_revision = "b1f0c0ffee01"
branch_labels = None
depends_on = None


# old action value -> new action value
_RENAMES = {
    "mode_calendar": "screen_jump_calendar",
    "mode_photos": "screen_jump_photos",
    "mode_web_services": "screen_jump_services",
    "mode_cycle": "none",
    "mode_spare": "none",
}


def upgrade() -> None:
    conn = op.get_bind()
    for old, new in _RENAMES.items():
        conn.execute(
            sa.text("UPDATE keyboard_mappings SET action = :new WHERE action = :old"),
            {"new": new, "old": old},
        )


def downgrade() -> None:
    conn = op.get_bind()
    # Reverse only the unambiguous renames; mode_cycle/mode_spare collapsed to
    # "none" and cannot be distinguished from a genuine "none" binding, so they
    # are not restored.
    reverse = {
        "screen_jump_calendar": "mode_calendar",
        "screen_jump_photos": "mode_photos",
        "screen_jump_services": "mode_web_services",
    }
    for new, old in reverse.items():
        conn.execute(
            sa.text("UPDATE keyboard_mappings SET action = :old WHERE action = :new"),
            {"old": old, "new": new},
        )
