"""Add agent_version + agent_update_status columns to kiosks table.

Allows the display-agent (calvin-lxw) to report its running bundle version
and update status back to the Calvin host (task 5 of kiosk-agent-self-update).

Revision ID: 4ca1bddc0e65
Revises: d3b2c1a0f9e8
Create Date: 2026-07-15
"""

import sqlalchemy as sa

from alembic import op

revision = "4ca1bddc0e65"
down_revision = "d3b2c1a0f9e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("agent_version", sa.String(length=64), nullable=True))
    op.add_column("kiosks", sa.Column("agent_update_status", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "agent_update_status")
    op.drop_column("kiosks", "agent_version")
