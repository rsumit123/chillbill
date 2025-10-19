"""
Revision ID: 5a41a1351360
Revises: 20251018_0003_group_ghost_members
Create Date: 2025-10-19 03:22:06.069079
"""

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '5a41a1351360'
down_revision = '20251018_0003_group_ghost_members'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # SQLite doesn't support ALTER TABLE modifications well, so we need to recreate the table
    # Step 1: Create new table with member_id
    op.create_table(
        'expense_splits_new',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('expense_id', sa.String(36), sa.ForeignKey('expenses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('group_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('share_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('share_percentage', sa.Numeric(5, 2), nullable=True),
        sa.UniqueConstraint('expense_id', 'member_id', name='uq_expense_member')
    )
    
    # Step 2: Copy data from old table, mapping user_id to member_id
    # We'll use a direct SQL query to handle the join
    op.execute("""
        INSERT INTO expense_splits_new (id, expense_id, member_id, share_amount, share_percentage)
        SELECT 
            es.id,
            es.expense_id,
            gm.id as member_id,
            es.share_amount,
            es.share_percentage
        FROM expense_splits es
        JOIN expenses e ON es.expense_id = e.id
        JOIN group_members gm ON gm.group_id = e.group_id AND gm.user_id = es.user_id
    """)
    
    # Step 3: Drop old table
    op.drop_table('expense_splits')
    
    # Step 4: Rename new table
    op.rename_table('expense_splits_new', 'expense_splits')


def downgrade() -> None:
    # Reverse: recreate table with user_id
    op.create_table(
        'expense_splits_new',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('expense_id', sa.String(36), sa.ForeignKey('expenses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('share_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('share_percentage', sa.Numeric(5, 2), nullable=True),
        sa.UniqueConstraint('expense_id', 'user_id', name='uq_expense_user')
    )
    
    op.execute("""
        INSERT INTO expense_splits_new (id, expense_id, user_id, share_amount, share_percentage)
        SELECT 
            es.id,
            es.expense_id,
            gm.user_id,
            es.share_amount,
            es.share_percentage
        FROM expense_splits es
        JOIN group_members gm ON es.member_id = gm.id
    """)
    
    op.drop_table('expense_splits')
    op.rename_table('expense_splits_new', 'expense_splits')
