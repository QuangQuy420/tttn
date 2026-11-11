"""Response DTOs for the `/admin/*` endpoints (face-shape model info + analytics).

Field names are camelCase on purpose (no alias generator). `from`/`to` are the exception:
`from` is a Python keyword, so the range fields are `date_from`/`date_to` and serialize
by alias (FastAPI serializes `response_model` by alias).
"""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.db.models import FaceShape


class ClassMetrics(BaseModel):
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None
    support: int | None = None


class FaceShapeModelMetrics(BaseModel):
    accuracy: float | None = None
    macroF1: float | None = None
    perClass: dict[str, ClassMetrics] | None = None


class FaceShapeModelInfo(BaseModel):
    """`method = "rule"` → `modelVersion = "rule-v0"` and every other field is `None`."""

    method: Literal["ml", "rule"]
    modelVersion: str
    algorithm: str | None = None
    classes: list[str] | None = None
    metrics: FaceShapeModelMetrics | None = None
    createdAt: str | None = None


class DateRangeResponse(BaseModel):
    """Inclusive calendar-day range (`Asia/Ho_Chi_Minh`) echoed back as `from`/`to`."""

    date_from: date = Field(serialization_alias="from")
    date_to: date = Field(serialization_alias="to")


class FaceShapeCount(BaseModel):
    faceShape: FaceShape
    count: int


class FaceShapeDistributionResponse(DateRangeResponse):
    """Always 6 `items`, in `FaceShape` enum order (zero-filled)."""

    total: int
    items: list[FaceShapeCount]
