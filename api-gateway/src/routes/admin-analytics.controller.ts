import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AdminAnalyticsProxyService } from '../services/admin-analytics-proxy.service';
import {
  AnalyticsEventsQueryDto,
  AnalyticsRangeQueryDto,
  TopProductsQueryDto,
} from './dto/admin-analytics-query.dto';

const queryValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/** Only the query values the caller actually sent (upstream applies the defaults). */
function definedParams(query: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  );
}

/**
 * Thin controller: delegates to `AdminAnalyticsProxyService` — no
 * forwarding/HTTP logic here. Read-only info about the two AI models
 * (face shape, PreferenceScore). Reuses `order:manage` as the admin
 * permission (no dedicated permission is seeded yet).
 */
@Controller('api/admin/ai')
export class AdminAiController {
  constructor(
    private readonly adminAnalyticsProxyService: AdminAnalyticsProxyService,
  ) {}

  @Get('face-shape-model')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  getFaceShapeModel(): Promise<unknown> {
    return this.adminAnalyticsProxyService.getFaceShapeModelInfo();
  }

  @Get('preference-model')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  getPreferenceModel(): Promise<unknown> {
    return this.adminAnalyticsProxyService.getPreferenceModelInfo();
  }
}

/**
 * Thin controller: delegates to `AdminAnalyticsProxyService`. Read-only
 * behavior statistics (recommendation-service) and the face-shape
 * distribution (face-processing-service), same `order:manage` convention
 * as `AdminAiController` above. Query params are validated here; the date
 * range rules (max 90 days, `from <= to`) are enforced upstream.
 */
@Controller('api/admin/analytics')
export class AdminAnalyticsController {
  constructor(
    private readonly adminAnalyticsProxyService: AdminAnalyticsProxyService,
  ) {}

  @Get('events/daily')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  @UsePipes(queryValidationPipe)
  getDailyEvents(@Query() query: AnalyticsEventsQueryDto): Promise<unknown> {
    return this.adminAnalyticsProxyService.getDailyEvents(definedParams(query));
  }

  @Get('funnel')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  @UsePipes(queryValidationPipe)
  getFunnel(@Query() query: AnalyticsEventsQueryDto): Promise<unknown> {
    return this.adminAnalyticsProxyService.getFunnel(definedParams(query));
  }

  @Get('top-products')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  @UsePipes(queryValidationPipe)
  getTopProducts(@Query() query: TopProductsQueryDto): Promise<unknown> {
    return this.adminAnalyticsProxyService.getTopProducts(definedParams(query));
  }

  @Get('face-shapes')
  @UseGuards(JwtGuard, PermissionsGuard)
  @RequirePermission('order:manage')
  @UsePipes(queryValidationPipe)
  getFaceShapes(@Query() query: AnalyticsRangeQueryDto): Promise<unknown> {
    return this.adminAnalyticsProxyService.getFaceShapeDistribution(
      definedParams(query),
    );
  }
}
