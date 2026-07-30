import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/typeorm-options';
import { PaymentsModule } from './payments.module';
import { HealthModule } from './health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildTypeOrmOptions(process.env),
    }),
    PaymentsModule,
    HealthModule,
  ],
})
export class AppModule {}
