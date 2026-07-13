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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsProxyService } from '../services/products-proxy.service';

/**
 * Thin controllers: parse the incoming request (path params, query string)
 * and delegate to `ProductsProxyService` — no forwarding/HTTP logic here.
 * No auth guard (Q3, deferred edge JWT verification).
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
  create(@Body() body: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.createProduct(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateProduct(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<unknown> {
    return this.productsProxyService.deleteProduct(id);
  }

  @Post(':id/images')
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
