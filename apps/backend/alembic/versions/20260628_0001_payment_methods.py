"""Add users.payment_methods JSON + settlements.via_payment_method String.

Revision ID: 20260628_0001_payment_methods
Revises: 20260528_0001_settlements_member
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260628_0001_payment_methods"
down_revision = "20260528_0001_settlements_member"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support JSON server_default cleanly; use TEXT default '[]'
    op.add_column(
        "users",
        sa.Column(
            "payment_methods",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "settlements",
        sa.Column("via_payment_method", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("settlements", "via_payment_method")
    op.drop_column("users", "payment_methods")
