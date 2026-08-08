import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Category } from '../db/entities/category.entity';
import { ICategoryRepository } from '../repositories/category.repository';
import { CATEGORY_REPOSITORY } from '../repositories/tokens';
import { CreateCategoryDto } from '../routes/dto/create-category.dto';
import { CategoryResponseDto } from '../routes/dto/category-response.dto';
import { UpdateCategoryDto } from '../routes/dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.findAll();
    return categories.map((category) => this.toResponseDto(category));
  }

  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }
    return this.toResponseDto(category);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.saveWithUniqueSlug(dto.name.trim());
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }
    if (dto.name === undefined) return this.toResponseDto(existing);

    const name = dto.name.trim();
    for (let suffix = 1; ; suffix += 1) {
      const slug = await this.generateAvailableSlug(name, id, suffix);
      try {
        const category = await this.categoryRepository.update(id, {
          name,
          slug,
        });
        if (!category) {
          throw new NotFoundException('Không tìm thấy danh mục.');
        }
        return this.toResponseDto(category);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    }
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }

    if (await this.categoryRepository.countProducts(id)) {
      throw new ConflictException(
        'Không thể xoá danh mục vì vẫn còn sản phẩm đang sử dụng. Vui lòng chuyển hoặc xoá sản phẩm trước.',
      );
    }

    try {
      await this.categoryRepository.delete(id);
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xoá danh mục vì vẫn còn sản phẩm đang sử dụng. Vui lòng chuyển hoặc xoá sản phẩm trước.',
        );
      }
      throw error;
    }
  }

  private async saveWithUniqueSlug(name: string): Promise<CategoryResponseDto> {
    for (let suffix = 1; ; suffix += 1) {
      const slug = await this.generateAvailableSlug(name, undefined, suffix);
      try {
        const category = await this.categoryRepository.create({ name, slug });
        return this.toResponseDto(category);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    }
  }

  private async generateAvailableSlug(
    name: string,
    id: string | undefined,
    suffix: number,
  ): Promise<string> {
    const baseSlug = this.slugify(name);
    const suffixText = suffix === 1 ? '' : `-${suffix}`;
    const slug = `${baseSlug.slice(0, 255 - suffixText.length)}${suffixText}`;
    const existing = await this.categoryRepository.findBySlug(slug);
    if (!existing || existing.id === id) return slug;
    return this.generateAvailableSlug(name, id, suffix + 1);
  }

  private slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'danh-muc';
  }

  private isUniqueViolation(error: unknown): boolean {
    return this.getDatabaseErrorCode(error) === '23505';
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return this.getDatabaseErrorCode(error) === '23503';
  }

  private getDatabaseErrorCode(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) return undefined;
    return (error.driverError as { code?: string }).code;
  }

  private toResponseDto(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
    };
  }
}
