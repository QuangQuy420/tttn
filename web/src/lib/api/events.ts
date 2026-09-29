import type { ClientBehaviorEvent, TrackEventsResult } from "@/types/tracking";
import { apiFetch } from "./client";

// Calls api-gateway's POST /api/events (api-gateway/src/routes/events.controller.ts), which
// attaches the userId from the caller's verified JWT and publishes to RabbitMQ.
//
// `keepalive: true` lets the request outlive the page (tab close / navigation). sendBeacon is not
// used because it cannot send the Authorization header.
export function postEvents(
  events: ClientBehaviorEvent[],
  token: string,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<TrackEventsResult> {
  return apiFetch<TrackEventsResult>("/events", {
    method: "POST",
    body: JSON.stringify({ events }),
    keepalive,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
