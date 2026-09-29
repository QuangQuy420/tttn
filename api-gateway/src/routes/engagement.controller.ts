import {
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { EngagementProxyService } from '../services/engagement-proxy.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * product-service validates query strings with `forbidNonWhitelisted`, so
 * only the query keys each upstream route accepts are forwarded.
 */
function pickQuery(
  query: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (query[key] !== undefined) {
      picked[key] = query[key];
    }
  }
  return picked;
}

/**
 * Thin controller: the caller's own wishlist. `userId` always comes from the
 * verified JWT (`request.user.userId`), never from the client.
 *
 * `product-ids` is declared before `:productId` so the literal route's
 * precedence is explicit.
 */
@Controller('api/wishlist')
export class WishlistController {
  constructor(private readonly engagementProxyService: EngagementProxyService) {}

  @Get()
  @UseGuards(JwtGuard)
  findAll(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.getWishlist(
      request.user,
      pickQuery(query, ['page', 'limit']),
    );
  }

  @Get('product-ids')
  @UseGuards(JwtGuard)
  productIds(@Req() request: AuthenticatedRequest): Promise<unknown> {
    return this.engagementProxyService.getWishlistProductIds(request.user);
  }

  @Post(':productId')
  @UseGuards(JwtGuard)
  add(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.addToWishlist(request.user, productId);
  }

  @Delete(':productId')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.engagementProxyService.removeFromWishlist(
      request.user,
      productId,
    );
  }
}

/**
 * Thin controller: product reviews. `summary` and the list stay public;
 * the caller's own review (`mine`) and creating a review require a JWT.
 */
@Controller('api/products/:id/reviews')
export class ProductReviewsController {
  constructor(private readonly engagementProxyService: EngagementProxyService) {}

  @Get('summary')
  summary(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.engagementProxyService.getReviewSummary(id);
  }

  @Get()
  findAll(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.engagementProxyService.getReviews(
      id,
      pickQuery(query, ['page', 'limit']),
    );
  }

  @Get('mine')
  @UseGuards(JwtGuard)
  findMine(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.getMyReview(request.user, id);
  }

  @Post()
  @UseGuards(JwtGuard)
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.createReview(request.user, id, body);
  }

  @Patch('mine')
  @UseGuards(JwtGuard)
  updateMine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.updateMyReview(request.user, id, body);
  }

  @Delete('mine')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMine(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.engagementProxyService.deleteMyReview(request.user, id);
  }
}

/**
 * Thin controller: review moderation. Every route requires the caller to
 * currently hold `product:manage` (checked live against user-service, see
 * `PermissionsGuard`).
 */
@Controller('api/admin/reviews')
export class AdminReviewsController {
  constructor(private readonly engagementProxyService: EngagementProxyService) {}

  @Get()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.engagementProxyService.getAdminReviews(
      pickQuery(query, ['page', 'limit', 'status']),
    );
  }

  @Patch(':reviewId/status')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('product:manage')
  updateStatus(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.engagementProxyService.updateReviewStatus(reviewId, body);
  }
}
