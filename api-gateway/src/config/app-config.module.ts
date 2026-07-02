import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';

/**
 * Central place for env/DI config wiring (per README: `src/config` owns env
 * config + downstream service URLs). Global so any feature module can inject
 * `ConfigService` without re-importing this module.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
  ],
})
export class AppConfigModule {}
