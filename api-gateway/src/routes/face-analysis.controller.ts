import { Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { FaceAnalysisProxyService } from '../services/face-analysis-proxy.service';

/**
 * Thin controller: parses the incoming multipart request and delegates to
 * `FaceAnalysisProxyService` — no forwarding/HTTP logic here.
 */
@Controller('api/face-analysis')
export class FaceAnalysisController {
  constructor(private readonly faceAnalysisProxyService: FaceAnalysisProxyService) {}

  @Post('analyze')
  @UseGuards(JwtGuard)
  @UseInterceptors(FileInterceptor('file'))
  analyze(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.faceAnalysisProxyService.analyzeFace(file, request.user.userId);
  }

  @Get('history')
  @UseGuards(JwtGuard)
  history(@Req() request: Request & { user: AuthenticatedUser }): Promise<unknown> {
    return this.faceAnalysisProxyService.getHistory(request.user.userId);
  }
}
