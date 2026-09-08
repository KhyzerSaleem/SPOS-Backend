import { BadRequestException } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';

describe('StockLedgerService', () => {
  const tenantId = '111111111111111111111111';
  const storeId = '222222222222222222222222';
  const productId = '333333333333333333333333';
  const warehouseId = '444444444444444444444444';

  function chainLean(value: unknown) {
    return {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(value),
    };
  }

  it('does not write a movement when an atomic stock deduction cannot match available quantity', async () => {
    const stockModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      findOne: jest.fn().mockReturnValue(chainLean({ quantity: 1 })),
    };
    const movementModel = { create: jest.fn() };

    const service = new StockLedgerService(
      {} as any,
      stockModel as any,
      movementModel as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.applyDelta({
        tenantId,
        storeId,
        productId,
        warehouseId,
        quantity: -2,
        type: 'out',
        reason: 'sale',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stockModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: { $gte: 2 },
      }),
      { $inc: { quantity: -2 } },
      {},
    );
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  it('writes transfer-in movement and syncs aggregate product stock', async () => {
    const stockModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      find: jest.fn().mockReturnValue(chainLean([{ quantity: 4 }, { quantity: 6 }])),
    };
    const movementModel = { create: jest.fn().mockResolvedValue({}) };
    const productModel = { updateOne: jest.fn().mockResolvedValue({}) };

    const service = new StockLedgerService(
      {} as any,
      stockModel as any,
      movementModel as any,
      productModel as any,
      {} as any,
    );

    const total = await service.applyDelta({
      tenantId,
      storeId,
      productId,
      warehouseId,
      quantity: 3,
      type: 'transfer_in',
      reason: 'Transfer TRF-1',
    });

    expect(total).toBe(10);
    expect(stockModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ warehouseId: expect.anything(), productId: expect.anything() }),
      expect.objectContaining({ $inc: { quantity: 3 } }),
      expect.objectContaining({ upsert: true }),
    );
    expect(movementModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'transfer_in', quantity: 3, reason: 'Transfer TRF-1' })],
      {},
    );
    expect(productModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything() }),
      { $set: { stock: 10 } },
      {},
    );
  });

  it('rejects zero-quantity warehouse movements', async () => {
    const service = new StockLedgerService(
      {} as any,
      {} as any,
      { create: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.applyDelta({
        tenantId,
        storeId,
        productId,
        warehouseId,
        quantity: 0,
        type: 'transfer_out',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
