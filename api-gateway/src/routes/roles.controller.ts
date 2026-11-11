import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UuidPipe } from '../common/uuid.pipe';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { UsersProxyService } from '../services/users-proxy.service';

/**
 * Thin controller: parses the incoming request and delegates to
 * `UsersProxyService` — no forwarding/HTTP logic here. Proxies
 * user-service's `/api/v1/roles` and `/api/v1/permissions`. Every route
 * requires the caller to currently hold `role:manage` (checked live against
 * user-service, see `PermissionsGuard`) — user-service enforces the same
 * check again on its own side (AC5), this guard is a defense-in-depth edge
 * check, not the only enforcement. Updating or deleting a role clears every
 * cached `perm:*` entry, since any user may hold that role.
 */
@Controller('api/roles')
export class RolesController {
  constructor(
    private readonly usersProxyService: UsersProxyService,
    private readonly permissionsCacheService: PermissionsCacheService,
  ) {}

  @Get()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  findAll(
    @Query() query: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.listRoles(query, authorization);
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
  async update(
    @Param('id', UuidPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    const result = await this.usersProxyService.updateRole(id, body, authorization);
    // Only after user-service accepted the change (an upstream error skips this).
    await this.permissionsCacheService.invalidateAll();
    return result;
  }

  @Delete(':id')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  async remove(
    @Param('id', UuidPipe) id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    const result = await this.usersProxyService.deleteRole(id, authorization);
    await this.permissionsCacheService.invalidateAll();
    return result;
  }
}

@Controller('api/permissions')
export class PermissionsController {
  constructor(private readonly usersProxyService: UsersProxyService) {}

  @Get()
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('role:manage')
  findAll(
    @Query() query: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ): Promise<unknown> {
    return this.usersProxyService.listPermissions(query, authorization);
  }
}
