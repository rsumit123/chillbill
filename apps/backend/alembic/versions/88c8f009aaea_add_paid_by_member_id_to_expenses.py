"""
Revision ID: 88c8f009aaea
Revises: 5a41a1351360
Create Date: 2025-10-19 05:29:48.592992
"""

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '88c8f009aaea'
down_revision = '5a41a1351360'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add paid_by_member_id column to expenses table
    # For SQLite, we need to:
    # 1. Create new table with the new column
    # 2. Copy data (mapping created_by to member_id where possible)
    # 3. Drop old table
    # 4. Rename new table
    
    # Step 1: Create new expenses table with paid_by_member_id
    op.create_table(
        'expenses_new',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('group_id', sa.String(36), sa.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('paid_by_member_id', sa.Integer(), sa.ForeignKey('group_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('total_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('receipt_path', sa.String(512), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Step 2: Copy data, finding member_id for each created_by user
    # We need to join expenses with group_members to find the member_id
    op.execute("""
        INSERT INTO expenses_new (
            id, group_id, created_by, paid_by_member_id, total_amount, currency, 
            note, date, receipt_path, deleted_at, created_at, updated_at
        )
        SELECT 
            e.id,
            e.group_id,
            e.created_by,
            gm.id as paid_by_member_id,
            e.total_amount,
            e.currency,
            e.note,
            e.date,
            e.receipt_path,
            e.deleted_at,
            e.created_at,
            e.updated_at
        FROM expenses e
        JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = e.created_by
    """)
    
    # Step 3: Drop old table
    op.drop_table('expenses')
    
    # Step 4: Rename new table
    op.rename_table('expenses_new', 'expenses')


def downgrade() -> None:
    # Reverse: remove paid_by_member_id column
    op.create_table(
        'expenses_old',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('group_id', sa.String(36), sa.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('total_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('receipt_path', sa.String(512), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    op.execute("""
        INSERT INTO expenses_old
        SELECT id, group_id, created_by, total_amount, currency, note, date, receipt_path, deleted_at, created_at, updated_at
        FROM expenses
    """)
    
    op.drop_table('expenses')
    op.rename_table('expenses_old', 'expenses')
