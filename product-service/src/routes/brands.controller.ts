import { Controller, Get } from '@nestjs/common';
import { BrandsService } from '../services/brands.service';
import { BrandResponseDto } from './dto/brand-response.dto';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  findAll(): Promise<BrandResponseDto[]> {
    return this.brandsService.findAll();
  }
}
