"""recurring_rules + expenses.recurring_rule_id

Revision ID: 20260701_0001
Revises: 20260628_0001_payment_methods
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa


revision = "20260701_0001"
down_revision = "20260628_0001_payment_methods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.String(36), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("paid_by_member_id", sa.Integer(), sa.ForeignKey("group_members.id"), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("splits_json", sa.JSON(), nullable=False),
        sa.Column("day_of_month", sa.SmallInteger(), nullable=False),
        sa.Column("next_run_at", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("paused_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_recurring_rules_next_run_active",
        "recurring_rules",
        ["next_run_at"],
    )
    op.add_column(
        "expenses",
        sa.Column("recurring_rule_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("expenses", "recurring_rule_id")
    op.drop_index("idx_recurring_rules_next_run_active", table_name="recurring_rules")
    op.drop_table("recurring_rules")
