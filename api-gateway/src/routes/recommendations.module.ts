import { Module } from '@nestjs/common';
import { RecommendationProxyService } from '../services/recommendation-proxy.service';
import { RecommendationsController } from './recommendations.controller';

/**
 * Wires the `/api/recommendations` proxy route to
 * `recommendation-service`, per the route table in README.md.
 */
@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationProxyService],
})
export class RecommendationsModule {}
