import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../db/entities/brand.entity';
import { Product } from '../db/entities/product.entity';

export interface IBrandRepository {
  /** One page (1-based) ordered by name, plus the total row count. */
  findPage(
    page: number,
    limit: number,
  ): Promise<{ items: Brand[]; total: number }>;
  findById(id: string): Promise<Brand | null>;
  findByNameKey(nameKey: string): Promise<Brand | null>;
  create(data: Partial<Brand>): Promise<Brand>;
  update(id: string, data: Partial<Brand>): Promise<Brand | null>;
  countProducts(id: string): Promise<number>;
  delete(id: string): Promise<boolean>;
}

@Injectable()
export class TypeOrmBrandRepository implements IBrandRepository {
  constructor(
    @InjectRepository(Brand) private readonly repo: Repository<Brand>,
  ) {}

  async findPage(
    page: number,
    limit: number,
  ): Promise<{ items: Brand[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  findById(id: string): Promise<Brand | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByNameKey(nameKey: string): Promise<Brand | null> {
    return this.repo.findOne({ where: { nameKey } });
  }

  create(data: Partial<Brand>): Promise<Brand> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<Brand>): Promise<Brand | null> {
    const result = await this.repo.update({ id }, data);
    return result.affected ? this.findById(id) : null;
  }

  countProducts(id: string): Promise<number> {
    return this.repo.manager.getRepository(Product).count({
      where: { brandId: id },
      withDeleted: true,
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return Boolean(result.affected);
  }
}
