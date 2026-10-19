"""rename face shape model versions

Revision ID: 557a683481e4
Revises: 7c1e5a9d2f40
Create Date: 2026-10-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '557a683481e4'
down_revision: Union[str, Sequence[str], None] = '7c1e5a9d2f40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (old id, new run-based id) — data only, no schema change.
RENAMES = [
    ('fs-20260930-svm', 'v1-full-real-20260930-svm'),
    ('fs-20261005-svm', 'v2-full-real-20261005-svm'),
]

UPDATE_SQL = sa.text('UPDATE face_analyses SET model_version = :new WHERE model_version = :old')


def upgrade() -> None:
    """Upgrade schema."""
    for old, new in RENAMES:
        op.execute(UPDATE_SQL.bindparams(old=old, new=new))


def downgrade() -> None:
    """Downgrade schema."""
    for old, new in RENAMES:
        op.execute(UPDATE_SQL.bindparams(old=new, new=old))
