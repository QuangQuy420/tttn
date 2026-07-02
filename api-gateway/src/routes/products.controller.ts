import { Controller, Get, Param, Query } from '@nestjs/common';
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
}

@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly productsProxyService: ProductsProxyService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.getCategories(query);
  }
}
