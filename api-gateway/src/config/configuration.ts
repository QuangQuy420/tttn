/**
 * Typed shape of the environment configuration this gateway needs.
 * Keep in sync with `.env.example`.
 */
export interface AppConfig {
  port: number;
  corsOrigin: string;
  downstreamTimeoutMs: number;
  productServiceUrl: string;
  faceProcessingServiceUrl: string;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '8080', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    downstreamTimeoutMs: parseInt(process.env.DOWNSTREAM_TIMEOUT_MS ?? '5000', 10),
    productServiceUrl: process.env.PRODUCT_SERVICE_URL ?? 'http://product-service:3002',
    faceProcessingServiceUrl:
      process.env.FACE_PROCESSING_SERVICE_URL ?? 'http://face-processing-service:8000',
  },
});
