import { CategoriesService } from './categories.service';
import { ICategoryRepository } from '../repositories/category.repository';
import { Category } from '../db/entities/category.entity';

describe('CategoriesService', () => {
  let categoryRepository: jest.Mocked<ICategoryRepository>;
  let service: CategoriesService;

  beforeEach(() => {
    categoryRepository = {
      findPage: jest.fn(),
      findBySlug: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      countProducts: jest.fn(),
      delete: jest.fn(),
    };
    service = new CategoriesService(categoryRepository);
  });

  it('maps categories to response DTOs', async () => {
    categoryRepository.findPage.mockResolvedValue({
      items: [
        {
          id: 'cat-1',
          name: 'Sunglasses',
          slug: 'sunglasses',
        } as Category,
        {
          id: 'cat-2',
          name: 'Aviators',
          slug: 'aviators',
        } as Category,
      ],
      total: 2,
    });

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.items).toEqual([
      { id: 'cat-1', name: 'Sunglasses', slug: 'sunglasses' },
      { id: 'cat-2', name: 'Aviators', slug: 'aviators' },
    ]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('returns an empty array when there are no categories', async () => {
    categoryRepository.findPage.mockResolvedValue({ items: [], total: 0 });

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.items).toEqual([]);
  });
});
