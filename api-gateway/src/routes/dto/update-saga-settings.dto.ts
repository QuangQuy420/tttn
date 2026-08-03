import { IsInt, Max, Min } from 'class-validator';

/**
 * Body for `PUT /api/admin/saga-settings`. Mirrors the bounds enforced by
 * order-service's `UpdateReconciliationSettingsRequest` (the source of
 * truth) — these decorators just reject obviously-bad input at the gateway
 * edge before it's forwarded downstream.
 */
export class UpdateSagaSettingsDto {
  @IsInt()
  @Min(10000)
  intervalMs: number;

  @IsInt()
  @Min(1)
  stuckThresholdMinutes: number;

  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts: number;
}
