import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm-options';
import { CatalogModule } from './catalog.module';
import { HealthModule } from './health.module';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildTypeOrmOptions(process.env),
    }),
    CatalogModule,
    HealthModule,
  ],
  // Registered here (not in main.ts) so the e2e app built from AppModule gets them too.
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
