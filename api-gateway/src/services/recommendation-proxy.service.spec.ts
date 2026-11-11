import { HttpService } from '@nestjs/axios';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { RecommendationProxyService } from './recommendation-proxy.service';

describe('RecommendationProxyService', () => {
  let service: RecommendationProxyService;
  let httpService: { post: jest.Mock; get: jest.Mock };
  let configService: { get: jest.Mock };

  const RECOMMENDATION_SERVICE_URL = 'http://recommendation-service:8001';

  beforeEach(() => {
    httpService = { post: jest.fn(), get: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue({
        recommendationServiceUrl: RECOMMENDATION_SERVICE_URL,
        downstreamTimeoutMs: 5000,
      }),
    };

    service = new RecommendationProxyService(
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

  describe('recommend', () => {
    const body = { faceShape: 'OVAL', limit: 8 };
    const envelope = {
      success: true,
      message: 'Thành công',
      data: { items: [{ productId: 'p1' }] },
    };

    it('forwards X-User-Id to POST /recommend when a user is present (AC1)', async () => {
      httpService.post.mockReturnValue(of(axiosResponse(envelope)));

      const result = await service.recommend(body, 'user-1');

      expect(httpService.post).toHaveBeenCalledWith(
        `${RECOMMENDATION_SERVICE_URL}/recommend`,
        body,
        { headers: { 'X-User-Id': 'user-1' } },
      );
      expect(result).toEqual(envelope);
    });

    it('sends no X-User-Id header for a guest (AC1)', async () => {
      httpService.post.mockReturnValue(of(axiosResponse(envelope)));

      await service.recommend(body);

      expect(httpService.post).toHaveBeenCalledWith(
        `${RECOMMENDATION_SERVICE_URL}/recommend`,
        body,
        undefined,
      );
    });
  });

  describe('forYou', () => {
    it('forwards X-User-Id + query to GET /recommendations/for-you and returns the body unchanged (AC10)', async () => {
      const envelope = {
        success: true,
        message: 'Thành công',
        data: { items: [{ productId: 'p2' }] },
      };
      httpService.get.mockReturnValue(of(axiosResponse(envelope)));
      const query = { limit: '12' };

      const result = await service.forYou('user-1', query);

      expect(httpService.get).toHaveBeenCalledWith(
        `${RECOMMENDATION_SERVICE_URL}/recommendations/for-you`,
        { headers: { 'X-User-Id': 'user-1' }, params: query },
      );
      expect(result).toEqual(envelope);
    });

    it('passes through a downstream error envelope as an HttpException with the same status', async () => {
      const envelope = {
        success: false,
        message: 'Thiếu thông tin người dùng',
        error: { code: 'BAD_REQUEST', details: null },
      };
      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: { status: 400, data: envelope },
      } as AxiosError;
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.forYou('user-1', {})).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: envelope,
      });
    });
  });
});
