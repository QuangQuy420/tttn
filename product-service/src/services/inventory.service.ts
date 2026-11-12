import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  IInventoryRepository,
  InsufficientStockError,
  ReserveItem,
} from '../repositories/inventory.repository';
import { IStockReservationRepository } from '../repositories/stock-reservation.repository';
import { IOrderSagaEventPublisher } from '../repositories/order-saga-event-publisher.repository';
import { StockReservationStatus } from '../db/enums/stock-reservation-status.enum';
import {
  INVENTORY_REPOSITORY,
  STOCK_RESERVATION_REPOSITORY,
  ORDER_SAGA_EVENT_PUBLISHER,
} from '../repositories/tokens';

/**
 * Orchestrates the checkout saga's stock steps for `OrderSagaEventConsumer` (T-PS-3): reserve
 * on `stock.reserve.requested`, release on `stock.release.requested`, commit on
 * `payment.completed`, and restock on `stock.restock.requested` (refund of a cancelled, paid
 * order). Thin —
 * delegates locking/quantity math to `IInventoryRepository` and idempotency bookkeeping to
 * `IStockReservationRepository`, and replies via `IOrderSagaEventPublisher`. A reply that
 * the broker did not confirm rejects, so the consumer nacks + requeues the request instead
 * of acking it with the reply lost; redelivery is safe because every step is idempotent.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: IInventoryRepository,
    @Inject(STOCK_RESERVATION_REPOSITORY)
    private readonly stockReservationRepository: IStockReservationRepository,
    @Inject(ORDER_SAGA_EVENT_PUBLISHER)
    private readonly sagaPublisher: IOrderSagaEventPublisher,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Handles `stock.reserve.requested` (AC1-AC3). Idempotent (NFR2): a duplicate request
   * for an order that already has a RESERVED row skips re-reserving and just re-publishes
   * `stock.reserved`, so a caller that missed the first reply can still progress without
   * double-incrementing `reservedQuantity`. An order whose rows already moved on
   * (COMMITTED / RELEASED / RESTOCKED) is a logged no-op — it must never hold stock again.
   * Unexpected (non-`InsufficientStockError`)
   * errors are left to propagate so `OrderSagaEventConsumer` can nack + requeue.
   *
   * The inventory increment and the RESERVED bookkeeping row are written in a single
   * `dataSource.transaction()` so they commit or roll back together — otherwise a failure
   * writing the bookkeeping row after the increment already committed would leave no
   * RESERVED row for message redelivery to find, and a retry would double-increment
   * `reservedQuantity` for the same order.
   */
  async reserve(orderId: string, items: ReserveItem[]): Promise<void> {
    const statuses =
      await this.stockReservationRepository.findStatusesForOrder(orderId);
    if (statuses.includes(StockReservationStatus.RESERVED)) {
      this.logger.warn(
        `Duplicate stock.reserve.requested for order ${orderId} — already reserved, re-publishing stock.reserved`,
      );
      await this.sagaPublisher.publishStockReserved(orderId);
      return;
    }
    if (statuses.length > 0) {
      this.logger.warn(
        `stock.reserve.requested for order ${orderId} whose reservation is already ${statuses.join('/')} — safe no-op`,
      );
      return;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await this.inventoryRepository.reserve(orderId, items, manager);
        await this.stockReservationRepository.createReserved(
          orderId,
          items,
          manager,
        );
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        await this.sagaPublisher.publishStockReserveRejected(
          orderId,
          error.message,
        );
        return;
      }
      throw error;
    }

    await this.sagaPublisher.publishStockReserved(orderId);
  }

  /**
   * Handles `stock.release.requested` (AC4/AC5/AC8). Idempotent (NFR2): only decrements
   * `reservedQuantity` if a RESERVED row exists for this order — repeating the release for
   * an already-RELEASED (or never-reserved) order is a safe no-op. Publishes nothing back
   * (fire-and-forget compensation — order-service has already moved on).
   *
   * The RESERVED→RELEASED flip and the inventory decrement run in a single
   * `dataSource.transaction()` so they commit or roll back together — otherwise a crash
   * or error between the two would leave `reservedQuantity` permanently inflated (the
   * flip would already be committed, so a retry would find no RESERVED row and no-op
   * without ever decrementing).
   */
  async release(orderId: string, items: ReserveItem[]): Promise<void> {
    const wasReserved = await this.dataSource.transaction(async (manager) => {
      const flipped =
        await this.stockReservationRepository.markReleasedIfReserved(
          orderId,
          manager,
        );
      if (!flipped) {
        return false;
      }
      await this.inventoryRepository.release(orderId, items, manager);
      return true;
    });
    if (!wasReserved) {
      this.logger.warn(
        `stock.release.requested for order ${orderId} with no RESERVED row — safe no-op`,
      );
    }
  }

  /**
   * Handles `payment.completed`. It derives quantities from the rows held by this service rather
   * than trusting payment payload line items, then atomically converts the held stock into sold
   * stock and transitions those rows from RESERVED to COMMITTED.
   */
  async commit(orderId: string): Promise<void> {
    const wasReserved = await this.dataSource.transaction(async (manager) => {
      const reservations =
        await this.stockReservationRepository.lockReservedForOrder(
          orderId,
          manager,
        );
      if (reservations.length === 0) {
        return false;
      }
      await this.inventoryRepository.commit(
        reservations.map(({ variantId, quantity }) => ({
          variantId,
          quantity,
        })),
        manager,
      );
      await this.stockReservationRepository.markCommitted(
        reservations,
        manager,
      );
      return true;
    });
    if (!wasReserved) {
      this.logger.warn(
        `payment.completed for order ${orderId} with no RESERVED row — safe no-op`,
      );
    }
  }

  /**
   * Handles `stock.restock.requested` (refund of a cancelled order that was already paid).
   * In one transaction it locks the order's RESERVED and COMMITTED rows together: COMMITTED
   * rows give their quantity back (`quantity += row.quantity`) and become RESTOCKED; rows
   * still RESERVED (the cancel raced ahead of the commit) are released and become RELEASED.
   * Quantities come from this service's own rows, like `commit()`. No such rows → no-op, so
   * a redelivered request is safe; a `payment.completed` arriving afterwards finds no
   * RESERVED rows and is already a logged no-op in `commit()`.
   */
  async restock(orderId: string): Promise<void> {
    const changed = await this.dataSource.transaction(async (manager) => {
      const reservations =
        await this.stockReservationRepository.lockReservedOrCommittedForOrder(
          orderId,
          manager,
        );
      if (reservations.length === 0) {
        return false;
      }
      const committed = reservations.filter(
        (reservation) =>
          reservation.status === StockReservationStatus.COMMITTED,
      );
      const reserved = reservations.filter(
        (reservation) => reservation.status === StockReservationStatus.RESERVED,
      );
      const toItems = (rows: typeof reservations): ReserveItem[] =>
        rows.map(({ variantId, quantity }) => ({ variantId, quantity }));

      await this.inventoryRepository.restock(toItems(committed), manager);
      await this.stockReservationRepository.markRestocked(committed, manager);
      if (reserved.length > 0) {
        await this.inventoryRepository.release(
          orderId,
          toItems(reserved),
          manager,
        );
        await this.stockReservationRepository.markReleased(reserved, manager);
      }
      return true;
    });
    if (!changed) {
      this.logger.warn(
        `stock.restock.requested for order ${orderId} with no RESERVED/COMMITTED row — safe no-op`,
      );
    }
  }
}
