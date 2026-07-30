/**
 * DI tokens for repository interfaces (Dependency Inversion — services depend on these
 * interfaces, not on TypeORM directly). See coder.md §2.
 */
export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export const ORDER_SAGA_EVENT_PUBLISHER = Symbol('ORDER_SAGA_EVENT_PUBLISHER');
