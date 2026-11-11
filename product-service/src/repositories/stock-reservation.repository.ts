import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { StockReservation } from '../db/entities/stock-reservation.entity';
import { StockReservationStatus } from '../db/enums/stock-reservation-status.enum';
import { ReserveItem } from './inventory.repository';

export interface IStockReservationRepository {
  /**
   * Idempotency check before reserving (NFR2): the distinct statuses of every reservation row
   * already recorded for this order (empty when the order was never reserved).
   */
  findStatusesForOrder(orderId: string): Promise<StockReservationStatus[]>;
  /** Does any order currently hold (RESERVED) stock of this variant? */
  hasReservedForVariant(variantId: string): Promise<boolean>;
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
  /**
   * Locks and returns every currently-held reservation for an order. The caller must use the
   * same transaction to adjust the corresponding variant rows and transition these rows.
   */
  lockReservedForOrder(
    orderId: string,
    manager: EntityManager,
  ): Promise<StockReservation[]>;
  /** Marks exactly the reservations locked by `lockReservedForOrder()` as committed. */
  markCommitted(
    reservations: StockReservation[],
    manager: EntityManager,
  ): Promise<void>;
  /**
   * Locks and returns the order's RESERVED and COMMITTED rows in ONE `FOR UPDATE` query —
   * everything a restock may still have to undo. Same transaction rule as
   * `lockReservedForOrder()`.
   */
  lockReservedOrCommittedForOrder(
    orderId: string,
    manager: EntityManager,
  ): Promise<StockReservation[]>;
  /** COMMITTED → RESTOCKED for exactly these rows. */
  markRestocked(
    reservations: StockReservation[],
    manager: EntityManager,
  ): Promise<void>;
  /** RESERVED → RELEASED for exactly these rows. */
  markReleased(
    reservations: StockReservation[],
    manager: EntityManager,
  ): Promise<void>;
}

@Injectable()
export class TypeOrmStockReservationRepository implements IStockReservationRepository {
  constructor(
    @InjectRepository(StockReservation)
    private readonly repo: Repository<StockReservation>,
  ) {}

  async findStatusesForOrder(
    orderId: string,
  ): Promise<StockReservationStatus[]> {
    const rows = await this.repo
      .createQueryBuilder('reservation')
      .select('DISTINCT reservation.status', 'status')
      .where('reservation.order_id = :orderId', { orderId })
      .getRawMany<{ status: StockReservationStatus }>();
    return rows.map((row) => row.status);
  }

  async hasReservedForVariant(variantId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { variantId, status: StockReservationStatus.RESERVED },
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

  async lockReservedForOrder(
    orderId: string,
    manager: EntityManager,
  ): Promise<StockReservation[]> {
    return manager
      .getRepository(StockReservation)
      .createQueryBuilder('reservation')
      .setLock('pessimistic_write')
      .where('reservation.order_id = :orderId', { orderId })
      .andWhere('reservation.status = :status', {
        status: StockReservationStatus.RESERVED,
      })
      .orderBy('reservation.variant_id', 'ASC')
      .getMany();
  }

  async markCommitted(
    reservations: StockReservation[],
    manager: EntityManager,
  ): Promise<void> {
    await this.transition(
      reservations,
      StockReservationStatus.RESERVED,
      StockReservationStatus.COMMITTED,
      manager,
    );
  }

  async lockReservedOrCommittedForOrder(
    orderId: string,
    manager: EntityManager,
  ): Promise<StockReservation[]> {
    return manager
      .getRepository(StockReservation)
      .createQueryBuilder('reservation')
      .setLock('pessimistic_write')
      .where('reservation.order_id = :orderId', { orderId })
      .andWhere('reservation.status IN (:...statuses)', {
        statuses: [
          StockReservationStatus.RESERVED,
          StockReservationStatus.COMMITTED,
        ],
      })
      .orderBy('reservation.variant_id', 'ASC')
      .getMany();
  }

  async markRestocked(
    reservations: StockReservation[],
    manager: EntityManager,
  ): Promise<void> {
    await this.transition(
      reservations,
      StockReservationStatus.COMMITTED,
      StockReservationStatus.RESTOCKED,
      manager,
    );
  }

  async markReleased(
    reservations: StockReservation[],
    manager: EntityManager,
  ): Promise<void> {
    await this.transition(
      reservations,
      StockReservationStatus.RESERVED,
      StockReservationStatus.RELEASED,
      manager,
    );
  }

  private async transition(
    reservations: StockReservation[],
    from: StockReservationStatus,
    to: StockReservationStatus,
    manager: EntityManager,
  ): Promise<void> {
    if (reservations.length === 0) return;
    await manager.getRepository(StockReservation).update(
      {
        id: In(reservations.map((reservation) => reservation.id)),
        status: from,
      },
      { status: to },
    );
  }
}
