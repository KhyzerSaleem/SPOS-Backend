import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AttributeSet, AttributeSetDocument } from '../../database/schemas/attribute-set.schema';
import { CreateAttributeSetDto } from './dto/create-attribute-set.dto';

@Injectable()
export class AttributeSetsService {
  constructor(@InjectModel(AttributeSet.name) private attrModel: Model<AttributeSetDocument>) {}

  async findAll(tenantId: string): Promise<any> {
    const attrs = await this.attrModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ name: 1 })
      .lean();
    return { data: attrs.map((a) => ({ ...a, _id: a._id.toString() })) };
  }

  async create(tenantId: string, dto: CreateAttributeSetDto) {
    const exists = await this.attrModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
    });
    if (exists) throw new ConflictException('Attribute set name already exists');

    return this.attrModel.create({
      name: dto.name,
      values: dto.values,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async update(tenantId: string, id: string, dto: CreateAttributeSetDto) {
    const attr = await this.attrModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!attr) throw new NotFoundException('Attribute set not found');

    if (dto.name) attr.name = dto.name;
    if (dto.values) attr.values = dto.values;
    await attr.save();
    return attr;
  }

  async delete(tenantId: string, id: string) {
    const result = await this.attrModel.deleteOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Attribute set not found');
    return { deleted: true };
  }
}
