import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm-options';
import { PaymentsModule } from './payments.module';
import { HealthModule } from './health.module';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildTypeOrmOptions(process.env),
    }),
    PaymentsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
