import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StockReservation } from '../db/entities/stock-reservation.entity';
import { StockReservationStatus } from '../db/enums/stock-reservation-status.enum';
import { ReserveItem } from './inventory.repository';

export interface IStockReservationRepository {
  /** Idempotency check before reserving (NFR2): is there already a RESERVED row for this order? */
  hasReservedForOrder(orderId: string): Promise<boolean>;
  /**
   * Records one RESERVED row per item, right after a successful `IInventoryRepository.reserve()`.
   * Accepts an optional `manager` so `InventoryService.reserve()` can run this in the same
   * transaction as the inventory increment — otherwise a failure here after the increment
   * already committed would leave no RESERVED row for redelivery to find, causing a
   * double-increment on retry.
   */
  createReserved(
    orderId: string,
    items: ReserveItem[],
    manager?: EntityManager,
  ): Promise<void>;
  /**
   * Flips every RESERVED row for this order to RELEASED. Returns `true` if any row was
   * flipped (i.e. the order was actually reserved), `false` if there was nothing to do —
   * a repeat release for an already-RELEASED (or never-reserved) order is then a safe
   * no-op for the caller (NFR2/AC8). Accepts an optional `manager` so
   * `InventoryService.release()` can run this in the same transaction as the inventory
   * decrement, so a crash between the two never leaves `reservedQuantity` permanently
   * inflated.
   */
  markReleasedIfReserved(
    orderId: string,
    manager?: EntityManager,
  ): Promise<boolean>;
}

@Injectable()
export class TypeOrmStockReservationRepository implements IStockReservationRepository {
  constructor(
    @InjectRepository(StockReservation)
    private readonly repo: Repository<StockReservation>,
  ) {}

  async hasReservedForOrder(orderId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { orderId, status: StockReservationStatus.RESERVED },
    });
    return count > 0;
  }

  async createReserved(
    orderId: string,
    items: ReserveItem[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(StockReservation) : this.repo;
    const rows = items.map((item) =>
      repo.create({
        orderId,
        variantId: item.variantId,
        quantity: item.quantity,
        status: StockReservationStatus.RESERVED,
      }),
    );
    await repo.save(rows);
  }

  async markReleasedIfReserved(
    orderId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(StockReservation) : this.repo;
    const result = await repo.update(
      { orderId, status: StockReservationStatus.RESERVED },
      { status: StockReservationStatus.RELEASED },
    );
    return (result.affected ?? 0) > 0;
  }
}
