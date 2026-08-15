import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from '../services/products.service';
import { ProductImagesService } from '../services/product-images.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import {
  ProductResponseDto,
  ProductImageResponseDto,
} from './dto/product-response.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UploadProductImageDto } from './dto/upload-product-image.dto';
import { SetImageThumbnailDto } from './dto/set-image-thumbnail.dto';

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productImagesService: ProductImagesService,
  ) {}

  @Get()
  findAll(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    return this.productsService.findAll(query);
  }

  // Declared before `:id` — a two-segment path never matches `:id`, but keeping the
  // literal route first makes the precedence explicit.
  @Get('slug/:slug')
  findOneBySlug(@Param('slug') slug: string): Promise<ProductResponseDto> {
    return this.productsService.findOneBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productsService.remove(id);
  }

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UploadProductImageDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ProductImageResponseDto> {
    if (!file) {
      throw new BadRequestException('Cần có tệp tin');
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tệp phải là 1 trong các định dạng: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Tệp phải nhỏ hơn hoặc bằng 5 MB');
    }
    if (body.variantId) {
      await this.productImagesService.assertVariantBelongsToProduct(
        id,
        body.variantId,
      );
    }

    const image = await this.productImagesService.uploadAndAttach(
      id,
      body.variantId ?? null,
      file,
    );

    return {
      id: image.id,
      variantId: image.variantId,
      imageUrl: image.imageUrl,
      isThumbnail: image.isThumbnail,
      sortOrder: image.sortOrder,
    };
  }

  @Patch(':id/images/:imageId')
  async setImageThumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() body: SetImageThumbnailDto,
  ): Promise<ProductImageResponseDto> {
    if (!body.isThumbnail) {
      throw new BadRequestException('isThumbnail phải là true');
    }
    const image = await this.productImagesService.setThumbnail(id, imageId);

    return {
      id: image.id,
      variantId: image.variantId,
      imageUrl: image.imageUrl,
      isThumbnail: image.isThumbnail,
      sortOrder: image.sortOrder,
    };
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    return this.productImagesService.remove(id, imageId);
  }
}
