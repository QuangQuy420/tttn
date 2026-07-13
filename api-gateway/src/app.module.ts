import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { FaceAnalysisModule } from './routes/face-analysis.module';
import { HealthController } from './routes/health.controller';
import { ProductsModule } from './routes/products.module';
import { AuthModule } from './routes/auth.module';
import { UsersModule } from './routes/users.module';

@Module({
  imports: [
            AppConfigModule,
            ProductsModule,
            FaceAnalysisModule,
            AuthModule,
            UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
