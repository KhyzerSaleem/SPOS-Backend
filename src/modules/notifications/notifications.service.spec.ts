import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

function chain(result: any) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('NotificationsService', () => {
  function makeService({ notifications = [], total = 0, user = null }: any = {}) {
    const notificationModel = {
      find: jest.fn().mockReturnValue(chain(notifications)),
      countDocuments: jest.fn().mockResolvedValue(total),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue(chain(user)),
      findByIdAndUpdate: jest.fn().mockReturnValue(chain(user)),
    };
    const service = new NotificationsService(notificationModel as any, userModel as any);
    return { service, notificationModel, userModel };
  }

  describe('getNotifications (pagination)', () => {
    it('caps the requested limit at 50 regardless of what the client asks for', async () => {
      const { service, notificationModel } = makeService({ total: 500 });

      await service.getNotifications('user-1', { limit: 10000 });

      const findChain = notificationModel.find.mock.results[0].value;
      expect(findChain.limit).toHaveBeenCalledWith(50);
    });

    it('defaults to page 1, limit 20 when nothing is specified', async () => {
      const { service, notificationModel } = makeService({ total: 5 });

      const result = await service.getNotifications('user-1', {});

      const findChain = notificationModel.find.mock.results[0].value;
      expect(findChain.limit).toHaveBeenCalledWith(20);
      expect(findChain.skip).toHaveBeenCalledWith(0);
      expect(result.page).toBe(1);
    });

    it('computes the correct skip for page > 1', async () => {
      const { service, notificationModel } = makeService({ total: 100 });

      await service.getNotifications('user-1', { page: 3, limit: 20 });

      const findChain = notificationModel.find.mock.results[0].value;
      expect(findChain.skip).toHaveBeenCalledWith(40);
    });

    it('filters by category when provided', async () => {
      const { service, notificationModel } = makeService({ total: 1 });

      await service.getNotifications('user-1', { category: 'inventory' });

      expect(notificationModel.find).toHaveBeenCalledWith({ userId: 'user-1', type: 'inventory' });
    });

    it('reports hasMore correctly', async () => {
      const { service } = makeService({ total: 45 });
      const page2 = await service.getNotifications('user-1', { page: 2, limit: 20 });
      expect(page2.hasMore).toBe(true); // 40 < 45

      const { service: service2 } = makeService({ total: 40 });
      const page2Exact = await service2.getNotifications('user-1', { page: 2, limit: 20 });
      expect(page2Exact.hasMore).toBe(false); // 40 < 40 is false
    });

    it('never lets page or limit go below 1', async () => {
      const { service, notificationModel } = makeService({ total: 0 });

      await service.getNotifications('user-1', { page: -5, limit: -10 });

      const findChain = notificationModel.find.mock.results[0].value;
      expect(findChain.limit).toHaveBeenCalledWith(1);
      expect(findChain.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('preferences', () => {
    it('returns the stored preferences', async () => {
      const prefs = {
        loginAlerts: true,
        inventoryAlerts: false,
        salesAlerts: false,
        systemUpdates: true,
      };
      const { service } = makeService({ user: { notificationPreferences: prefs } });

      const result = await service.getPreferences('user-1');
      expect(result).toEqual(prefs);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      const { service } = makeService({ user: null });
      await expect(service.getPreferences('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('only writes the four known preference keys, dropping anything else in the request body', async () => {
      const { service, userModel } = makeService({
        user: {
          notificationPreferences: {
            loginAlerts: false,
            inventoryAlerts: true,
            salesAlerts: true,
            systemUpdates: true,
          },
        },
      });

      // Simulates a forged body — the controller's @Body() is untyped.
      const maliciousPatch: any = {
        loginAlerts: false,
        role: 'super_admin',
        tenantId: 'someone-elses-tenant',
        isActive: false,
      };

      await service.updatePreferences('user-1', maliciousPatch);

      const [, update] = userModel.findByIdAndUpdate.mock.calls[0];
      expect(update.$set).toEqual({ 'notificationPreferences.loginAlerts': false });
      expect(update.$set.role).toBeUndefined();
      expect(update.$set.tenantId).toBeUndefined();
      expect(update.$set.isActive).toBeUndefined();
    });

    it('coerces truthy/falsy values to real booleans', async () => {
      const { service, userModel } = makeService({
        user: { notificationPreferences: {} },
      });

      await service.updatePreferences('user-1', { salesAlerts: 'yes', systemUpdates: 0 });

      const [, update] = userModel.findByIdAndUpdate.mock.calls[0];
      expect(update.$set).toEqual({
        'notificationPreferences.salesAlerts': true,
        'notificationPreferences.systemUpdates': false,
      });
    });
  });
});
