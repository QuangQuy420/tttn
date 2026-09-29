import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../db/entities/category.entity';
import { Product } from '../db/entities/product.entity';

export interface ICategoryRepository {
  /** One page (1-based) ordered by name, plus the total row count. */
  findPage(
    page: number,
    limit: number,
  ): Promise<{ items: Category[]; total: number }>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  create(data: Partial<Category>): Promise<Category>;
  update(id: string, data: Partial<Category>): Promise<Category | null>;
  countProducts(id: string): Promise<number>;
  delete(id: string): Promise<boolean>;
}

@Injectable()
export class TypeOrmCategoryRepository implements ICategoryRepository {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
  ) {}

  async findPage(
    page: number,
    limit: number,
  ): Promise<{ items: Category[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  findBySlug(slug: string): Promise<Category | null> {
    return this.repo.findOne({ where: { slug } });
  }

  findById(id: string): Promise<Category | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: Partial<Category>): Promise<Category> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<Category>): Promise<Category | null> {
    const result = await this.repo.update({ id }, data);
    return result.affected ? this.findById(id) : null;
  }

  countProducts(id: string): Promise<number> {
    return this.repo.manager.getRepository(Product).count({
      where: { categoryId: id },
      withDeleted: true,
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return Boolean(result.affected);
  }
}
