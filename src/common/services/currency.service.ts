import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant, TenantDocument } from '../../database/schemas/tenant.schema';
import { Store, StoreDocument } from '../../database/schemas/store.schema';
import { ExchangeRate, ExchangeRateDocument } from '../../database/schemas/exchange-rate.schema';
import { convertMoney, currencyForCountry, normalizeCurrencyCode } from '../utils/currency.util';

export interface CurrencySnapshot {
  currency: string;
  baseCurrency: string;
  /** Rate to multiply a local amount by to get the base amount. 1 when same currency. 0 when unknown. */
  exchangeRate: number;
  exchangeRateDate: Date;
  /** True when the store currency differs from base but no rate is on file. Base amounts are then null. */
  exchangeRateMissing: boolean;
}

@Injectable()
export class CurrencyService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(ExchangeRate.name) private exchangeRateModel: Model<ExchangeRateDocument>,
  ) {}

  async resolveTenantBaseCurrency(tenantId: string): Promise<string> {
    const tenant = await this.tenantModel.findById(tenantId).lean<any>();
    if (!tenant) throw new BadRequestException('Tenant not found for currency resolution');

    const base =
      tenant.baseCurrency ||
      currencyForCountry(tenant.settings?.country) ||
      tenant.settings?.currency ||
      null;
    if (base) return normalizeCurrencyCode(base);

    const store = await this.storeModel
      .findOne({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .sort({ createdAt: 1 })
      .lean<any>();
    return normalizeCurrencyCode(store?.currency || 'USD');
  }

  async resolveStoreCurrency(tenantId: string, storeId: string): Promise<string> {
    const store = await this.storeModel
      .findOne({ _id: new Types.ObjectId(storeId), tenantId: new Types.ObjectId(tenantId) })
      .lean<any>();
    if (!store) throw new BadRequestException('Store not found for currency resolution');
    return normalizeCurrencyCode(
      store.currency || (await this.resolveTenantBaseCurrency(tenantId)),
    );
  }

  /**
   * Resolve the currency conversion snapshot for a store at a point in time.
   *
   * By default this throws when the store currency differs from base and no rate
   * is on file (safe for accounting). Pass `{ allowMissing: true }` to instead
   * return a snapshot flagged `exchangeRateMissing: true` — used at checkout so a
   * sale is never blocked; the record is back-converted once a rate is added.
   */
  async resolveSnapshot(
    tenantId: string,
    storeId: string,
    at: Date = new Date(),
    opts: { allowMissing?: boolean } = {},
  ): Promise<CurrencySnapshot> {
    const [currency, baseCurrency] = await Promise.all([
      this.resolveStoreCurrency(tenantId, storeId),
      this.resolveTenantBaseCurrency(tenantId),
    ]);

    if (currency === baseCurrency) {
      return {
        currency,
        baseCurrency,
        exchangeRate: 1,
        exchangeRateDate: at,
        exchangeRateMissing: false,
      };
    }

    const rate = await this.findRate(tenantId, currency, baseCurrency, at);

    if (!rate) {
      if (opts.allowMissing) {
        // Sale proceeds; base amounts stay null until a rate is added and the
        // record is back-converted by the backfill job.
        return {
          currency,
          baseCurrency,
          exchangeRate: 0,
          exchangeRateDate: at,
          exchangeRateMissing: true,
        };
      }
      throw new BadRequestException(
        `Missing exchange rate from ${currency} to ${baseCurrency}. Add a manual rate in Settings before posting this transaction.`,
      );
    }

    return {
      currency,
      baseCurrency,
      exchangeRate: Number(rate.rate),
      exchangeRateDate: rate.effectiveAt || at,
      exchangeRateMissing: false,
    };
  }

  /**
   * Most recent active rate for a currency pair effective on/before `at`.
   * Manual entries and later-dated rates naturally win via the effectiveAt sort,
   * so a manual override added today supersedes an older auto-fetched rate.
   */
  async findRate(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
    at: Date = new Date(),
  ) {
    return this.exchangeRateModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        fromCurrency: normalizeCurrencyCode(fromCurrency),
        toCurrency: normalizeCurrencyCode(toCurrency),
        isActive: true,
        effectiveAt: { $lte: at },
      })
      .sort({ effectiveAt: -1 })
      .lean<any>();
  }

  /**
   * Convert a local amount to base currency.
   *
   * Returns 0 (never a raw or rate-coerced value) when the rate is unknown, so a
   * missing rate can never inflate base totals. The authoritative "this record is
   * unconverted" signal is the persisted `exchangeRateMissing` flag — reports
   * exclude flagged records and the backfill job recomputes them once a rate
   * exists. This keeps the return type a plain number for all arithmetic paths.
   */
  toBase(value: number, snapshot: { exchangeRate: number; exchangeRateMissing?: boolean }): number {
    if (snapshot.exchangeRateMissing || !snapshot.exchangeRate) return 0;
    return convertMoney(value, snapshot.exchangeRate);
  }
}
