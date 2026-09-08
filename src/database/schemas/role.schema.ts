import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type RoleDocument = Role & Document;

// Predefined system roles (cannot be deleted, only modified)
export const SYSTEM_ROLES = [
  'owner',
  'admin',
  'manager',
  'cashier',
  'accountant',
  'hr',
  'inventory_manager',
  'auditor',
  'employee',
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

// All permission strings grouped by module
export const PERMISSION_CATEGORIES = {
  DASHBOARD: ['dashboard.view'],
  POS: [
    'pos.create',
    'pos.view',
    'pos.edit',
    'pos.delete',
    'pos.hold',
    'pos.returns',
    'pos.settings',
  ],
  PRODUCTS: [
    'products.create',
    'products.view',
    'products.edit',
    'products.delete',
    'products.manage',
  ],
  INVENTORY: [
    'inventory.create',
    'inventory.view',
    'inventory.edit',
    'inventory.delete',
    'inventory.manage',
    'inventory.adjust',
    'inventory.transfer',
  ],
  SALES: [
    'sales.create',
    'sales.view',
    'sales.edit',
    'sales.delete',
    'sales.manage',
    'sales.returns',
    'returns.process',
  ],
  PURCHASES: [
    'purchases.create',
    'purchases.view',
    'purchases.edit',
    'purchases.delete',
    'purchases.approve',
    'purchases.manage',
    'purchases.receive',
    'purchases.invoice',
    'purchases.return',
  ],
  CUSTOMERS: [
    'customers.create',
    'customers.view',
    'customers.edit',
    'customers.delete',
    'customers.manage',
  ],
  SUPPLIERS: [
    'suppliers.create',
    'suppliers.view',
    'suppliers.edit',
    'suppliers.delete',
    'suppliers.manage',
  ],
  HRM: ['hrm.create', 'hrm.view', 'hrm.edit', 'hrm.delete', 'hrm.manage', 'hrm.payroll'],
  STAFF: ['staff.view', 'staff.manage'],
  FINANCE: ['finance.create', 'finance.view', 'finance.edit', 'finance.delete', 'finance.manage'],
  REPORTS: ['reports.view', 'reports.export', 'reports.manage'],
  SETTINGS: ['settings.view', 'settings.manage'],
  USERS: ['users.create', 'users.view', 'users.edit', 'users.delete', 'users.manage'],
  NOTIFICATIONS: ['notifications.view', 'notifications.manage'],
  BILLING: ['billing.view', 'billing.manage'],
} as const;

// Flat list of every valid permission string — used for validation
export const ALL_PERMISSIONS = Object.values(PERMISSION_CATEGORIES).flat();

@Schema({ timestamps: true })
export class Role {
  @ApiProperty({ description: 'Role name (e.g., admin, cashier, manager)' })
  @Prop({ required: true, trim: true })
  name: string;

  @ApiProperty({ description: 'Description of the role' })
  @Prop({ default: '' })
  description: string;

  @ApiProperty({ description: 'Array of permission strings. Use ["*"] for full access.' })
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @ApiProperty({ description: 'Whether this is a system role (cannot be deleted)' })
  @Prop({ type: Boolean, default: false })
  isSystem: boolean;

  @ApiProperty({ description: 'Tenant ID this role belongs to' })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @ApiProperty({ description: 'Whether this role can be assigned to users' })
  @Prop({ type: Boolean, default: true })
  isAssignable: boolean;

  @ApiProperty({ description: 'Hierarchy level — higher number means more authority' })
  @Prop({ type: Number, default: 0 })
  level: number;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ name: 1, tenantId: 1 }, { unique: true });
RoleSchema.index({ tenantId: 1, isSystem: 1 });
RoleSchema.index({ tenantId: 1, isAssignable: 1 });

