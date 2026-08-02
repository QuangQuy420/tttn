// Mirrors order-service's saga-log admin DTOs (api-gateway forwards these through unchanged,
// same envelope) — see order-service/src/main/java/com/tttn/orderservice/dto/response/
// SagaLogDayResponse.java, OrderLogSummaryResponse.java, OrderSagaLogResponse.java, plus
// com.tttn.orderservice.entity.OrderSagaLog's SagaLogStage/SagaLogLevel enums. See plan
// FR14-FR16, T21/T29.

// Mirrors com.tttn.orderservice.entity.OrderSagaLog.SagaLogStage.
export type SagaLogStage =
  | "CREATED"
  | "STOCK_RESERVE_REQUESTED"
  | "STOCK_RESERVED"
  | "STOCK_RESERVE_REJECTED"
  | "PAYMENT_CREATE_REQUESTED"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_FAILED"
  | "STOCK_RELEASE_REQUESTED"
  | "RECONCILIATION_RESENT"
  | "RECONCILIATION_EXHAUSTED"
  | "DEAD_LETTERED";

// Mirrors com.tttn.orderservice.entity.OrderSagaLog.SagaLogLevel.
export type SagaLogLevel = "INFO" | "WARN";

// Mirrors com.tttn.orderservice.enums.SagaLogService — which service an entry's event was sent
// from (sourceService) or to (targetService).
export type SagaLogService =
  | "ORDER_SERVICE"
  | "PRODUCT_SERVICE"
  | "PAYMENT_SERVICE"
  | "MESSAGE_BROKER";

// Mirrors SagaLogDayResponse — one row per calendar day (Asia/Ho_Chi_Minh, NFR6) that has at
// least one saga-log entry. `date` is an ISO date string ("yyyy-MM-dd").
export interface SagaLogDay {
  date: string;
  totalCount: number;
  hasWarning: boolean;
}

// Mirrors OrderLogSummaryResponse — one row per order with saga-log activity on a selected day.
export interface OrderLogSummary {
  orderId: string;
  orderCode: string;
  entryCount: number;
  worstLevel: SagaLogLevel;
  lastOccurredAt: string;
}

// Mirrors OrderSagaLogResponse — a single entry in one order's full saga timeline (not limited
// to the selected day — see FR16).
export interface OrderSagaLog {
  stage: SagaLogStage;
  level: SagaLogLevel;
  message: string;
  sourceService: SagaLogService;
  targetService: SagaLogService | null;
  errorDetail: string | null;
  retryCount: number | null;
  occurredAt: string;
}
