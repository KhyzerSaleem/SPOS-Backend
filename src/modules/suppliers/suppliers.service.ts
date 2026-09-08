import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Supplier, SupplierDocument } from '../../database/schemas/supplier.schema';
import {
  notDeletedFilter,
  softDeleteUpdate,
  restoreUpdate,
} from '../../common/utils/soft-delete.util';

@Injectable()
export class SuppliersService {
  constructor(@InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>) {}

  async findAll(tenantId: string, storeId: string, query: any) {
    const filter: any = {
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
      ...notDeletedFilter(),
    };
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 50);

    const [data, total] = await Promise.all([
      this.supplierModel
        .find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.supplierModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(tenantId: string, storeId: string, id: string) {
    const supplier = await this.supplierModel
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      })
      .lean();
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(tenantId: string, storeId: string, dto: any) {
    // Whitelist explicitly — dto is untyped. Spreading it raw would let a caller
    // seed balance fields (creditBalance/payableBalance/outstandingBalance) or
    // other internal state at creation, which must only ever change through the
    // purchase/payment flows. Mirrors the same guard already applied in update().
    const doc: Record<string, unknown> = {
      name: String(dto.name ?? '').trim(),
      tenantId: new Types.ObjectId(tenantId),
      storeId: new Types.ObjectId(storeId),
    };
    if (dto.contact !== undefined) doc.contact = dto.contact;
    if (dto.email !== undefined)
      doc.email = String(dto.email ?? '')
        .trim()
        .toLowerCase();
    if (dto.phone !== undefined) doc.phone = String(dto.phone ?? '').trim();
    if (dto.address !== undefined) doc.address = dto.address;
    if (dto.taxNumber !== undefined) doc.taxNumber = dto.taxNumber;
    if (dto.isActive !== undefined) doc.isActive = dto.isActive;

    return this.supplierModel.create(doc);
  }

  async update(tenantId: string, storeId: string, id: string, dto: any) {
    // Whitelist explicitly — dto is untyped, so spreading it raw into $set would
    // let a caller overwrite tenantId/storeId (reassigning this supplier to a
    // different tenant/store) or directly set creditBalance/payableBalance,
    // which must only ever change through the purchase/payment flows.
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = String(dto.name ?? '').trim();
    if (dto.contact !== undefined) patch.contact = dto.contact;
    if (dto.email !== undefined)
      patch.email = String(dto.email ?? '')
        .trim()
        .toLowerCase();
    if (dto.phone !== undefined) patch.phone = String(dto.phone ?? '').trim();
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.taxNumber !== undefined) patch.taxNumber = dto.taxNumber;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    const supplier = await this.supplierModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      },
      { $set: patch },
      { new: true },
    );
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async delete(tenantId: string, storeId: string, id: string, deletedBy?: string) {
    const result = await this.supplierModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        ...notDeletedFilter(),
      },
      softDeleteUpdate(deletedBy),
    );
    if (result.modifiedCount === 0) throw new NotFoundException('Supplier not found');
    return { deleted: true };
  }

  async restore(tenantId: string, storeId: string, id: string) {
    const supplier = await this.supplierModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        storeId: new Types.ObjectId(storeId),
        deletedAt: { $ne: null },
      },
      restoreUpdate(),
      { new: true },
    );
    if (!supplier) throw new NotFoundException('Deleted supplier not found');
    return supplier;
  }
}
