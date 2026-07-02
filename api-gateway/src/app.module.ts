import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { HealthController } from './routes/health.controller';
import { ProductsModule } from './routes/products.module';

@Module({
  imports: [AppConfigModule, ProductsModule],
  controllers: [HealthController],
})
export class AppModule {}
