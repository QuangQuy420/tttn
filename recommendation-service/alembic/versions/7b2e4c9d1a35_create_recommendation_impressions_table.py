"""create recommendation_impressions table

Revision ID: 7b2e4c9d1a35
Revises: 01640e07fe4e
Create Date: 2026-11-11 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7b2e4c9d1a35'
down_revision: Union[str, Sequence[str], None] = '01640e07fe4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Hand-written to match app/db/models.py (no DB available to autogenerate against).
    op.create_table('recommendation_impressions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('product_ids', postgresql.ARRAY(sa.UUID()), nullable=False),
    sa.Column('scores', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('alpha', sa.Float(), nullable=False),
    sa.Column('beta', sa.Float(), nullable=False),
    sa.Column('model_version', sa.String(length=64), nullable=True),
    sa.Column('face_analysis_id', sa.UUID(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_recommendation_impressions_user_id', 'recommendation_impressions', ['user_id'], unique=False)
    op.create_index('ix_recommendation_impressions_created_at', 'recommendation_impressions', ['created_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_recommendation_impressions_created_at', table_name='recommendation_impressions')
    op.drop_index('ix_recommendation_impressions_user_id', table_name='recommendation_impressions')
    op.drop_table('recommendation_impressions')
