import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ProductVariantsService } from '../services/product-variants.service';
import { ProductVariantResponseDto } from './dto/product-response.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

/**
 * Thin controller, mirrors `ProductsController`'s `:id/images` nesting — parses the request
 * and delegates to `ProductVariantsService`, which owns `ps_product_variants` including
 * its stock quantities.
 */
@Controller('products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}

  @Post()
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ): Promise<ProductVariantResponseDto> {
    return this.variantsService.create(productId, dto);
  }

  @Patch(':variantId')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<ProductVariantResponseDto> {
    return this.variantsService.update(productId, variantId, dto);
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<void> {
    return this.variantsService.remove(productId, variantId);
  }
}
