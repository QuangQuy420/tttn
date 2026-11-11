import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { RateLimitTier } from '../auth/rate-limit';
import { RequiredFilePipe, SingleFileUpload } from '../common/file-upload';
import { UuidPipe } from '../common/uuid.pipe';
import { FaceAnalysisProxyService } from '../services/face-analysis-proxy.service';

/**
 * Thin controller: parses the incoming multipart request and delegates to
 * `FaceAnalysisProxyService` — no forwarding/HTTP logic here.
 */
@Controller('api/face-analysis')
export class FaceAnalysisController {
  constructor(private readonly faceAnalysisProxyService: FaceAnalysisProxyService) {}

  @Post('analyze')
  @RateLimitTier('faceAnalyze')
  @UseGuards(JwtGuard)
  @SingleFileUpload(10)
  analyze(
    @UploadedFile(RequiredFilePipe) file: Express.Multer.File,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.faceAnalysisProxyService.analyzeFace(file, request.user.userId);
  }

  @Get('history')
  @UseGuards(JwtGuard)
  history(
    @Query() query: Record<string, unknown>,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.faceAnalysisProxyService.getHistory(request.user.userId, query);
  }

  @Delete('history/:id')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHistoryItem(
    @Param('id', UuidPipe) id: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<unknown> {
    return this.faceAnalysisProxyService.deleteHistoryItem(id, request.user.userId);
  }
}
