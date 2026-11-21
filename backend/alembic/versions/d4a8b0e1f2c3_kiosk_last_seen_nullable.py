"""Let last_seen be null until a screen actually polls.

Approval used to stamp the row's ``last_seen`` with the approval time, so a
screen nobody had heard from looked "just seen". A paired-but-never-polled
screen has no seen time; the registry and the Screens list already read a null
``last_seen`` as offline. Renaming the table through batch mode is how SQLite
changes a column's nullability (calvin-0xns).

Revision ID: d4a8b0e1f2c3
Revises: c3f7a9d2e8b1
Create Date: 2026-11-21
"""

import sqlalchemy as sa

from alembic import op

revision = "d4a8b0e1f2c3"
down_revision = "c3f7a9d2e8b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("kiosks") as batch:
        batch.alter_column("last_seen", existing_type=sa.DateTime(), nullable=True)


def downgrade() -> None:
    # A NOT NULL column cannot hold the rows approval created; treat "never
    # polled" as the moment of the downgrade rather than fail.
    op.execute("UPDATE kiosks SET last_seen = CURRENT_TIMESTAMP WHERE last_seen IS NULL")
    with op.batch_alter_table("kiosks") as batch:
        batch.alter_column("last_seen", existing_type=sa.DateTime(), nullable=False)
