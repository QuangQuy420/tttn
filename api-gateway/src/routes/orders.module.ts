import { Module } from '@nestjs/common';
import { OrdersProxyService } from '../services/orders-proxy.service';
import {
  AdminOrdersController,
  AdminSagaLogsController,
  AdminSagaSettingsController,
  CartController,
  OrdersController,
} from './orders.controller';

/**
 * Wires the `/api/cart/*`, `/api/orders/*`, `/api/admin/orders/*`,
 * `/api/admin/saga-logs/*`, and `/api/admin/saga-settings/*` proxy routes to
 * `order-service`, per the route table in README.md.
 * `AdminOrdersController`'s, `AdminSagaLogsController`'s, and
 * `AdminSagaSettingsController`'s routes use `PermissionsGuard`, whose
 * `PermissionsCacheService` comes from the global `CacheModule`.
 */
@Module({
  controllers: [
    CartController,
    OrdersController,
    AdminOrdersController,
    AdminSagaLogsController,
    AdminSagaSettingsController,
  ],
  providers: [OrdersProxyService],
})
export class OrdersModule {}
