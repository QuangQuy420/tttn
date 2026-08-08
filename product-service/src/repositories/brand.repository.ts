import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../db/entities/brand.entity';
import { Product } from '../db/entities/product.entity';

export interface IBrandRepository {
  findAll(): Promise<Brand[]>;
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

  findAll(): Promise<Brand[]> {
    return this.repo.find({ order: { name: 'ASC' } });
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
