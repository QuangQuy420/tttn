import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../db/entities/category.entity';

export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  create(data: Partial<Category>): Promise<Category>;
  update(id: string, data: Partial<Category>): Promise<Category>;
}

@Injectable()
export class TypeOrmCategoryRepository implements ICategoryRepository {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.repo.find({ order: { name: 'ASC' } });
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

  async update(id: string, data: Partial<Category>): Promise<Category> {
    await this.repo.update({ id }, data);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Category ${id} not found after update`);
    }
    return updated;
  }
}
