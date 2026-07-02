import { CategoriesService } from './categories.service';
import { ICategoryRepository } from '../repositories/category.repository';
import { Category } from '../db/entities/category.entity';

describe('CategoriesService', () => {
  let categoryRepository: jest.Mocked<ICategoryRepository>;
  let service: CategoriesService;

  beforeEach(() => {
    categoryRepository = {
      findAll: jest.fn(),
      findBySlug: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    service = new CategoriesService(categoryRepository);
  });

  it('maps categories to response DTOs', async () => {
    categoryRepository.findAll.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Sunglasses',
        slug: 'sunglasses',
        parentId: null,
      } as Category,
      {
        id: 'cat-2',
        name: 'Aviators',
        slug: 'aviators',
        parentId: 'cat-1',
      } as Category,
    ]);

    const result = await service.findAll();

    expect(result).toEqual([
      { id: 'cat-1', name: 'Sunglasses', slug: 'sunglasses', parentId: null },
      { id: 'cat-2', name: 'Aviators', slug: 'aviators', parentId: 'cat-1' },
    ]);
  });

  it('returns an empty array when there are no categories', async () => {
    categoryRepository.findAll.mockResolvedValue([]);

    const result = await service.findAll();

    expect(result).toEqual([]);
  });
});
