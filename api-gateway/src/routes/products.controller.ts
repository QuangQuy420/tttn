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
  Req,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { pickQueryIfPermitted } from '../auth/has-permission';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiredFilePipe, SingleFileUpload } from '../common/file-upload';
import { SlugPipe } from '../common/pattern.pipe';
import { omitQuery } from '../common/pick-query';
import { UuidPipe } from '../common/uuid.pipe';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { ProductsProxyService } from '../services/products-proxy.service';

type OptionalUserRequest = Request & { user?: AuthenticatedUser };

/** product-service's draft-visibility params on the list route. */
const LIST_STATUS_KEYS = ['status', 'includeAllStatuses'];
/** Detail routes accept only the flag (`forbidNonWhitelisted` upstream). */
const DETAIL_STATUS_KEYS = ['includeAllStatuses'];

/**
 * Thin controllers: parse the incoming request (path params, query string)
 * and delegate to `ProductsProxyService` — no forwarding/HTTP logic here.
 * Write endpoints require the caller to currently hold `product:manage`
 * (checked live against user-service, see `PermissionsGuard`); read
 * endpoints stay public (FR6). Reads forward the draft-visibility params
 * (`status` on the list, `includeAllStatuses` everywhere) only for a caller
 * who holds `product:manage` and strip them otherwise, so guests see
 * PUBLISHED products only.
 */
@Controller('api/products')
export class ProductsController {
  constructor(
    private readonly productsProxyService: ProductsProxyService,
    private readonly permissionsCacheService: PermissionsCacheService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  async findAll(
    @Query() query: Record<string, unknown>,
    @Req() request: OptionalUserRequest,
  ): Promise<unknown> {
    const statusQuery = await this.permittedStatusQuery(
      query,
      request,
      LIST_STATUS_KEYS,
    );
    return this.productsProxyService.getProducts({
      ...omitQuery(query, LIST_STATUS_KEYS),
      ...statusQuery,
    });
  }

  // Declared before `:id` so the literal route's precedence is explicit.
  @Get('slug/:slug')
  @UseGuards(OptionalJwtGuard)
  async findOneBySlug(
    @Param('slug', SlugPipe) slug: string,
    @Query() query: Record<string, unknown>,
    @Req() request: OptionalUserRequest,
  ): Promise<unknown> {
    return this.productsProxyService.getProductBySlug(
      slug,
      await this.permittedStatusQuery(query, request, DETAIL_STATUS_KEYS),
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  async findOne(
    @Param('id', UuidPipe) id: string,
    @Query() query: Record<string, unknown>,
    @Req() request: OptionalUserRequest,
  ): Promise<unknown> {
    return this.productsProxyService.getProductById(
      id,
      await this.permittedStatusQuery(query, request, DETAIL_STATUS_KEYS),
    );
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
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateProduct(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidPipe) id: string): Promise<unknown> {
    return this.productsProxyService.deleteProduct(id);
  }

  @Post(':id/variants')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  createVariant(
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.createVariant(id, body);
  }

  @Patch(':id/variants/:variantId')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  updateVariant(
    @Param('id', UuidPipe) id: string,
    @Param('variantId', UuidPipe) variantId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateVariant(id, variantId, body);
  }

  @Delete(':id/variants/:variantId')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(
    @Param('id', UuidPipe) id: string,
    @Param('variantId', UuidPipe) variantId: string,
  ): Promise<unknown> {
    return this.productsProxyService.deleteVariant(id, variantId);
  }

  @Post(':id/images')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @SingleFileUpload(5)
  uploadImage(
    @Param('id', UuidPipe) id: string,
    @Body('variantId') variantId: string | undefined,
    @Body('kind') kind: string | undefined,
    @UploadedFile(RequiredFilePipe) file: Express.Multer.File,
  ): Promise<unknown> {
    return this.productsProxyService.uploadProductImage(
      id,
      file,
      variantId,
      kind,
    );
  }

  @Patch(':id/images/:imageId')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  setImageThumbnail(
    @Param('id', UuidPipe) id: string,
    @Param('imageId', UuidPipe) imageId: string,
  ): Promise<unknown> {
    return this.productsProxyService.setProductImageThumbnail(id, imageId);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeImage(
    @Param('id', UuidPipe) id: string,
    @Param('imageId', UuidPipe) imageId: string,
  ): Promise<unknown> {
    return this.productsProxyService.deleteProductImage(id, imageId);
  }

  private permittedStatusQuery(
    query: Record<string, unknown>,
    request: OptionalUserRequest,
    keys: string[],
  ): Promise<Record<string, unknown>> {
    return pickQueryIfPermitted(
      this.permissionsCacheService,
      request.user,
      'product:manage',
      query,
      keys,
    );
  }
}

@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly productsProxyService: ProductsProxyService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.getCategories(query);
  }

  @Post()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('catalog:manage')
  create(@Body() body: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.createCategory(body);
  }

  @Patch(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('catalog:manage')
  update(
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateCategory(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidPipe) id: string): Promise<unknown> {
    return this.productsProxyService.deleteCategory(id);
  }
}

@Controller('api/brands')
export class BrandsController {
  constructor(private readonly productsProxyService: ProductsProxyService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.getBrands(query);
  }

  @Post()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('catalog:manage')
  create(@Body() body: Record<string, unknown>): Promise<unknown> {
    return this.productsProxyService.createBrand(body);
  }

  @Patch(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('catalog:manage')
  update(
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.productsProxyService.updateBrand(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('catalog:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidPipe) id: string): Promise<unknown> {
    return this.productsProxyService.deleteBrand(id);
  }
}
