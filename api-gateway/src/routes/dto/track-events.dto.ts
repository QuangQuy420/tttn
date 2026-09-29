import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const CLIENT_BEHAVIOR_EVENT_TYPES = ['VIEW', 'TRY_ON'] as const;
export type ClientBehaviorEventType =
  (typeof CLIENT_BEHAVIOR_EVENT_TYPES)[number];

const FACE_SHAPES = ['ROUND', 'SQUARE', 'OVAL', 'HEART', 'DIAMOND', 'OBLONG'];

/** Optional details for one event; unknown keys are stripped by the pipe. */
export class TrackEventContextDto {
  @IsOptional()
  @IsString({ message: 'sessionId phải là chuỗi' })
  @MaxLength(64, { message: 'sessionId tối đa 64 ký tự' })
  sessionId?: string;

  @IsOptional()
  @IsInt({ message: 'durationMs phải là số nguyên' })
  @Min(0, { message: 'durationMs không được âm' })
  @Max(3_600_000, { message: 'durationMs tối đa 3.600.000 ms' })
  durationMs?: number;

  @IsOptional()
  @IsIn(FACE_SHAPES, { message: 'faceShape không hợp lệ' })
  faceShape?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'variantId phải là UUID' })
  variantId?: string;
}

/**
 * One client-side behavior event. Only VIEW / TRY_ON are accepted from the
 * browser — LIKE / ADD_TO_CART / PURCHASE are published by the services.
 * `userId` is never read from the body (it comes from the JWT).
 */
export class TrackEventDto {
  @IsUUID('4', { message: 'eventId phải là UUID v4' })
  eventId: string;

  @IsIn(CLIENT_BEHAVIOR_EVENT_TYPES, {
    message: 'eventType chỉ được là VIEW hoặc TRY_ON',
  })
  eventType: ClientBehaviorEventType;

  @IsUUID(undefined, { message: 'productId phải là UUID' })
  productId: string;

  @IsISO8601(
    { strict: true },
    { message: 'occurredAt phải là thời gian ISO-8601' },
  )
  occurredAt: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrackEventContextDto)
  context?: TrackEventContextDto;
}

/** Body for `POST /api/events` — a batch of 1–20 events. */
export class TrackEventsDto {
  @IsArray({ message: 'events phải là một mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 event' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 event mỗi lần gửi' })
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[];
}
