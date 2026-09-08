import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'User email address' })
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @ApiProperty({ description: 'bcrypt-hashed password. Empty for OAuth-only accounts.' })
  @Prop({ default: '', select: false })
  passwordHash: string;

  @ApiProperty({ description: 'User full name' })
  @Prop({ required: true, trim: true })
  fullName: string;

  @ApiProperty({ description: 'Profile picture URL or base64' })
  @Prop({ default: '' })
  picture: string;

  @ApiProperty({ description: 'Phone number' })
  @Prop({ default: '' })
  phone: string;

  // ---------------------------------------------------------------------------
  // Tenant & role
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'Tenant this user belongs to. Null for super_admin.' })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', default: null })
  tenantId: MongooseSchema.Types.ObjectId | null;

  @ApiProperty({ description: 'Role name — must match a Role document for this tenant.' })
  @Prop({ required: true })
  role: string;

  /**
   * User-level permission overrides.
   * These are MERGED with the role's permissions in AuthService.getEffectivePermissions().
   * Validated against ALL_PERMISSIONS at the DTO/service layer before persisting.
   */
  @ApiProperty({ description: 'User-level permission overrides (merged with role permissions).' })
  @Prop({ type: [String], default: [] })
  permissions: string[];

  @ApiProperty({ description: 'Store ObjectIds this user is allowed to access.' })
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Store', default: [] })
  storeAccess: MongooseSchema.Types.ObjectId[];

  // ---------------------------------------------------------------------------
  // Account state
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'Whether the account is active.' })
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Whether the email address has been verified.' })
  @Prop({ type: Boolean, default: false })
  emailVerified: boolean;

  @ApiProperty({ description: 'Failed login attempt counter — resets on successful login.' })
  @Prop({ type: Number, default: 0 })
  failedLoginAttempts: number;

  @ApiProperty({ description: 'Account locked until this date. Null when not locked.' })
  @Prop({ type: Date, default: null })
  lockUntil: Date | null;

  // ---------------------------------------------------------------------------
  // OAuth
  // ---------------------------------------------------------------------------

  /**
   * Null for non-Google users — intentional so the sparse index works correctly.
   * An empty string '' would be indexed; null is excluded from the sparse index.
   */
  @ApiProperty({ description: 'Google OAuth ID. Null for non-Google accounts.' })
  @Prop({ type: String, default: null })
  googleId: string | null;

  // ---------------------------------------------------------------------------
  // Two-factor authentication
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'Whether TOTP two-factor authentication is enabled.' })
  @Prop({ type: Boolean, default: false })
  twoFactorEnabled: boolean;

  /**
   * TOTP secret — encrypted at rest with AES-256-CBC before storing
   * (same ENCRYPTION_KEY used for Settings sensitive fields).
   * select: false ensures it is NEVER returned in standard queries.
   */
  @Prop({ default: '', select: false })
  twoFactorSecret: string;

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  /**
   * Incremented to invalidate ALL refresh tokens for this user at once
   * (e.g. on password change or forced logout from all devices).
   * Currently the RefreshToken collection is the primary revocation mechanism;
   * tokenVersion provides a secondary "logout everywhere" signal.
   */
  @Prop({ type: Number, default: 0 })
  tokenVersion: number;

  // ---------------------------------------------------------------------------
  // Audit / session
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'Timestamp of last successful login.' })
  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  @ApiProperty({ description: 'IP address of last successful login.' })
  @Prop({ default: '' })
  lastLoginIP: string;

  @ApiProperty({
    description: 'Allowlist of IP addresses permitted to log in. Empty = unrestricted.',
  })
  @Prop({ type: [String], default: [] })
  allowedIPs: string[];

  // ---------------------------------------------------------------------------
  // HR / org chart (optional — populated when HRM module is used)
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'Job title / position.' })
  @Prop({ default: '' })
  jobTitle: string;

  @ApiProperty({ description: 'Department ObjectId.' })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department', default: null })
  departmentId: MongooseSchema.Types.ObjectId | null;

  @ApiProperty({ description: 'Employee ID string (HR reference).' })
  @Prop({ default: '' })
  employeeId: string;

  @ApiProperty({ description: 'Manager — references another User document.' })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  reportsTo: MongooseSchema.Types.ObjectId | null;

  // ---------------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'In-app and email notification preferences.' })
  @Prop({
    type: Object,
    default: {
      loginAlerts: true,
      inventoryAlerts: true,
      salesAlerts: false,
      systemUpdates: true, // was missing from original default
    },
  })
  notificationPreferences: {
    loginAlerts: boolean;
    inventoryAlerts: boolean;
    salesAlerts: boolean;
    systemUpdates: boolean;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

// ---------------------------------------------------------------------------
// Serialization safety net
// ---------------------------------------------------------------------------
// `select: false` keeps passwordHash out of query results, but a freshly
// created/updated in-memory document (e.g. the return value of create()) still
// carries it. This transform guarantees the hash is never serialized to a
// client response regardless of how the document was obtained.
function stripSensitive(_doc: unknown, ret: Record<string, any>) {
  delete ret.passwordHash;
  return ret;
}
UserSchema.set('toJSON', { transform: stripSensitive as any });
UserSchema.set('toObject', { transform: stripSensitive as any });

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/**
 * email + tenantId compound unique — allows the same email across tenants
 * (one person working at two businesses) while preventing duplicates within
 * a tenant. Replaces the field-level unique: true which was globally unique.
 */
UserSchema.index({ email: 1, tenantId: 1 }, { unique: true });

// Core RBAC + active-status lookups (most common query shape)
UserSchema.index({ tenantId: 1, role: 1 });
UserSchema.index({ tenantId: 1, isActive: 1 });

// Google OAuth lookup — sparse so null values are not indexed
UserSchema.index({ googleId: 1 }, { sparse: true });

// HR lookups — scoped to tenant for correct multi-tenant performance
UserSchema.index({ tenantId: 1, employeeId: 1 });
UserSchema.index({ tenantId: 1, departmentId: 1 });
UserSchema.index({ tenantId: 1, reportsTo: 1 });

// Audit / admin — last login scoped to tenant
UserSchema.index({ tenantId: 1, lastLoginAt: -1 });

// Platform operator lookups (tenantId is null)
UserSchema.index({ role: 1 }, { partialFilterExpression: { tenantId: null } });
