"""Add agent_update_message column to kiosks table.

The display-agent already knows the updater's state message ("rolled back to
previous version", "device python < 3.9; keeping current agent"). Storing it
lets the kiosk software fleet view tell an OS-too-old failure from a rollback
(CLV-19).

Revision ID: 8f3a1c5d7e20
Revises: 4ca1bddc0e65
Create Date: 2026-10-29
"""

import sqlalchemy as sa

from alembic import op

revision = "8f3a1c5d7e20"
down_revision = "4ca1bddc0e65"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("agent_update_message", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "agent_update_message")
