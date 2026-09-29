import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BrandsService } from '../services/brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { BrandResponseDto } from './dto/brand-response.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { Paginated } from '../common/api-response';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<BrandResponseDto>> {
    return this.brandsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<BrandResponseDto> {
    return this.brandsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBrandDto): Promise<BrandResponseDto> {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandResponseDto> {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.brandsService.remove(id);
  }
}
