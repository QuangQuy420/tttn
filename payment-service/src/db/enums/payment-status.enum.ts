// Only two terminal outcomes exist in this design: processing happens synchronously
// inside the RabbitMQ message handler (no real gateway round-trip to wait on), so there is
// no genuine PENDING state to model here (plan's Open Question Q3) — unlike order-service's
// own broader PaymentStatus lifecycle.
export enum PaymentStatus {
  PAID = 'PAID',
  FAILED = 'FAILED',
}
