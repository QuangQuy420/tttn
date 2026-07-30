import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { OrdersProxyService } from '../services/orders-proxy.service';

/**
 * Thin controller: parses the incoming request and delegates to
 * `OrdersProxyService` — no forwarding/HTTP logic here. Every route is
 * self-service (a user only ever acts on their own cart), so `userId` is
 * always taken from the verified JWT (`request.user.userId`), never from a
 * client-supplied path or body field.
 */
@Controller('api/cart')
export class CartController {
  constructor(private readonly ordersProxyService: OrdersProxyService) {}

  @Get()
  @UseGuards(JwtGuard)
  getCart(@Req() request: Request & { user: AuthenticatedUser }): Promise<unknown> {
    return this.ordersProxyService.getCart(request.user.userId);
  }

  @Post('items')
  @UseGuards(JwtGuard)
  addItem(
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.addCartItem(request.user.userId, body);
  }

  @Put('items/:variantId')
  @UseGuards(JwtGuard)
  updateItem(
    @Param('variantId') variantId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.updateCartItem(
      request.user.userId,
      variantId,
      body,
    );
  }

  @Delete('items/:variantId')
  @UseGuards(JwtGuard)
  removeItem(
    @Param('variantId') variantId: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.removeCartItem(
      request.user.userId,
      variantId,
    );
  }

  @Delete()
  @UseGuards(JwtGuard)
  clearCart(@Req() request: Request & { user: AuthenticatedUser }): Promise<unknown> {
    return this.ordersProxyService.clearCart(request.user.userId);
  }
}

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersProxyService: OrdersProxyService) {}

  @Post('checkout')
  @UseGuards(JwtGuard)
  checkout(
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.checkout(request.user.userId, body);
  }

  @Get()
  @UseGuards(JwtGuard)
  findAll(
    @Query() query: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.getOrders(request.user.userId, query);
  }

  @Get(':id')
  @UseGuards(JwtGuard)
  findOne(
    @Param('id') id: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.getOrderDetail(request.user.userId, id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtGuard)
  cancel(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.cancelOrder(request.user.userId, id, body);
  }
}

/**
 * Thin controller: parses the incoming request and delegates to
 * `OrdersProxyService` — no forwarding/HTTP logic here. Proxies
 * order-service's `/api/v1/admin/orders` routes, which return/act on ANY
 * order regardless of owner (unlike `OrdersController` above, which is
 * self-service). Every route requires the caller to currently hold
 * `order:manage` (checked live against user-service, see
 * `PermissionsGuard`).
 *
 * Route order matters: `summary` must be declared before `:id` — NestJS
 * matches routes in registration order, and a literal `/summary` request
 * would otherwise be swallowed by the `:id` pattern (`id="summary"`, which
 * order-service can't parse as a UUID).
 */
@Controller('api/admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersProxyService: OrdersProxyService) {}

  @Get()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  findAll(@Query() query: Record<string, unknown>): Promise<unknown> {
    return this.ordersProxyService.getAdminOrders(query);
  }

  @Get('summary')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  summary(): Promise<unknown> {
    return this.ordersProxyService.getAdminOrdersSummary();
  }

  @Get(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  findOne(@Param('id') id: string): Promise<unknown> {
    return this.ordersProxyService.getAdminOrderDetail(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  updateStatus(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.ordersProxyService.updateOrderStatusAdmin(
      id,
      request.user.userId,
      body,
    );
  }
}
