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
import { UsersProxyService } from '../services/users-proxy.service';

@Controller('api/users')
export class UsersController {
    constructor(
        private readonly usersProxyService: UsersProxyService,
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
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.listAddresses(authorization);
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
    assignRole(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.assignRoleToUser(
            id,
            body,
            authorization,
        );
    }

    @Delete(':id/roles/:roleId')
    @UseGuards(JwtGuard, PermissionsGuard)
    @RequirePermission('user:manage-roles')
    removeRole(
        @Param('id') id: string,
        @Param('roleId') roleId: string,
        @Headers('authorization') authorization?: string,
    ): Promise<unknown> {
        return this.usersProxyService.removeRoleFromUser(
            id,
            roleId,
            authorization,
        );
    }
}