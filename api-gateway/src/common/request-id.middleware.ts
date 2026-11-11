import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestContext } from './request-context';

const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request an id: the client's `X-Request-Id` when it is valid,
 * otherwise a new UUID. The id is set on the response before anything else
 * runs (so 429s and errors carry it too), kept in `requestContext` for the
 * outgoing-call interceptor (`SharedHttpModule`), and printed in one access
 * log line per request: `METHOD /path STATUS 12ms <requestId>`.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const startedAt = Date.now();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.on('finish', () => {
      // Query string left out on purpose: it may hold tokens (reset-password).
      const path = req.originalUrl.split('?')[0];
      this.logger.log(
        `${req.method} ${path} ${res.statusCode} ${Date.now() - startedAt}ms ${requestId}`,
      );
    });

    requestContext.run({ requestId }, next);
  }
}
