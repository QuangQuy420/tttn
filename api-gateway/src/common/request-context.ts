import { AsyncLocalStorage } from 'node:async_hooks';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export interface RequestContext {
  requestId: string;
}

/** Per-request context, entered by `RequestIdMiddleware`. */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The current request's id, or `undefined` outside an HTTP request. */
export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
