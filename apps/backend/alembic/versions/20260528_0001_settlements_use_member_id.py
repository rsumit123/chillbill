"""
Replace settlements.from_user_id / to_user_id (FK users.id) with
from_member_id / to_member_id (FK group_members.id). This lets ghost
members participate in settlements, like they do in expenses.

The settlements table was previously unused by the frontend, so we don't
preserve any rows.

Revision ID: 20260528_0001_settlements_member
Revises: a1b2c3d4e5f6
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260528_0001_settlements_member"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No rows expected; drop and recreate keeps the SQLite migration simple.
    op.drop_table("settlements")
    op.create_table(
        "settlements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("group_id", sa.String(36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_member_id", sa.Integer(), sa.ForeignKey("group_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_member_id", sa.Integer(), sa.ForeignKey("group_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("method", sa.Enum("manual", "upi", "stripe", name="settlement_method"), nullable=False, server_default="manual"),
        sa.Column("status", sa.Enum("pending", "success", "failed", name="settlement_status"), nullable=False, server_default="pending"),
        sa.Column("txn_ref", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("settlements")
    op.create_table(
        "settlements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("group_id", sa.String(36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("method", sa.Enum("manual", "upi", "stripe", name="settlement_method"), nullable=False, server_default="manual"),
        sa.Column("status", sa.Enum("pending", "success", "failed", name="settlement_status"), nullable=False, server_default="pending"),
        sa.Column("txn_ref", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
