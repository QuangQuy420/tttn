import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { WishlistService } from '../services/wishlist.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { CurrentUserId } from './request-user.decorator';
import { Paginated } from '../common/api-response';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(
    @CurrentUserId() userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ProductResponseDto>> {
    return this.wishlistService.list(userId, query);
  }

  /** Every liked product id, unpaginated on purpose — used only to paint the ❤ state. */
  @Get('product-ids')
  productIds(@CurrentUserId() userId: string): Promise<string[]> {
    return this.wishlistService.productIds(userId);
  }

  @Post(':productId')
  add(
    @CurrentUserId() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ created: boolean }> {
    return this.wishlistService.add(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUserId() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    await this.wishlistService.remove(userId, productId);
  }
}
