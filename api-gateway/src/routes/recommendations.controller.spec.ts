import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { RecommendationProxyService } from '../services/recommendation-proxy.service';
import { RecommendationsController } from './recommendations.controller';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let recommendationProxyService: { recommend: jest.Mock; forYou: jest.Mock };

  const data = { success: true, data: { items: [] } };

  beforeEach(() => {
    recommendationProxyService = {
      recommend: jest.fn().mockResolvedValue(data),
      forYou: jest.fn().mockResolvedValue(data),
    };
    controller = new RecommendationsController(
      recommendationProxyService as unknown as RecommendationProxyService,
    );
  });

  describe('forYou', () => {
    it('is protected by JwtGuard (AC10)', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, RecommendationsController.prototype.forYou),
      ).toEqual([JwtGuard]);
    });

    it('passes the authenticated userId and query to the proxy (AC10)', async () => {
      const request = { user: { userId: 'user-1' } } as unknown as Request & {
        user: AuthenticatedUser;
      };
      const query = { limit: '12' };

      const result = await controller.forYou(query, request);

      expect(recommendationProxyService.forYou).toHaveBeenCalledWith('user-1', query);
      expect(result).toEqual(data);
    });
  });

  describe('recommend', () => {
    const body = { faceShape: 'OVAL' };

    it('is guarded by OptionalJwtGuard so guests stay allowed (AC1)', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, RecommendationsController.prototype.recommend),
      ).toEqual([OptionalJwtGuard]);
    });

    it('passes the userId when a user is present (AC1)', async () => {
      const request = { user: { userId: 'user-1' } } as unknown as Request & {
        user?: AuthenticatedUser;
      };

      await controller.recommend(body, request);

      expect(recommendationProxyService.recommend).toHaveBeenCalledWith(body, 'user-1');
    });

    it('passes no userId for a guest (AC1)', async () => {
      const request = {} as unknown as Request & { user?: AuthenticatedUser };

      await controller.recommend(body, request);

      expect(recommendationProxyService.recommend).toHaveBeenCalledWith(body, undefined);
    });
  });
});
