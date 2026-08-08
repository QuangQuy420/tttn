import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ProductVariant } from '../db/entities/product-variant.entity';

export interface ReserveItem {
  variantId: string;
  quantity: number;
}

export interface StockShortage {
  variantId: string;
  requested: number;
  available: number;
}

/** Thrown by `reserve()` when at least one item can't be fully reserved (all-or-nothing). */
export class InsufficientStockError extends Error {
  constructor(public readonly shortages: StockShortage[]) {
    super(
      `Không đủ hàng cho biến thể: ${shortages
        .map(
          (s) => `${s.variantId} (yêu cầu ${s.requested}, còn ${s.available})`,
        )
        .join('; ')}`,
    );
    this.name = 'InsufficientStockError';
  }
}

/** Thrown when stored reservation data cannot safely be committed. */
export class InvalidStockReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStockReservationError';
  }
}

export interface IInventoryRepository {
  /**
   * All-or-nothing across every item (NFR1/AC1-AC3): locks every requested variant's
   * `ps_product_variants` row (pessimistic write, sorted by variantId to keep lock order stable
   * across concurrent multi-item checkouts and avoid deadlocks), verifies
   * `quantity - reservedQuantity >= requested` for every item, then increments
   * `reservedQuantity` for all of them. Throws `InsufficientStockError` (without changing
   * anything) if any single item is short.
   *
   * Accepts an optional `manager` so the caller (`InventoryService.reserve()`) can run this
   * inside the same transaction as the stock-reservation bookkeeping insert, keeping the two
   * atomic — without it, redelivery of a message after the increment commits but before the
   * bookkeeping row is written would double-increment on retry.
   */
  reserve(
    orderId: string,
    items: ReserveItem[],
    manager?: EntityManager,
  ): Promise<void>;
  /**
   * Decrements `reservedQuantity` back for each item (compensation). Accepts an optional
   * `manager` for the same reason as `reserve()` — so it can share a transaction with the
   * stock-reservation status flip.
   */
  release(
    orderId: string,
    items: ReserveItem[],
    manager?: EntityManager,
  ): Promise<void>;
  /**
   * Converts an already-held reservation into a sale by reducing both total and reserved stock.
   * The caller supplies the transaction that also transitions the reservation rows to COMMITTED.
   */
  commit(items: ReserveItem[], manager: EntityManager): Promise<void>;
  /** Plain unlocked read of `quantity - reservedQuantity` per variant (FR7). */
  findAvailableByVariantIds(variantIds: string[]): Promise<Map<string, number>>;
  /**
   * Admin restock (T-PS-variants) — sets the raw `quantity` for a variant. Leaves
   * `reservedQuantity` untouched:
   * this is a total-on-hand correction, not a reservation event, so it must never be routed
   * through `reserve()`/`release()`.
   */
  setQuantity(variantId: string, quantity: number): Promise<void>;
}

@Injectable()
export class TypeOrmInventoryRepository implements IInventoryRepository {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly repo: Repository<ProductVariant>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async reserve(
    orderId: string,
    items: ReserveItem[],
    manager?: EntityManager,
  ): Promise<void> {
    if (items.length === 0) return;
    if (manager) {
      await this.doReserve(manager, items);
      return;
    }
    await this.dataSource.transaction((txManager) =>
      this.doReserve(txManager, items),
    );
  }

