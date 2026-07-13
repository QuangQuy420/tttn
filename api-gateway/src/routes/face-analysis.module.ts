import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { FaceAnalysisProxyService } from '../services/face-analysis-proxy.service';
import { FaceAnalysisController } from './face-analysis.controller';

/**
 * Wires the `/api/face-analysis/*` proxy routes to
 * `face-processing-service`, per the route table in README.md.
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
  controllers: [FaceAnalysisController],
  providers: [FaceAnalysisProxyService],
})
export class FaceAnalysisModule {}
