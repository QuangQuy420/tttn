import { Module } from '@nestjs/common';
import { AuthProxyService } from '../services/auth-proxy.service';
import { AuthController } from './auth.controller';

@Module({
    controllers: [AuthController],
    providers: [AuthProxyService],
})
export class AuthModule {}