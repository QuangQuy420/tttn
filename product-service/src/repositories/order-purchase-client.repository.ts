import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PURCHASE_CHECK_TIMEOUT_MS = 3000;
const PURCHASE_CHECK_UNAVAILABLE_MESSAGE =
  'Không thể xác minh lịch sử mua hàng, vui lòng thử lại sau';

export interface IOrderPurchaseClient {
  /**
   * Asks order-service whether `userId` has an order in CONFIRMED or a later status that
   * contains `productId` (AC5). Throws `ServiceUnavailableException` (503) when order-service
   * is unreachable, times out (3 s), or answers non-2xx (AC12).
   */
  hasPurchased(userId: string, productId: string): Promise<boolean>;
}

interface PurchasedProductEnvelope {
  data?: { purchased?: boolean };
}

/**
 * Internal REST call to order-service's `/internal/v1/...` endpoint, authenticated with the
 * shared `X-Internal-Key`. Uses Node's global `fetch` (no HTTP client dependency here).
 */
@Injectable()
export class HttpOrderPurchaseClient implements IOrderPurchaseClient {
  private readonly logger = new Logger(HttpOrderPurchaseClient.name);
  private readonly baseUrl?: string;
  private readonly internalApiKey?: string;

  // Config is checked per call, not here: the service (and CI's e2e boot) must start even
  // when ORDER_SERVICE_URL/INTERNAL_API_KEY are not set — only review creation needs them.
  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService
      .get<string>('ORDER_SERVICE_URL')
      ?.replace(/\/$/, '');
    this.internalApiKey = this.configService.get<string>('INTERNAL_API_KEY');
  }

  async hasPurchased(userId: string, productId: string): Promise<boolean> {
    if (!this.baseUrl || !this.internalApiKey) {
      this.logger.error(
        'ORDER_SERVICE_URL/INTERNAL_API_KEY are not set — check your .env file.',
      );
      throw new ServiceUnavailableException(PURCHASE_CHECK_UNAVAILABLE_MESSAGE);
    }

    let body: PurchasedProductEnvelope;
    try {
      const response = await fetch(
        `${this.baseUrl}/internal/v1/users/${userId}/purchased-products/${productId}`,
        {
          headers: { 'X-Internal-Key': this.internalApiKey },
          signal: AbortSignal.timeout(PURCHASE_CHECK_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`order-service responded ${response.status}`);
      }
      body = (await response.json()) as PurchasedProductEnvelope;
    } catch (error) {
      this.logger.warn(
        `Purchase check failed for user ${userId}, product ${productId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException(PURCHASE_CHECK_UNAVAILABLE_MESSAGE);
    }
    return body.data?.purchased === true;
  }
}
