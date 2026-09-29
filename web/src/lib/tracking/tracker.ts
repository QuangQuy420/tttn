// Client-side behavior tracking (VIEW / TRY_ON) — a module-level queue that batches events and
// posts them to the gateway's POST /api/events. Best-effort by design: anonymous visitors are
// never tracked, failures are dropped (one console.warn), and nothing here ever throws.

import { postEvents } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { randomUuid } from "@/lib/uuid";
import type {
  ClientBehaviorEvent,
  ClientBehaviorEventContext,
  ClientBehaviorEventType,
} from "@/types/tracking";

const FLUSH_INTERVAL_MS = 5000;
// Flush early once this many events are queued.
const FLUSH_THRESHOLD = 10;
// Gateway rejects batches above 20 (api-gateway TrackEventsDto @ArrayMaxSize(20)).
const MAX_BATCH_SIZE = 20;
const SESSION_ID_KEY = "trackingSessionId";

let queue: ClientBehaviorEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersRegistered = false;
let hasWarned = false;

function warnOnce(error: unknown): void {
  if (hasWarned) return;
  hasWarned = true;
  console.warn("Không gửi được sự kiện theo dõi hành vi.", error);
}

// One id per browser tab, kept in sessionStorage so it survives in-tab navigation/reloads.
function getSessionId(): string | undefined {
  try {
    let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = randomUuid();
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // sessionStorage can be unavailable (privacy mode, blocked storage) — send without it.
    return undefined;
  }
}

function flush(keepalive = false): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const pending = queue;
  queue = [];

  // Re-read the token: the user may have logged out since the events were queued.
  const token = getAccessToken();
  if (!token) return;

  for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
    postEvents(pending.slice(i, i + MAX_BATCH_SIZE), token, { keepalive }).catch(warnOnce);
  }
}

function handlePageHide(): void {
  flush(true);
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "hidden") flush(true);
}

function registerListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

export function track(
  eventType: ClientBehaviorEventType,
  productId: string,
  context: ClientBehaviorEventContext = {},
): void {
  if (typeof window === "undefined") return;
  // Anonymous visitors are not tracked (the gateway would ignore them anyway).
  if (!getAccessToken()) return;

  registerListeners();

  const sessionId = getSessionId();
  queue.push({
    eventId: randomUuid(),
    eventType,
    productId,
    occurredAt: new Date().toISOString(),
    context: sessionId ? { sessionId, ...context } : context,
  });

  if (queue.length >= FLUSH_THRESHOLD) {
    flush();
  } else if (flushTimer === null) {
    flushTimer = setTimeout(() => flush(), FLUSH_INTERVAL_MS);
  }
}
