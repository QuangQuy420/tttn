import {
    Body,
    Controller,
    Post,
} from '@nestjs/common';
import { RateLimitTier } from '../auth/rate-limit';
import { AuthProxyService } from '../services/auth-proxy.service';

@Controller('api/auth')
export class AuthController {
    constructor(
        private readonly authProxyService: AuthProxyService,
    ) {}

    @Post('register')
    @RateLimitTier('auth')
    register(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.register(body);
    }

    @Post('login')
    @RateLimitTier('auth')
    login(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.login(body);
    }

    @Post('forgot-password')
    @RateLimitTier('auth')
    forgotPassword(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.forgotPassword(body);
    }

    @Post('reset-password')
    @RateLimitTier('auth')
    resetPassword(
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        return this.authProxyService.resetPassword(body);
    }
}