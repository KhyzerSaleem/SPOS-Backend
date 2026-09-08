import { Types } from 'mongoose';
import { SettingsService } from './settings.service';

function stubModel() {
  return {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };
}

describe('SettingsService.updateRole — mass assignment protection', () => {
  const tenantId = new Types.ObjectId().toString();
  const otherTenantId = new Types.ObjectId().toString();
  const roleId = new Types.ObjectId().toString();

  function makeService() {
    const roleModel = stubModel();
    roleModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ name: 'Cashier', permissions: ['pos.view'] }),
    });
    roleModel.findOneAndUpdate.mockImplementation((filter: any, update: any) => ({
      // Capture what was actually sent to Mongo so the test can assert on it.
      __filter: filter,
      __update: update,
    }));

    const models = {
      settingModel: stubModel(),
      taxModel: stubModel(),
      discountModel: stubModel(),
      pricingModel: stubModel(),
      payMethodModel: stubModel(),
      apiKeyModel: stubModel(),
      roleModel,
      invoiceCounterModel: stubModel(),
      exchangeRateModel: stubModel(),
      webhookModel: stubModel(),
    };
    const auditService = { log: jest.fn() };
    const currencyBackfill = { backfillTenant: jest.fn() };

    const service = new SettingsService(
      models.settingModel as any,
      models.taxModel as any,
      models.discountModel as any,
      models.pricingModel as any,
      models.payMethodModel as any,
      models.apiKeyModel as any,
      models.roleModel as any,
      models.invoiceCounterModel as any,
      models.exchangeRateModel as any,
      models.webhookModel as any,
      auditService as any,
      currencyBackfill as any,
    );
    return { service, roleModel };
  }

  it('only sends name/permissions to $set, dropping an injected tenantId', async () => {
    const { service, roleModel } = makeService();

    // Simulates a forged request body — the controller's @Body() is untyped,
    // so nothing upstream strips this before it reaches the service.
    const maliciousDto: any = {
      name: 'Cashier',
      permissions: ['pos.view'],
      tenantId: otherTenantId,
      isSystemRole: true,
    };

    await service.updateRole(tenantId, roleId, maliciousDto);

    expect(roleModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = roleModel.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toEqual({ name: 'Cashier', permissions: ['pos.view'] });
    expect(update.$set.tenantId).toBeUndefined();
    expect(update.$set.isSystemRole).toBeUndefined();
  });

  it('still scopes the update by the caller tenantId in the filter', async () => {
    const { service, roleModel } = makeService();

    await service.updateRole(tenantId, roleId, { name: 'Renamed' });

    const [filter] = roleModel.findOneAndUpdate.mock.calls[0];
    expect(filter.tenantId.toString()).toBe(tenantId);
    expect(filter._id).toBe(roleId);
  });
});
