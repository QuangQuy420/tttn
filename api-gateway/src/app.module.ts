import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { FaceAnalysisModule } from './routes/face-analysis.module';
import { HealthController } from './routes/health.controller';
import { ProductsModule } from './routes/products.module';
import { OrdersModule } from './routes/orders.module';
import { AuthModule } from './routes/auth.module';
import { UsersModule } from './routes/users.module';
import { RecommendationsModule } from './routes/recommendations.module';

@Module({
  imports: [
            AppConfigModule,
            ProductsModule,
            OrdersModule,
            FaceAnalysisModule,
            AuthModule,
            UsersModule,
            RecommendationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
