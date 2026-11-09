"""Add wifi_power_save to the kiosks table.

The Wi-Fi power-save state the display agent reports (on | off | unknown): a
power-saving radio can drop broadcast ARP, so the Screens view can flag it
(calvin-grwq).

Revision ID: f6c9d3e4a5b7
Revises: e5b8c1d2f3a4
Create Date: 2026-11-08
"""

import sqlalchemy as sa

from alembic import op

revision = "f6c9d3e4a5b7"
down_revision = "e5b8c1d2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("wifi_power_save", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "wifi_power_save")
