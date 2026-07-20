import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { UsersProxyService } from '../services/users-proxy.service';
import { PermissionsController, RolesController } from './roles.controller';

/**
 * Wires the `/api/roles/*` and `/api/permissions` proxy routes to
 * user-service. Shares `UsersProxyService` with `UsersModule` since both
 * proxy to the same downstream base URL — Nest re-instantiates providers
 * per module unless exported/shared via a common module, but this mirrors
 * `ProductsModule`'s self-contained pattern rather than introducing a shared
 * module for a single extra provider.
 */
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<AppConfig>('app')!.downstreamTimeoutMs,
      }),
    }),
  ],
  controllers: [RolesController, PermissionsController],
  providers: [UsersProxyService],
})
export class RolesModule {}
