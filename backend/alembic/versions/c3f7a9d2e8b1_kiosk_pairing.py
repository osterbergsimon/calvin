"""Add credential_hash and paired_at to the kiosks table.

A paired screen proves which screen it is with its own secret. Only the SHA-256
hex of that secret is stored, in ``credential_hash``; ``paired_at`` records when
the owner approved it. Both are nullable, so every existing screen starts
unpaired, and they are never part of the heartbeat columns (calvin-0xns).

Revision ID: c3f7a9d2e8b1
Revises: b8e2f4a6c9d1
Create Date: 2026-11-21
"""

import sqlalchemy as sa

from alembic import op

revision = "c3f7a9d2e8b1"
down_revision = "b8e2f4a6c9d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("credential_hash", sa.String(length=64), nullable=True))
    op.add_column("kiosks", sa.Column("paired_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "paired_at")
    op.drop_column("kiosks", "credential_hash")
