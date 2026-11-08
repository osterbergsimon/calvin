"""Add peer_ips to the kiosks table.

The network addresses a kiosk's polls arrived from. A sign-in from one of them is
a kiosk session (minutes, not a month), whatever the page claims: the address is
something a visitor at the screen cannot change (calvin-q4o8).

Revision ID: a7d4e1f8c2b9
Revises: f6c9d3e4a5b7
Create Date: 2026-11-08
"""

import sqlalchemy as sa

from alembic import op

revision = "a7d4e1f8c2b9"
down_revision = "f6c9d3e4a5b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("peer_ips", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "peer_ips")
