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
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { pickQueryIfPermitted } from '../auth/has-permission';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { pickQuery } from '../common/pick-query';
import { UuidPipe } from '../common/uuid.pipe';
import { EngagementProxyService } from '../services/engagement-proxy.service';
import { PermissionsCacheService } from '../services/permissions-cache.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };
type OptionalUserRequest = Request & { user?: AuthenticatedUser };

/** Draft-visibility flag of the review routes, forwarded only for `product:manage`. */
const STATUS_KEYS = ['includeAllStatuses'];

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
    @Param('productId', UuidPipe) productId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.addToWishlist(request.user, productId);
  }

  @Delete(':productId')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('productId', UuidPipe) productId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.engagementProxyService.removeFromWishlist(
      request.user,
      productId,
    );
  }
}

/**
 * Thin controller: product reviews. `summary` and the list stay public
 * (`includeAllStatuses` — reviews of a non-PUBLISHED product — is forwarded
 * only for `product:manage`); the caller's own review (`mine`) and creating
 * a review require a JWT.
 */
@Controller('api/products/:id/reviews')
export class ProductReviewsController {
  constructor(
    private readonly engagementProxyService: EngagementProxyService,
    private readonly permissionsCacheService: PermissionsCacheService,
  ) {}

  @Get('summary')
  @UseGuards(OptionalJwtGuard)
  async summary(
    @Param('id', UuidPipe) id: string,
    @Query() query: Record<string, unknown>,
    @Req() request: OptionalUserRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.getReviewSummary(
      id,
      await this.permittedStatusQuery(query, request),
    );
  }

  @Get()
  @UseGuards(OptionalJwtGuard)
  async findAll(
    @Param('id', UuidPipe) id: string,
    @Query() query: Record<string, unknown>,
    @Req() request: OptionalUserRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.getReviews(id, {
      ...pickQuery(query, ['page', 'limit']),
      ...(await this.permittedStatusQuery(query, request)),
    });
  }

  @Get('mine')
  @UseGuards(JwtGuard)
  findMine(
    @Param('id', UuidPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.getMyReview(request.user, id);
  }

  @Post()
  @UseGuards(JwtGuard)
  create(
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.createReview(request.user, id, body);
  }

  @Patch('mine')
  @UseGuards(JwtGuard)
  updateMine(
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.engagementProxyService.updateMyReview(request.user, id, body);
  }

  @Delete('mine')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMine(
    @Param('id', UuidPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.engagementProxyService.deleteMyReview(request.user, id);
  }

  private permittedStatusQuery(
    query: Record<string, unknown>,
    request: OptionalUserRequest,
  ): Promise<Record<string, unknown>> {
    return pickQueryIfPermitted(
      this.permissionsCacheService,
      request.user,
      'product:manage',
      query,
      STATUS_KEYS,
    );
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
    @Param('reviewId', UuidPipe) reviewId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.engagementProxyService.updateReviewStatus(reviewId, body);
  }
}
