"""Read-only admin views: the served face-shape model's card and the face-shape distribution.

Days are calendar days in `Asia/Ho_Chi_Minh`. The model card is the one kept in memory by the
classifier at boot — no file I/O per request.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.db.models import FaceShape
from app.repositories.face_analysis_repository import (
    IFaceAnalysisRepository,
    get_face_analysis_repository,
)
from app.schemas.admin import (
    ClassMetrics,
    FaceShapeCount,
    FaceShapeDistributionResponse,
    FaceShapeModelInfo,
    FaceShapeModelMetrics,
)
from app.services.face_classifier import FaceShapeClassifier, get_face_shape_classifier

ADMIN_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
DEFAULT_RANGE_DAYS = 30
MAX_RANGE_DAYS = 90
# Dates so extreme that the range bounds overflow (e.g. `to=9999-12-31`, `to=0001-01-05`).
_INVALID_RANGE_MESSAGE = "Khoảng thời gian không hợp lệ"


class InvalidDateRangeError(Exception):
    """`from` after `to`, or a range longer than `MAX_RANGE_DAYS` — carries the Vietnamese
    message the router returns as 400."""


class AdminService:
    """Constructed with its dependencies injected — never opens a DB session itself."""

    def __init__(
        self, repository: IFaceAnalysisRepository, classifier: FaceShapeClassifier
    ) -> None:
        self._repository = repository
        self._classifier = classifier

    def model_info(self) -> FaceShapeModelInfo:
        card = self._classifier.model_card
        if card is None:
            return FaceShapeModelInfo(method="rule", modelVersion=self._classifier.version)
        metrics = card.get("metrics")
        return FaceShapeModelInfo(
            method="ml",
            modelVersion=self._classifier.version,
            algorithm=card.get("algorithm"),
            classes=card.get("classes"),
            metrics=_map_metrics(metrics) if isinstance(metrics, dict) else None,
            createdAt=card.get("created_at"),
        )

    async def face_shape_distribution(
        self, date_from: date | None, date_to: date | None
    ) -> FaceShapeDistributionResponse:
        date_from, date_to = resolve_date_range(date_from, date_to)
        try:
            start = datetime.combine(date_from, datetime.min.time(), tzinfo=ADMIN_TIMEZONE)
            end = datetime.combine(
                date_to + timedelta(days=1), datetime.min.time(), tzinfo=ADMIN_TIMEZONE
            )
            # The DB driver converts to UTC; `0001-01-01 00:00+07` has no UTC value.
            start.astimezone(timezone.utc)
        except OverflowError as exc:
            raise InvalidDateRangeError(_INVALID_RANGE_MESSAGE) from exc
        counts = await self._repository.count_by_face_shape(start, end)
        items = [
            FaceShapeCount(faceShape=shape, count=counts.get(shape, 0)) for shape in FaceShape
        ]
        return FaceShapeDistributionResponse(
            date_from=date_from,
            date_to=date_to,
            total=sum(item.count for item in items),
            items=items,
        )


def resolve_date_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    """Apply defaults (`to` = today in Vietnam, `from` = `to` − 29 days) and validate."""
    if date_to is None:
        date_to = datetime.now(ADMIN_TIMEZONE).date()
    if date_from is None:
        try:
            date_from = date_to - timedelta(days=DEFAULT_RANGE_DAYS - 1)
        except OverflowError as exc:
            raise InvalidDateRangeError(_INVALID_RANGE_MESSAGE) from exc
    if date_from > date_to:
        raise InvalidDateRangeError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc")
    if (date_to - date_from).days + 1 > MAX_RANGE_DAYS:
        raise InvalidDateRangeError("Khoảng thời gian tối đa là 90 ngày")
    return date_from, date_to


def _map_metrics(metrics: dict) -> FaceShapeModelMetrics:
    """Card `metrics` → API shape; missing keys become `None`."""
    per_class = metrics.get("per_class")
    return FaceShapeModelMetrics(
        accuracy=metrics.get("test_accuracy"),
        macroF1=metrics.get("test_macro_f1"),
        perClass=(
            {
                shape: ClassMetrics(
                    precision=values.get("precision"),
                    recall=values.get("recall"),
                    f1=values.get("f1"),
                    support=values.get("support"),
                )
                for shape, values in per_class.items()
            }
            if isinstance(per_class, dict)
            else None
        ),
    )


def get_admin_service(
    repository: IFaceAnalysisRepository = Depends(get_face_analysis_repository),
    classifier: FaceShapeClassifier = Depends(get_face_shape_classifier),
) -> AdminService:
    """FastAPI `Depends` provider — constructs the service with its deps injected."""
    return AdminService(repository, classifier)
