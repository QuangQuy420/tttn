import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { FaceAnalysisModule } from './routes/face-analysis.module';
import { HealthController } from './routes/health.controller';
import { ProductsModule } from './routes/products.module';
import { AuthModule } from './routes/auth.module';

@Module({
  imports: [AppConfigModule, ProductsModule, FaceAnalysisModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
