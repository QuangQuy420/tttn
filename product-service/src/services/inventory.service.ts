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
import {
  INVENTORY_REPOSITORY,
  STOCK_RESERVATION_REPOSITORY,
  ORDER_SAGA_EVENT_PUBLISHER,
} from '../repositories/tokens';

/**
 * Orchestrates the checkout saga's two stock steps for `OrderSagaEventConsumer` (T-PS-3):
 * reserve on `stock.reserve.requested`, release on `stock.release.requested`. Thin —
 * delegates locking/quantity math to `IInventoryRepository` and idempotency bookkeeping to
 * `IStockReservationRepository`, and replies via `IOrderSagaEventPublisher`.
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
   * double-incrementing `reservedQuantity`. Unexpected (non-`InsufficientStockError`)
   * errors are left to propagate so `OrderSagaEventConsumer` can nack + requeue.
   *
   * The inventory increment and the RESERVED bookkeeping row are written in a single
   * `dataSource.transaction()` so they commit or roll back together — otherwise a failure
   * writing the bookkeeping row after the increment already committed would leave no
   * RESERVED row for message redelivery to find, and a retry would double-increment
   * `reservedQuantity` for the same order.
   */
  async reserve(orderId: string, items: ReserveItem[]): Promise<void> {
    const alreadyReserved =
      await this.stockReservationRepository.hasReservedForOrder(orderId);
    if (alreadyReserved) {
      this.logger.warn(
        `Duplicate stock.reserve.requested for order ${orderId} — already reserved, re-publishing stock.reserved`,
      );
      await this.sagaPublisher.publishStockReserved(orderId);
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
}
