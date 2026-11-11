import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtGuard } from '../auth/jwt.guard';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AdminAnalyticsProxyService } from '../services/admin-analytics-proxy.service';
import {
  AdminAiController,
  AdminAnalyticsController,
} from './admin-analytics.controller';

describe('Admin analytics controllers', () => {
  const handlers: Array<[string, (...args: never[]) => unknown]> = [
    ['AdminAiController.getFaceShapeModel', AdminAiController.prototype.getFaceShapeModel],
    ['AdminAiController.getPreferenceModel', AdminAiController.prototype.getPreferenceModel],
    ['AdminAnalyticsController.getDailyEvents', AdminAnalyticsController.prototype.getDailyEvents],
    ['AdminAnalyticsController.getFunnel', AdminAnalyticsController.prototype.getFunnel],
    ['AdminAnalyticsController.getTopProducts', AdminAnalyticsController.prototype.getTopProducts],
    ['AdminAnalyticsController.getFaceShapes', AdminAnalyticsController.prototype.getFaceShapes],
  ];

  it.each(handlers)(
    '%s is protected by JwtGuard + PermissionsGuard with order:manage (AC8)',
    (_name, handler) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        JwtGuard,
        PermissionsGuard,
      ]);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['order:manage']);
    },
  );

  describe('AdminAnalyticsController', () => {
    let controller: AdminAnalyticsController;
    let proxy: { getTopProducts: jest.Mock };

    const data = { success: true, data: { items: [] } };

    beforeEach(() => {
      proxy = { getTopProducts: jest.fn().mockResolvedValue(data) };
      controller = new AdminAnalyticsController(
        proxy as unknown as AdminAnalyticsProxyService,
      );
    });

    it('forwards only the query values the caller sent, so upstream applies defaults', async () => {
      const result = await controller.getTopProducts({
        source: 'all',
        eventType: 'VIEW',
        limit: 10,
        from: undefined,
        to: undefined,
      });

      expect(proxy.getTopProducts).toHaveBeenCalledWith({
        source: 'all',
        eventType: 'VIEW',
        limit: 10,
      });
      expect(result).toEqual(data);
    });
  });
});
