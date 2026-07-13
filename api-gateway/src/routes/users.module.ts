import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { UsersProxyService } from '../services/users-proxy.service';
import { UsersController } from './users.controller';

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
    controllers: [UsersController],
    providers: [UsersProxyService],
})
export class UsersModule {}