import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Brand, BrandDocument } from '../../database/schemas/brand.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { CreateBrandDto } from './dto/create-brand.dto';
import {
  notDeletedFilter,
  softDeleteUpdate,
  restoreUpdate,
} from '../../common/utils/soft-delete.util';
import { escapeRegex } from '../../common/utils/regex.util';

@Injectable()
export class BrandsService {
  constructor(
    @InjectModel(Brand.name) private brandModel: Model<BrandDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async findAll(tenantId: string, query: any): Promise<any> {
    const filter: any = { tenantId: new Types.ObjectId(tenantId), ...notDeletedFilter() };
    if (query.search) filter.name = new RegExp(escapeRegex(String(query.search)), 'i');

    const brands = await this.brandModel.find(filter).sort({ name: 1 }).lean();
    const withCounts = await Promise.all(
      brands.map(async (b) => {
        const productCount = await this.productModel.countDocuments({
          brandId: b._id,
          ...notDeletedFilter(),
        });
        return { ...b, _id: b._id.toString(), productCount };
      }),
    );
    return { data: withCounts };
  }

  async create(tenantId: string, dto: CreateBrandDto) {
    const slug = dto.slug || this.slugify(dto.name);
    const exists = await this.brandModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      slug,
      ...notDeletedFilter(),
    });
    if (exists) throw new ConflictException('Brand slug already exists');

    return this.brandModel.create({ name: dto.name, slug, tenantId: new Types.ObjectId(tenantId) });
  }

  async update(tenantId: string, id: string, dto: CreateBrandDto) {
    const brand = await this.brandModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      ...notDeletedFilter(),
    });
    if (!brand) throw new NotFoundException('Brand not found');

    if (dto.name) brand.name = dto.name;
    if (dto.slug) brand.slug = dto.slug;
    else if (dto.name) brand.slug = this.slugify(dto.name);
    await brand.save();
    return brand;
  }

  async delete(tenantId: string, id: string, deletedBy?: string) {
    const result = await this.brandModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        ...notDeletedFilter(),
      },
      softDeleteUpdate(deletedBy),
    );
    if (result.modifiedCount === 0) throw new NotFoundException('Brand not found');
    return { deleted: true };
  }

  async restore(tenantId: string, id: string) {
    const brand = await this.brandModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        deletedAt: { $ne: null },
      },
      restoreUpdate(),
      { new: true },
    );
    if (!brand) throw new NotFoundException('Deleted brand not found');
    return brand;
  }
}
