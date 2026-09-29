import type { FaceShapeTag } from "./product";

// Behavior events the browser may send — mirrors api-gateway's TrackEventsDto
// (api-gateway/src/routes/dto/track-events.dto.ts). LIKE / ADD_TO_CART / PURCHASE are emitted
// server-side only, so they are deliberately not part of this union.
export type ClientBehaviorEventType = "VIEW" | "TRY_ON";

export interface ClientBehaviorEventContext {
  sessionId?: string;
  durationMs?: number;
  faceShape?: FaceShapeTag;
  variantId?: string;
}

export interface ClientBehaviorEvent {
  eventId: string;
  eventType: ClientBehaviorEventType;
  productId: string;
  // ISO-8601 UTC, e.g. "2026-09-29T10:00:00.000Z".
  occurredAt: string;
  context?: ClientBehaviorEventContext;
}

// POST /api/events → 202. `accepted` is 0 when the gateway saw no valid token.
export interface TrackEventsResult {
  accepted: number;
}
