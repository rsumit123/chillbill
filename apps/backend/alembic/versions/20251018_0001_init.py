"""
Initial schema

Revision ID: init_20251018
Revises: 
Create Date: 2025-10-18 00:00:00
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "init_20251018"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("avatar_url", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # groups
    op.create_table(
        "groups",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # group_members
    op.create_table(
        "group_members",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.String(length=36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_user"),
    )

    # expenses
    op.create_table(
        "expenses",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("group_id", sa.String(length=36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("receipt_path", sa.String(length=512), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # expense_splits
    op.create_table(
        "expense_splits",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("expense_id", sa.String(length=36), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("share_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("share_percentage", sa.Numeric(5, 2), nullable=True),
        sa.UniqueConstraint("expense_id", "user_id", name="uq_expense_user"),
    )

    # settlements
    op.create_table(
        "settlements",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("group_id", sa.String(length=36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("method", sa.Enum("manual", "upi", "stripe", name="settlement_method"), nullable=False, server_default="manual"),
        sa.Column("status", sa.Enum("pending", "success", "failed", name="settlement_status"), nullable=False, server_default="pending"),
        sa.Column("txn_ref", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # activity
    op.create_table(
        "activity",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("group_id", sa.String(length=36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "type",
            sa.Enum(
                "expense_created",
                "expense_updated",
                "settlement_created",
                "member_added",
                name="activity_type",
            ),
            nullable=False,
        ),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("activity")
    op.drop_table("settlements")
    op.drop_table("expense_splits")
    op.drop_table("expenses")
    op.drop_table("group_members")
    op.drop_table("groups")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
