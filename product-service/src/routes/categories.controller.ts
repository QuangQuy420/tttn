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
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { Paginated } from '../common/api-response';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<CategoryResponseDto>> {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<CategoryResponseDto> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.categoriesService.remove(id);
  }
}
