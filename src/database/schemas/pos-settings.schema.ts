import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PosSettingsDocument = PosSettings & Document;

@Schema({ timestamps: true })
export class PosSettings {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Store', required: true })
  storeId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 'default' })
  terminalId: string;

  @Prop({ type: [String], default: ['cash', 'card', 'mobile'] })
  paymentMethods: string[];

  @Prop({ type: Number, default: 0 })
  defaultTaxRate: number;

  @Prop({ type: Boolean, default: true })
  printReceiptOnSale: boolean;

  @Prop({ type: String, default: '' })
  receiptHeader: string;

  @Prop({ type: String, default: '' })
  receiptFooter: string;

  @Prop({ type: String, default: '80mm' })
  receiptSize: string;

  @Prop({ type: String, default: 'browser' })
  printerConnectionType: string;

  @Prop({ type: String, default: '' })
  printerName: string;

  @Prop({ type: String, default: '' })
  printerHost: string;

  @Prop({ type: Number, default: 9100 })
  printerPort: number;

  @Prop({ type: String, default: '80mm' })
  printerPaperSize: string;

  @Prop({ type: Boolean, default: false })
  cashDrawerEnabled: boolean;

  @Prop({ type: Boolean, default: false })
  autoOpenCashDrawer: boolean;

  /** When null, defaults to true for pro+ plans and false for basic/trial */
  @Prop({ type: Boolean, default: null })
  requireShift: boolean | null;

  /** Points earned per currency unit (default: 0.01 → 1 pt per 100 currency) */
  @Prop({ type: Number, default: 0.01 })
  loyaltyEarnRate: number;

  /** Points required for 1 currency unit of discount (default: 100) */
  @Prop({ type: Number, default: 100 })
  loyaltyRedeemRate: number;

  @Prop({ type: String, default: 'retail' })
  posMode: string;

  @Prop({ type: String, default: 'register' })
  defaultPosScreen: string;

  @Prop({
    type: {
      tableManagement: { type: Boolean, default: false },
      menuModifiers: { type: Boolean, default: false },
      kitchenQueue: { type: Boolean, default: false },
      orderTypes: { type: Boolean, default: false },
      weightedItems: { type: Boolean, default: false },
      variantMatrix: { type: Boolean, default: false },
      batchTracking: { type: Boolean, default: false },
      categoryTabs: { type: Boolean, default: false },
      rxMode: { type: Boolean, default: false },
    },
    default: {},
  })
  featureFlags: {
    tableManagement?: boolean;
    menuModifiers?: boolean;
    kitchenQueue?: boolean;
    orderTypes?: boolean;
    weightedItems?: boolean;
    variantMatrix?: boolean;
    batchTracking?: boolean;
    categoryTabs?: boolean;
    rxMode?: boolean;
  };

  @Prop({
    type: [
      {
        id: String,
        label: String,
        shape: String,
        zone: String,
        capacity: Number,
        status: { type: String, default: 'available' },
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  tableLayout: {
    id: string;
    label: string;
    shape: string;
    zone: string;
    capacity: number;
    status?: string;
    x?: number;
    y?: number;
  }[];
}

export const PosSettingsSchema = SchemaFactory.createForClass(PosSettings);

PosSettingsSchema.index({ tenantId: 1, storeId: 1, terminalId: 1 }, { unique: true });
