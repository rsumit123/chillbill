"""group ghost members

Revision ID: 20251018_0003_group_ghost_members
Revises: 20251018_0002_add_group_icon
Create Date: 2025-10-18
"""

from alembic import op
import sqlalchemy as sa


revision = '20251018_0003_group_ghost_members'
down_revision = '20251018_0002_add_group_icon'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support ALTER COLUMN DROP NOT NULL directly; recreate via batch
    with op.batch_alter_table('group_members') as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.String(length=36), nullable=True)
        batch_op.add_column(sa.Column('name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('is_ghost', sa.Boolean(), nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    with op.batch_alter_table('group_members') as batch_op:
        batch_op.drop_column('is_ghost')
        batch_op.drop_column('name')
        batch_op.alter_column('user_id', existing_type=sa.String(length=36), nullable=False)


