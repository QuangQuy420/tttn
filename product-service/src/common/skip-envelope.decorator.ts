import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** Opts a controller/handler out of `ResponseEnvelopeInterceptor` (e.g. `/health`). */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
