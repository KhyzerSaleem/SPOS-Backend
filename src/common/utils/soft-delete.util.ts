import { FilterQuery, Types, UpdateQuery } from 'mongoose';

/** Default filter fragment — exclude soft-deleted documents. */
export function notDeletedFilter<T = Record<string, unknown>>(): FilterQuery<T> {
  return { deletedAt: null } as FilterQuery<T>;
}

/** Merge soft-delete exclusion into an existing filter. */
export function withNotDeleted<T>(filter: FilterQuery<T>): FilterQuery<T> {
  return { ...filter, deletedAt: null };
}

/** Update payload for soft delete. */
export function softDeleteUpdate(deletedBy?: string | Types.ObjectId): UpdateQuery<unknown> {
  const update: UpdateQuery<unknown> = { $set: { deletedAt: new Date() } };
  if (deletedBy) {
    (update.$set as Record<string, unknown>).deletedBy = new Types.ObjectId(String(deletedBy));
  }
  return update;
}

/** Update payload to restore a soft-deleted document. */
export function restoreUpdate(): UpdateQuery<unknown> {
  return { $unset: { deletedAt: 1, deletedBy: 1 } };
}
