"""add group icon column

Revision ID: 20251018_0002_add_group_icon
Revises: 20251018_0001_init
Create Date: 2025-10-18
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251018_0002_add_group_icon'
down_revision = 'init_20251018'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('groups', sa.Column('icon', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('groups', 'icon')


