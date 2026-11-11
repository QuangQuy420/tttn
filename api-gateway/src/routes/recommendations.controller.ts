import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { RecommendationProxyService } from '../services/recommendation-proxy.service';

/**
 * Thin controller: parses the incoming request and delegates to
 * `RecommendationProxyService` — no forwarding/HTTP logic here.
 *
 * `GET for-you` requires a JWT; `POST` stays open to guests and forwards
 * the caller's id only when a valid token is present (`OptionalJwtGuard`).
 */
@Controller('api/recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationProxyService: RecommendationProxyService) {}

  @Get('for-you')
  @UseGuards(JwtGuard)
  forYou(
    @Query() query: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.recommendationProxyService.forYou(request.user.userId, query);
  }

  @Post()
  @UseGuards(OptionalJwtGuard)
  recommend(
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user?: AuthenticatedUser },
  ): Promise<unknown> {
    return this.recommendationProxyService.recommend(body, request.user?.userId);
  }
}
