import { Inject, Injectable } from '@nestjs/common';
import { ICategoryRepository } from '../repositories/category.repository';
import { CATEGORY_REPOSITORY } from '../repositories/tokens';
import { CategoryResponseDto } from '../routes/dto/category-response.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.findAll();
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
    }));
  }
}
