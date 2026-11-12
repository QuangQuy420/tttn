import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
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
import { UuidPipe } from '../common/uuid.pipe';
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
    @UseGuards(JwtGuard)
    getProfile(
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.getProfile(authorization);
    }

    @Put('me')
    @UseGuards(JwtGuard)
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
    @UseGuards(JwtGuard)
    async changePassword(
        @Body() body: Record<string, unknown>,
        @Req() request: Request & { user: AuthenticatedUser },
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        const result = await this.usersProxyService.changePassword(
            body,
            authorization,
        );
        // user-service moved `tokensValidAfter`: drop the cached auth state so
        // the old token is rejected at once, not after the 60 s TTL.
        await this.permissionsCacheService.invalidateUser(request.user.userId);
        return result;
    }

    @Get('me/addresses')
    @UseGuards(JwtGuard)
    listAddresses(
        @Query() query: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.listAddresses(query, authorization);
    }

    @Post('me/addresses')
    @UseGuards(JwtGuard)
    @HttpCode(HttpStatus.OK)
    createAddress(
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.createAddress(body, authorization);
    }

    @Put('me/addresses/:id')
    @UseGuards(JwtGuard)
    updateAddress(
        @Param('id', UuidPipe) id: string,
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.updateAddress(id, body, authorization);
    }

    @Delete('me/addresses/:id')
    @UseGuards(JwtGuard)
    deleteAddress(
        @Param('id', UuidPipe) id: string,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.deleteAddress(id, authorization);
    }

    @Post(':id/roles')
    @UseGuards(JwtGuard, PermissionsGuard)
    @RequirePermission('user:manage-roles')
    async assignRole(
        @Param('id', UuidPipe) id: string,
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
        @Param('id', UuidPipe) id: string,
        @Param('roleId', UuidPipe) roleId: string,
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