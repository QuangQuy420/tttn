import { Body, Controller, Post } from '@nestjs/common';
import { RecommendationProxyService } from '../services/recommendation-proxy.service';

/**
 * Thin controller: parses the incoming request and delegates to
 * `RecommendationProxyService` — no forwarding/HTTP logic here.
 *
 * No `JwtGuard` here (Q2): this endpoint is stateless (faceShape in,
 * ranked products out), same unauthenticated precedent as `GET /products`.
 */
@Controller('api/recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationProxyService: RecommendationProxyService) {}

  @Post()
  recommend(@Body() body: Record<string, unknown>): Promise<unknown> {
    return this.recommendationProxyService.recommend(body);
  }
}
