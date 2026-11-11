import { Module } from '@nestjs/common';
import { UsersProxyService } from '../services/users-proxy.service';
import { UsersController } from './users.controller';

@Module({
    controllers: [UsersController],
    providers: [UsersProxyService],
})
export class UsersModule {}