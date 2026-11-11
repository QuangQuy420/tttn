import { HttpService } from '@nestjs/axios';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { AdminAnalyticsProxyService } from './admin-analytics-proxy.service';

describe('AdminAnalyticsProxyService', () => {
  let service: AdminAnalyticsProxyService;
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };

  const FACE_PROCESSING_SERVICE_URL = 'http://face-processing-service:8000';
  const RECOMMENDATION_SERVICE_URL = 'http://recommendation-service:8001';
  const INTERNAL_API_KEY = 'test-internal-key';
  const HEADERS = { 'X-Internal-Key': INTERNAL_API_KEY };

  beforeEach(() => {
    httpService = { get: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue({
        faceProcessingServiceUrl: FACE_PROCESSING_SERVICE_URL,
        recommendationServiceUrl: RECOMMENDATION_SERVICE_URL,
        internalApiKey: INTERNAL_API_KEY,
      }),
    };

    service = new AdminAnalyticsProxyService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  function axiosResponse<T>(data: T): AxiosResponse<T> {
    return {
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    };
  }

  const envelope = { success: true, message: 'Thành công', data: { ok: true } };

  it('sends X-Internal-Key to face-processing GET /admin/model-info and returns the body unchanged (AC9)', async () => {
    httpService.get.mockReturnValue(of(axiosResponse(envelope)));

    const result = await service.getFaceShapeModelInfo();

    expect(httpService.get).toHaveBeenCalledWith(
      `${FACE_PROCESSING_SERVICE_URL}/admin/model-info`,
      { params: undefined, headers: HEADERS },
    );
    expect(result).toEqual(envelope);
  });

  it('sends X-Internal-Key to recommendation GET /admin/model-info (AC9)', async () => {
    httpService.get.mockReturnValue(of(axiosResponse(envelope)));

    await service.getPreferenceModelInfo();

    expect(httpService.get).toHaveBeenCalledWith(
      `${RECOMMENDATION_SERVICE_URL}/admin/model-info`,
      { params: undefined, headers: HEADERS },
    );
  });

  it.each([
    ['getDailyEvents', RECOMMENDATION_SERVICE_URL, '/admin/analytics/events/daily'],
    ['getFunnel', RECOMMENDATION_SERVICE_URL, '/admin/analytics/funnel'],
    ['getTopProducts', RECOMMENDATION_SERVICE_URL, '/admin/analytics/top-products'],
    ['getFaceShapeDistribution', FACE_PROCESSING_SERVICE_URL, '/admin/analytics/face-shapes'],
  ] as const)(
    '%s forwards the query params + X-Internal-Key to %s%s (AC9)',
    async (method, baseUrl, path) => {
      httpService.get.mockReturnValue(of(axiosResponse(envelope)));
      const params = { from: '2026-09-01', to: '2026-09-30', source: 'all' };

      const result = await service[method](params);

      expect(httpService.get).toHaveBeenCalledWith(`${baseUrl}${path}`, {
        params,
        headers: HEADERS,
      });
      expect(result).toEqual(envelope);
    },
  );

  it('passes through an upstream 400 (bad date range) with the same status and body (AC11)', async () => {
    const errorEnvelope = {
      success: false,
      message: 'Khoảng thời gian tối đa là 90 ngày',
      error: { code: 'BAD_REQUEST', details: null },
    };
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: { status: 400, data: errorEnvelope },
    } as AxiosError;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.getDailyEvents({ from: '2026-01-01', to: '2026-09-30' }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: errorEnvelope,
    });
  });

  it('maps an upstream timeout to 504 with a Vietnamese message', async () => {
    const axiosError = {
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 5000ms exceeded',
    } as AxiosError;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(service.getFaceShapeModelInfo()).rejects.toMatchObject({
      status: HttpStatus.GATEWAY_TIMEOUT,
      response: 'face-processing-service không phản hồi kịp thời',
    });
  });
});
