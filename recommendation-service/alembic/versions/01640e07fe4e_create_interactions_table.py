"""create interactions table

Revision ID: 01640e07fe4e
Revises:
Create Date: 2026-09-29 19:43:36.214071

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '01640e07fe4e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Hand-written to match app/db/models.py (no DB available to autogenerate against).
    # `sa.Enum` inside `create_table` creates `behavior_event_type_enum` automatically.
    op.create_table('interactions',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('product_id', sa.UUID(), nullable=False),
    sa.Column('event_type', sa.Enum('VIEW', 'TRY_ON', 'LIKE', 'UNLIKE', 'ADD_TO_CART', 'PURCHASE', name='behavior_event_type_enum'), nullable=False),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('source', sa.String(length=32), nullable=False),
    sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id')
    )
    op.create_index('ix_interactions_user_occurred', 'interactions', ['user_id', sa.text('occurred_at DESC')], unique=False)
    op.create_index('ix_interactions_product', 'interactions', ['product_id'], unique=False)
    op.create_index('ix_interactions_occurred_type', 'interactions', ['occurred_at', 'event_type'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_interactions_occurred_type', table_name='interactions')
    op.drop_index('ix_interactions_product', table_name='interactions')
    op.drop_index('ix_interactions_user_occurred', table_name='interactions')
    op.drop_table('interactions')
    # `drop_table` does not drop the Postgres enum type — drop it explicitly.
    op.execute('DROP TYPE IF EXISTS behavior_event_type_enum')
