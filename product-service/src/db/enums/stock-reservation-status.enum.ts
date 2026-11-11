export enum StockReservationStatus {
  RESERVED = 'RESERVED',
  RELEASED = 'RELEASED',
  COMMITTED = 'COMMITTED',
  /** A COMMITTED sale undone by `stock.restock.requested` (refund of a cancelled order). */
  RESTOCKED = 'RESTOCKED',
}
