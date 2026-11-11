import { DataSource, EntityManager } from 'typeorm';
import { InventoryService } from './inventory.service';
import { IInventoryRepository } from '../repositories/inventory.repository';
import { IStockReservationRepository } from '../repositories/stock-reservation.repository';
import { IOrderSagaEventPublisher } from '../repositories/order-saga-event-publisher.repository';
import { StockReservation } from '../db/entities/stock-reservation.entity';
import { StockReservationStatus } from '../db/enums/stock-reservation-status.enum';

function makeReservation(
  overrides: Partial<StockReservation> = {},
): StockReservation {
  return {
    id: 'reservation-1',
    orderId: 'order-1',
    variantId: 'variant-1',
    quantity: 2,
    status: StockReservationStatus.COMMITTED,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

describe('InventoryService', () => {
  const manager = {} as EntityManager;
  let inventoryRepository: jest.Mocked<IInventoryRepository>;
  let stockReservationRepository: jest.Mocked<IStockReservationRepository>;
  let sagaPublisher: jest.Mocked<IOrderSagaEventPublisher>;
  let dataSource: { transaction: jest.Mock };
  let service: InventoryService;

  beforeEach(() => {
    inventoryRepository = {
      reserve: jest.fn(),
      release: jest.fn(),
      commit: jest.fn(),
      restock: jest.fn(),
      findAvailableByVariantIds: jest.fn(),
      setAvailable: jest.fn(),
    };
    stockReservationRepository = {
      findStatusesForOrder: jest.fn(),
      hasReservedForVariant: jest.fn(),
      createReserved: jest.fn(),
      markReleasedIfReserved: jest.fn(),
      lockReservedForOrder: jest.fn(),
      markCommitted: jest.fn(),
      lockReservedOrCommittedForOrder: jest.fn(),
      markRestocked: jest.fn(),
      markReleased: jest.fn(),
    };
    sagaPublisher = {
      publishStockReserved: jest.fn(),
      publishStockReserveRejected: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    service = new InventoryService(
      inventoryRepository,
      stockReservationRepository,
      sagaPublisher,
      dataSource as unknown as DataSource,
    );
  });

  describe('reserve', () => {
    it('ignores a repeated reserve request for an order whose stock is already COMMITTED (AC24)', async () => {
      stockReservationRepository.findStatusesForOrder.mockResolvedValue([
        StockReservationStatus.COMMITTED,
      ]);

      await service.reserve('order-1', [
        { variantId: 'variant-1', quantity: 2 },
      ]);

      expect(inventoryRepository.reserve).not.toHaveBeenCalled();
      expect(stockReservationRepository.createReserved).not.toHaveBeenCalled();
      expect(sagaPublisher.publishStockReserved).not.toHaveBeenCalled();
      expect(sagaPublisher.publishStockReserveRejected).not.toHaveBeenCalled();
    });
  });

  describe('restock', () => {
    it('adds COMMITTED quantities back and marks them RESTOCKED; releases rows still RESERVED (AC32)', async () => {
      const committed = makeReservation({
        id: 'r-1',
        variantId: 'variant-1',
        quantity: 2,
        status: StockReservationStatus.COMMITTED,
      });
      const reserved = makeReservation({
        id: 'r-2',
        variantId: 'variant-2',
        quantity: 1,
        status: StockReservationStatus.RESERVED,
      });
      stockReservationRepository.lockReservedOrCommittedForOrder.mockResolvedValue(
        [committed, reserved],
      );

      await service.restock('order-1');

      expect(
        stockReservationRepository.lockReservedOrCommittedForOrder,
      ).toHaveBeenCalledWith('order-1', manager);
      expect(inventoryRepository.restock).toHaveBeenCalledWith(
        [{ variantId: 'variant-1', quantity: 2 }],
        manager,
      );
      expect(stockReservationRepository.markRestocked).toHaveBeenCalledWith(
        [committed],
        manager,
      );
      expect(inventoryRepository.release).toHaveBeenCalledWith(
        'order-1',
        [{ variantId: 'variant-2', quantity: 1 }],
        manager,
      );
      expect(stockReservationRepository.markReleased).toHaveBeenCalledWith(
        [reserved],
        manager,
      );
    });

    it('is a no-op when the order has no RESERVED or COMMITTED rows (AC32)', async () => {
      stockReservationRepository.lockReservedOrCommittedForOrder.mockResolvedValue(
        [],
      );

      await service.restock('order-1');

      expect(inventoryRepository.restock).not.toHaveBeenCalled();
      expect(stockReservationRepository.markRestocked).not.toHaveBeenCalled();
      expect(inventoryRepository.release).not.toHaveBeenCalled();
    });
  });
});
