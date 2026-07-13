import {
    Body,
    Controller,
    Get,
    Headers,
    Put,
} from '@nestjs/common';
import { UsersProxyService } from '../services/users-proxy.service';

@Controller('api/users')
export class UsersController {
    constructor(
        private readonly usersProxyService: UsersProxyService,
    ) {}

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
}