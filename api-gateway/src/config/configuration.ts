/**
 * Typed shape of the environment configuration this gateway needs.
 * Keep in sync with `.env.example`.
 */
export interface AppConfig {
  port: number;
  corsOrigin: string;
  downstreamTimeoutMs: number;
  jwtSecret: string;
  userServiceUrl: string;
  productServiceUrl: string;
  orderServiceUrl: string;
  faceProcessingServiceUrl: string;
  recommendationServiceUrl: string;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '8080', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    downstreamTimeoutMs: parseInt(process.env.DOWNSTREAM_TIMEOUT_MS ?? '5000', 10),
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-.env',
    userServiceUrl:
        process.env.USER_SERVICE_URL ?? 'http://localhost:8081',
    productServiceUrl: process.env.PRODUCT_SERVICE_URL ?? 'http://product-service:3002',
    orderServiceUrl: process.env.ORDER_SERVICE_URL ?? 'http://order-service:3003',
    faceProcessingServiceUrl:
      process.env.FACE_PROCESSING_SERVICE_URL ?? 'http://face-processing-service:8000',
    recommendationServiceUrl:
      process.env.RECOMMENDATION_SERVICE_URL ?? 'http://recommendation-service:8000',
  },
});
