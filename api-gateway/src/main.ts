import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const { port, corsOrigin } = configService.get<AppConfig>('app')!;

  // Central CORS config (rate limit + request-id are wired in AppModule).
  app.enableCors({
    origin: corsOrigin.split(',').map((origin) => origin.trim()),
    // Lets the browser read the checkout replay flag set by order-service
    // and the gateway's per-request id (for bug reports / log lookup).
    exposedHeaders: ['Idempotent-Replayed', 'X-Request-Id'],
  });

  await app.listen(port);
}

bootstrap();
