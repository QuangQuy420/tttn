import { HttpModule, HttpService } from '@nestjs/axios';
import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { getRequestId, REQUEST_ID_HEADER } from './request-context';

/**
 * The one `HttpModule` (axios) every proxy service uses, with the shared
 * downstream timeout. Adds `X-Request-Id` from the current request context
 * to every outgoing call, on top of the per-call headers (multipart
 * `form.getHeaders()`, `X-User-Id`, `X-Internal-Key`, `Authorization`).
 */
@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<AppConfig>('app')!.downstreamTimeoutMs,
      }),
    }),
  ],
  exports: [HttpModule],
})
export class SharedHttpModule implements OnModuleInit {
  constructor(private readonly httpService: HttpService) {}

  onModuleInit(): void {
    // Undefined when tests replace `HttpService` with a bare stub.
    if (!this.httpService.axiosRef) {
      return;
    }

    this.httpService.axiosRef.interceptors.request.use((config) => {
      const requestId = getRequestId();
      if (requestId) {
        config.headers.set(REQUEST_ID_HEADER, requestId);
      }
      return config;
    });
  }
}