  /** Core reserve logic, run against whichever `EntityManager` (own or a caller's) is in scope. */
  private async doReserve(
    manager: EntityManager,
    items: ReserveItem[],
  ): Promise<void> {
    const sortedItems = this.sortByVariantId(items);
    const rows: ProductVariant[] = [];
    for (const item of sortedItems) {
      const row = await manager
        .createQueryBuilder(ProductVariant, 'variant')
        .setLock('pessimistic_write')
        .where('variant.id = :variantId', {
          variantId: item.variantId,
        })
        .getOne();
      // No variant row at all counts as zero available, same as a row with quantity 0.
      rows.push(
        row ??
          ({
            quantity: 0,
            reservedQuantity: 0,
          } as ProductVariant),
      );
    }

    const shortages: StockShortage[] = [];
    for (let i = 0; i < sortedItems.length; i += 1) {
      const item = sortedItems[i];
      const row = rows[i];
      const available = row.quantity - row.reservedQuantity;
      if (available < item.quantity) {
        shortages.push({
          variantId: item.variantId,
          requested: item.quantity,
          available,
        });
      }
    }
    if (shortages.length > 0) {
      throw new InsufficientStockError(shortages);
    }

    for (let i = 0; i < sortedItems.length; i += 1) {
      const row = rows[i];
      row.reservedQuantity += sortedItems[i].quantity;
      await manager.save(ProductVariant, row);
    }
  }

  async release(
    orderId: string,
    items: ReserveItem[],
    manager?: EntityManager,
  ): Promise<void> {
    if (items.length === 0) return;
    if (manager) {
      await this.doRelease(manager, items);
      return;
    }
    await this.dataSource.transaction((txManager) =>
      this.doRelease(txManager, items),
    );
  }

  async commit(items: ReserveItem[], manager: EntityManager): Promise<void> {
    const quantitiesByVariant = new Map<string, number>();
    for (const item of items) {
      quantitiesByVariant.set(
        item.variantId,
        (quantitiesByVariant.get(item.variantId) ?? 0) + item.quantity,
      );
    }

    const committedItems = [...quantitiesByVariant.entries()].map(
      ([variantId, quantity]) => ({ variantId, quantity }),
    );
    const sortedItems = this.sortByVariantId(committedItems);
    for (const item of sortedItems) {
      const row = await manager
        .createQueryBuilder(ProductVariant, 'variant')
        .setLock('pessimistic_write')
        .where('variant.id = :variantId', { variantId: item.variantId })
        .getOne();
      if (!row) {
        throw new InvalidStockReservationError(
          `Reserved variant ${item.variantId} no longer exists`,
        );
      }
      if (
        row.quantity < item.quantity ||
        row.reservedQuantity < item.quantity
      ) {
        throw new InvalidStockReservationError(
          `Reserved stock for variant ${item.variantId} is inconsistent`,
        );
      }
      row.quantity -= item.quantity;
      row.reservedQuantity -= item.quantity;
      await manager.save(ProductVariant, row);
    }
  }

  /** Core release logic, run against whichever `EntityManager` (own or a caller's) is in scope. */
  private async doRelease(
    manager: EntityManager,
    items: ReserveItem[],
  ): Promise<void> {
    const sortedItems = this.sortByVariantId(items);
    for (const item of sortedItems) {
      const row = await manager
        .createQueryBuilder(ProductVariant, 'variant')
        .setLock('pessimistic_write')
        .where('variant.id = :variantId', {
          variantId: item.variantId,
        })
        .getOne();
      if (!row) {
        // Nothing to release for a missing variant — shouldn't happen
        // in practice (reserve() would have rejected it first), but releasing must
        // never throw (fire-and-forget compensation).
        continue;
      }
      row.reservedQuantity = Math.max(0, row.reservedQuantity - item.quantity);
      await manager.save(ProductVariant, row);
    }
  }

  async findAvailableByVariantIds(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (variantIds.length === 0) return result;

    const rows = await this.repo.find({
      where: { id: In(variantIds) },
    });
    for (const row of rows) {
      result.set(row.id, row.quantity - row.reservedQuantity);
    }
    return result;
  }

  async setQuantity(variantId: string, quantity: number): Promise<void> {
    const existing = await this.repo.findOne({
      where: { id: variantId },
    });
    if (!existing) {
      throw new Error(`ProductVariant ${variantId} not found for stock update`);
    }
    existing.quantity = quantity;
    await this.repo.save(existing);
  }

  /** Stable lock order across concurrent multi-item checkouts, to avoid deadlocks. */
  private sortByVariantId(items: ReserveItem[]): ReserveItem[] {
    return [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));
  }
}
