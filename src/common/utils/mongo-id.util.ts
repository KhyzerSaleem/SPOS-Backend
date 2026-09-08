import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

export function assertValidObjectId(id: string, label = 'ID'): Types.ObjectId {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
}

export function assertValidObjectIds(ids: string[], label = 'IDs'): Types.ObjectId[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new BadRequestException(`${label} must be a non-empty array`);
  }
  if (ids.length > 100) {
    throw new BadRequestException(`${label} cannot exceed 100 items per request`);
  }
  return ids.map((id, index) => assertValidObjectId(id, `${label}[${index}]`));
}
