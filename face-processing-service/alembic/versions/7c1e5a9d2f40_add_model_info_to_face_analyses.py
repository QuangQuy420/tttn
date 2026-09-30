"""add model info to face_analyses

Revision ID: 7c1e5a9d2f40
Revises: 4bc306f02b28
Create Date: 2026-09-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7c1e5a9d2f40'
down_revision: Union[str, Sequence[str], None] = '4bc306f02b28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('face_analyses', sa.Column('model_version', sa.String(length=64), nullable=True))
    op.add_column('face_analyses', sa.Column('method', sa.String(length=16), nullable=True))
    op.add_column(
        'face_analyses',
        sa.Column('probabilities', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index(
        'ix_face_analyses_user_created',
        'face_analyses',
        ['user_id', sa.text('created_at DESC')],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_face_analyses_user_created', table_name='face_analyses')
    op.drop_column('face_analyses', 'probabilities')
    op.drop_column('face_analyses', 'method')
    op.drop_column('face_analyses', 'model_version')
