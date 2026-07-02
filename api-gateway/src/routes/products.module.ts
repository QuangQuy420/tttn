import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { ProductsProxyService } from '../services/products-proxy.service';
import { CategoriesController, ProductsController } from './products.controller';

/**
 * Wires the `/api/products/*` + `/api/categories/*` proxy routes to
 * `product-service`, per the route table in README.md.
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
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsProxyService],
})
export class ProductsModule {}
