import { Inject, Injectable } from '@nestjs/common';
import { IBrandRepository } from '../repositories/brand.repository';
import { BRAND_REPOSITORY } from '../repositories/tokens';
import { BrandResponseDto } from '../routes/dto/brand-response.dto';

@Injectable()
export class BrandsService {
  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: IBrandRepository,
  ) {}

  async findAll(): Promise<BrandResponseDto[]> {
    const brands = await this.brandRepository.findAll();
    return brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl,
    }));
  }
}
