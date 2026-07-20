import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
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
