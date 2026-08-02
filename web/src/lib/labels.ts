import type { FaceShapeTag, FrameShape, GenderTarget } from "@/types/product";
import type { OrderStatus } from "@/types/order";
import type { SagaLogLevel, SagaLogService, SagaLogStage } from "@/types/saga-log";

// Vietnamese labels for the admin area (Admin Products.dc.html / Product Edit.dc.html mockups
// use Vietnamese copy throughout) — also reused by the storefront (ProductFilters/ProductCard/
// ProductDetailPage), since the whole `web` UI is Vietnamese (see CLAUDE.md).
export const FRAME_SHAPE_LABELS_VI: Record<FrameShape, string> = {
  ROUND: "Gọng tròn",
  SQUARE: "Gọng vuông",
  OVAL: "Oval",
  CAT_EYE: "Mắt mèo",
  AVIATOR: "Phi công",
  RECTANGLE: "Chữ nhật",
  WAYFARER: "Wayfarer",
  RIMLESS: "Không viền",
};

export function formatFrameShapeVi(shape: FrameShape): string {
  return FRAME_SHAPE_LABELS_VI[shape];
}

// FaceShape tag picker labels — matches the mockup's faceShapeDefs where present (oval/round/
// square/heart/diamond); OBLONG isn't in the mockup (only 5 of the 6 backend enum values are
// shown there) so "Dài" is a reasonable Vietnamese label picked for consistency (plan Q2).
export const FACE_SHAPE_LABELS_VI: Record<FaceShapeTag, string> = {
  OVAL: "Oval",
  ROUND: "Tròn",
  SQUARE: "Vuông",
  HEART: "Tim",
  DIAMOND: "Kim cương",
  OBLONG: "Dài",
};

export function formatFaceShapeVi(shape: FaceShapeTag): string {
  return FACE_SHAPE_LABELS_VI[shape];
}

// Fixed display order for the face-shape tag picker (matches the mockup's faceShapeDefs order,
// with OBLONG appended last since the mockup doesn't show it).
export const FACE_SHAPE_TAGS: FaceShapeTag[] = [
  "OVAL",
  "ROUND",
  "SQUARE",
  "HEART",
  "DIAMOND",
  "OBLONG",
];

// Fixed display order for the frame-shape select (matches the mockup's shapeOptions order where
// possible; CAT_EYE/AVIATOR/RECTANGLE renamed to their Vietnamese equivalents already appear
// there, WAYFARER/RIMLESS appended since the mockup's list predates those enum values).
export const FRAME_SHAPES: FrameShape[] = [
  "ROUND",
  "SQUARE",
  "RECTANGLE",
  "AVIATOR",
  "CAT_EYE",
  "OVAL",
  "WAYFARER",
  "RIMLESS",
];

// GenderTarget isn't shown in the mockup (like brandId, it's a required backend field the mockup
// doesn't surface — see plan FR8) — added as a minimal required select so the form can submit a
// valid CreateProductDto.
export const GENDER_TARGET_LABELS_VI: Record<GenderTarget, string> = {
  UNISEX: "Unisex",
  MALE: "Nam",
  FEMALE: "Nữ",
};

export const GENDER_TARGETS: GenderTarget[] = ["UNISEX", "MALE", "FEMALE"];

// Order status labels — mirrors order-service's OrderStatus enum (see @/types/order).
export const ORDER_STATUS_LABELS_VI: Record<OrderStatus, string> = {
  PENDING: "Chờ xác nhận",
  AWAITING_PAYMENT: "Đang chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  PROCESSING: "Đang xử lý",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export function formatOrderStatusVi(status: OrderStatus): string {
  return ORDER_STATUS_LABELS_VI[status];
}

// Fixed display order for the order-status filter select.
export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

// Saga-log stage labels — mirrors OrderSagaLog.SagaLogStage (see @/types/saga-log). Used on the
// "Nhật ký xử lý đơn hàng" admin screens (plan FR14/FR18) since the raw enum values aren't
// Vietnamese.
export const SAGA_LOG_STAGE_LABELS_VI: Record<SagaLogStage, string> = {
  CREATED: "Tạo đơn hàng",
  STOCK_RESERVE_REQUESTED: "Gửi yêu cầu giữ hàng",
  STOCK_RESERVED: "Đã giữ hàng thành công",
  STOCK_RESERVE_REJECTED: "Giữ hàng thất bại",
  PAYMENT_CREATE_REQUESTED: "Gửi yêu cầu thanh toán",
  PAYMENT_COMPLETED: "Thanh toán thành công",
  PAYMENT_FAILED: "Thanh toán thất bại",
  STOCK_RELEASE_REQUESTED: "Gửi yêu cầu nhả hàng",
  RECONCILIATION_RESENT: "Tự động gửi lại lệnh",
  RECONCILIATION_EXHAUSTED: "Hết lượt tự động thử lại",
  DEAD_LETTERED: "Bản tin bị loại bỏ (dead-letter)",
};

export function formatSagaLogStageVi(stage: SagaLogStage): string {
  return SAGA_LOG_STAGE_LABELS_VI[stage];
}

// Saga-log level labels — mirrors OrderSagaLog.SagaLogLevel.
export const SAGA_LOG_LEVEL_LABELS_VI: Record<SagaLogLevel, string> = {
  INFO: "Bình thường",
  WARN: "Cảnh báo",
};

export function formatSagaLogLevelVi(level: SagaLogLevel): string {
  return SAGA_LOG_LEVEL_LABELS_VI[level];
}

// Saga-log service labels — mirrors OrderSagaLog.SagaLogService. Used for the "nơi bắn sự kiện"/
// "nơi nhận sự kiện" columns on the saga-log detail table.
export const SAGA_LOG_SERVICE_LABELS_VI: Record<SagaLogService, string> = {
  ORDER_SERVICE: "Order Service",
  PRODUCT_SERVICE: "Product Service",
  PAYMENT_SERVICE: "Payment Service",
  MESSAGE_BROKER: "Message Broker",
};

export function formatSagaLogServiceVi(service: SagaLogService | null): string {
  return service ? SAGA_LOG_SERVICE_LABELS_VI[service] : "—";
}

// "Trạng thái" column on the saga-log detail table — one saga-log row is a single event outcome
// (an event fired, a reply received, a retry attempt), so INFO/WARN reads better as "Thành
// công"/"Thất bại" here than the "Bình thường"/"Cảnh báo" wording used for the day/order summary
// screens (SAGA_LOG_LEVEL_LABELS_VI above), which describe a whole day/order's worst level.
export const SAGA_LOG_ROW_STATUS_LABELS_VI: Record<SagaLogLevel, string> = {
  INFO: "Thành công",
  WARN: "Thất bại",
};

export function formatSagaLogRowStatusVi(level: SagaLogLevel): string {
  return SAGA_LOG_ROW_STATUS_LABELS_VI[level];
}
