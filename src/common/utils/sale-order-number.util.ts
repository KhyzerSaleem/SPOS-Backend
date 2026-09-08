import { ConflictException } from '@nestjs/common';
import { ClientSession, Model, Types } from 'mongoose';
import { SaleOrderDocument } from '../../database/schemas/sale-order.schema';
import { InvoiceCounterDocument } from '../../database/schemas/invoice-counter.schema';

export async function getMaxOrderSequence(
  saleOrderModel: Model<SaleOrderDocument>,
  tenantObjId: Types.ObjectId,
  storeObjId: Types.ObjectId,
  session?: ClientSession | null,
): Promise<number> {
  const latest = await saleOrderModel
    .findOne({
      tenantId: tenantObjId,
      storeId: storeObjId,
      orderNumber: { $regex: /^SO-\d+$/ },
    })
    .sort({ orderNumber: -1 })
    .select('orderNumber')
    .session(session ?? null)
    .lean();

  if (!latest?.orderNumber) return 0;
  const match = String(latest.orderNumber).match(/SO-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Atomically allocate the next order number for a tenant + store. */
export async function allocateOrderNumber(
  saleOrderModel: Model<SaleOrderDocument>,
  counterModel: Model<InvoiceCounterDocument>,
  tenantObjId: Types.ObjectId,
  storeObjId: Types.ObjectId,
  session?: ClientSession | null,
): Promise<string> {
  const sessionOpts = session ? { session } : {};

  const maxExisting = await getMaxOrderSequence(saleOrderModel, tenantObjId, storeObjId, session);
  if (maxExisting > 0) {
    await counterModel.updateOne(
      { tenantId: tenantObjId, storeId: storeObjId },
      { $max: { lastOrderNumber: maxExisting } },
      { upsert: true, ...sessionOpts },
    );
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const counter = await counterModel.findOneAndUpdate(
      { tenantId: tenantObjId, storeId: storeObjId },
      { $inc: { lastOrderNumber: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOpts },
    );

    const orderNumber = `SO-${String(counter.lastOrderNumber).padStart(6, '0')}`;

    const exists = await saleOrderModel
      .exists({ tenantId: tenantObjId, storeId: storeObjId, orderNumber })
      .session(session ?? null);

    if (!exists) return orderNumber;

    const maxSeq = await getMaxOrderSequence(saleOrderModel, tenantObjId, storeObjId, session);
    await counterModel.updateOne(
      { tenantId: tenantObjId, storeId: storeObjId },
      { $set: { lastOrderNumber: maxSeq } },
      sessionOpts,
    );
  }

  throw new ConflictException(
    'Could not assign a unique order number. Please try again in a moment.',
  );
}

/** Drops obsolete global unique index on orderNumber (pre–compound-index schema). */
export async function dropLegacyOrderNumberIndex(
  saleOrderModel: Model<SaleOrderDocument>,
): Promise<void> {
  const collection = saleOrderModel.collection;
  const indexes = await collection.indexes();
  const legacy = indexes.find(
    (idx) =>
      idx.name === 'orderNumber_1' &&
      idx.key &&
      Object.keys(idx.key).length === 1 &&
      (idx.key as Record<string, number>).orderNumber === 1,
  );
  if (legacy) {
    await collection.dropIndex('orderNumber_1');
  }
}
