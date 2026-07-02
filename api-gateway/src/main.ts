import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const { port, corsOrigin } = configService.get<AppConfig>('app')!;

  // Central CORS config (README: "Central CORS, /health, rate-limit").
  app.enableCors({
    origin: corsOrigin.split(',').map((origin) => origin.trim()),
  });

  await app.listen(port);
}

bootstrap();
