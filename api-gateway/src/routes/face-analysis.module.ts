import { Module } from '@nestjs/common';
import { FaceAnalysisProxyService } from '../services/face-analysis-proxy.service';
import { FaceAnalysisController } from './face-analysis.controller';

/**
 * Wires the `/api/face-analysis/*` proxy routes to
 * `face-processing-service`, per the route table in README.md.
 */
@Module({
  controllers: [FaceAnalysisController],
  providers: [FaceAnalysisProxyService],
})
export class FaceAnalysisModule {}
