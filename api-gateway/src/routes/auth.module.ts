import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { AuthProxyService } from '../services/auth-proxy.service';
import { AuthController } from './auth.controller';

@Module({
    imports: [
        HttpModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                timeout:
                configService.get<AppConfig>('app')!
                    .downstreamTimeoutMs,
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthProxyService],
})
export class AuthModule {}