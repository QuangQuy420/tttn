import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { OrdersProxyService } from '../services/orders-proxy.service';
import { UsersProxyService } from '../services/users-proxy.service';
import {
  AdminOrdersController,
  AdminSagaLogsController,
  CartController,
  OrdersController,
} from './orders.controller';

/**
 * Wires the `/api/cart/*`, `/api/orders/*`, `/api/admin/orders/*`, and
 * `/api/admin/saga-logs/*` proxy routes to `order-service`, per the route
 * table in README.md. `UsersProxyService` is also provided here (alongside
 * `OrdersProxyService`) because `AdminOrdersController`'s and
 * `AdminSagaLogsController`'s routes use `PermissionsGuard`, which calls
 * `UsersProxyService.getPermissions` to check the caller's live permissions
 * against user-service.
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
  controllers: [
    CartController,
    OrdersController,
    AdminOrdersController,
    AdminSagaLogsController,
  ],
  providers: [OrdersProxyService, UsersProxyService],
})
export class OrdersModule {}
