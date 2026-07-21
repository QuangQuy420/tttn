import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersProxyService } from '../services/users-proxy.service';

/**
 * Thin controller: parses the incoming request and delegates to
 * `UsersProxyService` — no forwarding/HTTP logic here. Proxies
 * user-service's `/api/v1/roles` and `/api/v1/permissions`. Every route
 * requires the caller to currently hold `role:manage` (checked live against
 * user-service, see `PermissionsGuard`) — user-service enforces the same
 * check again on its own side (AC5), this guard is a defense-in-depth edge
 * check, not the only enforcement.
 */
@Controller('api/roles')
export class RolesController {
  constructor(private readonly usersProxyService: UsersProxyService) {}

  @Get()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  findAll(
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.listRoles(authorization);
  }

  @Post()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  create(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.createRole(body, authorization);
  }

  @Put(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.updateRole(id, body, authorization);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.deleteRole(id, authorization);
  }
}

@Controller('api/permissions')
export class PermissionsController {
  constructor(private readonly usersProxyService: UsersProxyService) {}

  @Get()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  findAll(
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.listPermissions(authorization);
  }
}
