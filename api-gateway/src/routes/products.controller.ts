import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ProductsProxyService } from '../services/products-proxy.service';

/**
 * Thin controllers: parse the incoming request (path params, query string)
 * and delegate to `ProductsProxyService` — no forwarding/HTTP logic here.
 * Write endpoints require the caller to currently hold `product:manage`
 * (checked live against user-service, see `PermissionsGuard`); read
 * endpoints stay public (FR6).
 */
@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsProxyService: ProductsProxyService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.getProducts(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<unknown> {
    return this.productsProxyService.getProductById(id);
  }

  @Post()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  create(@Body() body: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.createProduct(body);
  }

  @Patch(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateProduct(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<unknown> {
    return this.productsProxyService.deleteProduct(id);
  }

  @Post(':id/variants')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  createVariant(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.createVariant(id, body);
  }

  @Patch(':id/variants/:variantId')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateVariant(id, variantId, body);
  }

  @Delete(':id/variants/:variantId')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ): Promise<unknown> {
    return this.productsProxyService.deleteVariant(id, variantId);
  }

  @Post(':id/images')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @Param('id') id: string,
    @Body('slot') slot: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.productsProxyService.uploadProductImage(id, slot, file);
  }
}

@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly productsProxyService: ProductsProxyService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.getCategories(query);
  }
}

@Controller('api/brands')
export class BrandsController {
  constructor(private readonly productsProxyService: ProductsProxyService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.getBrands(query);
  }
}
