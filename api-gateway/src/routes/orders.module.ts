import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { OrdersProxyService } from '../services/orders-proxy.service';
import { CartController, OrdersController } from './orders.controller';

/**
 * Wires the `/api/cart/*` and `/api/orders/*` proxy routes to
 * `order-service`, per the route table in README.md.
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
  controllers: [CartController, OrdersController],
  providers: [OrdersProxyService],
})
export class OrdersModule {}
