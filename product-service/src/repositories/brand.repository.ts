import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../db/entities/brand.entity';

export interface IBrandRepository {
  findByName(name: string): Promise<Brand | null>;
  create(data: Partial<Brand>): Promise<Brand>;
}

@Injectable()
export class TypeOrmBrandRepository implements IBrandRepository {
  constructor(
    @InjectRepository(Brand) private readonly repo: Repository<Brand>,
  ) {}

  findByName(name: string): Promise<Brand | null> {
    return this.repo.findOne({ where: { name } });
  }

  create(data: Partial<Brand>): Promise<Brand> {
    return this.repo.save(this.repo.create(data));
  }
}
