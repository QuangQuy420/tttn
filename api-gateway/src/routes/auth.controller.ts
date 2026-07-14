import {
    Body,
    Controller,
    Post,
} from '@nestjs/common';
import { AuthProxyService } from '../services/auth-proxy.service';

@Controller('api/auth')
export class AuthController {
    constructor(
        private readonly authProxyService: AuthProxyService,
    ) {}

    @Post('register')
    register(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.register(body);
    }

    @Post('login')
    login(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.login(body);
    }

    @Post('forgot-password')
    forgotPassword(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.forgotPassword(body);
    }

    @Post('reset-password')
    resetPassword(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.resetPassword(body);
    }
}