// ---------------------------------------------------------------------------
// Default roles seeded for every new tenant
// ---------------------------------------------------------------------------
export const DEFAULT_ROLES_DATA: Array<{
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isAssignable: boolean;
  level: number;
}> = [
  {
    name: 'owner',
    description: 'Unrestricted access to every feature',
    permissions: ['*'],
    isSystem: true,
    isAssignable: false, // only assigned programmatically at tenant creation
    level: 100,
  },
  {
    name: 'admin',
    description: 'Full operational access including settings and user management',
    permissions: [
      ...PERMISSION_CATEGORIES.DASHBOARD,
      ...PERMISSION_CATEGORIES.POS,
      ...PERMISSION_CATEGORIES.PRODUCTS,
      ...PERMISSION_CATEGORIES.INVENTORY,
      ...PERMISSION_CATEGORIES.SALES,
      ...PERMISSION_CATEGORIES.PURCHASES,
      ...PERMISSION_CATEGORIES.CUSTOMERS,
      ...PERMISSION_CATEGORIES.SUPPLIERS,
      ...PERMISSION_CATEGORIES.HRM,
      ...PERMISSION_CATEGORIES.FINANCE,
      ...PERMISSION_CATEGORIES.REPORTS,
      ...PERMISSION_CATEGORIES.SETTINGS,
      ...PERMISSION_CATEGORIES.USERS,
      ...PERMISSION_CATEGORIES.STAFF,
      ...PERMISSION_CATEGORIES.NOTIFICATIONS,
      ...PERMISSION_CATEGORIES.BILLING,
    ],
    isSystem: true,
    isAssignable: true,
    level: 90,
  },
  {
    name: 'manager',
    description:
      'Manages day-to-day operations; no access to settings, billing, or user management',
    permissions: [
      ...PERMISSION_CATEGORIES.DASHBOARD,
      ...PERMISSION_CATEGORIES.POS,
      ...PERMISSION_CATEGORIES.PRODUCTS,
      ...PERMISSION_CATEGORIES.INVENTORY,
      ...PERMISSION_CATEGORIES.SALES,
      ...PERMISSION_CATEGORIES.PURCHASES,
      ...PERMISSION_CATEGORIES.CUSTOMERS,
      ...PERMISSION_CATEGORIES.SUPPLIERS,
      ...PERMISSION_CATEGORIES.REPORTS,
      'returns.process',
      'hrm.view',
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 80,
  },
  {
    name: 'accountant',
    description: 'Finance and reporting access; read-only on sales and purchases',
    permissions: [
      'dashboard.view',
      ...PERMISSION_CATEGORIES.FINANCE,
      ...PERMISSION_CATEGORIES.REPORTS,
      'sales.view',
      'purchases.view',
      'products.view',
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 70,
  },
  {
    name: 'inventory_manager',
    description: 'Full inventory control plus purchase receiving; read-only on sales',
    permissions: [
      'dashboard.view',
      ...PERMISSION_CATEGORIES.INVENTORY,
      ...PERMISSION_CATEGORIES.PRODUCTS,
      ...PERMISSION_CATEGORIES.PURCHASES,
      'purchases.receive',
      'purchases.invoice',
      'reports.view',
      'reports.export',
      'sales.view',
      'suppliers.view',
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 70,
  },
  {
    name: 'hr',
    description: 'Employee and payroll management; read-only on users',
    permissions: [
      'dashboard.view',
      ...PERMISSION_CATEGORIES.HRM,
      ...PERMISSION_CATEGORIES.STAFF,
      'reports.view',
      'users.view',
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 70,
  },
  {
    name: 'cashier',
    description: 'POS terminal access; read-only on products and customers',
    permissions: [
      'dashboard.view',
      ...PERMISSION_CATEGORIES.POS,
      'sales.view',
      'products.view',
      'customers.view',
      'customers.create', // cashiers can register new walk-in customers
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 50,
  },
  {
    name: 'auditor',
    description: 'Read-only access across all modules for compliance auditing',
    permissions: [
      'dashboard.view',
      'sales.view',
      'purchases.view',
      'inventory.view',
      'products.view',
      'finance.view',
      'reports.view',
      'reports.export',
      'hrm.view',
      'customers.view',
      'suppliers.view',
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 60,
  },
  {
    name: 'employee',
    description: 'Basic access: view-only on most modules, no POS or financial data',
    permissions: [
      'dashboard.view',
      'pos.view',
      'products.view',
      'inventory.view',
      'sales.view',
      'notifications.view',
    ],
    isSystem: true,
    isAssignable: true,
    level: 40,
  },
];
