// Processing happens synchronously inside the RabbitMQ message handler (no real gateway
// round-trip to wait on), so there is no genuine PENDING state to model here (plan's Open
// Question Q3) — unlike order-service's own broader PaymentStatus lifecycle. A row is created
// as PAID or FAILED; the only later move is PAID → REFUNDED on `payment.refund.requested`
// (mock refund, no money moves).
export enum PaymentStatus {
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}
