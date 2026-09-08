import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../../database/schemas/category.schema';
import { Product, ProductDocument } from '../../database/schemas/product.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  notDeletedFilter,
  softDeleteUpdate,
  restoreUpdate,
} from '../../common/utils/soft-delete.util';
import { escapeRegex } from '../../common/utils/regex.util';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
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
    if (query.search) {
      filter.name = new RegExp(escapeRegex(String(query.search)), 'i');
    }
    const categories = await this.categoryModel.find(filter).sort({ name: 1 }).lean();

    const withCounts = await Promise.all(
      categories.map(async (c) => {
        const productCount = await this.productModel.countDocuments({
          categoryId: c._id,
          ...notDeletedFilter(),
        });
        return { ...c, _id: c._id.toString(), productCount };
      }),
    );
    return { data: withCounts };
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const slug = dto.slug || this.slugify(dto.name);
    const exists = await this.categoryModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      slug,
      ...notDeletedFilter(),
    });
    if (exists) throw new ConflictException('Category slug already exists');

    return this.categoryModel.create({
      name: dto.name,
      slug,
      tenantId: new Types.ObjectId(tenantId),
    });
  }

  async update(tenantId: string, id: string, dto: CreateCategoryDto) {
    const cat = await this.categoryModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
      ...notDeletedFilter(),
    });
    if (!cat) throw new NotFoundException('Category not found');

    if (dto.name) cat.name = dto.name;
    if (dto.slug) cat.slug = dto.slug;
    else if (dto.name) cat.slug = this.slugify(dto.name);
    await cat.save();
    return cat;
  }

  async delete(tenantId: string, id: string, deletedBy?: string) {
    const result = await this.categoryModel.updateOne(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        ...notDeletedFilter(),
      },
      softDeleteUpdate(deletedBy),
    );
    if (result.modifiedCount === 0) throw new NotFoundException('Category not found');
    return { deleted: true };
  }

  async restore(tenantId: string, id: string) {
    const cat = await this.categoryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
        deletedAt: { $ne: null },
      },
      restoreUpdate(),
      { new: true },
    );
    if (!cat) throw new NotFoundException('Deleted category not found');
    return cat;
  }
}
