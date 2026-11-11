import { DataSource, EntityManager, Repository } from 'typeorm';
import { TypeOrmInventoryRepository } from './inventory.repository';
import { ProductVariant } from '../db/entities/product-variant.entity';

/**
 * Fake `EntityManager` whose query builder returns the in-memory variant row by id, and whose
 * `save` records a snapshot of what was written.
 */
function makeManager(rows: Record<string, ProductVariant>) {
  const saved: Array<{
    id: string;
    quantity: number;
    reservedQuantity: number;
  }> = [];
  const manager = {
    createQueryBuilder: jest.fn(() => {
      let variantId: string | undefined;
      const builder: Record<string, jest.Mock> = {
        withDeleted: jest.fn(() => builder),
        setLock: jest.fn(() => builder),
        where: jest.fn((_sql: string, params: { variantId: string }) => {
          variantId = params.variantId;
          return builder;
        }),
        getOne: jest.fn(() =>
          Promise.resolve((variantId ? rows[variantId] : null) ?? null),
        ),
      };
      return builder;
    }),
    save: jest.fn((_entity: unknown, row: ProductVariant) => {
      saved.push({
        id: row.id,
        quantity: row.quantity,
        reservedQuantity: row.reservedQuantity,
      });
      return Promise.resolve(row);
    }),
  };
  return { manager: manager as unknown as EntityManager, saved };
}

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'variant-1',
    quantity: 10,
    reservedQuantity: 3,
    ...overrides,
  } as ProductVariant;
}

describe('TypeOrmInventoryRepository', () => {
  function makeRepository(manager: EntityManager) {
    const dataSource = {
      transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    return new TypeOrmInventoryRepository(
      {} as Repository<ProductVariant>,
      dataSource as unknown as DataSource,
    );
  }

  it('setAvailable keeps held reservations on top: quantity = available + reserved (AC19)', async () => {
    const { manager, saved } = makeManager({
      'variant-1': makeVariant({ quantity: 10, reservedQuantity: 3 }),
    });

    await makeRepository(manager).setAvailable('variant-1', 5);

    expect(saved).toEqual([
      { id: 'variant-1', quantity: 8, reservedQuantity: 3 },
    ]);
  });

  it('restock adds the sold quantity back to on-hand stock (AC32)', async () => {
    const { manager, saved } = makeManager({
      'variant-1': makeVariant({ quantity: 10, reservedQuantity: 0 }),
    });

    await makeRepository(manager).restock(
      [{ variantId: 'variant-1', quantity: 2 }],
      manager,
    );

    expect(saved).toEqual([
      { id: 'variant-1', quantity: 12, reservedQuantity: 0 },
    ]);
  });

  it('reserve sums repeated variantIds instead of losing one increment (AC29)', async () => {
    const { manager, saved } = makeManager({
      'variant-1': makeVariant({ quantity: 10, reservedQuantity: 0 }),
    });

    await makeRepository(manager).reserve(
      'order-1',
      [
        { variantId: 'variant-1', quantity: 2 },
        { variantId: 'variant-1', quantity: 3 },
      ],
      manager,
    );

    expect(saved).toEqual([
      { id: 'variant-1', quantity: 10, reservedQuantity: 5 },
    ]);
  });
});
