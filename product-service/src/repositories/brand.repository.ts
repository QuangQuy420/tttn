import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../db/entities/brand.entity';

export interface IBrandRepository {
  findAll(): Promise<Brand[]>;
  findById(id: string): Promise<Brand | null>;
  findByName(name: string): Promise<Brand | null>;
  create(data: Partial<Brand>): Promise<Brand>;
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

  findByName(name: string): Promise<Brand | null> {
    return this.repo.findOne({ where: { name } });
  }

  create(data: Partial<Brand>): Promise<Brand> {
    return this.repo.save(this.repo.create(data));
  }
}
