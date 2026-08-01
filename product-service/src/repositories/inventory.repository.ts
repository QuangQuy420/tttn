import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Inventory } from '../db/entities/inventory.entity';

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

// Q3 (carried over from the superseded plan): single fixed warehouse, no
// multi-warehouse support anywhere in this project.
const WAREHOUSE_CODE = 'MAIN';

export interface CreateInventoryInput {
  variantId: string;
  quantity: number;
  reservedQuantity?: number;
}

export interface IInventoryRepository {
  /**
   * All-or-nothing across every item (NFR1/AC1-AC3): locks every requested variant's
   * `ps_inventory` row (pessimistic write, sorted by variantId to keep lock order stable
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
  /** Plain unlocked read of `quantity - reservedQuantity` per variant (FR7). */
  findAvailableByVariantIds(variantIds: string[]): Promise<Map<string, number>>;
  /** Creates a `ps_inventory` row for a variant in the fixed `"MAIN"` warehouse (seeding, T-PS-7). */
  create(data: CreateInventoryInput): Promise<void>;
  /**
   * Admin restock (T-PS-variants) — sets the raw `quantity` for a variant in the `"MAIN"`
   * warehouse, creating the row if it doesn't exist yet. Leaves `reservedQuantity` untouched:
   * this is a total-on-hand correction, not a reservation event, so it must never be routed
   * through `reserve()`/`release()`.
   */
  setQuantity(variantId: string, quantity: number): Promise<void>;
}

@Injectable()
export class TypeOrmInventoryRepository implements IInventoryRepository {
  constructor(
    @InjectRepository(Inventory)
    private readonly repo: Repository<Inventory>,
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
    const rows: Inventory[] = [];
    for (const item of sortedItems) {
      const row = await manager
        .createQueryBuilder(Inventory, 'inventory')
        .setLock('pessimistic_write')
        .where('inventory.variant_id = :variantId', {
          variantId: item.variantId,
        })
        .andWhere('inventory.warehouse_code = :warehouseCode', {
          warehouseCode: WAREHOUSE_CODE,
        })
        .getOne();
      // No inventory row at all counts as zero available, same as a row with quantity 0.
      rows.push(
        row ??
          ({
            variantId: item.variantId,
            quantity: 0,
            reservedQuantity: 0,
          } as Inventory),
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
      await manager.save(Inventory, row);
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

  /** Core release logic, run against whichever `EntityManager` (own or a caller's) is in scope. */
  private async doRelease(
    manager: EntityManager,
    items: ReserveItem[],
  ): Promise<void> {
    const sortedItems = this.sortByVariantId(items);
    for (const item of sortedItems) {
      const row = await manager
        .createQueryBuilder(Inventory, 'inventory')
        .setLock('pessimistic_write')
        .where('inventory.variant_id = :variantId', {
          variantId: item.variantId,
        })
        .andWhere('inventory.warehouse_code = :warehouseCode', {
          warehouseCode: WAREHOUSE_CODE,
        })
        .getOne();
      if (!row) {
        // Nothing to release for a variant with no inventory row — shouldn't happen
        // in practice (reserve() would have rejected it first), but releasing must
        // never throw (fire-and-forget compensation).
        continue;
      }
      row.reservedQuantity = Math.max(0, row.reservedQuantity - item.quantity);
      await manager.save(Inventory, row);
    }
  }

  async findAvailableByVariantIds(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (variantIds.length === 0) return result;

    const rows = await this.repo.find({
      where: { variantId: In(variantIds), warehouseCode: WAREHOUSE_CODE },
    });
    for (const row of rows) {
      result.set(row.variantId, row.quantity - row.reservedQuantity);
    }
    return result;
  }

  async create(data: CreateInventoryInput): Promise<void> {
    const inventory = this.repo.create({
      variantId: data.variantId,
      warehouseCode: WAREHOUSE_CODE,
      quantity: data.quantity,
      reservedQuantity: data.reservedQuantity ?? 0,
    });
    await this.repo.save(inventory);
  }

  async setQuantity(variantId: string, quantity: number): Promise<void> {
    const existing = await this.repo.findOne({
      where: { variantId, warehouseCode: WAREHOUSE_CODE },
    });
    if (existing) {
      existing.quantity = quantity;
      await this.repo.save(existing);
      return;
    }
    await this.create({ variantId, quantity });
  }

  /** Stable lock order across concurrent multi-item checkouts, to avoid deadlocks. */
  private sortByVariantId(items: ReserveItem[]): ReserveItem[] {
    return [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));
  }
}
