/** Serializable plan row for admin API (avoids heavy Mongoose lean inference). */
export interface AdminPlanListItem {
  _id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  userLimit: number;
  storeLimit: number;
  storageLimitMB: number;
  isActive: boolean;
  sortOrder: number;
  maxUsers: number;
  maxStores: number;
  createdAt?: string;
  updatedAt?: string;
}
