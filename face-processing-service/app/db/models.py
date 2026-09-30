"""ORM models — SQLAlchemy 2.0 declarative style.

`FaceShape` reuses the exact 6 values from `product-service`'s `FaceShape` enum
(`product-service/src/db/enums/face-shape.enum.ts:6-13`) so results are directly
comparable with product-service data later. Do not invent a 7th value or rename any
of these (per the plan). This is a naming convention only, not a DB/FK constraint —
`face_processing_db` has no cross-database foreign keys to `product_db`.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FaceShape(str, enum.Enum):
    ROUND = "ROUND"
    SQUARE = "SQUARE"
    OVAL = "OVAL"
    HEART = "HEART"
    DIAMOND = "DIAMOND"
    OBLONG = "OBLONG"


class FaceAnalysis(Base):
    __tablename__ = "face_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    face_shape: Mapped[FaceShape] = mapped_column(
        Enum(FaceShape, name="face_shape_enum"), nullable=False
    )
    measurements: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Which classifier produced the result — null for rows created before plan 08.
    model_version: Mapped[str | None] = mapped_column(String(64))
    method: Mapped[str | None] = mapped_column(String(16))
    # {FaceShape value: probability} for all 6 shapes.
    probabilities: Mapped[dict | None] = mapped_column(JSONB)


# Serves the "latest analysis of a user" query (`/internal/users/{id}/latest-analysis`).
Index(
    "ix_face_analyses_user_created",
    FaceAnalysis.user_id,
    FaceAnalysis.created_at.desc(),
)
