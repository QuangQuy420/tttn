import { BrandsService } from './brands.service';
import { IBrandRepository } from '../repositories/brand.repository';
import { Brand } from '../db/entities/brand.entity';

describe('BrandsService', () => {
  let brandRepository: jest.Mocked<IBrandRepository>;
  let service: BrandsService;

  beforeEach(() => {
    brandRepository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      findByNameKey: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      countProducts: jest.fn(),
      delete: jest.fn(),
    };
    service = new BrandsService(brandRepository);
  });

  it('returns one page of brands with meta (AC3)', async () => {
    brandRepository.findPage.mockResolvedValue({
      items: [
        {
          id: 'brand-1',
          name: 'Ray-Ban',
          logoUrl: null,
          description: null,
        } as Brand,
      ],
      total: 3,
    });

    const result = await service.findAll({ page: 2, limit: 1 });

    expect(brandRepository.findPage).toHaveBeenCalledWith(2, 1);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'brand-1', name: 'Ray-Ban' }),
    ]);
    expect(result.meta).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
  });
});
