import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type EmployeeDocument = Employee & Document;

@Schema({ _id: false })
class SalaryDetails {
  @Prop({ type: Number, default: 0, min: 0 })
  basic: number;

  @Prop({ type: Number, default: 0, min: 0 })
  allowances: number;

  @Prop({ type: Number, default: 0, min: 0 })
  deductions: number;

  @Prop({ type: Number, default: 0, min: 0 })
  net: number;
}

@Schema({ _id: false })
class BankDetails {
  @Prop({ default: '' })
  bankName: string;

  @Prop({ default: '' })
  accountNumber: string;

  @Prop({ default: '' })
  routingNumber: string;

  @Prop({ default: '' })
  ifscCode: string;
}

@Schema({ _id: false })
class EmergencyContact {
  @Prop({ default: '' })
  name: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: '' })
  relation: string;
}

@Schema({ timestamps: true })
export class Employee {
  @Prop({ required: true })
  employeeId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  // Optional: not every employee has a work email (floor staff, contractors).
  // Uniqueness is enforced by a *partial* index below so any number of
  // employees may have no email at all.
  @Prop({ default: '', trim: true, lowercase: true })
  email: string;

  @Prop({ default: '' })
  phone: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Department' })
  departmentId: MongooseSchema.Types.ObjectId;

  @Prop({ default: '' })
  designation: string;

  @Prop({ type: Date })
  dateOfJoining: Date;

  @Prop({ type: Date })
  dateOfLeaving: Date;

  @Prop({
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern'],
    default: 'full-time',
  })
  employmentType: string;

  @Prop({ type: SalaryDetails, default: () => ({}) })
  salary: SalaryDetails;

  @Prop({ type: BankDetails, default: () => ({}) })
  bankDetails: BankDetails;

  @Prop({ type: EmergencyContact, default: () => ({}) })
  emergencyContact: EmergencyContact;

  @Prop({ default: '' })
  address: string;

  @Prop({
    type: String,
    enum: ['active', 'on-leave', 'terminated', 'resigned'],
    default: 'active',
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store' })
  storeId: MongooseSchema.Types.ObjectId;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
// Partial: only enforce email uniqueness for employees that actually have one.
// The previous non-partial index meant the *second* employee saved without an
// email collided on the empty string (and, before email was normalised, on the
// literal string "undefined") — surfacing as "This record already exists".
// NOTE: this replaces an index of the same name with different options; run
//   npm run db:repair-indexes
// to drop the legacy index, otherwise MongoDB reports IndexOptionsConflict and
// silently keeps the old one.
EmployeeSchema.index(
  { tenantId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } },
  },
);
EmployeeSchema.index({ tenantId: 1, departmentId: 1 });
EmployeeSchema.index({ tenantId: 1, status: 1 });
EmployeeSchema.index({ tenantId: 1, storeId: 1 });
