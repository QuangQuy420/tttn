import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FaceAnalysisProxyService } from '../services/face-analysis-proxy.service';

/**
 * Thin controller: parses the incoming multipart request and delegates to
 * `FaceAnalysisProxyService` — no forwarding/HTTP logic here. No auth guard
 * (Q3, deferred edge JWT verification).
 */
@Controller('api/face-analysis')
export class FaceAnalysisController {
  constructor(private readonly faceAnalysisProxyService: FaceAnalysisProxyService) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  analyze(@UploadedFile() file: Express.Multer.File): Promise<unknown> {
    return this.faceAnalysisProxyService.analyzeFace(file);
  }
}
