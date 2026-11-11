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
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { UsersProxyService } from '../services/users-proxy.service';

@Controller('api/users')
export class UsersController {
    constructor(
        private readonly usersProxyService: UsersProxyService,
        private readonly permissionsCacheService: PermissionsCacheService,
    ) {}

    @Get()
    @UseGuards(JwtGuard, PermissionsGuard)
    @RequirePermission('user:manage-roles')
    listUsers(
        @Query() query: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.listUsers(query, authorization);
    }

    @Get('me')
    getProfile(
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.getProfile(authorization);
    }

    @Put('me')
    updateProfile(
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.updateProfile(
            body,
            authorization,
        );
    }

    @Put('change-password')
    changePassword(
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.changePassword(
            body,
            authorization,
        );
    }

    @Get('me/addresses')
    listAddresses(
        @Query() query: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.listAddresses(query, authorization);
    }

    @Post('me/addresses')
    createAddress(
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.createAddress(body, authorization);
    }

    @Put('me/addresses/:id')
    updateAddress(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.updateAddress(id, body, authorization);
    }

    @Delete('me/addresses/:id')
    deleteAddress(
        @Param('id') id: string,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.deleteAddress(id, authorization);
    }

    @Post(':id/roles')
    @UseGuards(JwtGuard, PermissionsGuard)
    @RequirePermission('user:manage-roles')
    async assignRole(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        const result = await this.usersProxyService.assignRoleToUser(
            id,
            body,
            authorization,
        );
        // Only after user-service accepted the change (an upstream error skips this).
        await this.permissionsCacheService.invalidateUser(id);
        return result;
    }

    @Delete(':id/roles/:roleId')
    @UseGuards(JwtGuard, PermissionsGuard)
    @RequirePermission('user:manage-roles')
    async removeRole(
        @Param('id') id: string,
        @Param('roleId') roleId: string,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        const result = await this.usersProxyService.removeRoleFromUser(
            id,
            roleId,
            authorization,
        );
        await this.permissionsCacheService.invalidateUser(id);
        return result;
    }
}