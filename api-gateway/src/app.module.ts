import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  RATE_LIMIT_TIER,
  RateLimitTierName,
  userOrIpTracker,
} from './auth/rate-limit';
import { CacheModule } from './common/cache.module';
import { GatewayExceptionFilter } from './common/gateway-exception.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { SharedHttpModule } from './common/shared-http.module';
import { AppConfigModule } from './config/app-config.module';
import { AppConfig } from './config/configuration';
import { FaceAnalysisModule } from './routes/face-analysis.module';
import { HealthController } from './routes/health.controller';
import { ProductsModule } from './routes/products.module';
import { OrdersModule } from './routes/orders.module';
import { AuthModule } from './routes/auth.module';
import { UsersModule } from './routes/users.module';
import { RolesModule } from './routes/roles.module';
import { RecommendationsModule } from './routes/recommendations.module';
import { EngagementModule } from './routes/engagement.module';
import { EventsModule } from './routes/events.module';

@Module({
  imports: [
            AppConfigModule,
            // One in-memory throttler (single gateway instance, ADR 0005), keyed
            // per user (valid JWT) or IP; the limit depends on the route's
            // `@RateLimitTier(...)`, otherwise `RATE_LIMIT_DEFAULT`.
            ThrottlerModule.forRootAsync({
              inject: [ConfigService, Reflector],
              useFactory: (configService: ConfigService, reflector: Reflector) => {
                const app = configService.get<AppConfig>('app')!;
                const limitByTier: Record<RateLimitTierName, number> = {
                  auth: app.rateLimitAuth,
                  faceAnalyze: app.rateLimitFaceAnalyze,
                  events: app.rateLimitEvents,
                };
                return {
                  throttlers: [
                    {
                      name: 'default',
                      ttl: app.rateLimitTtlMs,
                      limit: (context) => {
                        const tier = reflector.getAllAndOverride<
                          RateLimitTierName | undefined
                        >(RATE_LIMIT_TIER, [context.getHandler(), context.getClass()]);
                        return tier ? limitByTier[tier] : app.rateLimitDefault;
                      },
                    },
                  ],
                  getTracker: userOrIpTracker(app.jwtSecret),
                  errorMessage: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
                };
              },
            }),
            CacheModule,
            SharedHttpModule,
            ProductsModule,
            OrdersModule,
            FaceAnalysisModule,
            AuthModule,
            UsersModule,
            RolesModule,
            RecommendationsModule,
            EngagementModule,
            EventsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GatewayExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Express 5 wildcard: every route, so 429s and 404s also carry X-Request-Id.
    consumer.apply(RequestIdMiddleware).forRoutes('{*splat}');
  }
}
