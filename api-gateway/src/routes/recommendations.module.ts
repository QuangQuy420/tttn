import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RecommendationProxyService } from '../services/recommendation-proxy.service';
import { RecommendationsController } from './recommendations.controller';

/**
 * Wires the `/api/recommendations` proxy route to
 * `recommendation-service`, per the route table in README.md.
 */
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<AppConfig>('app')!.downstreamTimeoutMs,
      }),
    }),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationProxyService],
})
export class RecommendationsModule {}
