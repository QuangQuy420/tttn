import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GatewayExceptionFilter } from './common/gateway-exception.filter';
import { AppConfigModule } from './config/app-config.module';
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
  providers: [{ provide: APP_FILTER, useClass: GatewayExceptionFilter }],
})
export class AppModule {}
