import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Unit, UnitDocument } from '../../database/schemas/unit.schema';
import { CreateUnitDto } from './dto/create-unit.dto';
import {
  notDeletedFilter,
  softDeleteUpdate,
  restoreUpdate,
} from '../../common/utils/soft-delete.util';
import { escapeRegex } from '../../common/utils/regex.util';

@Injectable()
export class UnitsService {
  constructor(@InjectModel(Unit.name) private unitModel: Model<UnitDocument>) {}

  async findAll(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId: new Types.ObjectId(tenantId), ...notDeletedFilter() };
    if (query.search) filter.name = new RegExp(escapeRegex(String(query.search)), 'i');

    const units = await this.unitModel.find(filter).sort({ name: 1 }).lean();
    return { data: units.map((u) => ({ ...u, _id: u._id.toString() })) };
  }

  async create(tenantId: string, dto: CreateUnitDto) {
    const exists = await this.unitModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      ...notDeletedFilter(),
    });
    if (exists) throw new ConflictException('Unit name already exists');

    return this.unitModel.create({
      name: dto.name,
      abbreviation: dto.abbreviation,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async update(tenantId: string, id: string, dto: CreateUnitDto) {
    const unit = await this.unitModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      ...notDeletedFilter(),
    });
    if (!unit) throw new NotFoundException('Unit not found');

    if (dto.name) unit.name = dto.name;
    if (dto.abbreviation) unit.abbreviation = dto.abbreviation;
    await unit.save();
    return unit;
  }

  async delete(tenantId: string, id: string, deletedBy?: string) {
    const result = await this.unitModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        ...notDeletedFilter(),
      },
      softDeleteUpdate(deletedBy),
    );
    if (result.modifiedCount === 0) throw new NotFoundException('Unit not found');
    return { deleted: true };
  }

  async restore(tenantId: string, id: string) {
    const unit = await this.unitModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        deletedAt: { $ne: null },
      },
      restoreUpdate(),
      { new: true },
    );
    if (!unit) throw new NotFoundException('Deleted unit not found');
    return unit;
  }
}
