"""Add auth_provider column and make password_hash nullable for Google OAuth

Revision ID: a1b2c3d4e5f6
Revises: 88c8f009aaea
Create Date: 2026-03-23
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '88c8f009aaea'
branch_labels = None
depends_on = None


def upgrade():
    # SQLite doesn't support ALTER COLUMN, so password_hash nullable change
    # is handled by creating with batch mode
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('auth_provider', sa.String(20), nullable=False, server_default='email'))
        batch_op.alter_column('password_hash', existing_type=sa.String(512), nullable=True)


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('password_hash', existing_type=sa.String(512), nullable=False)
        batch_op.drop_column('auth_provider')
