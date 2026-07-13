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

from sqlalchemy import DateTime, Enum, Float, String, func
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
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    face_shape: Mapped[FaceShape] = mapped_column(
        Enum(FaceShape, name="face_shape_enum"), nullable=False
    )
    measurements: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
