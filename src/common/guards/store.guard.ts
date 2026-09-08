import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Store, StoreDocument } from '../../database/schemas/store.schema';

/** Roles that have unrestricted access to every store within their tenant. */
const STORE_UNRESTRICTED_ROLES = new Set(['super_admin', 'owner', 'admin']);

@Injectable()
export class StoreGuard implements CanActivate {
  constructor(@InjectModel(Store.name) private storeModel: Model<StoreDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Auth guard runs before StoreGuard — user must already be present
    if (!user || !user.tenantId) {
      throw new ForbiddenException('Authentication required');
    }

    // super_admin operates outside tenant scope entirely — no store scoping needed
    if (user.role === 'super_admin') {
      return true;
    }

    const storeId = request.headers['x-store-id'] as string | undefined;
    if (!storeId) {
      throw new BadRequestException('X-Store-Id header is required');
    }

    // Prevent Mongoose CastError from malformed ObjectId strings
    if (!isValidObjectId(storeId)) {
      throw new BadRequestException(`Invalid store ID: "${storeId}"`);
    }

    // Verify the store exists, is active, and belongs to the user's tenant
    const store = await this.storeModel
      .findOne({ _id: storeId, tenantId: user.tenantId, isActive: true })
      .lean();

    if (!store) {
      throw new ForbiddenException('Store not found, inactive, or does not belong to your tenant');
    }

    // Owners and admins have access to every store in their tenant
    if (!STORE_UNRESTRICTED_ROLES.has(user.role)) {
      // All other roles must have the store explicitly in their storeAccess list
      const storeAccess: string[] = user.storeAccess ?? [];
      const hasAccess = storeAccess.some((id) => id.toString() === storeId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this store');
      }
    }

    // Attach store context so services can read req.storeId and req.store
    request.storeId = storeId;
    request.store = {
      id: store._id.toString(),
      name: store.name,
      code: store.code,
    };

    return true;
  }
}
